-- 커플 컨텐츠 보드 DB 스키마
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (이미 있는 것은 건너뛰고, 정책은 최신으로 갱신).

-- ─────────────────────────────────────────────
-- 1. 컨텐츠 카드
--    프론트 스키마와 1:1 대응. sort_order 는 수동 배치 순서
--    (두 카드 사이 값의 중간값을 넣는 방식이라 소수를 허용한다)
-- ─────────────────────────────────────────────
create table if not exists public.contents (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  status             text not null default 'PLANNING'
                     check (status in ('PLANNING', 'COMPLETED')),
  date               date not null,
  reference_url      text not null default '',
  reference_platform text not null default 'NONE'
                     check (reference_platform in ('INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'NONE')),
  photo_urls         text[] not null default '{}',
  categories         text[] not null default '{}',
  memo               text not null default '',
  sort_order         double precision not null default extract(epoch from now()),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists contents_status_sort_idx on public.contents (status, sort_order);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contents_set_updated_at on public.contents;
create trigger contents_set_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 2. 커스텀 카테고리 (기본 4개 외에 직접 추가한 것)
-- ─────────────────────────────────────────────
create table if not exists public.custom_categories (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. RLS (행 수준 보안)
--    로그인 없이 쓰는 보드라 anon(익명) 접근을 허용한다.
--    → 사이트 주소를 아는 사람은 누구나 읽고 쓸 수 있다는 뜻.
--    나중에 로그인을 붙이고 싶으면 아래 정책의 'anon'을 지우고
--    'authenticated'만 남기면 된다.
-- ─────────────────────────────────────────────
alter table public.contents enable row level security;
alter table public.custom_categories enable row level security;

-- 이전 버전 스키마의 로그인 필수 정책이 남아 있으면 제거
drop policy if exists "authenticated can do everything on contents" on public.contents;
drop policy if exists "authenticated can do everything on custom_categories" on public.custom_categories;

drop policy if exists "anyone can do everything on contents" on public.contents;
create policy "anyone can do everything on contents"
  on public.contents for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "anyone can do everything on custom_categories" on public.custom_categories;
create policy "anyone can do everything on custom_categories"
  on public.custom_categories for all
  to anon, authenticated
  using (true) with check (true);

-- ─────────────────────────────────────────────
-- 4. 실시간 반영 (한쪽이 추가하면 다른 쪽 화면에 바로 나타나게)
--    이미 등록된 테이블이면 건너뛴다.
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contents'
  ) then
    alter publication supabase_realtime add table public.contents;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_categories'
  ) then
    alter publication supabase_realtime add table public.custom_categories;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 5. 사진 업로드용 Storage 버킷
--    (완료 카드에 직접 찍은 사진을 올릴 때 사용)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- 이전 버전 스키마의 로그인 필수 정책이 남아 있으면 제거
drop policy if exists "authenticated can upload photos" on storage.objects;
drop policy if exists "authenticated can update photos" on storage.objects;
drop policy if exists "authenticated can delete photos" on storage.objects;

drop policy if exists "anyone can upload photos" on storage.objects;
create policy "anyone can upload photos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'photos');

drop policy if exists "anyone can update photos" on storage.objects;
create policy "anyone can update photos"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'photos');

drop policy if exists "anyone can delete photos" on storage.objects;
create policy "anyone can delete photos"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'photos');

drop policy if exists "anyone can view photos" on storage.objects;
create policy "anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');
