# 혜진 ♥ 정우 컨텐츠 보드

커플이 "같이 할 것 / 같이 한 것"을 카드로 모으는 보드. SNS 링크를 붙여넣으면 AI가
제목·카테고리·메모·장소를 채워준다.

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드 (배포 전 반드시 통과시킬 것)
npm run preview  # 빌드 결과 확인
```

테스트 러너는 없다. 변경 후에는 `npm run build`로 최소 검증하고, UI 동작은 직접 확인한다.
Edge Function을 고쳤으면 `deno check supabase/functions/<이름>/index.ts`로 타입을 확인한다.

## 구조

```
src/
  App.jsx                     최상위, Dashboard 렌더
  components/
    Dashboard.jsx             탭(PLANNING/COMPLETED/CATEGORIES) · 필터 · 카드 그리드 · 모달 제어
    ContentCard.jsx           풀 카드 1장 (사진/임베드/장소/카테고리) — 시트 안에서만 쓴다
    ContentSummary.jsx        축약 카드 — 목록에 깔리는 한 줄 요약 + 상시 노출 액션
    ContentSheet.jsx          축약 카드를 누르면 뜨는 풀 카드 시트 (목록·지도 공용)
    CategoryPicker.jsx        '이 태그에 넣을 카드 고르기' 창 (기존 카드 토글)
    ContentFormModal.jsx      카드 추가·수정 폼 (AI 자동 채움 진입점)
    CategoryFilter.jsx        '할 일' 탭의 태그 칩 — 거르기 전용 (칩에 태그 색 점)
    RegionSearch.jsx          🧭 지역 검색 한 줄 (지도 위) — 고른 동네가 곧 필터
    CategoryManager.jsx       '태그 관리' 탭 — 태그 만들기 · 태그별 색 고르기 · 안 쓰는 태그 지우기
    CompletedCalendar.jsx     '한 일' 탭의 달력 (컨텐츠 있는 날 강조)
    ContentMap.jsx            지도 (lazy 로드) — 핀 계산·범례·시트·위치 없는 카드 안내
    map/NaverCanvas.jsx       네이버 지도 v3로 핀·경계선 그리기
    map/LeafletCanvas.jsx     OSM 폴백으로 핀·경계선 그리기 (같은 props)
    map/useNaverMapsScript.js 네이버 스크립트 로더 (off/loading/ready/failed)
    map/pin.js                두 지도가 공유하는 핀 마크업 (태그 색 · 상태별 채움)
    map/overlays.js           시·군·구 경계 데이터 로더 · 스타일 · 화면 컬링
    map/MapLegend.jsx         지도 아래 범례 + 경계 on/off 스위치
    map/PinMiniCard.jsx       핀 탭 → 지도 위 축약 카드 (누르면 ContentSheet)
    PlacePicker.jsx           📍 장소 검색·확정 UI
    ClipboardPrompt.jsx       클립보드에서 SNS 링크 감지 배너
    BulkAnalyzeButton.jsx     분석 안 된 카드 일괄 재분석 (한 장씩 · 끊겨도 재개)
    BulkCaptionButton.jsx     원문 캡션 없는 카드에 원문만 채우기 (다른 필드는 안 건드림)
    BulkRunStatus.jsx         위 두 일괄 작업의 진행률·결과·실패 사유 표시 (공용)
    BulkTimeButton.jsx        카드들의 '가기 좋은 시간대' 일괄 채우기 (20장씩 묶어 호출)
    ShareToast.jsx            공유로 받은 링크의 저장 결과 알림 (+ 수정하기)
    PhotoCarousel.jsx / embeds/   사진·인스타·유튜브·틱톡 표시
  hooks/
    useBulkRun.js             카드를 한 장씩 오래 걸리는 작업에 태우는 공용 실행기
                              (Wake Lock · 진행 위치 저장 · 끊겨도 자동 재개)
    useContents.js            카드 CRUD (Supabase ↔ localStorage 이중 모드)
    useCategories.js          커스텀 카테고리 + 태그별 색
    useClipboardSuggestion.js 클립보드 감시
    useSharedLink.js          공유(`?url=`/`?text=`)로 들어온 링크 1회 수신
  utils/
    linkAnalyzer.js           링크 → 카드 초안 (Edge Function 호출, oEmbed 폴백)
    placeSearch.js            장소 검색 Edge Function 호출
    regions.js                주소 → 동네 묶기 (동 우선 · 구까지 폴백) — 지역 검색 후보
    regionSearch.js           동네 검색 (AI 1순위 · 이름/태그 로컬 매칭 폴백)
    timeSlots.js              '가기 좋은 시간대' 고정 목록 · 정규화 (프론트 단일 출처)
    analyzeTimeSlots.js       기존 카드들의 시간대 일괄 분석 호출 (20장씩 · 진행률)
    categoryColors.js         태그 → 색 (직접 고른 색 우선 · 나머지는 팔레트 자동 배정)
    uploadPhoto.js            Supabase Storage 업로드
  data/
    districtBoundaries.json   시·군·구 경계선 (생성물 — 직접 고치지 말 것)
  lib/supabaseClient.js       설정 없으면 null → localStorage 모드
public/
  manifest.webmanifest        PWA + 안드로이드 공유 시트(share_target)
  sw.js                       설치 조건만 채우는 빈 서비스 워커 (캐싱 안 함)
  icon-*.png                  홈 화면 아이콘 (생성물)
scripts/
  build-map-overlays.mjs      위 JSON을 공개 데이터에서 만들어 내는 스크립트
supabase/
  schema.sql                  테이블 · RLS · 마이그레이션 SQL
  functions/analyze-link/     Claude로 링크 분석 + 장소 자동 검색 + 시간대 판단
  functions/analyze-time/     기존 카드들의 시간대만 일괄 재분석 (배치)
  functions/place-search/     네이버 지역 검색 프록시
  functions/region-search/    추상적인 검색어 → 보드에 있는 동네를 관련도 순으로
  functions/instagram-webhook/ 인스타 DM 웹훅 (검증용 탐침 — payload를 로그로만 남긴다)
docs/MAP_FEATURE.md           지도 기능 기획 노트 (아직 미구현 단계 포함)
docs/REGION_SEARCH.md         지역(동네) 검색 기획·구현 노트
docs/SHARE_TARGET.md          인스타 공유 → 카드 (폰별 설치 방법 포함)
SUPABASE_SETUP.md             공유 DB · Edge Function · 네이버 키 설정 안내
```

## 핵심 규칙

**시크릿은 절대 프론트엔드·저장소·GitHub Secrets에 넣지 않는다.**
저장소와 배포 사이트가 공개이므로 `ANTHROPIC_API_KEY`, `APIFY_TOKEN`,
`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`은 **Supabase Edge Function 시크릿 전용**이다.
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_NAVER_MAP_CLIENT_ID`만
GitHub Secrets에 둔다. anon 키는 RLS로, 지도 Client ID는 서비스 URL 제한으로 보호되므로
브라우저에 노출되는 것이 설계상 정상이다. **지도 Client ID와 검색 API의
`NAVER_CLIENT_SECRET`은 전혀 다른 키다** — 후자는 절대 프론트에 두지 않는다.

**이중 모드를 항상 유지한다.** `isSupabaseConfigured`가 false면 앱은 localStorage로
완전히 동작해야 한다. 새 기능을 넣을 때 Supabase 전용 UI는 이 플래그로 감싼다.

**Edge Function은 파일 하나로 자족적이어야 한다.** Supabase 대시보드 편집기로 함수별로
배포하기 때문에 함수 간 공유 import를 만들지 않는다.

**스키마 변경은 코드 배포보다 먼저.** 새 컬럼을 쓰는 코드가 먼저 나가면 저장이 전부
실패한다. `supabase/schema.sql`에 `alter table ... add column if not exists` 형태로
마이그레이션을 남기고, SUPABASE_SETUP.md에 실행 순서를 적는다.

**실패는 화면에 이유를 남긴다.** 외부 API 실패는 500으로 던지지 말고 HTTP 200에
`failed` / `detail` / `place_debug` 같은 한국어 사유를 담아 폼에 그대로 보여준다.
사용자가 로그를 열지 않고도 원인을 알 수 있어야 한다.

**태그 관리는 '태그 관리' 탭에 모은다.** 태그 만들기·색 고르기·지우기는 전부 여기다.
태그 칩 줄(`CategoryFilter`)은 거르는 일만 한다 — 칩 사이에 입력칸·설정이 끼면 줄이 흔들린다.
**태그 색은 한곳(`buildCategoryColorMap`)에서 만들어 내려보낸다.** 직접 고른 색이 자동 색을
이기고, 자동 색은 이미 골라 간 색을 피한다. 화면마다 따로 만들면 필터를 걸 때 색이 바뀐다.

**축약 → 풀 카드 두 단계다.** 목록과 지도는 축약 카드(`ContentSummary` / `PinMiniCard`)로
훑고, 누르면 `ContentSheet`가 풀 카드를 띄운다. 목록을 전부 풀 카드로 깔면 임베드·사진
때문에 한 화면에 두세 장밖에 안 들어와서 훑을 수가 없다. **풀 카드(`ContentCard`)는
시트 안에서만 쓴다** — 목록에 직접 넣지 말 것.

**동네는 주소에서 계산해 낸다 — 저장하지 않는다.** 지역 검색의 후보(동네)는
`places[].address`를 그때그때 파싱해서 만든다(`src/utils/regions.js`). 컬럼을 새로 만들어
동네를 적어 두면 주소를 고칠 때마다 어긋난다. 도로명주소에는 동 이름이 없으므로
**동을 못 뽑으면 구·시·군으로 묶는 폴백을 지우지 말 것** — 저장된 카드의 상당수가 그 경로다.

**편집 모드는 없다.** 카드의 ✏️ 수정은 항상 떠 있고, 나머지(완료 전환·순서 이동·삭제)는
카드의 `⋯` 뒤에 접혀 있다. 예전엔 상단 '편집' 토글을 켜야 액션이 나왔는데 한 번 더 누르는
단계가 번거로워서 없앴다. **액션을 새로 추가할 땐 넷을 다 펼치지 말고 `⋯` 안에 넣을 것** —
카드마다 버튼 줄이 생기면 목록이 시끄러워진다.

**AI 모델은 비용 때문에 `claude-haiku-4-5`를 쓴다.** 응답은 JSON만 반환하도록 강제하고,
장소는 지어내지 말라는 규칙을 시스템 프롬프트에 유지한다.

## 데이터 모델

`custom_categories` 행: `name`(PK), `color`(직접 고른 `#RRGGBB` · null이면 자동 색).
색만 고른 기본 태그(맛집 등)도 이 테이블에 행이 생긴다.

`contents` 행의 주요 필드: `title`, `status`(`PLANNING`|`COMPLETED`), `date`,
`categories`(text[]), `memo`, `caption`, `photo_urls`(text[]), `reference_url`,
`reference_platform`, `places`(jsonb), `time_slots`(text[]), `time_reason`, `sort_order`.

**`caption`은 게시물 원문이고 `memo`는 그 요약이다 — 둘을 섞지 말 것.** 화면에는 `memo`만
쓰고 `caption`은 저장만 한다(폼에 입력칸도 없다). 원문을 남기는 이유는 게시물이 지워지거나
비공개로 바뀌면 두 번 다시 못 구하기 때문이고, 원문이 있으면 나중에 새 필드를 뽑거나 다시
분석할 때 **인스타를 또 긁지 않아도 된다**(카드당 1분 → 몇 초, Apify 크레딧 0).
`analyze-link`에 `caption_only: true`로 부르면 수집만 하고 Claude를 건너뛴다 —
이미 분석된 옛 카드에 원문만 백필하는 경로(`BulkCaptionButton`)가 이걸 쓴다.
**옛 카드에는 `caption`이 빈 문자열이므로 없는 경우를 처리하는 경로를 지우면 안 된다.**

`places` 원소:

```js
{ name, address, lat, lng, category, url, source, time_slots, time_reason }
// source: MANUAL | AI | INSTAGRAM | NAVER_LINK  (MANUAL = 사용자가 확정함)
// lat/lng 는 null 일 수 있다 (이름만 추가한 경우)
// time_slots 는 그 장소 하나의 시간대. 비어 있으면 카드의 time_slots 를 따라간다
```

`time_slots` 원소는 `MORNING` | `LUNCH` | `AFTERNOON` | `EVENING` | `NIGHT` 다섯 개뿐이다.
사용자가 늘릴 수 있는 `categories`와 달리 **고정 enum**이다 — 나중에 데이트 코스의 슬롯으로
써야 하므로 자유 문장이면 안 된다. 목록은 `src/utils/timeSlots.js`가 단일 출처이고
두 Edge Function의 `TIME_SLOT_KEYS`와 프롬프트가 같은 목록을 복사해 갖고 있으니
**셋을 함께 고쳐야 한다**.

**시간대는 장소마다 붙는다.** 한 카드에 점심 국밥집과 야장이 같이 들어갈 수 있어서
카드 하나에 시간대 하나로는 코스를 짤 수 없다. 그래서 값이 두 군데에 있다.

| | 무엇 | 언제 쓰나 |
|---|---|---|
| `places[].time_slots` | 그 장소 하나의 시간대 | **코스를 짤 때 쓰는 진짜 값** |
| `contents.time_slots` | 카드 기본값 | 장소가 없는 카드(홈데이트·온라인), 아직 장소별로 못 채운 곳의 폴백 |

읽는 쪽에서 직접 고르지 말고 `src/utils/timeSlots.js`의 `resolveTimeSlots(place, content)`
(장소 하나에 적용되는 값) 와 `cardTimeSlots(content)` (카드 대표 = 장소별 값의 합집합) 를 쓴다.
`places`는 jsonb라 필드를 늘려도 컬럼 마이그레이션이 없지만, 옛 카드에는 키가 아예 없으므로
**빈 값을 폴백으로 처리하는 경로를 지우면 안 된다**.

`time_reason`은 AI가 그 시간대를 고른 근거 한 구절이다(장소별에도 같이 붙는다). 사람이 틀린
판단을 눈으로 잡아내라고 두는 값이라(`place_debug`와 같은 취지) 카드 툴팁·폼에 보여주고,
사람이 칩을 직접 바꾸면 비운다.

읽어오는 컬럼 목록은 `useContents.js`의 `ROW_FIELDS`에 있다. 컬럼을 추가하면
스키마 · `ROW_FIELDS` · 폼 · 카드를 함께 고쳐야 한다.

## 외부 연동

- **Claude** — `analyze-link` 함수 안에서만 호출
- **Apify** — 인스타 캡션 수집 (실패 시 oEmbed 폴백)
- **지도 렌더링** — 네이버 지도 v3가 1순위, OpenStreetMap(Leaflet)이 폴백.
  `VITE_NAVER_MAP_CLIENT_ID`가 있고 스크립트 인증까지 성공해야 네이버로 그린다.
  스크립트는 `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=…`
  (구 파라미터 `ncpClientId`는 폐기됐다). 인증 실패는 예외가 아니라 전역 콜백
  `window.navermap_authFailure`로 오므로 그걸 잡아 폴백한다.
  두 캔버스는 `{ pins, selectedKey, onSelect, className }` props가 같아야 한다.
  **네이버 호출은 전부 try/catch로 감싼다.** 인증이 실패하면 반쯤 죽은 지도 객체가 남고,
  정리 중 `destroy()`가 던진 예외가 올라가면 React가 트리를 내려서 화면이 하얘진다.
  실패하면 `onFailure`로 알려 OSM으로 넘기고, 마지막 방어선으로 `MapErrorBoundary`를 둔다.
- **시·군·구 경계 데이터** — **외부 API가 아니라 저장소에 넣어둔 JSON**(`src/data/`)이다.
  런타임에 아무 데도 호출하지 않는다. `node scripts/build-map-overlays.mjs`로 공개 데이터에서
  다시 만들 수 있고, 235KB라 경계를 처음 켤 때 동적 import로 따로 내려받는다.
  **시 경계(주황)와 구 경계(회색) 두 단계**로 나눠 그린다 — 구를 먼저 깔고 시를 위에 얹는다.
  화면에 걸치는 것만, 배율 10 이상에서만 그린다 (전국을 다 얹으면 폴리라인이 2,000개가 넘는다).
  **JSON을 손으로 고치지 말고 스크립트를 고쳐서 다시 생성할 것.**
- **지역 검색** — `region-search` 함수. 후보 동네는 프론트가 주소에서 만들어 보내고,
  Claude는 **주어진 번호 중에서만** 고른다 (없는 동네를 추천하지 못하게). 함수를 배포하지
  않아도 이름·태그 로컬 매칭으로 검색은 되고, AI를 못 쓴 이유를 화면에 남긴다.
- **인스타 DM 웹훅** — `instagram-webhook` 함수. **아직 검증 단계**로, 릴스를 DM으로
  공유했을 때 payload에 원본 permalink가 들어오는지만 확인한다 (카드는 만들지 않는다).
  Meta는 anon 키를 안 붙이므로 **이 함수만 JWT 검증을 꺼야** 하고, 그래서 공개 엔드포인트가 된다
  — `META_APP_SECRET`으로 `X-Hub-Signature-256`을 검증하는 게 유일한 자물쇠다.
  Meta는 200이 아니면 계속 재전송하므로 **무슨 일이 있어도 200을 돌려준다.**
  설정 순서는 SUPABASE_SETUP.md 9번.
- **공유로 카드 만들기** — 외부 API가 아니라 **브라우저 표준**이다.
  안드로이드는 manifest의 `share_target`으로 공유 시트에 뜨고, 아이폰은 애플이
  이 표준을 지원하지 않아 **단축어**로 같은 주소를 연다. 그래서 받는 쪽 코드는
  `?url=`/`?text=`/`?title=` 세 칸을 훑는 `useSharedLink` 하나면 된다.
  **인스타는 링크를 `url`이 아니라 `text`에 문장째로 넣어 보낸다** — 반드시 셋 다 볼 것.
  `sw.js`에 캐싱을 넣지 말 것 (배포해도 옛 화면이 남는다). 설치 방법은 docs/SHARE_TARGET.md.
- **네이버 지역 검색** — NCP **NAVER API HUB** 경유.
  `GET https://naverapihub.apigw.ntruss.com/search/v1/local`,
  헤더 `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY`.
  (developers.naver.com이 아니다 — 검색 API는 NCP로 이관되었다.)
  좌표는 `mapx`/`mapy`를 10,000,000으로 나눠 WGS84로 변환하고, `title`의 `<b>` 태그와
  HTML 엔티티는 제거한다.

## 배포

`main`에 push하면 GitHub Actions가 GitHub Pages로 배포한다.
**Edge Function은 자동 배포되지 않는다** — Supabase 대시보드에서 수동 배포해야 하므로,
함수를 고쳤으면 사용자에게 재배포를 알려준다.

## 작업 방식

- 개발과 push는 지정된 작업 브랜치에서만 한다.
- PR은 명시적으로 요청받았을 때만 만든다.
- 커밋 메시지·코드 주석은 한국어로 쓴다 (기존 코드와 동일하게).
- 사용자와의 대화는 한국어로 한다.
