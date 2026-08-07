# Supabase 연동 준비 가이드

지금 앱은 브라우저 **localStorage**에만 저장돼서 기기마다 데이터가 따로예요.
Supabase를 붙이면 두 사람이 **같은 보드를 공유**하고, 사진 업로드와 실시간 반영도 가능해집니다.

아래 순서대로 진행하면 됩니다. (무료 플랜으로 충분해요)

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 접속 → GitHub 계정으로 가입/로그인
2. **New project** 클릭
   - Name: `hyejinjungwoo-board` (아무거나)
   - Database Password: 자동 생성된 것 저장해 두기
   - Region: `Northeast Asia (Seoul)` 선택
3. 프로젝트 생성 완료까지 1~2분 대기

## 2. DB 테이블 만들기

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 저장소의 [`supabase/schema.sql`](./supabase/schema.sql) 내용 전체를 붙여넣고 **Run**
3. 성공하면 `contents`, `custom_categories` 테이블과 `photos` 스토리지 버킷,
   접근 정책, 실시간 설정까지 한 번에 만들어집니다.

> **로그인 없는 공유 방식이에요.** 사이트 주소를 아는 사람은 누구나 보드를
> 읽고 쓸 수 있습니다 (둘만 링크를 공유한다는 전제). 나중에 로그인을 붙이고
> 싶어지면 `supabase/schema.sql`의 정책에서 `anon`만 빼면 됩니다.

## 3. API 키 확인

왼쪽 메뉴 **Settings → API** 에서 두 값을 복사해 두세요.

| 항목 | 환경변수 이름 |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| anon public key | `VITE_SUPABASE_ANON_KEY` |

> anon 키는 프론트에 노출되어도 되는 공개 키예요.

## 4. 키 등록

**로컬 개발용** — 저장소 루트에서:

```bash
cp .env.example .env
# .env 를 열어 3번에서 복사한 두 값을 채워 넣기
```

**배포(GitHub Pages)용** — GitHub 저장소에서:

1. **Settings → Secrets and variables → Actions → New repository secret**
2. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 두 개를 각각 등록

배포 워크플로(`.github/workflows/deploy.yml`)가 빌드할 때 이 시크릿을 읽도록 이미 설정돼 있어요.
시크릿이 없으면 지금처럼 localStorage 모드로 빌드됩니다.

## 5. 다음 단계 (연동 코드 작업)

여기까지 끝나면 Claude에게 "Supabase 연동 코드 작업해줘"라고 요청하세요. 그러면:

- `useContents`가 localStorage 대신 Supabase DB를 읽고 쓰도록 전환
- 기존 localStorage 데이터를 DB로 옮기는 1회성 마이그레이션
- 완료 카드 사진 직접 업로드 (Storage)
- 실시간 반영 (한쪽이 추가하면 다른 쪽에 바로 표시)

를 구현하게 됩니다.
