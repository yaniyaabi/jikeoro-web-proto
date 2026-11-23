'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const HEADERS = ['사용자 ID','사용자 이름','제보 ID','등록 일시 (한국 시간)','수정 일시 (한국 시간)','관찰 일시 (한국 시간)',
  '등록 경로','위치','주소','위치 설명','위도','경도','GPS 오차 (m)','날씨','기온 (°C)','날씨 코드',
  '날씨 관측 일시 (한국 시간)','날씨 원본 (JSON)','위험요소 유형','위험요소 세부유형','제목','설명',
  '처리 상태','담당 기관','처리 답변','사진 수','영상 수','음성 수','첨부파일 수','첨부파일 원본 경로','사진 미리보기 경로','첨부파일 정보 (JSON)'];
// One statement gives a consistent snapshot of reports, authors and attachments.
// No public-map LIMIT: old reports and reports without GPS must also be exported.
const QUERY = `SELECT r.id,r.user_id,u.name AS user_name,r.source,r.category,r.subcategory,r.title,r.description,
  r.latitude,r.longitude,r.accuracy,r.address,r.place_description,r.status,r.assigned_agency,r.response,
  r.observed_at,r.weather,r.created_at,r.updated_at,
  COALESCE((SELECT json_agg(json_build_object('id',m.id,'kind',m.kind,'name',m.original_name,
    'bytes',m.size_bytes,'path',m.storage_path,'preview',m.preview_path) ORDER BY m.created_at,m.id)
    FROM jikeoro.media m WHERE m.report_id=r.id),'[]'::json) AS attachments
  FROM jikeoro.reports r JOIN jikeoro.users u ON u.id=r.user_id ORDER BY r.created_at,r.id`;
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function koreanTime(value) {
  if (!value) return '';
  // Open-Meteo timestamps from the clients already use Korean time but may omit an offset.
  const input = typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? value+'+09:00' : value;
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '';
}
function weatherLabel(code) {
  if (code === null || code === undefined || code === '') return '기록 없음';
  const n = Number(code);
  if (n === 0) return '맑음';
  if ([1,2,3].includes(n)) return '구름';
  if ([45,48].includes(n)) return '안개';
  if ((n>=51 && n<=67) || (n>=80 && n<=82)) return '비';
  if ((n>=71 && n<=77) || [85,86].includes(n)) return '눈';
  if ([95,96,99].includes(n)) return '뇌우';
  return '기타 ('+String(code)+')';
}
function cell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value).replace(/\u0000/g,'');
  // Quoting CSV fields alone does not prevent spreadsheet formula execution.
  if (typeof value !== 'number' && /^[\s\u0000-\u0020]*[=+\-@]/.test(text)) text = "'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
function makeCsv(rows, mediaDirectory) {
  const statuses = {received:'접수',review:'현장 검토',action:'조치 진행',completed:'처리 완료'};
  const lines = [HEADERS.map(cell).join(',')];
  for (const r of rows) {
    const weather = r.weather && typeof r.weather === 'object' ? r.weather : null;
    const files = r.attachments || [];
    const originalPaths = files.map(f=>path.join(mediaDirectory,f.path));
    const previews = files.filter(f=>f.preview).map(f=>path.join(mediaDirectory,f.preview));
    const location = r.address || r.place_description || (r.latitude != null ? `${r.latitude}, ${r.longitude}` : '기록 없음');
    const data = [r.user_id,r.user_name,r.id,koreanTime(r.created_at),koreanTime(r.updated_at),koreanTime(r.observed_at),
      r.source==='senior_app'?'앱':'홈페이지',location,r.address,r.place_description,r.latitude,r.longitude,r.accuracy,
      weatherLabel(weather?.code),weather?.temperature,weather?.code,koreanTime(weather?.observedAt),weather?JSON.stringify(weather):'',
      r.category,r.subcategory,r.title,r.description,statuses[r.status]||r.status,r.assigned_agency,r.response,
      files.filter(f=>f.kind==='image').length,files.filter(f=>f.kind==='video').length,files.filter(f=>f.kind==='audio').length,files.length,
      originalPaths.join('\n'),previews.join('\n'),JSON.stringify(files)];
    lines.push(data.map(cell).join(','));
  }
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
function exportDirectory(storage, publicDir) {
  if(storage.exportsDirectory && !path.isAbsolute(storage.exportsDirectory)) throw new Error('CSV export folder must be an absolute path.');
  const directory = path.resolve(storage.exportsDirectory || path.join(path.dirname(storage.mediaDirectory),'exports'));
  // Never create identified research data inside a directory served to visitors.
  if (publicDir) {
    const relative = path.relative(path.resolve(publicDir),directory);
    if (!relative || (!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative))) throw new Error('CSV exports must be outside the public website folder.');
  }
  return directory;
}
function createReportCsvExporter(pool, storage, {publicDir,io=fs,log=console.log,warn=console.error,intervalMs=60000,debounceMs=1500}={}) {
  const directory = exportDirectory(storage,publicDir), filename = path.join(directory,'제보목록.csv');
  let lastHash=null, running=null, timer=null, interval=null, again=false, stopped=false, lastError=null;
  async function writeSnapshot() {
    const result = await pool.query(QUERY);
    const bytes = Buffer.from(makeCsv(result.rows,storage.mediaDirectory),'utf8');
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (lastHash===hash) {
      const exists = await io.stat(filename).then(s=>s.isFile() && s.size===bytes.length).catch(()=>false);
      if (exists) return {path:filename,reports:result.rows.length,changed:false};
    }
    await io.mkdir(directory,{recursive:true});
    const temporary = path.join(directory,'.reports-'+crypto.randomUUID()+'.tmp');
    try {
      const handle = await io.open(temporary,'wx',0o600);
      try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
      // Same-folder replacement keeps the previous complete CSV if Excel/NAS locks it.
      await io.rename(temporary,filename);
    } finally {await io.unlink(temporary).catch(()=>{});}
    lastHash=hash;
    log(`NAS CSV updated: ${result.rows.length} reports. Folder: ${directory}`);
    return {path:filename,reports:result.rows.length,changed:true};
  }
  function describeError(error) {
    const code = error.code || error.name || 'UnknownError';
    if (lastError!==code) warn(`NAS CSV update pending (${code}). Close the CSV in Excel and check the NAS connection. The previous CSV is kept; automatic retry is enabled.`);
    lastError=code;
  }
  function schedule(delay=debounceMs) {
    if (stopped) return;
    if (running) {again=true;return;}
    if (timer) return;
    timer=setTimeout(()=>{timer=null;void refresh().catch(describeError);},delay);
    timer.unref?.();
  }
  function refresh() {
    if (stopped) return Promise.reject(new Error('CSV exporter has stopped.'));
    if (running) {again=true;return running;}
    running=writeSnapshot().then(result=>{lastError=null;return result;}).finally(()=>{
      running=null;
      if (again) {again=false;schedule();}
    });
    return running;
  }
  function start() {
    if (stopped || interval) return;
    interval=setInterval(()=>schedule(0),intervalMs);interval.unref?.();schedule(0);
  }
  async function stop() {
    stopped=true;clearInterval(interval);clearTimeout(timer);
    if (running) await running.catch(()=>{});
  }
  return {filename,refresh,schedule,start,stop};
}
module.exports={createReportCsvExporter,makeCsv,koreanTime,weatherLabel,HEADERS};
