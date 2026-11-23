'use strict';
process.env.NODE_ENV='test';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {once}=require('node:events');
const {PGlite}=require('@electric-sql/pglite');
const webpush=require('web-push');
const {createReportCsvExporter,HEADERS,koreanTime}=require('../lib/report-csv.cjs');
const {createApp}=require('../server.cjs');
let db,root,storage,pool;
const user='11111111-1111-4111-8111-111111111111';
const first='22222222-2222-4222-8222-222222222222',second='33333333-3333-4333-8333-333333333333';
function parseCsv(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===',' && !quoted){row.push(field);field='';}
    else if(c==='\r' && text[i+1]==='\n' && !quoted){row.push(field);rows.push(row);row=[];field='';i++;}
    else field+=c;
  }
  assert.equal(quoted,false);return rows;
}
before(async()=>{
  root=await fs.mkdtemp(path.join(__dirname,'csv-fixture-'));
  storage={mediaDirectory:path.join(root,'media'),backupDirectory:path.join(root,'db-backups')};
  db=new PGlite();await db.exec(await fs.readFile(path.join(__dirname,'../schema.sql'),'utf8'));
  pool={query:(...args)=>db.query(...args)};
  await db.query('INSERT INTO jikeoro.users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[user,'private-email@example.com','시험 이름','PRIVATE_PASSWORD_HASH']);
  await db.query(`INSERT INTO jikeoro.reports(id,user_id,source,category,subcategory,title,description,latitude,longitude,place_description,weather,created_at,updated_at)
    VALUES($1,$2,'senior_app','인도','보도 파손','시험 제보',$3,-36.37,127.36,'지도 위치',$4::jsonb,'2026-11-23T09:17:57Z','2026-11-23T09:17:57Z')`,
    [first,user,'쉼표, 따옴표 "확인"\n다음 줄',JSON.stringify({temperature:0,code:0,observedAt:'2026-11-23T18:15'})]);
  await db.query(`INSERT INTO jikeoro.reports(id,user_id,source,category,subcategory,title,description,address,created_at)
    VALUES($1,$2,'website','기타','계단/난간','두 번째','=HYPERLINK("http://example.com")','GPS 없는 주소','2026-11-23T10:00:00Z')`,[second,user]);
  await db.query(`INSERT INTO jikeoro.media(report_id,kind,original_name,mime_type,size_bytes,storage_path,preview_path)
    VALUES($1,'image','사진, "한글".jpg','image/jpeg',123,'imports/snapshot/originals/old.jpg','imports/snapshot/previews/old.jpg')`,[first]);
});
after(async()=>{
  if(db)await db.close();
  if(root){assert.equal(path.dirname(path.resolve(root)),path.resolve(__dirname));assert.ok(path.basename(root).startsWith('csv-fixture-'));await fs.rm(root,{recursive:true,force:true});}
});

test('exports every report with joined identity, Korean times, weather and imported file paths without credentials',async()=>{
  const exporter=createReportCsvExporter(pool,storage,{log:()=>{}});
  const result=await exporter.refresh();assert.equal(result.reports,2);
  const bytes=await fs.readFile(result.path);assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);
  const text=bytes.toString('utf8'),rows=parseCsv(text);assert.equal(rows.length,3);assert.deepEqual(rows[0],HEADERS);
  const value=(r,h)=>rows[r][HEADERS.indexOf(h)];
  assert.equal(value(1,'사용자 ID'),user);assert.equal(value(1,'사용자 이름'),'시험 이름');assert.equal(value(1,'제보 ID'),first);
  assert.equal(value(1,'등록 일시 (한국 시간)'),'2026-11-23 18:17:57');
  assert.equal(value(1,'날씨 관측 일시 (한국 시간)'),'2026-11-23 18:15:00');
  assert.equal(value(1,'날씨'),'맑음');assert.equal(value(1,'기온 (°C)'),'0');assert.equal(value(1,'위도'),'-36.37');
  assert.equal(value(1,'설명'),'쉼표, 따옴표 "확인"\n다음 줄');assert.equal(value(1,'사진 수'),'1');
  assert.equal(value(1,'첨부파일 원본 경로'),path.join(storage.mediaDirectory,'imports/snapshot/originals/old.jpg'));
  assert.equal(value(2,'위치'),'GPS 없는 주소');assert.equal(value(2,'날씨'),'기록 없음');assert.match(value(2,'설명'),/^'=HYPERLINK/);
  assert.doesNotMatch(text,/private-email|PRIVATE_PASSWORD_HASH|password_hash|session_hash/);
  assert.equal((await exporter.refresh()).changed,false);await exporter.stop();
});

test('locked Excel CSV stays complete, retries reflect edits and deletion, and failures never change DB records',async()=>{
  let locked=false;
  const exporter=createReportCsvExporter(pool,storage,{log:()=>{},io:{...fs,rename:async(...args)=>{
    if(locked)throw Object.assign(new Error('Excel lock'),{code:'EBUSY'});return fs.rename(...args);
  }}});
  await exporter.refresh();const previous=await fs.readFile(exporter.filename);
  await db.query("UPDATE jikeoro.reports SET status='review',response='현장 확인' WHERE id=$1",[first]);
  locked=true;await assert.rejects(exporter.refresh(),{code:'EBUSY'});
  assert.deepEqual(await fs.readFile(exporter.filename),previous);
  assert.equal((await db.query('SELECT status FROM jikeoro.reports WHERE id=$1',[first])).rows[0].status,'review');
  assert.deepEqual(await fs.readdir(path.dirname(exporter.filename)),['제보목록.csv']);
  locked=false;await exporter.refresh();assert.match(await fs.readFile(exporter.filename,'utf8'),/현장 검토/);
  await db.query('DELETE FROM jikeoro.reports WHERE id=$1',[second]);
  assert.equal((await exporter.refresh()).reports,1);assert.equal(parseCsv(await fs.readFile(exporter.filename,'utf8')).length,2);
  await fs.unlink(exporter.filename);assert.equal((await exporter.refresh()).changed,true);await exporter.stop();
});

test('startup and periodic reconciliation recover after NAS interruption without simultaneous exports',async()=>{
  let fail=true,active=0,maximum=0,calls=0,outages=0;
  const exporter=createReportCsvExporter({query:async(...args)=>{
    active++;maximum=Math.max(maximum,active);calls++;
    try {return await pool.query(...args);}finally{active--;}
  }}, {...storage,exportsDirectory:path.join(root,'automatic')},{log:()=>{},warn:()=>{},intervalMs:25,debounceMs:1,io:{...fs,mkdir:async(...args)=>{if(fail){outages++;throw Object.assign(new Error('NAS disconnected'),{code:'ENETUNREACH'});}return fs.mkdir(...args);}}});
  exporter.start();
  const wait=async check=>{for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Export did not recover');};
  await wait(()=>outages>0);fail=false;
  await wait(()=>fs.stat(exporter.filename).then(()=>true).catch(()=>false));
  assert.equal(maximum,1);assert.ok(calls>=2);assert.equal(parseCsv(await fs.readFile(exporter.filename,'utf8')).length,2);await exporter.stop();
});

test('successful API mutations queue CSV refresh, rejected requests do not, and exports are never publicly served',async()=>{
  let queued=0;
  const config={origin:'http://127.0.0.1:3001',allowedOrigins:new Set(),storage,publicDir:path.join(root,'public'),keys:{...webpush.generateVAPIDKeys(),subject:'mailto:test@example.com'}};
  const service=createApp({pool,config,disableRateLimit:true,reportCsv:{schedule:()=>{queued++;}}});
  const server=service.app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal(queued,0);
    assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
    assert.equal(queued,1);
    for(const route of ['/exports/제보목록.csv','/media/../exports/제보목록.csv','/web/../exports/제보목록.csv']) assert.equal((await fetch(base+route)).status,404);
    assert.throws(()=>createReportCsvExporter(pool,{...storage,exportsDirectory:config.publicDir},{publicDir:config.publicDir}),/outside/);
    assert.throws(()=>createReportCsvExporter(pool,{...storage,exportsDirectory:'relative-folder'}),/absolute/);
    assert.equal(koreanTime('not-a-date'),'');
  }finally {await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});
