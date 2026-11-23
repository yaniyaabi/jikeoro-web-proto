'use strict';
process.env.NODE_ENV='test';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {once}=require('node:events');
const {PGlite}=require('@electric-sql/pglite');
const sharp=require('sharp');
const webpush=require('web-push');
const {createApp}=require('../server.cjs');
const {hashPassword}=require('../lib/security.cjs');

let db,pool,server,service,root,base,config,member,other,admin,agencyA,agencyB,reportId,mediaId;
const sent=[];
async function request(route,{token,method='GET',body,headers={}}={}) {
  if(token)headers={...headers,Authorization:`Bearer ${token}`};
  let payload=body;
  if(body && !Buffer.isBuffer(body)) {headers={...headers,'Content-Type':'application/json'};payload=JSON.stringify(body);}
  return await fetch(base+route,{method,headers,body:payload});
}
async function signup(email,extra={}) {
  const response=await request('/api/auth/register',{method:'POST',body:{name:'시험 지킴이',email,password:'test-password-1234',...extra}});
  assert.equal(response.status,201);
  return await response.json();
}
async function login(email) {
  const response=await request('/api/auth/login',{method:'POST',body:{email,password:'test-password-1234'}});
  assert.equal(response.status,200);
  return await response.json();
}
function payload(extra={}) {return {category:'인도',subcategory:'보도 파손',description:'보도블록이 들떠 있어요.',latitude:36.37,longitude:127.36,points:999999,user_id:other?.user.id,...extra};}

before(async()=>{
  root=await fs.mkdtemp(path.join(__dirname,'fixture-'));
  config={origin:'http://127.0.0.1:3001',allowedOrigins:new Set(['http://127.0.0.1:3001']),publicDir:path.join(root,'public'),storage:{mediaDirectory:path.join(root,'media'),backupDirectory:path.join(root,'backup')},keys:{...webpush.generateVAPIDKeys(),subject:'mailto:test@example.com'}};
  await fs.mkdir(config.storage.mediaDirectory);await fs.mkdir(config.storage.backupDirectory);
  db=new PGlite();await db.exec(await fs.readFile(path.join(__dirname,'../schema.sql'),'utf8'));
  let tail=Promise.resolve();
  async function acquire() {let release;const gate=new Promise(resolve=>{release=resolve;});const previous=tail;tail=tail.then(()=>gate);await previous;return release;}
  pool={query:async(sql,params)=>{const release=await acquire();try{return await db.query(sql,params);}finally{release();}},connect:async()=>{const release=await acquire();return {query:(sql,params)=>db.query(sql,params),release};}};
  service=createApp({pool,config,disableRateLimit:true,sendPush:async(subscription,body)=>{sent.push({subscription,body:JSON.parse(body)});return {statusCode:201};}});
  server=service.app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
  member=await signup('member@example.com',{role:'research_admin'});
  other=await signup('other@example.com');
  const encoded=await hashPassword('test-password-1234');
  for(const [email,role,agency] of [['admin@example.com','research_admin','HDL'],['a@example.com','agency_staff','기관 A'],['b@example.com','agency_staff','기관 B']]) {
    await pool.query('INSERT INTO jikeoro.users(email,name,password_hash,role,agency) VALUES($1,$2,$3,$4,$5)',[email,'운영 시험',encoded,role,agency]);
  }
  admin=await login('admin@example.com');agencyA=await login('a@example.com');agencyB=await login('b@example.com');
});
after(async()=>{
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  if(db)await db.close();
  if(root) {
    const resolved=path.resolve(root),expected=path.resolve(__dirname);
    assert.equal(path.dirname(resolved),expected);
    assert.ok(path.basename(resolved).startsWith('fixture-'));
    await fs.rm(resolved,{recursive:true,force:true});
  }
});

test('registration cannot escalate role, password is hashed, and auth requires valid credentials',async()=>{
  assert.equal(member.user.role,'member');
  const stored=await pool.query('SELECT password_hash FROM jikeoro.users WHERE id=$1',[member.user.id]);
  assert.match(stored.rows[0].password_hash,/^scrypt\$/);
  assert.ok(!stored.rows[0].password_hash.includes('test-password'));
  const wrong=await request('/api/auth/login',{method:'POST',body:{email:'member@example.com',password:'wrong-password'}});
  assert.equal(wrong.status,401);
  assert.equal((await request('/api/admin/accounts',{token:member.accessToken})).status,403);
  assert.equal((await request('/api/reports')).status,401);
  assert.equal((await request('/api/auth/session',{token:member.accessToken})).status,200);
});

test('report owner and points come from server; SQL input stays data; private reports are isolated',async()=>{
  const response=await request('/api/reports',{token:member.accessToken,method:'POST',body:payload({description:"' ; DROP TABLE jikeoro.users; --"})});
  assert.equal(response.status,201);reportId=(await response.json()).id;
  const row=(await pool.query('SELECT * FROM jikeoro.reports WHERE id=$1',[reportId])).rows[0];
  assert.equal(row.user_id,member.user.id);assert.equal(row.points,100);
  const mine=await (await request('/api/reports',{token:member.accessToken})).json();assert.equal(mine.reports.length,1);
  const theirs=await (await request('/api/reports',{token:other.accessToken})).json();assert.equal(theirs.reports.length,0);
  assert.equal((await request(`/api/reports/${reportId}/media`,{token:other.accessToken})).status,404);
  const map=await (await request('/api/map/reports')).json();
  assert.equal(map.reports[0].id,reportId);assert.equal(map.reports[0].email,undefined);assert.equal(map.reports[0].user_id,undefined);
});

test('uploads persist despite NAS rename locks, deduplicate retry IDs, deny other users, and strip public metadata',async(t)=>{
  const originalUnlink=fs.unlink.bind(fs);
  let renameAttempts=0;
  t.mock.method(fs,'rename',async()=>{renameAttempts++;const e=new Error('NAS file busy');e.code='EBUSY';throw e;});
  t.mock.method(fs,'unlink',async filename=>{if(filename.includes(path.sep+'.incoming'+path.sep)){const e=new Error('Temporary NAS lock');e.code='EBUSY';throw e;}return originalUnlink(filename);});
  const image=await sharp({create:{width:1200,height:900,channels:3,background:'#449933'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'PRIVATE_GPS_MARKER'}}}).toBuffer();
  assert.ok((await sharp(image).metadata()).exif);
  const uploadId=crypto.randomUUID();
  const headers={'Content-Type':'image/jpeg','X-Media-Kind':'image','X-File-Name':encodeURIComponent('보도 사진.jpg'),'X-Media-Id':uploadId};
  const response=await request(`/api/reports/${reportId}/media`,{token:member.accessToken,method:'POST',body:image,headers});
  assert.equal(response.status,201,await response.clone().text());mediaId=(await response.json()).media.id;
  assert.equal(mediaId,uploadId);assert.equal(renameAttempts,0);
  t.mock.restoreAll();
  await service.cleanup();
  const retry=await request(`/api/reports/${reportId}/media`,{token:member.accessToken,method:'POST',body:image,headers});
  assert.equal(retry.status,200);assert.equal((await retry.json()).media.id,mediaId);
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM jikeoro.media WHERE report_id=$1',[reportId])).rows[0].n,1);
  const row=(await pool.query('SELECT * FROM jikeoro.media WHERE id=$1',[mediaId])).rows[0];
  assert.deepEqual(await fs.readFile(path.join(config.storage.mediaDirectory,row.storage_path)),image);
  assert.equal((await request(`/api/media/${mediaId}`)).status,401);
  assert.equal((await request(`/api/media/${mediaId}`,{token:other.accessToken})).status,404);
  const original=await request(`/api/media/${mediaId}`,{token:member.accessToken});assert.equal(original.status,200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),image);
  const preview=await request(`/api/map/reports/${reportId}/preview?retry=0`);assert.equal(preview.status,200);
  const metadata=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
  assert.ok(metadata.width<=280 && metadata.height<=208);assert.equal(metadata.exif,undefined);
});

test('invalid files are rejected and staged files removed; unprivileged uploads and deletion fail',async()=>{
  const response=await request(`/api/reports/${reportId}/media`,{token:member.accessToken,method:'POST',body:Buffer.from('<script>bad</script>'),headers:{'Content-Type':'image/jpeg','X-Media-Kind':'image'}});
  assert.equal(response.status,415);
  assert.deepEqual(await fs.readdir(path.join(config.storage.mediaDirectory,'.incoming')),[]);
  assert.equal((await request('/api/reports',{token:other.accessToken,method:'DELETE',body:{id:reportId}})).status,404);
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM jikeoro.media')).rows[0].n,1);
});

test('agency permissions follow assignment and cannot change another agency or elevate accounts',async()=>{
  assert.equal((await request('/api/admin/reports',{token:member.accessToken})).status,403);
  let changed=await request('/api/admin/reports',{token:admin.accessToken,method:'PATCH',body:{id:reportId,status:'review',assignedAgency:'기관 A',response:'확인 중입니다.'}});assert.equal(changed.status,200);
  const a=await (await request('/api/admin/reports',{token:agencyA.accessToken})).json();assert.equal(a.reports.length,1);
  const b=await (await request('/api/admin/reports',{token:agencyB.accessToken})).json();assert.equal(b.reports.length,0);
  assert.equal((await request(`/api/media/${mediaId}`,{token:agencyB.accessToken})).status,404);
  assert.equal((await request('/api/admin/reports',{token:agencyA.accessToken,method:'PATCH',body:{id:reportId,status:'action',assignedAgency:'기관 B'}})).status,403);
  assert.equal((await request('/api/admin/accounts',{token:agencyA.accessToken})).status,403);
  changed=await request('/api/admin/reports',{token:agencyA.accessToken,method:'PATCH',body:{id:reportId,status:'action',assignedAgency:'기관 A',response:'현장 확인 중입니다.'}});assert.equal(changed.status,200);
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM jikeoro.report_history WHERE report_id=$1',[reportId])).rows[0].n,3);
});

test('rewards use database points and one pending request, not client-supplied amounts',async()=>{
  assert.equal((await request('/api/rewards',{token:member.accessToken,method:'POST',body:{phone:'01012345678',points:999999}})).status,400);
  for(let i=0;i<4;i++)assert.equal((await request('/api/reports',{token:member.accessToken,method:'POST',body:payload()})).status,201);
  const response=await request('/api/rewards',{token:member.accessToken,method:'POST',body:{phone:'01012345678',points:999999,source:'app'}});assert.equal(response.status,201);
  const reward=(await response.json()).request;assert.equal(reward.exchangePoints,500);
  assert.equal((await request('/api/rewards',{token:member.accessToken,method:'POST',body:{phone:'01012345678'}})).status,409);
  assert.equal((await request(`/api/admin/rewards/${reward.id}`,{token:member.accessToken,method:'PATCH',body:{}})).status,403);
  assert.equal((await request(`/api/admin/rewards/${reward.id}`,{token:admin.accessToken,method:'PATCH',body:{}})).status,200);
  assert.equal((await (await request('/api/rewards',{token:member.accessToken})).json()).availablePoints,0);
});

test('push scheduling deduplicates in Korean time and logout removes the device subscription',async()=>{
  const sub={action:'subscribe',endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:crypto.randomBytes(65).toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  assert.equal((await request('/api/reminders',{token:member.accessToken,method:'POST',body:sub})).status,200);
  assert.equal((await request('/api/reminders',{token:other.accessToken,method:'POST',body:{...sub,keys:{...sub.keys,auth:crypto.randomBytes(16).toString('base64url')}}})).status,409);
  assert.equal(await service.runReminders(new Date('2026-11-18T02:00:00Z')),1);
  assert.equal(await service.runReminders(new Date('2026-11-18T02:05:00Z')),0);
  assert.equal(sent.length,1);assert.match(sent[0].body.body,/오늘도/);
  assert.equal(await service.runReminders(new Date('2026-11-18T10:00:00Z')),1);assert.match(sent[1].body.body,/오늘 보행/);
  assert.equal((await request('/api/auth/logout',{token:member.accessToken,method:'POST',body:{}})).status,200);
  assert.equal((await request('/api/reports',{token:member.accessToken})).status,401);
  assert.equal(await service.runReminders(new Date('2026-11-19T02:00:00Z')),0);
});

test('deletion removes access and cleans associated original and thumbnail files',async()=>{
  const session=await login('member@example.com');
  const row=(await pool.query('SELECT * FROM jikeoro.media WHERE id=$1',[mediaId])).rows[0];
  assert.equal((await request('/api/reports',{token:session.accessToken,method:'DELETE',body:{id:reportId}})).status,200);
  assert.equal((await request(`/api/media/${mediaId}`,{token:session.accessToken})).status,404);
  await assert.rejects(fs.stat(path.join(config.storage.mediaDirectory,row.storage_path)),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(config.storage.mediaDirectory,row.preview_path)),{code:'ENOENT'});
  assert.equal((await request(`/api/map/reports/${reportId}/preview`)).status,404);
});

test('untrusted origins and private configuration URLs are not exposed',async()=>{
  const page=await request('/status');
  // External maps require a Referer; cross-origin requests receive only the origin.
  assert.equal(page.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await request('/api/auth/session',{headers:{Origin:'https://attacker.example'}})).status,403);
  for(const filename of ['/db.env','/api.env','/first-admin.txt','/push-keys.json','/storage.json'])assert.equal((await request(filename)).status,404);
});
