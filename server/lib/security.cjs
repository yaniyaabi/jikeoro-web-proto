'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const bcrypt = require('bcryptjs');
const derive = promisify(crypto.scrypt);
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let hashing = 0;
const waiting = [];

async function limitedHash(operation) {
  if (hashing >= 2) {
    if (waiting.length >= 12) throw new HttpError(429, '잠시 후 다시 시도해주세요.');
    await new Promise((resolve) => waiting.push(resolve));
  } else hashing++;
  try { return await operation(); }
  finally {
    const next = waiting.shift();
    if (next) next(); else hashing--;
  }
}
async function hashPassword(password) {
  return limitedHash(async () => {
    const salt = crypto.randomBytes(16);
    const key = await derive(password, salt, 32, SCRYPT);
    return `scrypt$131072$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  });
}
async function verifyPassword(password, encoded) {
  if (/^\$2[aby]\$/.test(encoded)) return limitedHash(() => bcrypt.compare(password, encoded));
  const parts = String(encoded).split('$');
  if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$131072$8$1') return false;
  return limitedHash(async () => {
    const expected = Buffer.from(parts[5], 'base64');
    const salt = Buffer.from(parts[4], 'base64');
    if (expected.length !== 32 || salt.length !== 16) return false;
    const actual = await derive(password, salt, 32, SCRYPT);
    return crypto.timingSafeEqual(actual, expected);
  });
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function assert(condition, status, message) { if (!condition) throw new HttpError(status, message); }
function text(value, maximum, fallback = '') {
  const result = typeof value === 'string' ? value.trim() : fallback;
  assert(result.length <= maximum, 400, '입력 내용이 너무 깁니다.');
  return result;
}
function email(value) {
  const result = text(value, 254).toLowerCase();
  assert(/^\S+@\S+\.\S+$/.test(result), 400, '이메일 주소를 확인해주세요.');
  return result;
}
function password(value) {
  assert(typeof value === 'string' && value.length >= 8 && value.length <= 128, 400, '비밀번호는 8~128자로 입력해주세요.');
  return value;
}
function uuid(value) {
  assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 400, '기록 번호를 확인해주세요.');
  return value.toLowerCase();
}
const AVATAR = {
  skin: ['peach','sand','brown','deep'], hair: ['wave','short','bun','bob','hijab'],
  hairColor: ['espresso','walnut','amber','silver'], top: ['purple','yellow','mint','coral','blue'],
  background: ['pink','sky','lilac','lemon','mint'], accessory: ['none','round','square','freckles','beard','mustache','cap'],
};
const DEFAULT_AVATAR = { skin:'deep',hair:'short',hairColor:'espresso',top:'coral',background:'pink',accessory:'none' };
function avatar(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(AVATAR).map(([key, choices]) => [key,choices.includes(source[key]) ? source[key] : DEFAULT_AVATAR[key]]));
}
function publicUser(user) {
  return { id:user.id,name:user.name,email:user.email,role:user.role,agency:user.agency ?? null,avatar:user.role === 'member' ? avatar(user.avatar) : null };
}
function canReadReport(user, report) {
  return user && (report.user_id === user.id || user.role === 'research_admin' || (user.role === 'agency_staff' && Boolean(user.agency) && report.assigned_agency === user.agency));
}
module.exports = { hashPassword,verifyPassword,tokenHash,newToken,HttpError,assert,text,email,password,uuid,avatar,publicUser,canReadReport };
