'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
async function jsonFile(filename) {return JSON.parse((await fs.readFile(filename,'utf8')).replace(/^\uFEFF/,''));}
async function loadConfig(root=path.resolve(__dirname,'..')) {
  const storage=await jsonFile(path.join(root,'storage.json'));
  for(const key of ['mediaDirectory','backupDirectory']) {
    if(typeof storage[key]!=='string' || !path.isAbsolute(storage[key])) throw new Error('Invalid NAS configuration.');
  }
  for(const key of ['POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB']) if(!process.env[key]) throw new Error('Missing DB credentials.');
  const keys=await jsonFile(path.join(root,'push-keys.json'));
  const origin=process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:3001';
  const allowedOrigins=new Set(['http://127.0.0.1:3001','http://localhost:3001',origin,...(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);
  return {root,storage,keys,allowedOrigins,origin,publicDir:path.join(root,'public'),port:3001};
}
module.exports={loadConfig,jsonFile};
