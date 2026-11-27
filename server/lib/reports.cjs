'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { assert,text,uuid,canReadReport,publicUser } = require('./security.cjs');
const { requireUser,requireStaff } = require('./auth.cjs');
const { transaction } = require('./database.cjs');

const CATEGORIES = ['인도','횡단보도','조도','날씨 관련 위험','기타'];
const STATUSES = ['received','review','action','completed'];
function numeric(value,low,high) {
  if (value === null || value === undefined || value === '') return null;
  assert(typeof value === 'number' && Number.isFinite(value) && value>=low && value<=high,400,'위치 정보를 확인해주세요.');
  return value;
}
function newReport(body) {
  const category = text(body.category ?? body.type,50);
  assert(CATEGORIES.includes(category),400,'위험 유형을 선택해주세요.');
  const latitude = numeric(body.latitude,-90,90),longitude = numeric(body.longitude,-180,180);
  assert((latitude === null) === (longitude === null),400,'위도와 경도를 함께 확인해주세요.');
  const address = text(body.address,1000) || null;
  const place = text(body.placeDescription ?? body.place_description ?? body.place,1000) || null;
  assert(latitude !== null || address || place,400,'위치 정보를 입력해주세요.');
  const subcategory = text(body.subcategory,100) || null;
  assert(subcategory,400,'세부 위험 유형을 선택해주세요.');
  const description = text(body.description,10000);
  const title = text(body.title,10000,description.slice(0,150) || `${category} 위험요소를 발견했어요`).slice(0,300);
  let observedAt = null;
  if (body.observedAt ?? body.observed_at) {
    const date = new Date(body.observedAt ?? body.observed_at);
    assert(Number.isFinite(date.getTime()),400,'관찰 시간을 확인해주세요.');
    observedAt = date.toISOString();
  }
  const weather = body.weather && typeof body.weather === 'object' && !Array.isArray(body.weather) ? {
    temperature:numeric(body.weather.temperature,-100,100),
    code:numeric(body.weather.code,0,100),
    observedAt:typeof body.weather.observedAt === 'string' ? body.weather.observedAt.slice(0,50) : null,
  } : null;
  return { id:body.id ? uuid(body.id) : crypto.randomUUID(),category,subcategory,title,description,latitude,longitude,
    accuracy:numeric(body.accuracy,0,1000000),address,place,observedAt,weather,
    source:body.source === 'senior_app' ? 'senior_app' : 'website' };
}
function location(row) {
  return row.address || row.place_description || (row.latitude != null ? `지도에서 선택한 위치 (${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)})` : '위치정보 없음');
}
function memberReport(row) {
  return { id:row.id,type:row.category,subcategory:row.subcategory,title:row.title,description:row.description,
    place:location(row),latitude:row.latitude,longitude:row.longitude,accuracy:row.accuracy,status:row.status,
    response:row.response,department:row.assigned_agency || '지켜로 운영팀',createdAt:row.created_at,
    observedAt:row.observed_at || row.created_at,weather:row.weather,mediaCount:Number(row.media_count || 0),points:100,
    hasPhotoPreview:Boolean(row.has_photo_preview),likeCount:Number(row.like_count || 0),likedByMe:Boolean(row.liked_by_me) };
}
async function findReport(pool,user,id,{ownerOnly=false}={}) {
  uuid(id);
  const result = await pool.query('SELECT * FROM jikeoro.reports WHERE id=$1',[id]);
  const report = result.rows[0];
  assert(report && (ownerOnly ? report.user_id === user.id : canReadReport(user,report)),404,'기록을 찾을 수 없거나 접근 권한이 없습니다.');
  return report;
}
const mediaSummary = `(SELECT COUNT(*)::integer FROM jikeoro.media m WHERE m.report_id=r.id) AS media_count`;
const mapLikesSummary = `(SELECT COUNT(*)::integer FROM jikeoro.report_likes l WHERE l.report_id=r.id) AS like_count,
  EXISTS(SELECT 1 FROM jikeoro.report_likes l WHERE l.report_id=r.id AND l.user_id=$1::uuid) AS liked_by_me`;
const likeState = row => ({id:row.id,likeCount:Number(row.like_count),likedByMe:Boolean(row.liked_by_me)});
function reportsRoutes(pool,storage,cleanupFiles) {
  const router = express.Router();
  router.get('/map/reports',async (req,res) => {
    const result = await pool.query(`SELECT r.id,r.category,r.subcategory,r.title,r.description,r.latitude,r.longitude,r.accuracy,
      r.address,r.place_description,r.status,r.created_at,r.updated_at,r.observed_at,r.response,r.assigned_agency,r.weather,${mediaSummary},${mapLikesSummary},
      EXISTS(SELECT 1 FROM jikeoro.media m WHERE m.report_id=r.id AND m.kind='image' AND m.preview_path IS NOT NULL) AS has_photo_preview
      FROM jikeoro.reports r WHERE latitude IS NOT NULL ORDER BY created_at DESC LIMIT 5000`,[req.user?.id || null]);
    res.json({authenticated:Boolean(req.user),reports:result.rows.map(memberReport)});
  });
  router.get('/map/likes',async(req,res)=>{
    const result=await pool.query(`SELECT r.id,${mapLikesSummary} FROM jikeoro.reports r
      WHERE r.latitude IS NOT NULL ORDER BY r.created_at DESC LIMIT 5000`,[req.user?.id || null]);
    res.json({authenticated:Boolean(req.user),likes:result.rows.map(likeState)});
  });
  router.post('/map/reports/:id/like',requireUser,async(req,res)=>{
    const id=uuid(req.params.id);
    assert(typeof req.body.liked==='boolean',400,'좋아요 상태를 확인해주세요.');
    const result=await transaction(pool,async client=>{
      // Serialize changes to one report so returned counts include concurrent users.
      const found=await client.query('SELECT id FROM jikeoro.reports WHERE id=$1 AND latitude IS NOT NULL FOR UPDATE',[id]);
      assert(found.rows.length,404,'공개 지도에서 확인할 수 없는 제보입니다.');
      if(req.body.liked)await client.query('INSERT INTO jikeoro.report_likes(report_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,req.user.id]);
      else await client.query('DELETE FROM jikeoro.report_likes WHERE report_id=$1 AND user_id=$2',[id,req.user.id]);
      return (await client.query(`SELECT r.id,${mapLikesSummary} FROM jikeoro.reports r WHERE r.id=$2`,[req.user.id,id])).rows[0];
    });
    res.json(likeState(result));
  });
  router.get('/reports',requireUser,async (req,res) => {
    const result = await pool.query(`SELECT r.*,${mediaSummary} FROM jikeoro.reports r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000`,[req.user.id]);
    res.json({reports:result.rows.map(memberReport)});
  });
  router.get('/app/reports',requireUser,async (req,res) => {
    const result = await pool.query(`SELECT r.*,
      COALESCE((SELECT json_agg(json_build_object('id',m.id,'kind',m.kind,'original_name',m.original_name,'mime_type',m.mime_type,'size_bytes',m.size_bytes)) FROM jikeoro.media m WHERE m.report_id=r.id),'[]'::json) AS report_media,
      COALESCE((SELECT json_agg(json_build_object('status',h.status,'note',h.note,'created_at',h.created_at) ORDER BY h.created_at) FROM jikeoro.report_history h WHERE h.report_id=r.id),'[]'::json) AS report_status_history
      FROM jikeoro.reports r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000`,[req.user.id]);
    res.json({reports:result.rows});
  });
  router.post('/reports',requireUser,async (req,res) => {
    assert(req.user.role === 'member',403,'주민 계정으로 로그인해주세요.');
    const report = newReport(req.body);
    const created = await transaction(pool,async (client) => {
      await client.query('SELECT id FROM jikeoro.users WHERE id=$1 FOR UPDATE',[req.user.id]);
      const result = await client.query(`INSERT INTO jikeoro.reports(id,user_id,source,category,subcategory,title,description,latitude,longitude,accuracy,address,place_description,observed_at,weather)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [report.id,req.user.id,report.source,report.category,report.subcategory,report.title,report.description,report.latitude,report.longitude,report.accuracy,report.address,report.place,report.observedAt,JSON.stringify(report.weather)]);
      if (!result.rows.length) {
        const found = await client.query('SELECT user_id FROM jikeoro.reports WHERE id=$1',[report.id]);
        assert(found.rows[0]?.user_id === req.user.id,409,'이미 사용 중인 기록 번호입니다.');
        return false;
      }
      await client.query(`INSERT INTO jikeoro.report_history(report_id,status,note,actor_user_id) VALUES($1,'received','주민 제보가 접수되었습니다.',$2)`,[report.id,req.user.id]);
      return true;
    });
    res.status(created ? 201 : 200).json({ok:true,id:report.id,linkedToAccount:true});
  });
  router.post('/reports/claim',requireUser,async (req,res) => {
    await findReport(pool,req.user,req.body.id,{ownerOnly:true});
    res.json({ok:true});
  });
  router.delete('/reports',requireUser,async (req,res) => {
    const id = uuid(req.body.id);
    await transaction(pool,async (client) => {
      await client.query('SELECT id FROM jikeoro.users WHERE id=$1 FOR UPDATE',[req.user.id]);
      await findReport(client,req.user,id,{ownerOnly:true});
      // Lock against concurrent uploads before collecting their cleanup paths.
      await client.query('SELECT id FROM jikeoro.reports WHERE id=$1 FOR UPDATE',[id]);
      const files = await client.query('SELECT storage_path,preview_path FROM jikeoro.media WHERE report_id=$1',[id]);
      for (const item of files.rows) for (const filename of [item.storage_path,item.preview_path].filter(Boolean)) {
        await client.query('INSERT INTO jikeoro.file_cleanup(file_path) VALUES($1) ON CONFLICT DO NOTHING',[filename]);
      }
      await client.query('DELETE FROM jikeoro.reports WHERE id=$1 AND user_id=$2',[id,req.user.id]);
    });
    await cleanupFiles().catch(() => {});
    res.json({ok:true});
  });
  router.get('/admin/reports',requireStaff,async (req,res) => {
    const params = req.user.role === 'agency_staff' ? [req.user.agency || ''] : [];
    const filter = params.length ? 'WHERE r.assigned_agency=$1' : '';
    const result = await pool.query(`SELECT r.*,u.name AS reporter_name,
      COALESCE((SELECT json_agg(json_build_object('kind',m.kind,'name',m.original_name,'type',m.mime_type,'size',m.size_bytes)) FROM jikeoro.media m WHERE m.report_id=r.id),'[]'::json) AS media
      FROM jikeoro.reports r JOIN jikeoro.users u ON u.id=r.user_id ${filter} ORDER BY updated_at DESC LIMIT 5000`,params);
    res.json({user:publicUser(req.user),reports:result.rows});
  });
  router.patch('/admin/reports',requireStaff,async (req,res) => {
    const id = uuid(req.body.id);
    assert(STATUSES.includes(req.body.status),400,'처리 상태를 확인해주세요.');
    const agency = text(req.body.assignedAgency,200) || null;
    const response = text(req.body.response,10000);
    await transaction(pool,async (client) => {
      await client.query('SELECT id FROM jikeoro.reports WHERE id=$1 FOR UPDATE',[id]);
      const report = await findReport(client,req.user,id);
      assert(req.user.role === 'research_admin' || agency === report.assigned_agency,403,'담당 기관 변경은 연구원 관리자만 할 수 있습니다.');
      await client.query('UPDATE jikeoro.reports SET status=$1,assigned_agency=$2,response=$3,updated_at=now() WHERE id=$4',[req.body.status,agency,response,id]);
      await client.query('INSERT INTO jikeoro.report_history(report_id,status,note,actor_user_id) VALUES($1,$2,$3,$4)',[id,req.body.status,response,req.user.id]);
      await client.query(`INSERT INTO jikeoro.audit_logs(actor_user_id,report_id,action,detail) VALUES($1,$2,'report_status_update',$3)`,[req.user.id,id,`${req.body.status} · ${agency || '미배정'}`]);
    });
    res.json({ok:true});
  });
  return router;
}
module.exports = { reportsRoutes,findReport,memberReport,newReport };
