'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Pool,Client}=require('pg');
const webpush=require('web-push');
const {hashPassword}=require('./lib/security.cjs');
const {jsonFile}=require('./lib/config.cjs');

async function main() {
  const root=__dirname;
  const admin=new Client({host:'127.0.0.1',port:15432,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,connectionTimeoutMillis:5000});
  await admin.connect();
  let settings;
  try {settings=await fs.readFile(path.join(root,'api.env'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const previous=settings?.match(/^POSTGRES_PASSWORD=([A-Fa-f0-9]{64})\s*$/m)?.[1];
  const appPassword=previous || crypto.randomBytes(32).toString('hex');
  try {
    await admin.query('BEGIN');
    await admin.query('SELECT pg_advisory_xact_lock(78182026)');
    await admin.query(await fs.readFile(path.join(root,'schema.sql'),'utf8'));
    const role=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='jikeoro_api'");
    // Only a generated hexadecimal secret is interpolated; role and identifier are constants.
    if(!role.rows.length) await admin.query(`CREATE ROLE jikeoro_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${appPassword}'`);
    else await admin.query(`ALTER ROLE jikeoro_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${appPassword}'`);
    await admin.query('GRANT CONNECT ON DATABASE jikeoro TO jikeoro_api');
    await admin.query('GRANT USAGE ON SCHEMA jikeoro TO jikeoro_api');
    await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA jikeoro TO jikeoro_api');
    await admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA jikeoro TO jikeoro_api');
    const count=await admin.query("SELECT COUNT(*)::integer AS count FROM jikeoro.users WHERE role='research_admin'");
    if(!count.rows[0].count) {
      let password;
      try {
        const old=await fs.readFile(path.join(root,'first-admin.txt'),'utf8');
        password=old.match(/^Password: ([A-Za-z0-9_-]{24})\s*$/m)?.[1];
        if(!password)throw new Error('Existing first-admin.txt needs review.');
      } catch(error) {if(error.code!=='ENOENT')throw error;}
      const existed=Boolean(password);
      password??=crypto.randomBytes(18).toString('base64url');
      const encoded=await hashPassword(password);
      await admin.query("INSERT INTO jikeoro.users(email,name,password_hash,role,agency) VALUES('admin@jikeoro.local','지켜로 운영자',$1,'research_admin','HDL')",[encoded]);
      // Create the private credentials file before committing so a file failure rolls back the admin creation.
      if(!existed)await fs.writeFile(path.join(root,'first-admin.txt'),`Initial local administrator\r\nEmail: admin@jikeoro.local\r\nPassword: ${password}\r\n\r\nKeep this file private.\r\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    }
    if(!settings) await fs.writeFile(path.join(root,'api.env'),`POSTGRES_DB=jikeoro\nPOSTGRES_USER=jikeoro_api\nPOSTGRES_PASSWORD=${appPassword}\nPUBLIC_ORIGIN=http://127.0.0.1:3001\n`,{mode:0o600,flag:'wx'});
    if(settings && !previous) throw new Error('Existing api.env needs review. No passwords changed.');
    await admin.query('COMMIT');
  } catch(error) {await admin.query('ROLLBACK').catch(()=>{});throw error;}
  finally {await admin.end();}
  let keys;
  try {keys=await jsonFile(path.join(root,'push-keys.json'));}catch(error) {
    if(error.code!=='ENOENT')throw error;
    keys={...webpush.generateVAPIDKeys(),subject:'mailto:healthdesignlab@kaist.ac.kr'};
    await fs.writeFile(path.join(root,'push-keys.json'),JSON.stringify(keys,null,2),{mode:0o600,flag:'wx'});
  }
  const storage=await jsonFile(path.join(root,'storage.json'));
  for(const directory of [storage.mediaDirectory,storage.backupDirectory]) {
    if(!path.isAbsolute(directory) || !(await fs.stat(directory)).isDirectory())throw new Error('NAS folder not available.');
  }
  const runtime=new Pool({host:'127.0.0.1',port:15432,user:'jikeoro_api',password:appPassword,database:'jikeoro',connectionTimeoutMillis:5000});
  try {
    await runtime.query('SELECT version FROM jikeoro.schema_versions WHERE version=1');
    const role=await runtime.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user');
    if(role.rows[0].rolsuper || role.rows[0].rolcreatedb || role.rows[0].rolcreaterole)throw new Error('Runtime role is too privileged.');
  } finally {await runtime.end();}
  console.log('Local server setup complete.');
  console.log('Administrator credentials: first-admin.txt (keep private).');
}
if(require.main===module) main().catch((error)=>{console.error('Setup failed:',error.code||error.message);process.exitCode=1;});
