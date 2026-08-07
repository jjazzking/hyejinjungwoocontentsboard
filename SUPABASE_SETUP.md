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

## 5. 연동 후 동작 방식

키가 등록된 상태로 빌드되면 앱이 자동으로 공유 DB 모드로 동작합니다.

- **공유 보드**: 두 사람 모두 같은 데이터를 보고, 한쪽이 바꾸면 상대 화면에도 실시간 반영
- **1회 이관**: 사이트에 처음 접속했을 때 DB가 비어 있으면, 그 브라우저의
  localStorage 데이터(카드 + 커스텀 카테고리)를 DB로 자동으로 옮깁니다.
  **데이터가 더 잘 정리된 쪽 기기에서 먼저 접속하세요** — 나중에 접속한 쪽의
  로컬 데이터는 이관되지 않습니다 (DB에 이미 데이터가 있으므로).
- **사진 업로드**: 카드 폼에서 📷 버튼으로 기기 사진을 바로 올릴 수 있어요.
  용량 절약을 위해 긴 변 1600px JPEG로 자동 압축됩니다.
- **키가 없으면**: 예전처럼 localStorage 모드로 동작합니다 (기기별 저장).

## 6. AI 링크 분석 켜기 (선택)

링크로 카드를 만들 때 AI가 게시물 캡션·썸네일을 읽고
**제목·카테고리·메모를 자동으로 채워주는** 기능입니다.
Anthropic API 키가 필요해요 (https://console.anthropic.com 에서 발급, $5 충전이면 충분).

### 6-1. API 키를 Supabase 시크릿으로 등록

1. Supabase 대시보드 → **Edge Functions** → **Secrets** 탭
2. **Add new secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: 발급받은 키 (`sk-ant-...`)

> ⚠️ 이 키는 **깃허브 시크릿이 아니라 Supabase에만** 등록하세요.
> 저장소와 사이트는 공개라서 키가 코드에 들어가면 안 됩니다.

### 6-2. 분석 함수 배포

1. Supabase 대시보드 → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. Function name: `analyze-link`
3. 에디터 내용을 전부 지우고, 이 저장소의
   [`supabase/functions/analyze-link/index.ts`](./supabase/functions/analyze-link/index.ts)
   내용 전체를 붙여넣기
4. **Deploy function** 클릭

배포가 끝나면 바로 적용됩니다 — 사이트에서 링크를 복사해 '카드 만들기'를 누르면
AI가 채운 초안이 열려요. 함수가 없거나 분석에 실패하면 예전 방식(제목만 가져오기)으로
자동 폴백하니 걱정하지 않아도 됩니다.

> 참고: 인스타그램은 게시물에 따라 서버에서도 캡션을 못 읽는 경우가 있어요
> (비공개 계정, 로그인 요구 등). 그런 경우엔 링크만 채워진 초안이 열립니다.
