begin;

-- Only the server-side preview function can read these paths. Keep table RLS
-- and original storage objects private to their existing owners/staff.
create or replace function public.get_map_report_preview_sources(p_report_id uuid)
returns table (id uuid, storage_path text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.storage_path, m.size_bytes
  from public.report_media m
  join public.reports r on r.id = m.report_id
  where r.id = p_report_id
    and r.latitude is not null and r.longitude is not null
    and m.kind = 'image'
  order by m.created_at, m.id
  limit 8;
$$;

revoke all on function public.get_map_report_preview_sources(uuid) from public, anon, authenticated;
grant execute on function public.get_map_report_preview_sources(uuid) to service_role;

commit;
