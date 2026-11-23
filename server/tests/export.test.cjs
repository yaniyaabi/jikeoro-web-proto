'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

test('read-only migration export retains owners, password hashes, non-ASCII data and counts in one complete row', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid primary key,email text,encrypted_password text,created_at timestamptz DEFAULT now(),email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb);
      CREATE TABLE public.profiles(id uuid primary key,name text,role text,avatar jsonb);
      CREATE TABLE public.reports(id uuid primary key,user_id uuid,description text);
      CREATE TABLE public.report_media(id uuid primary key,report_id uuid,storage_path text);
      CREATE TABLE public.report_status_history(id bigint primary key,report_id uuid,note text);
      CREATE TABLE public.admin_audit_logs(id bigint primary key,actor_user_id uuid,detail text);
      CREATE TABLE storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    `);
    const user='130fa6cf-6d7b-4f50-8000-000000000001', report='130fa6cf-6d7b-4f50-8000-000000000002';
    await db.query('INSERT INTO auth.users(id,email,encrypted_password) VALUES($1,$2,$3)',[user,'fixture@example.com','$2b$10$synthetic-hash-not-a-real-password']);
    await db.query('INSERT INTO profiles(id,name,role) VALUES($1,$2,$3)',[user,'김 지킴이','member']);
    await db.query('INSERT INTO reports(id,user_id,description) VALUES($1,$2,$3)',[report,user,'계단, "난간"\n확인이 필요해요.']);
    await db.query('INSERT INTO report_media(id,report_id,storage_path) VALUES($1,$2,$3)',[user,report,`${user}/${report}/사진.jpg`]);
    await db.query('INSERT INTO storage.objects(id,bucket_id,name) VALUES($1,$2,$3)',[user,'report-media',`${user}/${report}/사진.jpg`]);
    await db.query('INSERT INTO storage.objects(id,bucket_id,name) VALUES($1,$2,$3)',[report,'unrelated','private-unrelated-file']);
    const sql = await fs.readFile(path.join(__dirname,'../migration/export-supabase.sql'),'utf8');
    await db.exec('BEGIN READ ONLY');
    const result = await db.query(sql);
    await db.exec('COMMIT');
    assert.equal(result.rows.length,1);
    const exported=result.rows[0].jikeoro_export;
    assert.equal(exported.format,'jikeoro-supabase-export');
    assert.equal(exported.row_counts.auth_users,1);
    assert.equal(exported.row_counts.reports,1);
    assert.equal(exported.row_counts.storage_objects,1);
    assert.equal(exported.auth_users[0].encrypted_password,'$2b$10$synthetic-hash-not-a-real-password');
    assert.equal(exported.reports[0].user_id,user);
    assert.equal(exported.reports[0].description,'계단, "난간"\n확인이 필요해요.');
    assert.deepEqual(exported.admin_audit_logs,[]);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM reports')).rows[0].n,1);
  } finally {await db.close();}
});
