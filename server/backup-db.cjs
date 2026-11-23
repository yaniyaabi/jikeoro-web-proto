'use strict';
const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const {jsonFile}=require('./lib/config.cjs');
async function main() {
  const storage=await jsonFile(path.join(__dirname,'storage.json'));
  if(!path.isAbsolute(storage.backupDirectory))throw new Error('Invalid backup folder.');
  if(!(await fs.stat(storage.backupDirectory)).isDirectory())throw new Error('NAS backup folder is not accessible.');
  const name=`jikeoro-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.dump`;
  const target=path.join(storage.backupDirectory,name),partial=target+'.partial';
  const command=process.platform==='win32'?'docker.exe':'docker';
  const child=spawn(command,['compose','exec','-T','db','pg_dump','--format=custom','--no-owner','--no-acl','--username=jikeoro_admin','--dbname=jikeoro'],{cwd:__dirname,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let errorText='';
  child.stderr.on('data',chunk=>{if(errorText.length<4000)errorText+=chunk.toString();});
  const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('DB backup failed. Check Docker and the db service.')));});
  completed.catch(()=>{});
  try {
    await pipeline(child.stdout,createWriteStream(partial,{flags:'wx'}));
    await completed;
    if((await fs.stat(partial)).size<100)throw new Error('Backup is incomplete.');
    await fs.rename(partial,target);
    const hash=crypto.createHash('sha256');
    for await(const chunk of createReadStream(target))hash.update(chunk);
    await fs.writeFile(target+'.sha256',hash.digest('hex')+'  '+name+'\n',{flag:'wx'});
    console.log('DB backup saved:',target);
  } catch(error) {
    child.kill();await fs.unlink(partial).catch(()=>{});throw error;
  }
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
