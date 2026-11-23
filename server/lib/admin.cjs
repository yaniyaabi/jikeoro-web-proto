'use strict';
const express = require('express');
const { assert,email,password,text,uuid,hashPassword } = require('./security.cjs');
const { requireAdmin,requireUser } = require('./auth.cjs');
const { transaction,earnedPoints } = require('./database.cjs');
function account(user) { return {id:user.id,name:user.name,loginId:user.email,role:user.role,agency:user.agency||'',active:user.active,createdAt:user.created_at}; }
function reward(row) { return {id:row.id,applicantId:row.user_id,name:row.name,email:row.email,phone:row.phone,points:Number(row.earned_points||0),exchangePoints:row.exchange_points,source:row.source,status:row.status,requestedAt:row.requested_at,sentAt:row.sent_at}; }
function adminRoutes(pool) {
  const router = express.Router();
  router.get('/admin/accounts',requireAdmin,async(req,res) => {
    const result = await pool.query(`SELECT * FROM jikeoro.users WHERE role IN ('research_admin','agency_staff') ORDER BY created_at`);
    res.json({accounts:result.rows.map(account)});
  });
  router.post('/admin/accounts',requireAdmin,async(req,res) => {
    const name=text(req.body.name,100),loginId=email(req.body.loginId),agency=text(req.body.agency,200);
    assert(name.length>=2 && agency && ['research_admin','agency_staff'].includes(req.body.role),400,'이름, 권한과 소속 기관을 확인해주세요.');
    const encoded=await hashPassword(password(req.body.password));
    const user = await transaction(pool,async(client) => {
      let result;
      try { result=await client.query('INSERT INTO jikeoro.users(email,name,password_hash,role,agency) VALUES($1,$2,$3,$4,$5) RETURNING *',[loginId,name,encoded,req.body.role,agency]); }
      catch(error) { if(error.code==='23505') assert(false,409,'이미 사용 중인 이메일입니다.'); throw error; }
      await client.query(`INSERT INTO jikeoro.audit_logs(actor_user_id,action,detail) VALUES($1,'staff_account_created',$2)`,[req.user.id,`${loginId} · ${req.body.role}`]);
      return result.rows[0];
    });
    res.status(201).json({account:account(user)});
  });
  router.patch('/admin/accounts',requireAdmin,async(req,res) => {
    const id=uuid(req.body.id),agency=text(req.body.agency,200),active=req.body.active !== false,role=req.body.role;
    assert(agency && ['research_admin','agency_staff'].includes(role),400,'권한과 소속 기관을 확인해주세요.');
    assert(id!==req.user.id || (role==='research_admin' && active),400,'본인 관리자 권한을 낮추거나 중지할 수 없습니다.');
    const user=await transaction(pool,async(client) => {
      const result=await client.query(`UPDATE jikeoro.users SET role=$1,agency=$2,active=$3 WHERE id=$4 AND role IN ('research_admin','agency_staff') RETURNING *`,[role,agency,active,id]);
      assert(result.rows[0],404,'운영 계정을 찾을 수 없습니다.');
      // Revoke all device sessions when staff permissions change.
      if(id!==req.user.id) await client.query('DELETE FROM jikeoro.sessions WHERE user_id=$1',[id]);
      await client.query(`INSERT INTO jikeoro.audit_logs(actor_user_id,action,detail) VALUES($1,'staff_account_updated',$2)`,[req.user.id,`${id} · ${role} · ${active}`]);
      return result.rows[0];
    });
    res.json({account:account(user)});
  });
  router.get('/rewards',requireUser,async(req,res) => {
    const result=await pool.query(`SELECT r.*,u.name,u.email FROM jikeoro.rewards r JOIN jikeoro.users u ON u.id=r.user_id WHERE r.user_id=$1 ORDER BY requested_at DESC`,[req.user.id]);
    const earned=await earnedPoints(pool,req.user.id);
    const spent=result.rows.reduce((sum,row)=>sum+row.exchange_points,0);
    res.json({requests:result.rows.map(reward),points:earned,availablePoints:Math.max(0,earned-spent)});
  });
  router.post('/rewards',requireUser,async(req,res) => {
    assert(req.user.role==='member',403,'주민 계정으로 로그인해주세요.');
    const phone=text(req.body.phone,30).replace(/\D/g,'');
    assert(/^\d{10,11}$/.test(phone),400,'휴대전화 번호를 확인해주세요.');
    const record=await transaction(pool,async(client) => {
      await client.query('SELECT id FROM jikeoro.users WHERE id=$1 FOR UPDATE',[req.user.id]);
      const existing=await client.query('SELECT * FROM jikeoro.rewards WHERE user_id=$1',[req.user.id]);
      assert(!existing.rows.some(row=>row.status==='pending'),409,'이미 처리 중인 교환 신청이 있습니다.');
      const earned=await earnedPoints(client,req.user.id);
      assert(earned-existing.rows.reduce((sum,row)=>sum+row.exchange_points,0)>=500,400,'교환 가능한 마일리지가 부족합니다.');
      const result=await client.query(`INSERT INTO jikeoro.rewards(user_id,phone,source,earned_points) VALUES($1,$2,$3,$4) RETURNING *`,[req.user.id,phone,req.body.source==='app'?'app':'web',earned]);
      return {...result.rows[0],name:req.user.name,email:req.user.email,earned_points:earned};
    });
    res.status(201).json({request:reward(record)});
  });
  router.get('/admin/rewards',requireAdmin,async(req,res) => {
    const result=await pool.query('SELECT r.*,u.name,u.email FROM jikeoro.rewards r JOIN jikeoro.users u ON u.id=r.user_id ORDER BY requested_at DESC LIMIT 5000');
    res.json({requests:result.rows.map(reward)});
  });
  router.patch('/admin/rewards/:id',requireAdmin,async(req,res) => {
    const id=uuid(req.params.id);
    const record=await transaction(pool,async(client) => {
      const result=await client.query(`UPDATE jikeoro.rewards SET status='sent',sent_at=COALESCE(sent_at,now()) WHERE id=$1 RETURNING *`,[id]);
      assert(result.rows[0],404,'교환 신청을 찾을 수 없습니다.');
      await client.query(`INSERT INTO jikeoro.audit_logs(actor_user_id,action,detail) VALUES($1,'reward_marked_sent',$2)`,[req.user.id,id]);
      return result.rows[0];
    });
    res.json({ok:true,id:record.id,status:record.status,sentAt:record.sent_at});
  });
  return router;
}
module.exports={adminRoutes};
