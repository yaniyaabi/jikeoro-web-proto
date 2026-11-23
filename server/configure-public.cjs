'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createInterface}=require('node:readline/promises');
async function main() {
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  let origin;
  try {
    const input=(await terminal.question('Public HTTPS server address: ')).trim();
    const url=new URL(input);
    if(url.protocol!=='https:' || url.username || url.password || ['localhost','127.0.0.1','::1'].includes(url.hostname))throw new Error('Enter the public HTTPS address, without a password.');
    origin=url.origin;
  } finally {terminal.close();}
  const filename=path.join(__dirname,'api.env');
  const original=await fs.readFile(filename,'utf8');
  let updated=original.replace(/^PUBLIC_ORIGIN=.*$/m,`PUBLIC_ORIGIN=${origin}`);
  if(!/^PUBLIC_ORIGIN=/m.test(updated))updated+=`\nPUBLIC_ORIGIN=${origin}\n`;
  if(/^ALLOWED_ORIGINS=/m.test(updated)) {
    updated=updated.replace(/^ALLOWED_ORIGINS=(.*)$/m,(_,value)=>`ALLOWED_ORIGINS=${[...new Set([...value.split(',').filter(Boolean),'https://yaniyaabi.github.io'])].join(',')}`);
  } else updated+='\nALLOWED_ORIGINS=https://yaniyaabi.github.io\n';
  await fs.writeFile(filename,updated,{mode:0o600});
  console.log('Public address configured:',origin);
  console.log('Restart start-server.cmd to apply. Configure this address as JIKEORO_API_BASE_URL in both GitHub repositories when ready to switch.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
