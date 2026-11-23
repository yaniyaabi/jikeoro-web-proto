'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {parseExport,checkExport,safeRelative}=require('./migration-check.cjs');
const {createReadStream}=require('node:fs');

function ensure(ok,message) {if(!ok)throw new Error(message);}
async function hashFile(filename) {const h=crypto.createHash('sha256');for await(const chunk of createReadStream(filename))h.update(chunk);return h.digest('hex');}
function contained(root,file) {const r=path.relative(root,file);return r && r!=='..' && !r.startsWith('..'+path.sep) && !path.isAbsolute(r);}
async function secureFile(root,relative,{createParent=false}={}) {
  ensure(safeRelative(relative),'Unsafe migration path.');
  const canonical=await fs.realpath(root),target=path.join(canonical,...relative.split('/'));
  ensure(contained(canonical,target),'Invalid migration target.');
  if(createParent)await fs.mkdir(path.dirname(target),{recursive:true});
  const parent=await fs.realpath(path.dirname(target));
  ensure(parent===canonical || contained(canonical,parent),'Linked directory outside migration storage.');
  try {ensure(!(await fs.lstat(target)).isSymbolicLink(),'Linked migration file needs review.');}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  return target;
}
async function copyVerified(source,destination,expectedHash) {
  try {await fs.stat(destination);ensure(await hashFile(destination)===expectedHash,'Existing migration file has changed.');return;}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  const temporary=path.join(path.dirname(destination),'.copy-'+crypto.randomBytes(6).toString('hex')+'.part');
  await fs.copyFile(source,temporary,constants.COPYFILE_EXCL);
  ensure(await hashFile(temporary)===expectedHash,'Original file changed while copying. No database records imported.');
  await fs.rename(temporary,destination);
}
function validatePriorCheck(data,csvBytes,prior) {
  const digest=crypto.createHash('sha256').update(csvBytes).digest('hex');
  ensure(prior?.format==='jikeoro-migration-check' && prior.version===1 && prior.ready===true,'Run a successful migration check first.');
  ensure(prior.csv_sha256===digest,'CSV changed after checking. Run the migration check again.');
  ensure(prior.checked_files===data.report_media.length && prior.files?.length===data.report_media.length,'The checked file list is incomplete.');
  const known=new Set();
  for(const f of prior.files) {ensure(typeof f.id==='string' && !known.has(f.id) && /^[a-f0-9]{64}$/.test(f.sha256),'Invalid checked file manifest.');known.add(f.id);}
  return digest;
}
async function prepareFiles(data,check,{mediaRoot,storageRoot,sourceHash,makePreview,onProgress}) {
  const originals=await fs.realpath(mediaRoot),storage=await fs.realpath(storageRoot);
  ensure(originals!==storage && !contained(originals,storage) && !contained(storage,originals),'Source and service media folders must be separate.');
  // Short names also work with Windows image decoders that have path-length limits.
  const namespace=sourceHash.slice(0,16);
  const finalRelative='imports/'+namespace,finalRoot=path.join(storage,'imports',namespace);
  const stageRoot=path.join(storage,'.migrate-stage',namespace);
  // Publish files individually; some SMB/NAS shares prohibit renaming directories.
  // Database rows only reference this folder after every original is verified.
  const working=finalRoot;
  try {await fs.mkdir(working,{recursive:true});}
  catch(error) {error.migration_operation='create_service_media_folder';throw error;}
  ensure(contained(storage,await fs.realpath(working)),'Invalid staging directory.');
  const marker=await secureFile(working,'migration-source.json');
  try {ensure(JSON.parse(await fs.readFile(marker,'utf8')).source_hash===sourceHash,'Migration folder belongs to another snapshot.');}
  catch(error) {if(error.code!=='ENOENT')throw error;await fs.writeFile(marker,JSON.stringify({source_hash:sourceHash})+'\n',{flag:'wx'});}
  let cacheRoot=null;
  try {
    cacheRoot=await fs.realpath(stageRoot);
    ensure(contained(storage,cacheRoot),'Invalid copied-media directory.');
    const cacheMarker=await secureFile(cacheRoot,'migration-source.json');
    ensure(JSON.parse(await fs.readFile(cacheMarker,'utf8')).source_hash===sourceHash,'Copied-media folder belongs to another snapshot.');
  } catch(error) {if(error.code!=='ENOENT')throw error;cacheRoot=null;}
  const checked=new Map(check.files.map(f=>[f.id,f])),prepared=[],warnings=[];
  let n=0,reused=0;
  for(const m of data.report_media) {
    const entry=checked.get(m.id);ensure(entry && entry.storage_path===m.storage_path,'Media manifest mismatch.');
    let source=await secureFile(originals,m.storage_path);
    const ext=path.extname(m.storage_path).slice(1).toLowerCase();
    const originalRelative='originals/'+m.id+'.'+(/^[a-z0-9]{1,10}$/.test(ext)?ext:'bin');
    if(cacheRoot) {
      try {
        const cached=await secureFile(cacheRoot,originalRelative);
        if(await hashFile(cached)===entry.sha256) {source=cached;reused++;}
      } catch(error) {if(error.code!=='ENOENT')throw error;}
    }
    const destination=await secureFile(working,originalRelative,{createParent:true});
    try {await copyVerified(source,destination,entry.sha256);}
    catch(error) {error.migration_operation='copy_verified_original';throw error;}
    let previewRelative=null,previewHash=null;
    if(m.kind==='image') {
      const temporary=await secureFile(working,'previews/p'+crypto.randomBytes(6).toString('hex')+'.jpg',{createParent:true});
      let decoded=false;
      try {
        await makePreview(destination,temporary,m.mime_type);
        decoded=true;
      } catch(error) {
        // Retain the original even if a historical image cannot be decoded.
        warnings.push({code:'thumbnail_unavailable',media_id:m.id,reason:error.code||error.name||'ImageError'});
        await fs.unlink(temporary).catch(()=>{});
      }
      if(decoded) {
        try {
          previewHash=await hashFile(temporary);
          const relative='previews/'+m.id+'-'+previewHash.slice(0,12)+'.jpg';
          const preview=await secureFile(working,relative,{createParent:true});
          await copyVerified(temporary,preview,previewHash);
          previewRelative=finalRelative+'/'+relative;
          await fs.unlink(temporary).catch(()=>{});
        } catch(error) {error.migration_operation='publish_verified_preview';throw error;}
      }
    }
    const mime=typeof m.mime_type==='string' && /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(m.mime_type)?m.mime_type:'application/octet-stream';
    prepared.push({id:m.id,report_id:m.report_id,kind:m.kind,original_name:m.original_name || path.basename(m.storage_path),mime_type:mime,size_bytes:entry.size_bytes,storage_path:finalRelative+'/'+originalRelative,preview_path:previewRelative,created_at:m.created_at,sha256:entry.sha256,preview_sha256:previewHash});
    n++;if(n%10===0 || n===data.report_media.length)onProgress(`Copying media: ${n}/${data.report_media.length}`);
  }
  if(reused)onProgress(`Reused previously copied media: ${reused}/${data.report_media.length}`);
  onProgress('Media files prepared in the service folder.');
  return {files:prepared,warnings};
}
async function insert(client,table,columns,values,{returnId=false}={}) {
  const placeholders=values.map((_,i)=>'$'+(i+1)).join(',');
  return client.query(`INSERT INTO jikeoro.${table}(${columns.join(',')}) VALUES(${placeholders})${returnId?' RETURNING id':''}`,values);
}
async function verifyImported(client,result,storageRoot,onProgress) {
  for(const [table,ids] of [['users',result.user_ids],['reports',result.report_ids],['media',result.files.map(f=>f.id)]]) {
    const count=await client.query(`SELECT COUNT(*)::integer AS n FROM jikeoro.${table} WHERE id=ANY($1::uuid[])`,[ids]);
    ensure(count.rows[0].n===ids.length,`Imported ${table} count did not match.`);
  }
  onProgress('Verifying imported file checksums...');
  for(const f of result.files) {
    const filename=await secureFile(storageRoot,f.storage_path);
    ensure((await fs.stat(filename)).size===Number(f.size_bytes) && await hashFile(filename)===f.sha256,'Imported original checksum did not match.');
    if(f.preview_path)ensure(await hashFile(await secureFile(storageRoot,f.preview_path))===f.preview_sha256,'Imported preview checksum did not match.');
  }
}
async function importSnapshot({pool,data,csvBytes,priorCheck,mediaRoot,storageRoot,makePreview,onProgress=()=>{}}) {
  const sourceHash=validatePriorCheck(data,csvBytes,priorCheck),client=await pool.connect();
  let lock=false;
  try {
    lock=(await client.query('SELECT pg_try_advisory_lock(20261118,1) AS locked')).rows[0].locked;
    ensure(lock,'Another migration is already running.');
    await client.query(`CREATE TABLE IF NOT EXISTS jikeoro.migration_runs (
      source_hash text PRIMARY KEY CHECK(source_hash ~ '^[a-f0-9]{64}$'),
      completed_at timestamptz NOT NULL DEFAULT now(),result jsonb NOT NULL
    )`);
    const previous=(await client.query('SELECT result FROM jikeoro.migration_runs WHERE source_hash=$1',[sourceHash])).rows[0]?.result;
    if(previous) {await verifyImported(client,previous,storageRoot,onProgress);return {...previous,already_imported:true};}
    onProgress('Rechecking source snapshot and files...');
    const adapter={connect:async()=>({query:(sql,args)=>client.query(sql,args),release(){}})};
    const check=await checkExport(data,{mediaRoot,pool:adapter,onProgress:(n,total)=>onProgress(`Checking files: ${n}/${total}`)});
    ensure(check.ready,'Migration check no longer passes. Run the check tool and review its summary.');
    const before=new Map(priorCheck.files.map(f=>[f.id,f]));
    for(const f of check.files)ensure(f.sha256===before.get(f.id)?.sha256 && f.size_bytes===before.get(f.id)?.size_bytes,'Source file changed since the check. Run the check tool again.');
    const currentUsers=(await client.query('SELECT id FROM jikeoro.users WHERE id=ANY($1::uuid[])',[data.auth_users.map(u=>u.id)])).rows;
    ensure(currentUsers.length===0,'Some source users already exist locally. No accounts were overwritten.');
    const prepared=await prepareFiles(data,check,{mediaRoot,storageRoot,sourceHash,makePreview,onProgress});
    const result={format:'jikeoro-migration-import',version:1,source_hash:sourceHash,exported_at:data.exported_at,imported_at:new Date().toISOString(),imported_counts:{users:data.auth_users.length,reports:data.reports.length,media:data.report_media.length,history:data.report_status_history.length,audit:data.admin_audit_logs.length},user_ids:data.auth_users.map(u=>u.id),report_ids:data.reports.map(r=>r.id),files:prepared.files,warnings:prepared.warnings,history_ids:[],audit_ids:[]};
    const profiles=new Map(data.profiles.map(p=>[p.id,p]));
    onProgress('Saving the complete snapshot in one database transaction...');
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query('LOCK TABLE jikeoro.users,jikeoro.reports,jikeoro.media,jikeoro.report_history,jikeoro.audit_logs IN SHARE ROW EXCLUSIVE MODE');
      for(const u of data.auth_users) {
        const p=profiles.get(u.id),role=p?.role || 'member';
        const name=p?.name?.trim()?p.name:u.email.split('@')[0].slice(0,100);
        const active=Boolean(u.email_confirmed_at) && !u.deleted_at && !(u.banned_until && new Date(u.banned_until)>new Date());
        await insert(client,'users',['id','email','name','password_hash','role','agency','avatar','active','created_at'],[u.id,u.email.trim().toLowerCase(),name,u.encrypted_password,role,p?.agency || null,JSON.stringify(p?.avatar || u.raw_user_meta_data?.avatar || {}),active,u.created_at]);
      }
      const columns=['id','user_id','source','category','subcategory','title','description','latitude','longitude','accuracy','address','place_description','status','assigned_agency','response','observed_at','weather','points','created_at','updated_at'];
      for(const r of data.reports)await insert(client,'reports',columns,columns.map(k=>k==='response'?(r[k]??''):k==='weather'?(r[k]===null || r[k]===undefined?null:JSON.stringify(r[k])):(r[k]??null)));
      for(const m of prepared.files)await insert(client,'media',['id','report_id','kind','original_name','mime_type','size_bytes','storage_path','preview_path','created_at'],[m.id,m.report_id,m.kind,m.original_name,m.mime_type,m.size_bytes,m.storage_path,m.preview_path,m.created_at]);
      for(const h of data.report_status_history) {
        const inserted=await insert(client,'report_history',['report_id','status','note','actor_user_id','created_at'],[h.report_id,h.status,h.note??null,h.actor_user_id??null,h.created_at],{returnId:true});
        result.history_ids.push({source_id:String(h.id),local_id:String(inserted.rows[0].id)});
      }
      for(const a of data.admin_audit_logs) {
        const inserted=await insert(client,'audit_logs',['actor_user_id','report_id','action','detail','created_at'],[a.actor_user_id,a.report_id??null,a.action,a.detail??'',a.created_at],{returnId:true});
        result.audit_ids.push({source_id:String(a.id),local_id:String(inserted.rows[0].id)});
      }
      await client.query('INSERT INTO jikeoro.migration_runs(source_hash,result) VALUES($1,$2::jsonb)',[sourceHash,JSON.stringify(result)]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
    await verifyImported(client,result,storageRoot,onProgress);
    return {...result,already_imported:false};
  } finally {
    if(lock)await client.query('SELECT pg_advisory_unlock(20261118,1)').catch(()=>{});
    client.release();
  }
}
async function assertServerStopped() {
  const open=await new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port:3001});
    socket.setTimeout(1000);let done=false;
    const finish=value=>{if(done)return;done=true;socket.destroy();resolve(value);};
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(true));
  });
  ensure(!open,'Stop start-server.cmd with Ctrl+C before importing. Keep Docker running.');
}
async function runBackup(serverRoot) {
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(serverRoot,'backup-db.cjs')],{cwd:serverRoot,windowsHide:true,stdio:'inherit'});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Backup failed. Import was not started.')));
  });
}
async function installAuthPatch(serverRoot,directory) {
  const source=path.join(__dirname,'server-patch','auth.cjs');
  const expected=JSON.parse(await fs.readFile(path.join(__dirname,'server-patch','manifest.json'),'utf8'));
  ensure(await hashFile(source)===expected.new_sha256,'Server patch checksum did not match.');
  const target=path.join(serverRoot,'lib','auth.cjs'),current=await hashFile(target);
  if(current===expected.new_sha256)return;
  ensure(current===expected.previous_sha256,'Existing auth module was changed. Import was not started.');
  const backup=path.join(directory,'code-backups',new Date().toISOString().replace(/[:.]/g,'-'));
  await fs.mkdir(backup,{recursive:true});await fs.copyFile(target,path.join(backup,'auth.cjs'));
  await fs.copyFile(source,target);
}
async function main() {
  await assertServerStopped();
  const serverRoot=path.join(process.env.USERPROFILE,'jikeoro-server'),directory=path.join(process.env.USERPROFILE,'jikeoro-migration');
  const csvs=(await fs.readdir(directory)).filter(n=>/\.csv$/i.test(n));
  ensure(csvs.length===1,'Keep exactly one source CSV in jikeoro-migration.');
  const csvBytes=await fs.readFile(path.join(directory,csvs[0])),data=parseExport(csvBytes);
  const priorCheck=JSON.parse(await fs.readFile(path.join(directory,'migration-check-result.json'),'utf8'));
  validatePriorCheck(data,csvBytes,priorCheck);
  await runBackup(serverRoot);
  await installAuthPatch(serverRoot,directory);
  const storage=JSON.parse((await fs.readFile(path.join(serverRoot,'storage.json'),'utf8')).replace(/^\uFEFF/,''));
  const {Pool}=require(path.join(serverRoot,'node_modules','pg'));
  const {makePreview}=require(path.join(serverRoot,'lib','media.cjs'));
  const pool=new Pool({host:'127.0.0.1',port:15432,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,connectionTimeoutMillis:5000});
  let result;
  try {result=await importSnapshot({pool,data,csvBytes,priorCheck,mediaRoot:path.join(path.dirname(storage.mediaDirectory),'supabase-originals','report-media'),storageRoot:storage.mediaDirectory,makePreview,onProgress:message=>console.log(message)});}
  finally {await pool.end();}
  await fs.writeFile(path.join(directory,'migration-import-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(`Imported users: ${result.imported_counts.users}; Reports: ${result.imported_counts.reports}; Media: ${result.imported_counts.media}`);
  console.log(`Verified files: ${result.files.length}/${result.imported_counts.media}; Preview warnings: ${result.warnings.length}`);
  console.log(result.already_imported?'IMPORT ALREADY COMPLETE - previous import was verified.':'IMPORT COMPLETE - local database and NAS files verified.');
  console.log('Supabase originals were not changed. Public app/site cutover is still pending.');
}
module.exports={importSnapshot,validatePriorCheck,verifyImported,secureFile};
if(require.main===module)main().catch(error=>{console.error('Import stopped:',error.code||error.message);if(error.migration_operation)console.error('Operation:',error.migration_operation);if(error.syscall)console.error('Filesystem operation:',error.syscall);console.error('Keep the CSV and NAS originals. Re-running the same package is safe after the issue is resolved.');process.exitCode=1;});
