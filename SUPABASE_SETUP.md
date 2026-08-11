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
> (비공개 계정, 로그인 요구 등). 그런 경우엔 링크만 채워진 초안이 열리는데,
> 폼 맨 위의 **✨ AI 자동 작성** 칸에 게시물 글(캡션)을 직접 붙여넣고
> **🤖 AI로 채우기**를 누르면 똑같이 제목·카테고리·메모를 채울 수 있습니다.

### 6-3. 인스타그램 자동 수집 켜기 (선택)

인스타그램은 서버에서 오는 요청을 자주 막아서, 링크만으로는 캡션을 못 읽을 때가 많아요.
수집 서비스 [Apify](https://apify.com)를 붙이면 링크만 복사해도 자동으로 읽어옵니다.

1. https://apify.com 가입 (무료 플랜 — **카드 등록 불필요**, 매달 $5 크레딧 제공)
2. **Settings → API & Integrations** 에서 Personal API token 복사
3. Supabase → Edge Functions → **Secrets** 에 추가
   - Name: `APIFY_TOKEN`
   - Value: 복사한 토큰

등록하면 무료 경로(og태그·임베드·미러)를 먼저 시도하고, 전부 실패했을 때만
Apify를 호출합니다 — 크레딧을 아끼기 위해서예요. Apify 경로는 20~60초 정도 걸립니다.
시크릿이 없으면 이 단계는 그냥 건너뛰고 동작합니다.

## 7. 장소 검색 켜기 (선택)

카드에 **📍 장소**를 붙이는 기능입니다. 가게 이름으로 검색하면 주소와 좌표까지
저장돼서, 나중에 지도에 핀으로 표시할 수 있어요.

### 7-1. DB에 장소 컬럼 추가 ⚠️ 먼저 할 것

Supabase 대시보드 → **SQL Editor** → **New query** 에 붙여넣고 **Run**:

```sql
alter table public.contents
  add column if not exists places jsonb not null default '[]'::jsonb;
```

> 기존 카드는 빈 목록이 되어 아무 영향이 없습니다.
> [`supabase/schema.sql`](./supabase/schema.sql) 전체를 다시 실행해도 결과는 같아요.
> **이 SQL을 실행하기 전에는 장소를 저장할 수 없으니** 이 단계를 먼저 끝내세요.

### 7-2. 네이버 검색 API 키 발급

1. https://www.ncloud.com 가입/로그인 (네이버 아이디 연동)
2. 콘솔 → **Services → Application Services → NAVER API HUB**
3. **Application 등록** → API 선택 화면에서 **`지역` (NAVER Search Local API)** 만 체크 → 다음
4. Application 이름을 넣고 등록하면 인증 정보가 발급됩니다

> 요금: 검색 API는 **0 ~ 775,000건 무료(일 최대 25,000건)**.
> 이 보드가 쓰는 양은 하루 수십 건 수준이라 한도에 닿을 일이 없습니다.

### 7-3. 키를 Supabase 시크릿으로 등록

Supabase 대시보드 → **Edge Functions** → **Secrets** 에 2개 추가:

| Name | Value |
|---|---|
| `NAVER_CLIENT_ID` | 발급받은 Client ID (또는 API Key ID) |
| `NAVER_CLIENT_SECRET` | 발급받은 Client Secret (또는 API Key) |

> ⚠️ 이 키도 **깃허브가 아니라 Supabase에만** 등록하세요.

### 7-4. 검색 함수 배포

**Edge Functions** → **Deploy a new function** → **Via Editor**

- Function name: `place-search`
- 내용: [`supabase/functions/place-search/index.ts`](./supabase/functions/place-search/index.ts) 전체 붙여넣기

> 시크릿을 **등록한 뒤에** 함수를 배포하세요. 이미 떠 있는 함수에는 시크릿 변경이
> 바로 반영되지 않을 수 있어서, 순서가 뒤바뀌었다면 함수를 한 번 더 배포하면 됩니다.

검색이 안 되면 폼의 장소 칸에 실패 사유가 그대로 표시됩니다
(**Edge Functions → place-search → Logs** 의 `place-search:` 줄에도 같은 내용이 남습니다).

### 7-5. 장소 자동 채우기 (analyze-link 재배포)

`analyze-link` 함수도 같은 네이버 키를 써서 **링크만으로 장소까지 자동으로 찾아줍니다.**

- AI가 **캡션에서 뽑은 검색어**로 먼저 찾고
- 결과가 없으면 인스타그램 **위치 태그**로 한 번 더 (태그는 동네·건물 단위로
  대충 찍힌 경우가 많아 폴백으로만 씁니다)

자동으로 찾은 장소에는 **"⚠️ 확인해 주세요"** 배지가 붙고, 폼에서 **✓ 맞아요** 로 확정하거나
**🔍 다시 찾기** 로 직접 검색할 수 있습니다.

6번에서 이미 `analyze-link` 를 배포했더라도, 이 기능을 쓰려면
[최신 코드](./supabase/functions/analyze-link/index.ts)로 **한 번 더 배포**해야 합니다.
네이버 시크릿이 없으면 장소만 비어 있고 나머지 분석은 그대로 동작합니다.

시크릿이 없거나 검색이 실패해도 장소 **이름만 직접 입력**해서 저장할 수 있습니다
(좌표가 없을 뿐, 카드에는 그대로 표시돼요).

---

## 8. 지도를 네이버 지도로 바꾸기 (선택)

지도는 기본적으로 **OpenStreetMap**으로 그려집니다 (계정·키가 필요 없음).
아래를 설정하면 **네이버 지도**로 자동 전환되고, 키가 없거나 인증에 실패하면
다시 OpenStreetMap으로 떨어지므로 지도가 비는 일은 없습니다.

> ⚠️ 여기서 쓰는 키는 **7번의 검색 API 키와 다른 키**입니다.
> 검색은 `NAVER API HUB`, 지도는 `Maps` — 상품이 따로예요.

### 8-1. NCP에서 Maps 신청

1. [NAVER Cloud Platform 콘솔](https://console.ncloud.com) → **Services** → **Maps**
2. **이용 신청** — 지도는 **결제수단(카드) 등록을 요구**합니다
   (Web Dynamic Map 월 1,000만 건까지 무료지만 등록 자체는 필요)
3. **Application 등록** → **Web Dynamic Map** 선택

### 8-2. 서비스 URL 등록 ⚠️ 빠뜨리기 쉬움

Application 설정의 **Web 서비스 URL**에 보드가 열리는 주소를 **전부** 넣습니다.

```
https://jjazzking.github.io
http://localhost:5173
```

여기에 없는 주소에서 열면 지도가 **인증 실패**로 뜹니다.
(그 경우 지도 아래에 `⚠️ 네이버 지도 인증 실패` 안내가 표시됩니다.)

### 8-3. Client ID를 GitHub 시크릿으로 등록

발급된 **Client ID**를 저장소 → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret** 으로 넣습니다.

| 이름 | 값 |
| --- | --- |
| `VITE_NAVER_MAP_CLIENT_ID` | Maps Application의 Client ID |

> 이 값은 **브라우저에 노출되는 것이 정상**입니다. 지도 JS를 브라우저가 직접
> 불러오기 때문이고, 8-2의 서비스 URL 제한으로 보호합니다.
> **검색 API의 `NAVER_CLIENT_SECRET`은 절대 GitHub에 넣지 마세요** — 그건 Supabase 시크릿 전용입니다.

등록한 뒤 `main`에 아무 커밋이나 올리면(또는 Actions에서 workflow를 수동 실행하면)
새 빌드에 키가 주입되고 지도가 네이버로 바뀝니다.

로컬에서 확인하려면 `.env` 에 같은 이름으로 넣으면 됩니다.

```bash
VITE_NAVER_MAP_CLIENT_ID=여기에_Client_ID
```
