begin;

alter table public.profiles
add column if not exists avatar jsonb;

update public.profiles
set avatar = '{"skin":"peach","hair":"wave","hairColor":"walnut","top":"purple","background":"lemon","accessory":"round"}'::jsonb
where role = 'member' and avatar is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    case
      when jsonb_typeof(new.raw_user_meta_data -> 'avatar') = 'object' then new.raw_user_meta_data -> 'avatar'
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
