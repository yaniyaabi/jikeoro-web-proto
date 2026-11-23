'use strict';
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Pool}=require('pg');
const {sessionMiddleware,authRoutes}=require('./lib/auth.cjs');
const {reportsRoutes}=require('./lib/reports.cjs');
const {adminRoutes}=require('./lib/admin.cjs');
const {mediaService}=require('./lib/media.cjs');
const {reminderService}=require('./lib/reminders.cjs');
const {loadConfig}=require('./lib/config.cjs');
const {createReportCsvExporter}=require('./lib/report-csv.cjs');

function createApp({pool,config,sendPush,disableRateLimit=false,reportCsv}) {
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy','loopback');
  app.use(helmet({contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https:'],
    imgSrc:["'self'",'data:','blob:','https:'],fontSrc:["'self'",'data:','https:'],
    connectSrc:["'self'",'https:'],workerSrc:["'self'",'blob:'],mediaSrc:["'self'",'blob:'],
    objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:null,
  }},referrerPolicy:{policy:'strict-origin-when-cross-origin'},strictTransportSecurity:config.origin.startsWith('https:') ? undefined : false}));
  app.use((req,res,next)=>{
    const origin=req.get('origin');
    if(origin && !config.allowedOrigins.has(origin)) return res.status(403).json({error:'허용되지 않은 접속 주소입니다.'});
    if(origin) {res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');}
    if(req.method==='OPTIONS') {
      res.set('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-File-Name, X-Media-Kind, X-Media-Id');
      res.set('Access-Control-Max-Age','600');
      return res.status(204).end();
    }
    next();
  });
  app.use(express.json({limit:'256kb',strict:true}));
  app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  if(reportCsv) app.use('/api',(req,res,next)=>{
    if(['POST','PATCH','DELETE','PUT'].includes(req.method)) res.once('finish',()=>{
      if(res.statusCode>=200 && res.statusCode<300) reportCsv.schedule();
    });
    next();
  });
  if(!disableRateLimit) app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'요청이 많습니다. 잠시 후 다시 시도해주세요.'}}));
  app.get('/health',async(req,res)=>{
    let database=false,nas=false;
    try {await pool.query('SELECT 1');database=true;}catch{}
    try {nas=(await fs.stat(config.storage.mediaDirectory)).isDirectory() && (await fs.stat(config.storage.backupDirectory)).isDirectory();}catch{}
    res.status(database&&nas?200:503).json({server:'ok',database:database?'ok':'unavailable',nas:nas?'ok':'unavailable'});
  });
  app.use('/api',sessionMiddleware(pool));
  const media=mediaService(pool,config.storage);
  const reminders=reminderService(pool,config.keys,sendPush?{send:sendPush}:{});
  app.use('/api/auth',authRoutes(pool));
  app.use('/api',reportsRoutes(pool,config.storage,media.cleanup),media.router,adminRoutes(pool),reminders.router);
  app.use('/api',(req,res)=>res.status(404).json({error:'지원하지 않는 요청입니다.'}));
  app.get('/',(req,res)=>res.redirect('/web/'));
  app.get('/status',(req,res)=>res.type('html').send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>지켜로 서버</title></head><body><h1>지켜로 연구실 서버</h1><p><a href="/web/">홈페이지 열기</a> · <a href="/app/">앱 화면 열기</a> · <a href="/health">연결 상태 확인</a></p></body></html>`));
  app.use('/web',express.static(path.join(config.publicDir,'web'),{dotfiles:'deny',index:'index.html',maxAge:0}));
  app.use('/app',express.static(path.join(config.publicDir,'app'),{dotfiles:'deny',index:'index.html',maxAge:0,setHeaders(res,file){if(file.endsWith('sw.js'))res.set('Cache-Control','no-store');}}));
  // Legacy absolute asset paths are resolved only against the public web build.
  app.use(express.static(path.join(config.publicDir,'web'),{dotfiles:'deny',index:false}));
  app.use((req,res)=>res.status(404).type('text').send('Not found'));
  app.use((error,req,res,next)=>{
    if(res.headersSent) return next(error);
    const status=Number.isInteger(error.status) && error.status>=400 && error.status<500 ? error.status : 500;
    if(status===500 && process.env.NODE_ENV!=='test') console.error('Request failed:',error.code||error.name||'UnknownError',error.uploadOperation||'',error.syscall||'');
    res.status(status).json({error:status===500?'요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.':error.type==='entity.too.large'?'입력 내용이 너무 큽니다.':error instanceof SyntaxError?'요청 형식을 확인해주세요.':error.message});
  });
  return {app,cleanup:media.cleanup,runReminders:reminders.runScheduled};
}
async function main() {
  const config=await loadConfig(__dirname);
  const pool=new Pool({host:'127.0.0.1',port:15432,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,max:10,connectionTimeoutMillis:5000,query_timeout:10000});
  pool.on('error',()=>console.error('Database connection interrupted.'));
  try {await pool.query('SELECT version FROM jikeoro.schema_versions WHERE version=1');}
  catch(error) {await pool.end();throw error;}
  const reportCsv=createReportCsvExporter(pool,config.storage,{publicDir:config.publicDir});
  const service=createApp({pool,config,reportCsv});
  const server=service.app.listen(config.port,'127.0.0.1',()=>{
    console.log(`Jikeoro website: http://127.0.0.1:${config.port}/web/`);
    console.log(`Jikeoro app: http://127.0.0.1:${config.port}/app/`);
    console.log('Keep this window and Docker Desktop running.');
    reportCsv.start();
  });
  server.requestTimeout=5*60*1000;
  server.headersTimeout=15000;
  server.on('error',async(error)=>{console.error(error.code==='EADDRINUSE'?'Port 3001 is in use. Stop the previous server with Ctrl+C.':'Could not start server.');await reportCsv.stop();await pool.end();process.exitCode=1;});
  const runMaintenance=async()=>{
    await service.cleanup().catch(()=>{});
    await pool.query('DELETE FROM jikeoro.sessions WHERE expires_at<=now()').catch(()=>{});
  };
  const maintenance=setInterval(runMaintenance,60000);
  const scheduler=setInterval(()=>service.runReminders().catch(()=>{}),30000);
  maintenance.unref();scheduler.unref();
  void runMaintenance();
  const stop=()=>{clearInterval(maintenance);clearInterval(scheduler);server.close(async()=>{await reportCsv.stop();await pool.end();});server.closeIdleConnections();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module) main().catch(()=>{console.error('Server setup is incomplete. Run install-server.cmd first and keep Docker running.');process.exitCode=1;});
module.exports={createApp};
