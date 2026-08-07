-- 커플 컨텐츠 보드 DB 스키마
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.

-- ─────────────────────────────────────────────
-- 1. 컨텐츠 카드
--    프론트 스키마와 1:1 대응. sort_order 는 수동 배치 순서
--    (두 카드 사이 값의 중간값을 넣는 방식이라 소수를 허용한다)
-- ─────────────────────────────────────────────
create table public.contents (
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

create index contents_status_sort_idx on public.contents (status, sort_order);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger contents_set_updated_at
  before update on public.contents
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 2. 커스텀 카테고리 (기본 4개 외에 직접 추가한 것)
-- ─────────────────────────────────────────────
create table public.custom_categories (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. RLS (행 수준 보안)
--    로그인한 사용자(두 사람의 계정)만 읽고 쓸 수 있게 한다.
--    Authentication → Sign In / Providers 에서 이메일 가입을 끄거나
--    두 계정만 만들어 두면 외부인은 접근할 수 없다.
-- ─────────────────────────────────────────────
alter table public.contents enable row level security;
alter table public.custom_categories enable row level security;

create policy "authenticated can do everything on contents"
  on public.contents for all
  to authenticated
  using (true) with check (true);

create policy "authenticated can do everything on custom_categories"
  on public.custom_categories for all
  to authenticated
  using (true) with check (true);

-- ─────────────────────────────────────────────
-- 4. 실시간 반영 (한쪽이 추가하면 다른 쪽 화면에 바로 나타나게)
-- ─────────────────────────────────────────────
alter publication supabase_realtime add table public.contents;
alter publication supabase_realtime add table public.custom_categories;

-- ─────────────────────────────────────────────
-- 5. 사진 업로드용 Storage 버킷
--    (완료 카드에 직접 찍은 사진을 올릴 때 사용)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

create policy "authenticated can upload photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos');

create policy "authenticated can update photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photos');

create policy "authenticated can delete photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos');

create policy "anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');
