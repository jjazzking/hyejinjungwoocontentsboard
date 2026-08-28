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

### 7-6. 상호명으로 못 찾을 때 도로명주소로 폴백 (선택)

`search/v1/local`(지역검색)은 **업체명 색인** 기반이라, 등록 안 된 소규모 가게는
캡션에 정확한 주소가 적혀 있어도 상호명 검색만으로는 못 찾습니다. 이 경우
캡션 속 실제 주소를 **NCP Maps의 Geocoding API**로 좌표 변환해서 마지막으로 한 번 더
시도하도록 `analyze-link`가 되어 있어요. 다음 시크릿이 있어야 동작합니다.

1. [NAVER Cloud Platform 콘솔](https://console.ncloud.com) → **Services → Maps** →
   8번에서 만든 Application(또는 새 Application)에 **Geocoding** API를 추가로 체크
   (이용 신청이 안 되어 있으면 8-1처럼 카드 등록 후 진행)
2. 그 Application의 **Client ID / Client Secret**을 복사
   (Client ID는 8-3에서 쓴 `VITE_NAVER_MAP_CLIENT_ID`와 같은 값이어도 됩니다 —
   다만 이건 GitHub가 아니라 **Supabase 시크릿**으로 따로 등록해야 해요)
3. Supabase 대시보드 → **Edge Functions → Secrets** 에 2개 추가

   | Name | Value |
   |---|---|
   | `NAVER_MAPS_CLIENT_ID` | Maps Application의 Client ID |
   | `NAVER_MAPS_CLIENT_SECRET` | 같은 Application의 Client Secret |

4. `analyze-link` 함수를 [최신 코드](./supabase/functions/analyze-link/index.ts)로 재배포

> 이 시크릿이 없으면 이 단계만 조용히 건너뛰고, 기존처럼 상호명 검색 결과(또는 실패 사유)만
> 돌아옵니다. 7-2의 검색 API 키(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`)와는 **다른 상품의
> 다른 키**라서 헷갈리지 않도록 이름을 `NAVER_MAPS_*`로 분리했습니다.
> 주소로 찾은 장소는 좌표만 정확하고 이름은 AI 추정이라, 다른 자동 채움 결과와 똑같이
> **"⚠️ 확인해 주세요"** 배지가 붙습니다.

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

---

## 9. 인스타 DM으로 카드 만들기 — **검증 단계** 🧪

> 인스타에서 릴스를 보다가 **공유 → DM으로 보드 계정에 보내면 카드가 생기는** 흐름을 노립니다.
> 인스타 앱 안에서 두 번만 누르면 되고, 아이폰·안드로이드가 똑같이 동작합니다.
>
> **다만 아직 되는지 확정되지 않았습니다.** 릴스를 DM으로 공유했을 때 Meta가 보내주는
> 데이터에 **원본 게시물 주소가 들어 있는지**가 관건인데, 문서만으로는 알 수 없어서
> 직접 받아보고 확인해야 합니다. 이 9번은 **그 확인만 하는 절차**입니다.
> 지금 배포하는 함수는 카드를 만들지 않고 **받은 걸 로그로 남기기만** 합니다.

### 9-1. Meta 개발자 앱 만들기

[developers.facebook.com](https://developers.facebook.com) → **내 앱** → **앱 만들기**

- 앱에 **Instagram** 제품을 추가하고, **Instagram 로그인을 사용하는 Instagram API**
  (`Instagram API setup with Instagram Login`) 쪽으로 설정합니다
- **앱 설정 → 기본 설정**에서 **앱 시크릿**을 복사해 둡니다 (9-2에서 씁니다)

> Meta 콘솔은 메뉴 이름이 자주 바뀝니다. 위 이름이 안 보이면 **Instagram** 제품 안에서
> "웹훅(Webhooks)"과 "앱 시크릿"이 있는 화면을 찾으면 됩니다.

### 9-2. 시크릿 등록

**Project Settings** → **Edge Functions** → **Secrets** 에 두 개를 넣습니다.

| 이름 | 값 |
| --- | --- |
| `META_VERIFY_TOKEN` | 아무 문자열 (예: `hyejin-jungwoo-2026`). 9-4에서 똑같이 입력합니다 |
| `META_APP_SECRET` | 9-1에서 복사한 **앱 시크릿** |

`META_APP_SECRET`은 **이 엔드포인트의 유일한 자물쇠**입니다 (아래 9-3 참고). 꼭 넣으세요.

### 9-3. 함수 배포 + ⚠️ JWT 검증 끄기

**Edge Functions** → **Deploy a new function** → **Via Editor**

- Function name: `instagram-webhook`
- 내용: [`supabase/functions/instagram-webhook/index.ts`](./supabase/functions/instagram-webhook/index.ts) 전체 붙여넣기

배포한 뒤 **그 함수의 설정에서 JWT 검증을 끕니다.**
(함수 상세 → **Settings** → `Verify JWT` / `Enforce JWT verification` 류의 스위치)

> **이걸 빠뜨리면 100% 실패합니다.** Meta는 Supabase anon 키를 붙여주지 않아서,
> 켜져 있으면 요청이 함수에 닿기도 전에 401로 막힙니다.
> 대신 이 주소는 사실상 공개가 되므로, 함수는 `META_APP_SECRET`으로
> **Meta가 보낸 서명(`X-Hub-Signature-256`)을 검증**해서 남의 요청을 걸러냅니다.

함수 주소는 이 형태입니다 (9-4에서 붙여넣습니다):

```
https://<프로젝트-ref>.supabase.co/functions/v1/instagram-webhook
```

### 9-4. Meta 앱에 웹훅 등록

Instagram 제품 → **Webhooks(웹훅)**

1. **콜백 URL**: 위 함수 주소
2. **확인 토큰**: `META_VERIFY_TOKEN` 에 넣은 것과 **똑같은 문자열**
3. **확인 및 저장** — 여기서 통과해야 다음으로 갑니다
   (실패하면 9-3의 JWT 스위치를 먼저 의심하세요)
4. 저장되면 **`messages` 필드를 구독**합니다
5. 화면 안내에 따라 **보드용 인스타 프로페셔널 계정을 연결**합니다

### 9-5. ⚠️ 인스타 앱에서 메시지 접근 허용

인스타 앱 → **설정** → **메시지 및 스토리 답장** → **연결된 도구**
→ **메시지 접근 허용**을 켭니다.

> 이 스위치가 꺼져 있으면 웹훅이 **아무것도 안 옵니다.** 가장 많이 빠뜨리는 단계입니다.

### 9-6. 테스트 — 릴스를 DM으로 보내기

**다른 계정에서** 보드 계정으로 보내야 합니다. (자기 자신에게 보낸 DM은 웹훅이
안 오거나 형태가 다릅니다. 두 사람이 쓰는 보드니 서로의 계정을 쓰면 됩니다.)

인스타에서 릴스 하나 → **공유** → 보드 계정 선택 → 보내기.

그다음 **Edge Functions → instagram-webhook → Logs** 를 봅니다.

### 9-7. 결과 읽는 법

로그에 이런 줄들이 찍힙니다.

```
instagram-webhook: 📦 payload (…)        ← 받은 데이터 전체
instagram-webhook: 🧩 첨부 type=… payload 키=[…]
instagram-webhook: 🔎 발견한 링크 N개
instagram-webhook: ✅ 게시물 주소를 찾았습니다 → https://www.instagram.com/reel/…
instagram-webhook: ❌ 게시물 주소(instagram.com/reel/… 형태)는 없습니다
```

- **✅ 가 뜨면** → 이 방식으로 갑니다. 함수에 카드 생성 로직을 얹으면 끝입니다
- **❌ 가 뜨면** → 링크가 `lookaside.fbsbx.com/…` 같은 CDN 주소만 오는 경우입니다.
  그 주소로는 어떤 게시물인지 알 수 없어서 **DM 방식은 여기서 접습니다.**
  대신 공유버튼(PWA/단축어)이나 링크 여러 개 붙여넣기로 갑니다
- **아무 로그도 안 찍히면** → 9-5 스위치, 9-3 JWT, 9-4 `messages` 구독 순으로 확인

> 확인이 끝나면 이 함수는 지워도 됩니다. 로그만 남기고 아무것도 저장하지 않습니다.

## 10. 태그 색 저장 켜기 (선택)

'🏷️ 태그 관리' 탭에서 태그마다 색을 고를 수 있는데, 그 색은
`custom_categories.color` 컬럼에 저장됩니다. 컬럼이 없으면 색을 골라도
새로고침하면 원래대로 돌아옵니다 (목록·태그 만들기는 그대로 동작합니다).

Supabase 대시보드 → **SQL Editor** → **New query** 에 붙여넣고 **Run**:

```sql
alter table public.custom_categories
  add column if not exists color text;
```

> [`supabase/schema.sql`](./supabase/schema.sql) 전체를 다시 실행해도 결과는 같아요.
> 색을 안 고른 태그는 `null`로 남고, 앱이 팔레트에서 자동으로 색을 나눠 줍니다.

---

## 11. 가기 좋은 시간대 채우기 (선택)

**"이 장소는 언제 가면 좋은지"**(아침/점심/오후/저녁/야간)를 AI가 판단해서 붙여 줍니다.
나중에 데이트 코스를 짤 때 쓸 재료라, 자유 문장이 아니라 **정해진 5개 값** 중에서만
고르게 되어 있어요. AI가 고른 값은 카드 수정 폼에서 직접 바꿀 수 있습니다.

시간대는 **장소마다 따로** 붙습니다. 한 카드에 점심 국밥집과 야장이 같이 들어갈 수 있어서
카드 하나에 시간대 하나로는 "점심은 여기 → 저녁은 여기" 같은 코스를 짤 수 없기 때문이에요.
카드에도 시간대가 하나 있는데, 이건 **장소가 없는 카드**(집에서 요리·온라인)와
아직 장소별로 못 채운 곳이 따라가는 기본값입니다.

### 11-1. DB에 컬럼 추가 ⚠️ 먼저 할 것

**코드 배포보다 먼저 해야 합니다.** 컬럼이 없는 상태에서 새 코드가 카드를 저장하면
저장이 전부 실패해요.

Supabase 대시보드 → **SQL Editor** 에서 아래를 실행합니다
([`supabase/schema.sql`](./supabase/schema.sql) 전체를 다시 붙여넣어도 됩니다 —
여러 번 실행해도 안전해요).

```sql
alter table public.contents
  add column if not exists time_slots text[] not null default '{}';

alter table public.contents
  add column if not exists time_reason text not null default '';
```

> 장소별 시간대는 `places` (jsonb) 안에 들어가므로 **컬럼 추가가 더 필요하지 않습니다.**
> 위 두 컬럼만 있으면 되고, 예전에 만든 카드는 키가 없는 상태로 두어도 안전해요
> (카드 기본값을 따라갑니다).

### 11-2. 새로 만드는 카드에 자동으로 붙이기

`analyze-link` 함수를 [최신 코드](./supabase/functions/analyze-link/index.ts)로
**재배포**하면, 링크를 붙여넣어 만드는 카드에 시간대가 같이 채워집니다.
(6번에서 이미 배포했더라도 한 번 더 배포해야 해요 — 프롬프트가 바뀌었습니다.
장소마다 시간대를 따로 판단하도록 바뀐 것도 이 재배포에 들어 있습니다.)

### 11-3. 이미 만들어 둔 카드 일괄 채우기

예전에 만든 카드들은 원본 캡션이 남아 있지 않아서, 제목·메모·태그·장소를 근거로
다시 판단하는 **별도 함수**를 씁니다.
(원문을 앞으로는 남겨 두려면 아래 12번을 보세요 — 원문이 있으면 판단이 훨씬 정확해집니다.)

1. Supabase 대시보드 → **Edge Functions** → **Deploy a new function**
2. Function name: `analyze-time`
3. 내용: [`supabase/functions/analyze-time/index.ts`](./supabase/functions/analyze-time/index.ts) 전체 붙여넣기
4. **Verify JWT** 는 끄기 (`analyze-link`와 동일)
5. 6-1에서 등록한 `ANTHROPIC_API_KEY` 시크릿을 그대로 씁니다 (추가 키 없음)

> `analyze-time` 을 이미 배포해 두었더라도 **한 번 더 배포**해야 합니다 —
> 장소별 시간대를 돌려주도록 응답 형식과 프롬프트가 바뀌었어요.

배포한 뒤 보드 상단(‘분석 안 된 카드 다시 분석’ 버튼 아래)에
**🕐 시간대 안 채운 카드 N개 분석** 버튼이 생깁니다.

- 아직 시간대를 못 채운 곳이 남은 카드가 있으면 **그 카드들만** 분석합니다
  (카드 단위로만 채워 둔 예전 카드도 장소별로 채우러 다시 대상이 됩니다)
- 전부 채워져 있으면 라벨이 **🕐 시간대 전체 다시 분석**으로 바뀌고,
  누르면 직접 고쳐둔 값까지 다시 씁니다 (확인 창이 한 번 뜹니다)
- 카드는 20개씩 끊어서 보내고 `12/47` 형태로 진행 상황이 표시됩니다
- 일부만 실패해도 성공한 카드는 그대로 저장하고, 실패 사유를 화면에 남깁니다

> 링크 재분석(6번)과 달리 게시물을 다시 수집하지 않아서 **훨씬 빠르고 쌉니다.**
> 카드를 20개씩 묶어 보내므로 카드 수만큼 호출이 늘지 않고, Claude Haiku 기준
> 카드 100개에 몇십 원 수준입니다.

---

## 12. 게시물 원문(캡션) 보관하기 (선택)

카드에 **게시물 원문 캡션을 손대지 않은 그대로** 저장해 둡니다. 화면에는 안 보이고
저장만 하는 값이라 쓰는 방법은 없고, **왜 모으는지**가 전부예요.

- AI가 만드는 `메모`는 "한두 문장"짜리 **요약**입니다. 원문에 있던 영업시간·분위기·
  가격·웨이팅 같은 건 대부분 여기서 잘려 나가요.
- 그런데 원문은 **게시물이 지워지거나 비공개로 바뀌면 두 번 다시 못 구합니다.**
- 원문을 갖고 있으면 나중에 다시 분석할 때 **인스타를 또 긁지 않아도 됩니다** —
  카드당 1분 넘게 걸리던 재분석이 몇 초로 끝나고, Apify 크레딧도 안 씁니다.

### 12-1. DB에 컬럼 추가 ⚠️ 먼저 할 것

**코드 배포보다 먼저 해야 합니다.** 컬럼이 없는 상태에서 새 코드가 카드를 저장하면
저장이 전부 실패해요.

Supabase 대시보드 → **SQL Editor** 에서 아래를 실행합니다
([`supabase/schema.sql`](./supabase/schema.sql) 전체를 다시 붙여넣어도 됩니다 —
여러 번 실행해도 안전해요).

```sql
alter table public.contents
  add column if not exists caption text not null default '';
```

### 12-2. 새로 만드는 카드에 자동으로 붙이기

`analyze-link` 함수를 [최신 코드](./supabase/functions/analyze-link/index.ts)로
**재배포**하면, 링크로 만드는 카드에 원문이 같이 저장됩니다.
(앞에서 이미 배포했더라도 한 번 더 해야 해요 — 응답에 `caption`이 추가됐습니다.)

### 12-3. 이미 만들어 둔 카드 일괄 수집

화면 위쪽 **📝 원문 없는 카드 N개 수집** 버튼을 누르면 됩니다.
(대상이 하나도 없으면 버튼이 안 보입니다.)

- **원문만 채우고 제목·메모·태그·장소는 절대 안 건드립니다.** 이미 잘 정리해 둔 카드도
  안심하고 돌려도 돼요.
- 게시물을 다시 긁어야 해서 **카드 하나에 1분 넘게 걸릴 수 있습니다.** 화면이 꺼지지
  않게 잡아 두고, 중간에 끊겨도 앱을 다시 열면 남은 카드부터 이어서 합니다.
- **AI(Claude)는 부르지 않습니다** — 수집만 하는 모드(`caption_only`)라 토큰 비용이 0이에요.
  드는 건 인스타 수집(Apify) 쪽뿐입니다.
- 실패한 카드는 이유와 함께 목록에 남고, 이름을 누르면 그 카드가 바로 열립니다.
  (이미 지워졌거나 비공개로 바뀐 게시물은 원문을 못 구합니다 — 그런 카드는 원문 없이
  그대로 두면 돼요.)

---

## 13. 가고 싶은 동네 검색 켜기 (선택)

지도 위 검색바에 **"조용히 걷기 좋은 동네"** 처럼 추상적으로 던지면, 저장해 둔 카드가 있는
동네를 관련도 순으로 골라 줍니다. 고른 동네를 누르면 목록·지도가 그 동네로 걸러집니다.

- 후보는 **보드에 저장된 동네뿐**입니다 — 안 가 본 새 동네를 발굴해 주지는 않아요.
- 동네는 카드에 붙은 장소의 **주소를 읽어서** 자동으로 묶입니다. 새 컬럼도, 추가 수집도
  필요 없어요 (DB 작업 없음). 주소에 지번(○○동)이 있으면 **동 단위**로, 도로명주소뿐이면
  **구·시·군 단위**로 묶입니다. 주소에 동이 없어도 카드 제목·메모에 동네 이름이 하나만
  적혀 있으면 그걸 빌려 씁니다.
- **이 함수를 배포하지 않아도 검색은 됩니다** — 다만 이름·태그 매칭으로만 찾고,
  그 사실을 화면에 알려 줍니다. 분위기를 읽는 건 AI 쪽 몫이에요.

### 13-1. 검색 함수 배포

1. Supabase 대시보드 → **Edge Functions** → **Deploy a new function**
2. Function name: `region-search`
3. 내용: [`supabase/functions/region-search/index.ts`](./supabase/functions/region-search/index.ts) 전체 붙여넣기
4. **Verify JWT** 는 끄기 (`analyze-link`와 동일)
5. 6-1에서 등록한 `ANTHROPIC_API_KEY` 시크릿을 그대로 씁니다 (추가 키 없음)

### 13-2. 쓰는 법

1. ‘할 것들’ 또는 ‘한 것들’ 탭의 지도 위 **🧭 어디 갈까?** 칸에 검색어를 넣습니다
2. 결과는 관련도 높은 순이고, 오른쪽 숫자가 AI가 매긴 점수입니다.
   1등과 가까운 동네가 같은 점수면 더 위로 올라옵니다
3. 동네를 누르면 그 동네 카드만 남고 지도도 거기로 맞춰집니다 — 다시 누르면 해제,
   **초기화**를 누르면 검색 자체를 지웁니다

> **비용**: 카드 본문을 통째로 보내지 않고, 동네마다 **이름·태그·장소 이름·카드 제목만
> 뭉쳐서** 보냅니다 (사진·링크·메모·주소는 안 보냅니다). 동네 40곳이어도 입력이
> 7천 자 남짓이라 Claude Haiku 기준 **한 번 검색에 10원 안팎**입니다.
> 동네 목록은 매번 똑같아서 캐시를 걸어 두었고, 연달아 검색하면 두 번째부터 그 부분의
> 입력 비용이 1/10로 떨어집니다. 같은 검색어를 다시 누르면 아예 호출하지 않습니다.
