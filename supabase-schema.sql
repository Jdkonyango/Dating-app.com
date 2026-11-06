create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_path text,
  first_name text not null check (char_length(first_name) between 1 and 30),
  age integer not null check (age between 18 and 120),
  city text not null check (char_length(city) between 1 and 50),
  intent text not null check (intent in ('relationship', 'friends', 'exploring')),
  bio text not null check (char_length(bio) between 1 and 240),
  interests text[] not null default '{}',
  adult_confirmed boolean not null default false check (adult_confirmed),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_interests_limit check (cardinality(interests) <= 8)
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_path text;
update public.profiles
set username = 'member_' || substr(replace(user_id::text, '-', ''), 1, 12)
where username is null;
alter table public.profiles alter column username set not null;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,24}$');
create unique index if not exists profiles_username_unique on public.profiles (username);
alter table public.profiles drop constraint if exists profiles_first_name_nonempty;
alter table public.profiles add constraint profiles_first_name_nonempty
  check (first_name = trim(first_name) and char_length(first_name) between 1 and 30);
alter table public.profiles drop constraint if exists profiles_city_nonempty;
alter table public.profiles add constraint profiles_city_nonempty
  check (city = trim(city) and char_length(city) between 1 and 50);
alter table public.profiles drop constraint if exists profiles_bio_nonempty;
alter table public.profiles add constraint profiles_bio_nonempty
  check (bio = trim(bio) and char_length(bio) between 1 and 240);

create table if not exists public.likes (
  actor_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  check (actor_id <> target_id)
);

create table if not exists public.passes (
  actor_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  check (actor_id <> target_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a::text < user_b::text),
  unique (user_a, user_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_created_idx on public.messages (match_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('harassment', 'fake_profile', 'underage', 'unsafe_behavior', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.blocks enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meetday-avatars', 'meetday-avatars', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.can_view_meetday_avatar(p_owner_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id::text = p_owner_id
      and p.is_active
      and (
        p.user_id = auth.uid()
        or not exists (
          select 1 from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
            or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
        )
      )
  );
$$;
revoke all on function public.can_view_meetday_avatar(text) from public, anon;
grant execute on function public.can_view_meetday_avatar(text) to authenticated;

drop policy if exists meetday_avatar_read on storage.objects;
create policy meetday_avatar_read on storage.objects
  for select to authenticated using (
    bucket_id = 'meetday-avatars'
    and public.can_view_meetday_avatar((storage.foldername(name))[1])
  );
drop policy if exists meetday_avatar_upload on storage.objects;
create policy meetday_avatar_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'meetday-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
drop policy if exists meetday_avatar_update on storage.objects;
create policy meetday_avatar_update on storage.objects
  for update to authenticated using (
    bucket_id = 'meetday-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  ) with check (
    bucket_id = 'meetday-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
drop policy if exists meetday_avatar_delete on storage.objects;
create policy meetday_avatar_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'meetday-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists likes_read_self on public.likes;
drop policy if exists likes_create_self on public.likes;
drop policy if exists likes_remove_self on public.likes;
drop policy if exists passes_read_self on public.passes;
drop policy if exists passes_create_self on public.passes;
drop policy if exists passes_remove_self on public.passes;
drop policy if exists blocks_read_self on public.blocks;
drop policy if exists blocks_create_self on public.blocks;
drop policy if exists blocks_remove_self on public.blocks;

drop policy if exists matches_read_participant on public.matches;
create policy matches_read_participant on public.matches
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

drop policy if exists messages_read_participant on public.messages;
create policy messages_read_participant on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (select auth.uid()) in (m.user_a, m.user_b)
    )
  );

drop policy if exists messages_send_as_participant on public.messages;
create policy messages_send_as_participant on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (select auth.uid()) in (m.user_a, m.user_b)
    )
  );

drop policy if exists reports_submit_as_self on public.reports;
create policy reports_submit_as_self on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

revoke all on public.profiles, public.likes, public.passes, public.blocks,
  public.matches, public.messages, public.reports from public, anon, authenticated;
grant select on public.matches to authenticated;
grant select, insert on public.messages to authenticated;
grant insert on public.reports to authenticated;

drop function if exists public.save_my_profile(text, integer, text, text, text, text[], boolean);
create or replace function public.save_my_profile(
  p_first_name text,
  p_username text,
  p_age integer,
  p_city text,
  p_intent text,
  p_bio text,
  p_interests text[],
  p_avatar_path text,
  p_adult_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_interest text;
begin
  if v_user_id is null then
    raise exception 'Sign in is required.';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'Verify your email before creating a profile.';
  end if;
  if p_adult_confirmed is not true or p_age < 18 or p_age > 120 then
    raise exception 'Meetday is only for adults aged 18 or older.';
  end if;
  if p_intent not in ('relationship', 'friends', 'exploring') then
    raise exception 'Choose a valid relationship intention.';
  end if;
  if p_username is null or lower(trim(p_username)) !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Usernames must be 3–24 letters, numbers, or underscores.';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.username = lower(trim(p_username)) and p.user_id <> v_user_id
  ) then
    raise exception 'That username is already taken. Please choose another.';
  end if;
  if p_avatar_path is not null and (
    p_avatar_path !~ ('^' || v_user_id::text || '/profile\.(jpg|png|webp)$')
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'meetday-avatars'
        and o.name = p_avatar_path
        and o.owner_id = v_user_id::text
    )
  ) then
    raise exception 'The selected profile photo is invalid. Upload it again and retry.';
  end if;
  if coalesce(cardinality(p_interests), 0) > 8 then
    raise exception 'Add no more than eight interests.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_interests, '{}')) as item(value)
    where item.value is null or trim(item.value) = '' or char_length(trim(item.value)) > 32
  ) then
    raise exception 'Interests must be non-empty and 32 characters or fewer.';
  end if;
  foreach v_interest in array coalesce(p_interests, '{}') loop
    if char_length(v_interest) > 32 then
      raise exception 'Each interest must be 32 characters or fewer.';
    end if;
  end loop;

  insert into public.profiles (
    user_id, username, avatar_path, first_name, age, city, intent, bio, interests, adult_confirmed,
    is_active, updated_at
  ) values (
    v_user_id, lower(trim(p_username)), p_avatar_path, trim(p_first_name), p_age, trim(p_city), p_intent,
    trim(p_bio), coalesce(p_interests, '{}'), true, true, now()
  )
  on conflict (user_id) do update set
    username = excluded.username,
    avatar_path = excluded.avatar_path,
    first_name = excluded.first_name,
    age = excluded.age,
    city = excluded.city,
    intent = excluded.intent,
    bio = excluded.bio,
    interests = excluded.interests,
    adult_confirmed = excluded.adult_confirmed,
    is_active = true,
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'username', v_profile.username,
    'avatar_path', v_profile.avatar_path,
    'first_name', v_profile.first_name,
    'age', v_profile.age,
    'city', v_profile.city,
    'intent', v_profile.intent,
    'bio', v_profile.bio,
    'interests', v_profile.interests,
    'adult_confirmed', v_profile.adult_confirmed
  );
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'user_id', p.user_id,
    'username', p.username,
    'avatar_path', p.avatar_path,
    'first_name', p.first_name,
    'age', p.age,
    'city', p.city,
    'intent', p.intent,
    'bio', p.bio,
    'interests', p.interests,
    'adult_confirmed', p.adult_confirmed
  ) end
  from (select auth.uid() as user_id) current_user
  left join public.profiles p on p.user_id = current_user.user_id;
$$;

drop function if exists public.discover_profiles(text, text, boolean);
create or replace function public.discover_profiles(
  p_intent text default null,
  p_search text default null,
  p_include_passed boolean default false
)
returns table (
  user_id uuid,
  username text,
  avatar_path text,
  first_name text,
  age integer,
  city text,
  intent text,
  bio text,
  interests text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in is required.';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_user_id and p.is_active) then
    raise exception 'Complete your profile before discovering members.';
  end if;
  if p_intent is not null and p_intent not in ('relationship', 'friends', 'exploring') then
    raise exception 'Choose a valid relationship intention.';
  end if;

  return query
  select p.user_id, p.username, p.avatar_path, p.first_name, p.age, p.city, p.intent, p.bio, p.interests
  from public.profiles p
  where p.is_active
    and p.user_id <> v_user_id
    and (p_intent is null or p.intent = p_intent)
    and (
      nullif(trim(p_search), '') is null
      or p.first_name ilike '%' || trim(p_search) || '%'
      or p.city ilike '%' || trim(p_search) || '%'
      or p.bio ilike '%' || trim(p_search) || '%'
      or exists (
        select 1 from unnest(p.interests) as item(value)
        where item.value ilike '%' || trim(p_search) || '%'
      )
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_user_id and b.blocked_id = p.user_id)
        or (b.blocker_id = p.user_id and b.blocked_id = v_user_id)
    )
    and (p_include_passed or not exists (
      select 1 from public.passes ps
      where ps.actor_id = v_user_id and ps.target_id = p.user_id
    ))
    and not exists (
      select 1 from public.likes l
      where l.actor_id = v_user_id and l.target_id = p.user_id
    )
  order by p.created_at desc
  limit 100;
end;
$$;

create or replace function public.like_profile(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_first uuid;
  v_second uuid;
  v_mutual boolean;
begin
  if v_user_id is null or p_target_id = v_user_id then
    raise exception 'Choose another active member.';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_user_id and p.is_active)
    or not exists (select 1 from public.profiles p where p.user_id = p_target_id and p.is_active) then
    raise exception 'Both members need active profiles.';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_user_id and b.blocked_id = p_target_id)
       or (b.blocker_id = p_target_id and b.blocked_id = v_user_id)
  ) then
    raise exception 'This member is unavailable.';
  end if;
  delete from public.passes ps where ps.actor_id = v_user_id and ps.target_id = p_target_id;
  insert into public.likes (actor_id, target_id) values (v_user_id, p_target_id)
    on conflict do nothing;
  select exists (
    select 1 from public.likes l
    where l.actor_id = p_target_id and l.target_id = v_user_id
  ) into v_mutual;
  if v_mutual then
    if v_user_id::text < p_target_id::text then
      v_first := v_user_id; v_second := p_target_id;
    else
      v_first := p_target_id; v_second := v_user_id;
    end if;
    insert into public.matches (user_a, user_b) values (v_first, v_second)
      on conflict (user_a, user_b) do nothing;
  end if;
  return v_mutual;
end;
$$;

create or replace function public.pass_profile(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_target_id = v_user_id then
    raise exception 'Choose another active member.';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target_id and p.is_active) then
    raise exception 'This member is unavailable.';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_user_id and b.blocked_id = p_target_id)
       or (b.blocker_id = p_target_id and b.blocked_id = v_user_id)
  ) then
    raise exception 'This member is unavailable.';
  end if;
  insert into public.passes (actor_id, target_id) values (v_user_id, p_target_id)
    on conflict do nothing;
end;
$$;

drop function if exists public.get_my_matches();
create or replace function public.get_my_matches()
returns table (
  match_id uuid,
  user_id uuid,
  username text,
  avatar_path text,
  first_name text,
  age integer,
  city text,
  intent text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select m.id, p.user_id, p.username, p.avatar_path, p.first_name, p.age, p.city, p.intent, m.created_at
  from public.matches m
  join public.profiles p on p.user_id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where auth.uid() in (m.user_a, m.user_b)
    and p.is_active
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    )
  order by m.created_at desc;
$$;

create or replace function public.block_profile(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_first uuid;
  v_second uuid;
begin
  if v_user_id is null or p_target_id = v_user_id then
    raise exception 'Choose another member to block.';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_user_id, p_target_id)
    on conflict do nothing;
  if v_user_id::text < p_target_id::text then
    v_first := v_user_id; v_second := p_target_id;
  else
    v_first := p_target_id; v_second := v_user_id;
  end if;
  delete from public.matches m where m.user_a = v_first and m.user_b = v_second;
  delete from public.likes l
    where (l.actor_id = v_user_id and l.target_id = p_target_id)
       or (l.actor_id = p_target_id and l.target_id = v_user_id);
  delete from public.passes ps
    where (ps.actor_id = v_user_id and ps.target_id = p_target_id)
       or (ps.actor_id = p_target_id and ps.target_id = v_user_id);
end;
$$;

create or replace function public.remove_my_like(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_first uuid;
  v_second uuid;
begin
  if v_user_id is null or p_target_id = v_user_id then
    raise exception 'Invalid member.';
  end if;
  if v_user_id is null or p_target_id = v_user_id then
    raise exception 'Invalid member.';
  end if;
  delete from public.likes l where l.actor_id = v_user_id and l.target_id = p_target_id;
  if v_user_id::text < p_target_id::text then
    v_first := v_user_id; v_second := p_target_id;
  else
    v_first := p_target_id; v_second := v_user_id;
  end if;
  delete from public.matches m where m.user_a = v_first and m.user_b = v_second;
end;
$$;

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.messages m
    where m.sender_id = new.sender_id and m.created_at > now() - interval '1 second'
  ) then
    raise exception 'Please wait a moment before sending another message.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
for each row execute function public.enforce_message_rate_limit();

create or replace function public.enforce_interest_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_recent_count integer;
begin
  if v_actor_id is null or new.actor_id <> v_actor_id then
    raise exception 'Sign in is required.';
  end if;
  select count(*) into v_recent_count
  from (
    select l.created_at from public.likes l
    where l.actor_id = v_actor_id and l.created_at > now() - interval '1 minute'
    union all
    select p.created_at from public.passes p
    where p.actor_id = v_actor_id and p.created_at > now() - interval '1 minute'
  ) recent;
  if v_recent_count >= 30 then
    raise exception 'You have reached the short-term limit for likes and passes. Please try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists likes_rate_limit on public.likes;
create trigger likes_rate_limit before insert on public.likes
for each row execute function public.enforce_interest_rate_limit();

drop trigger if exists passes_rate_limit on public.passes;
create trigger passes_rate_limit before insert on public.passes
for each row execute function public.enforce_interest_rate_limit();

revoke all on function public.save_my_profile(text, text, integer, text, text, text, text[], text, boolean) from public, anon;
revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.discover_profiles(text, text, boolean) from public, anon;
revoke all on function public.like_profile(uuid) from public, anon;
revoke all on function public.pass_profile(uuid) from public, anon;
revoke all on function public.get_my_matches() from public, anon;
revoke all on function public.block_profile(uuid) from public, anon;
revoke all on function public.remove_my_like(uuid) from public, anon;
grant execute on function public.save_my_profile(text, text, integer, text, text, text, text[], text, boolean) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.discover_profiles(text, text, boolean) to authenticated;
grant execute on function public.like_profile(uuid) to authenticated;
grant execute on function public.pass_profile(uuid) to authenticated;
grant execute on function public.get_my_matches() to authenticated;
grant execute on function public.block_profile(uuid) to authenticated;
grant execute on function public.remove_my_like(uuid) to authenticated;
revoke all on function public.enforce_message_rate_limit() from public, anon, authenticated;
revoke all on function public.enforce_interest_rate_limit() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end;
$$;
