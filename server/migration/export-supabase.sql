-- Jikeoro migration export, version 1. This query only reads existing data.
-- Run in the Supabase SQL Editor and export the one-row result as CSV.
-- The export includes email addresses and password hashes. Keep the CSV private.
-- Media contents are NOT embedded: download report-media separately with Cyberduck.
WITH snapshot AS (
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'encrypted_password', u.encrypted_password,
      'created_at', u.created_at,
      'email_confirmed_at', to_jsonb(u)->'email_confirmed_at',
      'banned_until', to_jsonb(u)->'banned_until',
      'deleted_at', to_jsonb(u)->'deleted_at',
      'raw_user_meta_data', to_jsonb(u)->'raw_user_meta_data'
    ) ORDER BY u.id) FROM auth.users AS u), '[]'::jsonb) AS auth_users,
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.profiles AS p), '[]'::jsonb) AS profiles,
    COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.reports AS r), '[]'::jsonb) AS reports,
    COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.report_media AS m), '[]'::jsonb) AS report_media,
    COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.report_status_history AS h), '[]'::jsonb) AS report_status_history,
    COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.admin_audit_logs AS a), '[]'::jsonb) AS admin_audit_logs,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', o.id,
      'bucket_id', o.bucket_id,
      'name', o.name,
      'metadata', o.metadata,
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ) ORDER BY o.name) FROM storage.objects AS o WHERE o.bucket_id='report-media'), '[]'::jsonb) AS storage_objects,
    COALESCE((SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'), '[]'::jsonb) AS public_table_inventory
)
SELECT jsonb_build_object(
  'format', 'jikeoro-supabase-export',
  'version', 1,
  'exported_at', transaction_timestamp(),
  'auth_users', s.auth_users,
  'profiles', s.profiles,
  'reports', s.reports,
  'report_media', s.report_media,
  'report_status_history', s.report_status_history,
  'admin_audit_logs', s.admin_audit_logs,
  'storage_objects', s.storage_objects,
  'public_table_inventory', s.public_table_inventory,
  'row_counts', jsonb_build_object(
    'auth_users', jsonb_array_length(s.auth_users),
    'profiles', jsonb_array_length(s.profiles),
    'reports', jsonb_array_length(s.reports),
    'report_media', jsonb_array_length(s.report_media),
    'report_status_history', jsonb_array_length(s.report_status_history),
    'admin_audit_logs', jsonb_array_length(s.admin_audit_logs),
    'storage_objects', jsonb_array_length(s.storage_objects)
  ),
  'notes', jsonb_build_array(
    'Read-only snapshot; source records were not changed.',
    'Media file bytes are not included. Preserve the report-media folder tree.',
    'Cloud sessions, device subscriptions and browser-only reward records require separate handling.'
  )
) AS jikeoro_export
FROM snapshot AS s;
