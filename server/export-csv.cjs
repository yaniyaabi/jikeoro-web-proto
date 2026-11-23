'use strict';
const path=require('node:path');
const {Pool}=require('pg');
const {jsonFile}=require('./lib/config.cjs');
const {createReportCsvExporter}=require('./lib/report-csv.cjs');
async function main() {
  const storage=await jsonFile(path.join(__dirname,'storage.json'));
  const pool=new Pool({host:'127.0.0.1',port:15432,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,max:1,connectionTimeoutMillis:5000,query_timeout:30000});
  try {
    const exporter=createReportCsvExporter(pool,storage,{publicDir:path.join(__dirname,'public')});
    const result=await exporter.refresh();
    console.log('CSV saved:',result.path);
  } finally {await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error('CSV export failed:',error.code||error.message);process.exitCode=1;});
module.exports={main};
