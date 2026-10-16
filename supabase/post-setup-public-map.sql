-- 기존 초기 스키마를 이미 실행한 프로젝트에서 한 번만 실행하는 보완 SQL입니다.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/ogg'
]
where id = 'report-media';

create or replace function public.get_public_map_reports()
returns table (
  id uuid,
  category text,
  subcategory text,
  title text,
  description text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  address text,
  place_description text,
  status text,
  assigned_agency text,
  response text,
  observed_at timestamptz,
  created_at timestamptz,
  media_count bigint
)
language sql
stable
security definer set search_path = ''
as $$
  select
    r.id, r.category, r.subcategory, r.title, r.description,
    r.latitude, r.longitude, r.accuracy, r.address, r.place_description,
    r.status, r.assigned_agency, r.response, r.observed_at, r.created_at,
    count(m.id)::bigint as media_count
  from public.reports r
  left join public.report_media m on m.report_id = r.id
  where r.latitude is not null and r.longitude is not null
  group by r.id
  order by r.created_at desc;
$$;

revoke all on function public.get_public_map_reports() from public;
grant execute on function public.get_public_map_reports() to anon, authenticated;
