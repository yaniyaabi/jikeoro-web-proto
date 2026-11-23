'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {createReadStream} = require('node:fs');
const TABLES = ['auth_users','profiles','reports','report_media','report_status_history','admin_audit_logs','storage_objects'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['received','review','action','completed']);
const ROLES = new Set(['member','research_admin','agency_staff']);

function parseCsv(text) {
  const rows=[]; let row=[], value='', quoted=false, closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"' && text[i+1]==='"') {value+='"';i++;}
      else if(c==='"') {quoted=false;closed=true;}
      else value+=c;
    } else if(c==='"') {
      if(value || closed)throw new Error('Invalid CSV quoting. Download the original CSV again.');
      quoted=true;
    } else if(c===',' || c==='\r' || c==='\n') {
      row.push(value);value='';closed=false;
      if(c!==',') {rows.push(row);row=[];if(c==='\r' && text[i+1]==='\n')i++;}
    } else {
      if(closed)throw new Error('Unexpected text after a CSV value.');
      value+=c;
    }
  }
  if(quoted)throw new Error('CSV is incomplete. Download the original CSV again.');
  if(value || row.length || closed) {row.push(value);rows.push(row);}
  return rows.filter(r=>r.some(v=>v.length));
}
function parseExport(bytes) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').trim();
  let data;
  if(text.startsWith('{'))data=JSON.parse(text);
  else {
    const rows=parseCsv(text),column=rows[0]?.indexOf('jikeoro_export');
    if(column===undefined || column<0 || rows.length!==2 || rows[1].length!==rows[0].length)throw new Error('Expected one CSV result row named jikeoro_export.');
    data=JSON.parse(rows[1][column]);
  }
  if(data?.format!=='jikeoro-supabase-export' || data.version!==1)throw new Error('Unsupported migration export.');
  for(const table of TABLES) {
    if(!Array.isArray(data[table]) || data.row_counts?.[table]!==data[table].length)throw new Error(`Incomplete export table: ${table}`);
  }
  if(!Array.isArray(data.public_table_inventory))throw new Error('Missing source table inventory.');
  return data;
}
function safeRelative(value) {
  return typeof value==='string' && value.length>0 && !/[\\:\x00-\x1f]/.test(value) && !value.startsWith('/') && value.split('/').every(p=>p && p!=='.' && p!=='..' && !/[. ]$/.test(p));
}
function within(root,file) {const relative=path.relative(root,file);return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);}
function iso(value) {return typeof value==='string' && Number.isFinite(Date.parse(value));}
async function hashFile(filename) {const h=crypto.createHash('sha256');for await(const chunk of createReadStream(filename))h.update(chunk);return h.digest('hex');}

async function checkExport(data,{mediaRoot,pool,onProgress=()=>{}}) {
  const issues=[], files=[];
  const add=(severity,code,table,id)=>issues.push({severity,code,table,...(id!==undefined?{id:String(id)}:{})});
  const maps={};
  for(const table of TABLES) {
    maps[table]=new Map();
    for(const row of data[table]) {
      const key=String(row?.id);
      if(!row || typeof row!=='object' || Array.isArray(row) || (!['report_status_history','admin_audit_logs'].includes(table) && !UUID.test(key)) || (['report_status_history','admin_audit_logs'].includes(table) && !/^[1-9][0-9]*$/.test(key))) {add('error','invalid_record_id',table);continue;}
      if(maps[table].has(key))add('error','duplicate_record_id',table,key);
      maps[table].set(key,row);
    }
  }
  const emailIds=new Map();
  for(const u of data.auth_users) {
    if(typeof u.email!=='string' || !/^\S+@\S+\.\S+$/.test(u.email) || u.email.length>254)add('error','email_login_needs_review','auth_users',u.id);
    else {const email=u.email.trim().toLowerCase();if(emailIds.has(email))add('error','duplicate_email','auth_users',u.id);emailIds.set(email,u.id);}
    if(typeof u.encrypted_password!=='string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(u.encrypted_password))add('error','password_login_needs_review','auth_users',u.id);
    if(!iso(u.created_at))add('error','invalid_created_at','auth_users',u.id);
    if(u.deleted_at || (u.banned_until && new Date(u.banned_until)>new Date()))add('warning','inactive_source_user','auth_users',u.id);
    if(!u.email_confirmed_at)add('warning','unconfirmed_source_email','auth_users',u.id);
  }
  for(const p of data.profiles) {
    if(!maps.auth_users.has(p.id))add('error','missing_auth_user','profiles',p.id);
    if(!ROLES.has(p.role) || (p.role==='agency_staff' && !p.agency?.trim()))add('error','invalid_role_or_agency','profiles',p.id);
    if(typeof p.name!=='string' || !p.name.trim())add('warning','empty_name_uses_email_prefix','profiles',p.id);
    if(p.name?.length>100)add('error','name_too_long','profiles',p.id);
  }
  for(const u of data.auth_users)if(!maps.profiles.has(u.id))add('warning','auth_user_without_profile','auth_users',u.id);
  for(const r of data.reports) {
    if(!maps.profiles.has(r.user_id))add('error','missing_owner','reports',r.id);
    if(!STATUSES.has(r.status) || !['website','senior_app'].includes(r.source))add('error','invalid_status_or_source','reports',r.id);
    if(typeof r.category!=='string' || typeof r.title!=='string' || typeof r.description!=='string')add('error','invalid_report_text','reports',r.id);
    if(Number(r.points)!==100)add('error','nonstandard_points_need_review','reports',r.id);
    const hasLat=r.latitude!==null && r.latitude!==undefined,hasLng=r.longitude!==null && r.longitude!==undefined;
    if(hasLat!==hasLng || (hasLat && (!Number.isFinite(r.latitude) || r.latitude< -90 || r.latitude>90 || !Number.isFinite(r.longitude) || r.longitude< -180 || r.longitude>180)))add('error','invalid_coordinates','reports',r.id);
    if(r.accuracy!==null && r.accuracy!==undefined && (!Number.isFinite(r.accuracy) || r.accuracy<0 || r.accuracy>1000000))add('error','invalid_accuracy','reports',r.id);
    if(!iso(r.created_at) || !iso(r.updated_at) || (r.observed_at && !iso(r.observed_at)))add('error','invalid_report_time','reports',r.id);
  }
  for(const table of ['report_status_history','admin_audit_logs'])for(const row of data[table]) {
    if((table==='report_status_history' || row.report_id) && !maps.reports.has(row.report_id))add('error','missing_report',table,row.id);
    if((table==='admin_audit_logs' || row.actor_user_id) && !maps.profiles.has(row.actor_user_id))add('error','missing_actor',table,row.id);
    if(table==='report_status_history' && !STATUSES.has(row.status))add('error','invalid_history_status',table,row.id);
    if(!iso(row.created_at))add('error','invalid_created_at',table,row.id);
  }
  const knownTables=new Set(['profiles','reports','report_media','report_status_history','admin_audit_logs','walking_push_config','walking_push_subscriptions']);
  for(const table of data.public_table_inventory)if(!knownTables.has(table))add('error','additional_source_table_needs_review',String(table));
  const objectNames=new Set(data.storage_objects.map(o=>o.name)),referenced=new Set();
  let canonicalRoot;
  try {canonicalRoot=await fs.realpath(mediaRoot);if(!(await fs.stat(canonicalRoot)).isDirectory())throw new Error();}
  catch {add('error','original_media_folder_not_accessible','report_media');}
  let processed=0,totalBytes=0;
  for(const m of data.report_media) {
    const r=maps.reports.get(m.report_id);
    if(!r || m.user_id!==r.user_id)add('error','media_owner_or_report_mismatch','report_media',m.id);
    if(!['image','video','audio'].includes(m.kind))add('error','invalid_media_kind','report_media',m.id);
    if(!iso(m.created_at))add('error','invalid_created_at','report_media',m.id);
    if(!safeRelative(m.storage_path)) {add('error','unsafe_storage_path','report_media',m.id);continue;}
    if(referenced.has(m.storage_path))add('error','duplicate_storage_path','report_media',m.id);
    referenced.add(m.storage_path);
    if(!objectNames.has(m.storage_path))add('error','missing_storage_inventory_entry','report_media',m.id);
    if(canonicalRoot) {
      try {
        const actual=await fs.realpath(path.join(canonicalRoot,...m.storage_path.split('/')));
        if(!within(canonicalRoot,actual))throw new Error('outside');
        const stat=await fs.stat(actual);
        if(!stat.isFile() || stat.size===0)throw new Error('empty');
        if(Number(m.size_bytes)>0 && Number(m.size_bytes)!==stat.size)add('error','file_size_mismatch','report_media',m.id);
        const object=data.storage_objects.find(o=>o.name===m.storage_path),inventorySize=Number(object?.metadata?.size);
        if(inventorySize>0 && inventorySize!==stat.size)add('error','inventory_size_mismatch','report_media',m.id);
        files.push({id:m.id,storage_path:m.storage_path,size_bytes:stat.size,sha256:await hashFile(actual)});
        totalBytes+=stat.size;
      } catch {add('error','file_missing_empty_or_unreadable','report_media',m.id);}
    }
    processed++;
    if(processed%25===0)onProgress(processed,data.report_media.length);
  }
  let localCounts=null;
  if(pool) {
    const client=await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='15s'");
      const users=(await client.query('SELECT id,email FROM jikeoro.users')).rows;
      for(const u of users) {
        const sourceId=emailIds.get(u.email.toLowerCase());
        if(sourceId && sourceId!==u.id)add('error','local_email_collision','auth_users',sourceId);
        const sameId=maps.auth_users.get(u.id);
        if(sameId && sameId.email.toLowerCase()!==u.email.toLowerCase())add('error','local_user_id_collision','auth_users',u.id);
      }
      const reports=(await client.query('SELECT id,user_id FROM jikeoro.reports')).rows;
      for(const r of reports)if(maps.reports.has(r.id))add('error','report_already_exists_locally','reports',r.id);
      const media=(await client.query('SELECT id FROM jikeoro.media')).rows;
      for(const m of media)if(maps.report_media.has(m.id))add('error','media_already_exists_locally','report_media',m.id);
      localCounts={users:users.length,reports:reports.length,media:media.length};
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
    finally {client.release();}
  }
  const unusedObjects=[...objectNames].filter(name=>!referenced.has(name)).length;
  return {format:'jikeoro-migration-check',version:1,checked_at:new Date().toISOString(),exported_at:data.exported_at,ready:!issues.some(i=>i.severity==='error'),exported_counts:data.row_counts,local_counts:localCounts,checked_files:files.length,total_bytes:totalBytes,unreferenced_storage_objects:unusedObjects,issues,files};
}

async function main() {
  const serverRoot=path.join(process.env.USERPROFILE,'jikeoro-server');
  const directory=path.join(process.env.USERPROFILE,'jikeoro-migration');
  const csvs=(await fs.readdir(directory)).filter(n=>/\.csv$/i.test(n));
  if(csvs.length!==1)throw new Error('Keep exactly one Supabase export CSV in the jikeoro-migration folder.');
  const bytes=await fs.readFile(path.join(directory,csvs[0])),data=parseExport(bytes);
  const storage=JSON.parse((await fs.readFile(path.join(serverRoot,'storage.json'),'utf8')).replace(/^\uFEFF/,''));
  const mediaRoot=path.join(path.dirname(storage.mediaDirectory),'supabase-originals','report-media');
  const {Pool}=require(path.join(serverRoot,'node_modules','pg'));
  const pool=new Pool({host:'127.0.0.1',port:15432,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,connectionTimeoutMillis:5000});
  let report;
  try {report=await checkExport(data,{mediaRoot,pool,onProgress:(n,total)=>console.log(`Checking files: ${n}/${total}`)});}
  finally {await pool.end();}
  report.csv_sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const output=path.join(directory,'migration-check-result.json');
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const errors=report.issues.filter(i=>i.severity==='error').length,warnings=report.issues.length-errors;
  console.log(`Users: ${data.auth_users.length}; Reports: ${data.reports.length}; Media: ${data.report_media.length}`);
  console.log(`Checked files: ${report.checked_files}/${data.report_media.length}`);
  console.log(`Errors: ${errors}; Warnings: ${warnings}`);
  console.log(report.ready?'CHECK OK - no database records were changed.':'CHECK NEEDS REVIEW - no database records were changed.');
  const codes=[...new Set(report.issues.map(i=>i.code))];
  if(codes.length)console.log('Review codes:',codes.join(', '));
  console.log('Private check report saved in the jikeoro-migration folder.');
  process.exitCode=report.ready?0:2;
}
module.exports={parseCsv,parseExport,safeRelative,checkExport};
if(require.main===module)main().catch(error=>{console.error('Check failed:',error.code||error.message);process.exitCode=1;});
