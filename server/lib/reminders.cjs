'use strict';
const express = require('express');
const webpush = require('web-push');
const { assert,text } = require('./security.cjs');
const { requireUser } = require('./auth.cjs');

const HOURS = [11,19];
function subscriptionInput(body) {
  const endpoint=text(body.endpoint,2048);
  let url;
  try { url=new URL(endpoint); } catch { assert(false,400,'알림 기기 정보를 확인해주세요.'); }
  const host=url.hostname.toLowerCase();
  const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  assert(url.protocol==='https:' && !url.username && !url.password && (!url.port || url.port==='443') && allowed,400,'지원하지 않는 알림 서버입니다.');
  const p256dh=body.keys?.p256dh,auth=body.keys?.auth;
  assert(typeof p256dh==='string' && /^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) && Buffer.from(p256dh,'base64url').length===65,400,'알림 암호화 키를 확인해주세요.');
  assert(typeof auth==='string' && /^[A-Za-z0-9_-]+={0,2}$/.test(auth) && Buffer.from(auth,'base64url').length===16,400,'알림 인증 키를 확인해주세요.');
  return {endpoint,p256dh,auth};
}
function koreanMoment(now) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${values.year}-${values.month}-${values.day}`,hour:Number(values.hour),minute:Number(values.minute)};
}
function payload(hour,test=false) {
  return JSON.stringify({title:'지켜로와 함께해요!',body:hour===11?'오늘도 지켜로와 함께 걸어볼까요? 오늘의 보행을 기록해요.':'오늘 보행은 어땠나요? 지켜로와 함께 하루를 돌아봐요.',test});
}
function reminderService(pool,keys,{send=webpush.sendNotification.bind(webpush)}={}) {
  const options={vapidDetails:{subject:keys.subject,publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:600,timeout:10000};
  const sendOne=(sub,message)=>send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},message,options);
  const router=express.Router();
  router.get('/reminders', (req,res)=>res.json({publicKey:keys.publicKey,hours:HOURS}));
  router.post('/reminders',requireUser,async(req,res)=>{
    const action=req.body.action;
    const endpoint=text(req.body.endpoint,2048);
    if(action==='subscribe') {
      const input=subscriptionInput(req.body);
      const registered=await pool.query(`INSERT INTO jikeoro.push_subscriptions(user_id,session_hash,endpoint,p256dh,auth,enabled)
        VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,enabled=true
        WHERE jikeoro.push_subscriptions.p256dh=EXCLUDED.p256dh AND jikeoro.push_subscriptions.auth=EXCLUDED.auth RETURNING id`,
      [req.user.id,req.user.session_hash,input.endpoint,input.p256dh,input.auth]);
      assert(registered.rows.length,409,'다른 알림 기기에 등록된 주소입니다. 알림을 다시 허용해주세요.');
      return res.json({enabled:true,hours:HOURS});
    }
    if(action==='status') {
      const result=await pool.query('SELECT enabled FROM jikeoro.push_subscriptions WHERE endpoint=$1 AND user_id=$2 AND session_hash=$3',[endpoint,req.user.id,req.user.session_hash]);
      return res.json({enabled:result.rows[0]?.enabled===true,hours:HOURS});
    }
    if(action==='disable') {
      await pool.query('UPDATE jikeoro.push_subscriptions SET enabled=false WHERE endpoint=$1 AND user_id=$2 AND session_hash=$3',[endpoint,req.user.id,req.user.session_hash]);
      return res.json({enabled:false,hours:HOURS});
    }
    if(action==='test') {
      const result=await pool.query(`UPDATE jikeoro.push_subscriptions SET last_test_at=now()
        WHERE endpoint=$1 AND user_id=$2 AND session_hash=$3 AND enabled=true AND (last_test_at IS NULL OR last_test_at<now()-interval '1 minute') RETURNING *`,[endpoint,req.user.id,req.user.session_hash]);
      assert(result.rows[0],429,'알림을 켠 뒤 다시 시도해주세요. 테스트는 1분에 한 번 가능합니다.');
      await sendOne(result.rows[0],payload(koreanMoment(new Date()).hour,true));
      return res.json({ok:true});
    }
    assert(false,400,'지원하지 않는 알림 요청입니다.');
  });
  let running=false;
  async function runScheduled(now=new Date()) {
    if(running) return 0;
    const moment=koreanMoment(now);
    if(!HOURS.includes(moment.hour) || moment.minute>=10) return 0;
    running=true;
    let count=0;
    try {
      const result=await pool.query(`SELECT p.* FROM jikeoro.push_subscriptions p
        JOIN jikeoro.sessions s ON s.token_hash=p.session_hash JOIN jikeoro.users u ON u.id=p.user_id
        WHERE p.enabled=true AND s.expires_at>now() AND u.active=true ORDER BY p.created_at`);
      for(const sub of result.rows) {
        const claimed=await pool.query(`INSERT INTO jikeoro.push_deliveries(subscription_id,local_date,hour) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING subscription_id`,[sub.id,moment.date,moment.hour]);
        if(!claimed.rows.length) continue;
        try {
          const active=await pool.query(`SELECT p.id FROM jikeoro.push_subscriptions p JOIN jikeoro.sessions s ON s.token_hash=p.session_hash JOIN jikeoro.users u ON u.id=p.user_id WHERE p.id=$1 AND p.enabled=true AND s.expires_at>now() AND u.active=true`,[sub.id]);
          if(!active.rows.length) continue;
          await sendOne(sub,payload(moment.hour));
          count++;
        } catch(error) {
          if(error.statusCode===404 || error.statusCode===410) await pool.query('DELETE FROM jikeoro.push_subscriptions WHERE id=$1',[sub.id]);
          else await pool.query('DELETE FROM jikeoro.push_deliveries WHERE subscription_id=$1 AND local_date=$2 AND hour=$3',[sub.id,moment.date,moment.hour]);
        }
      }
    } finally {running=false;}
    return count;
  }
  return {router,runScheduled};
}
module.exports={reminderService,koreanMoment,subscriptionInput};
