'use strict';
const fs = require('node:fs/promises');
const { createReadStream,createWriteStream,constants } = require('node:fs');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const sharp = require('sharp');
const {Worker}=require('node:worker_threads');
const { assert,HttpError,text,uuid } = require('./security.cjs');
const { requireUser } = require('./auth.cjs');
const { transaction } = require('./database.cjs');
const { findReport } = require('./reports.cjs');
sharp.concurrency(2);
sharp.cache({files:0});
const MAX_BYTES = 50*1024*1024;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif','video/mp4','video/quicktime','video/webm','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/vnd.wave','audio/ogg','audio/opus','audio/webm','video/ogg']);

function safeFile(root,relative) {
  assert(typeof relative === 'string' && relative.length>0 && !relative.includes('\\') && !path.isAbsolute(relative) && !relative.split('/').includes('..'),500,'저장 경로를 확인하지 못했습니다.');
  const target = path.resolve(root,relative);
  assert(target.startsWith(path.resolve(root)+path.sep),500,'저장 경로를 확인하지 못했습니다.');
  return target;
}
function publicMedia(item) {
  return { id:item.id,report_id:item.report_id,kind:item.kind,original_name:item.original_name,mime_type:item.mime_type,size_bytes:Number(item.size_bytes),url:`/api/media/${item.id}` };
}
let previewActive=0;
const previewQueue=[];
async function makePreview(filename,target,mime='image/jpeg') {
  if(previewActive>=2) {
    assert(previewQueue.length<8,429,'사진을 처리 중입니다. 잠시 후 다시 시도해주세요.');
    await new Promise(resolve=>previewQueue.push(resolve));
  } else previewActive++;
  try {
    try {
      // Close the NAS input handle before libvips starts decoding it.
      await sharp(await fs.readFile(filename),{limitInputPixels:60*1000*1000,failOn:'error'}).rotate()
        .resize({width:280,height:208,fit:'inside',withoutEnlargement:true})
        .jpeg({quality:78}).timeout({seconds:10}).toFile(target);
    } catch(error) {
      if(!['image/heic','image/heif'].includes(mime))throw new HttpError(415,'사진을 읽지 못했습니다. 손상되지 않은 사진을 선택해주세요.');
      await new Promise((resolve,reject)=>{
        const worker=new Worker(path.join(__dirname,'heic-worker.cjs'),{workerData:{filename,target},resourceLimits:{maxOldGenerationSizeMb:512}});
        let settled=false;
        const done=(ok)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(ok)resolve();else reject(new HttpError(415,'HEIC 사진을 읽지 못했습니다. JPEG 또는 PNG 사진으로 다시 시도해주세요.'));};
        const timer=setTimeout(()=>done(false),20000);
        worker.once('message',message=>done(message.ok===true));
        worker.once('error',()=>done(false));
        worker.once('exit',()=>{if(!settled)done(false);});
      });
    }
  } finally {const next=previewQueue.shift();if(next)next();else previewActive--;}
}
function mediaService(pool,storage) {
  let cleaning = false;
  const activeUploads=new Set();
  async function removeUploadFile(relative) {
    if(!relative)return;
    try {await fs.unlink(safeFile(storage.mediaDirectory,relative));}
    catch(error) {
      if(error.code==='ENOENT')return;
      await pool.query('INSERT INTO jikeoro.file_cleanup(file_path) VALUES($1) ON CONFLICT DO NOTHING',[relative]).catch(()=>{});
    }
  }
  async function cleanup() {
    if (cleaning) return;
    cleaning = true;
    try {
      const result = await pool.query('SELECT file_path FROM jikeoro.file_cleanup ORDER BY requested_at LIMIT 100');
      for (const item of result.rows) {
        try {
          await fs.unlink(safeFile(storage.mediaDirectory,item.file_path)).catch((error) => { if(error.code !== 'ENOENT') throw error; });
          await pool.query('DELETE FROM jikeoro.file_cleanup WHERE file_path=$1',[item.file_path]);
        } catch { /* Keep durable cleanup jobs for the next attempt. */ }
      }
    } finally { cleaning = false; }
  }
  const router = express.Router();
  router.post('/reports/:id/media',requireUser,async (req,res) => {
    const reportId = uuid(req.params.id);
    await findReport(pool,req.user,reportId,{ownerOnly:true});
    assert(!req.get('content-length') || Number(req.get('content-length')) <= MAX_BYTES,413,'파일은 한 개당 50MB까지 올릴 수 있습니다.');
    const kind = req.get('x-media-kind');
    assert(['image','video','audio'].includes(kind),400,'파일 종류를 확인해주세요.');
    let originalName;
    try { originalName = decodeURIComponent(req.get('x-file-name') || 'file'); }
    catch { throw new HttpError(400,'파일 이름을 확인해주세요.'); }
    originalName = text(originalName.replace(/[\u0000-\u001f]/g,''),255,'file') || 'file';
    const id = req.get('x-media-id') ? uuid(req.get('x-media-id')) : crypto.randomUUID();
    assert(!activeUploads.has(id),409,'같은 파일을 전송하고 있어요. 잠시 후 다시 시도해주세요.');
    activeUploads.add(id);
    const attemptId=crypto.randomUUID();
    const stagingRelative = `.incoming/${attemptId}.part`;
    const staged = safeFile(storage.mediaDirectory,stagingRelative);
    let finalFile,previewFile,storagePath,previewPath=null,committed=false,operation='lookup';
    try {
      const existing=(await pool.query('SELECT * FROM jikeoro.media WHERE id=$1',[id])).rows[0];
      if(existing) {
        assert(existing.report_id===reportId && existing.kind===kind && existing.original_name===originalName,409,'다른 파일에 사용된 번호입니다. 사진을 다시 선택해주세요.');
        let drained=0;req.on('data',chunk=>{drained+=chunk.length;if(drained>MAX_BYTES)req.destroy();});req.resume();
        return res.json({ok:true,media:publicMedia(existing)});
      }
      operation='receive';
      await fs.mkdir(path.dirname(staged),{recursive:true});
      let size = 0;
      const counter = new Transform({transform(chunk,encoding,done) {
        size += chunk.length;
        done(size > MAX_BYTES ? new HttpError(413,'파일은 한 개당 50MB까지 올릴 수 있습니다.') : null,chunk);
      }});
      await pipeline(req,counter,createWriteStream(staged,{flags:'wx'}));
      assert(size>0,400,'빈 파일은 올릴 수 없습니다.');
      const handle = await fs.open(staged,'r');
      let prefix;
      try { const buffer=Buffer.alloc(8192); const {bytesRead}=await handle.read(buffer,0,buffer.length,0); prefix=buffer.subarray(0,bytesRead); }
      finally { await handle.close(); }
      const {fileTypeFromBuffer} = await import('file-type');
      const detected = await fileTypeFromBuffer(prefix).catch(() => undefined);
      assert(detected && ALLOWED.has(detected.mime),415,'지원하는 사진·영상·음성 파일을 선택해주세요.');
      const mimeKind = detected.mime.split('/')[0];
      assert(kind === mimeKind || (kind === 'audio' && ['video/webm','video/mp4','video/ogg'].includes(detected.mime)),415,'선택한 파일 종류와 실제 파일이 다릅니다.');
      storagePath = `reports/${reportId}/${attemptId}.${detected.ext}`;
      finalFile = safeFile(storage.mediaDirectory,storagePath);
      await fs.mkdir(path.dirname(finalFile),{recursive:true});
      operation='copy_original';
      // Moving an open file between SMB folders can fail with EBUSY/EPERM.
      // The copy is private until its metadata transaction commits.
      await fs.copyFile(staged,finalFile,constants.COPYFILE_EXCL);
      assert((await fs.stat(finalFile)).size===size,500,'파일 복사를 확인하지 못했습니다.');
      if (kind === 'image') {
        operation='make_preview';
        previewPath = `previews/${reportId}/${attemptId}.jpg`;
        previewFile = safeFile(storage.mediaDirectory,previewPath);
        await fs.mkdir(path.dirname(previewFile),{recursive:true});
        // Metadata is stripped by sharp's default JPEG output, including EXIF/GPS.
        await makePreview(staged,previewFile,detected.mime);
      }
      operation='save_metadata';
      const mime = kind === 'audio' && detected.mime.startsWith('video/') ? detected.mime.replace('video/','audio/') : detected.mime;
      const record = await transaction(pool,async (client) => {
        await client.query('SELECT id FROM jikeoro.reports WHERE id=$1 FOR UPDATE',[reportId]);
        await findReport(client,req.user,reportId,{ownerOnly:true});
        const count = await client.query('SELECT COUNT(*)::integer AS count FROM jikeoro.media WHERE report_id=$1',[reportId]);
        assert(count.rows[0].count < 20,400,'제보 한 건에 파일은 최대 20개까지 저장할 수 있습니다.');
        const result = await client.query(`INSERT INTO jikeoro.media(id,report_id,kind,original_name,mime_type,size_bytes,storage_path,preview_path)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[id,reportId,kind,originalName,mime,size,storagePath,previewPath]);
        return result.rows[0];
      });
      committed = true;
      res.status(201).json({ok:true,media:publicMedia(record)});
    } catch(error) {
      error.uploadOperation=operation;
      throw error;
    } finally {
      activeUploads.delete(id);
      await removeUploadFile(stagingRelative);
      if (!committed && (storagePath || previewPath)) {
        // If COMMIT's acknowledgement was lost, never delete a referenced original.
        let removable=false;
        try {const saved=(await pool.query('SELECT storage_path FROM jikeoro.media WHERE id=$1',[id])).rows[0];removable=saved?.storage_path!==storagePath;}
        catch { /* Preserve files when the database outcome cannot be established. */ }
        if(removable)for(const relative of [storagePath,previewPath].filter(Boolean))await removeUploadFile(relative);
      }
    }
  });
  router.get('/reports/:id/media',requireUser,async (req,res) => {
    const id = uuid(req.params.id);
    await findReport(pool,req.user,id);
    const result = await pool.query('SELECT * FROM jikeoro.media WHERE report_id=$1 ORDER BY created_at',[id]);
    res.json({media:result.rows.map(publicMedia)});
  });
  router.get('/media/:id',requireUser,async (req,res) => {
    const result = await pool.query('SELECT * FROM jikeoro.media WHERE id=$1',[uuid(req.params.id)]);
    const media = result.rows[0];
    assert(media,404,'파일을 찾을 수 없습니다.');
    await findReport(pool,req.user,media.report_id);
    res.set('Cache-Control','private, no-store');
    res.set('Content-Type',media.mime_type);
    res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(media.original_name)}`);
    res.sendFile(safeFile(storage.mediaDirectory,media.storage_path),{dotfiles:'deny'},(error) => {
      if (error && !res.headersSent) res.status(404).json({error:'파일을 읽지 못했습니다. 잠시 후 다시 시도해주세요.'});
    });
  });
  router.get('/map/reports/:id/preview',async (req,res) => {
    const result = await pool.query(`SELECT m.preview_path FROM jikeoro.media m JOIN jikeoro.reports r ON r.id=m.report_id
      WHERE m.report_id=$1 AND r.latitude IS NOT NULL AND m.kind='image' AND m.preview_path IS NOT NULL ORDER BY m.created_at LIMIT 1`,[uuid(req.params.id)]);
    const preview = result.rows[0]?.preview_path;
    assert(preview,404,'사진 미리보기가 없습니다.');
    res.set('Content-Type','image/jpeg');
    res.set('Cache-Control','public, max-age=300');
    res.set('Cross-Origin-Resource-Policy','cross-origin');
    res.sendFile(safeFile(storage.mediaDirectory,preview),{dotfiles:'deny'},(error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  });
  return {router,cleanup};
}
module.exports = { mediaService,safeFile,MAX_BYTES,makePreview };
