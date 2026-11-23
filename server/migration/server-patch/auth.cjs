'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { hashPassword,verifyPassword,tokenHash,newToken,assert,email,password,text,avatar,publicUser } = require('./security.cjs');

function sessionMiddleware(pool) {
  return async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    req.user = null;
    if (/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
      const hash = tokenHash(authorization.slice(7));
      const result = await pool.query(`SELECT u.*,s.token_hash AS session_hash FROM jikeoro.sessions s
        JOIN jikeoro.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [hash]);
      req.user = result.rows[0] ?? null;
    }
    next();
  };
}
function requireUser(req, res, next) {
  assert(req.user, 401, '로그인이 필요합니다. 다시 로그인해주세요.');
  next();
}
function requireStaff(req, res, next) {
  requireUser(req, res, () => {});
  assert(['research_admin','agency_staff'].includes(req.user.role), 403, '운영 계정 로그인이 필요합니다.');
  next();
}
function requireAdmin(req, res, next) {
  requireUser(req, res, () => {});
  assert(req.user.role === 'research_admin', 403, '연구원 관리자 권한이 필요합니다.');
  next();
}
async function issueSession(pool, user) {
  const token = newToken();
  await pool.query(`INSERT INTO jikeoro.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`, [tokenHash(token),user.id]);
  return { ok: true, user: publicUser(user), accessToken: token };
}
function authRoutes(pool) {
  const router = express.Router();
  const authLimiter = rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders:'draft-8',legacyHeaders:false,message:{error:'로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.'} });
  let dummyHashPromise;
  router.get('/session', (req,res) => res.json({ authenticated:Boolean(req.user),user:req.user ? publicUser(req.user) : null }));
  router.post('/register', authLimiter, async (req,res) => {
    const name = text(req.body.name,100);
    assert(name.length >= 2,400,'이름을 두 글자 이상 입력해주세요.');
    const normalizedEmail = email(req.body.email);
    const secret = password(req.body.password);
    const encoded = await hashPassword(secret);
    let user;
    try {
      const result = await pool.query(`INSERT INTO jikeoro.users(email,name,password_hash,avatar) VALUES($1,$2,$3,$4::jsonb) RETURNING *`, [normalizedEmail,name,encoded,JSON.stringify(avatar(req.body.avatar))]);
      user = result.rows[0];
    } catch (error) {
      if (error.code === '23505') assert(false,409,'이미 가입된 이메일입니다. 로그인해주세요.');
      throw error;
    }
    res.status(201).json(await issueSession(pool,user));
  });
  const login = async (req,res) => {
    const normalizedEmail = email(req.body.email ?? req.body.loginId);
    // Imported accounts can have passwords shorter than the new registration rule.
    const secret = req.body.password;
    assert(typeof secret === 'string' && secret.length>=1 && secret.length<=128,400,'비밀번호를 입력해주세요.');
    const result = await pool.query('SELECT * FROM jikeoro.users WHERE lower(email)=$1',[normalizedEmail]);
    const user = result.rows[0];
    dummyHashPromise ??= hashPassword(newToken());
    const valid = await verifyPassword(secret,user?.password_hash ?? await dummyHashPromise);
    assert(valid && user?.active,401,'이메일 또는 비밀번호가 맞지 않습니다.');
    if (req.path === '/admin-login') assert(['research_admin','agency_staff'].includes(user.role),403,'운영 권한이 없는 계정입니다.');
    res.json(await issueSession(pool,user));
  };
  router.post('/login',authLimiter,login);
  router.post('/admin-login',authLimiter,login);
  router.post('/logout', async (req,res) => {
    if (req.user) await pool.query('DELETE FROM jikeoro.sessions WHERE token_hash=$1',[req.user.session_hash]);
    res.json({ok:true});
  });
  return router;
}
module.exports = { sessionMiddleware,requireUser,requireStaff,requireAdmin,issueSession,authRoutes };
