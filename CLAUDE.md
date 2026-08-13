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
    Dashboard.jsx             탭(PLANNING/COMPLETED) · 필터 · 카드 그리드 · 모달 제어
    ContentCard.jsx           카드 1장 (사진/임베드/장소/카테고리)
    ContentFormModal.jsx      카드 추가·수정 폼 (AI 자동 채움 진입점)
    CategoryFilter.jsx        '할 일' 탭의 태그별 필터 칩
    CompletedCalendar.jsx     '한 일' 탭의 달력 (컨텐츠 있는 날 강조)
    ContentMap.jsx            지도 (lazy 로드) — 핀 계산·범례·시트·위치 없는 카드 안내
    map/NaverCanvas.jsx       네이버 지도 v3로 핀·경계선 그리기
    map/LeafletCanvas.jsx     OSM 폴백으로 핀·경계선 그리기 (같은 props)
    map/useNaverMapsScript.js 네이버 스크립트 로더 (off/loading/ready/failed)
    map/pin.js                두 지도가 공유하는 핀 마크업 (태그 색 · 상태별 채움)
    map/overlays.js           시·군·구 경계 데이터 로더 · 스타일 · 화면 컬링
    map/MapLegend.jsx         지도 아래 범례 + 경계 on/off 스위치
    map/PinSheet.jsx          핀 탭 → 실제 카드를 그대로 띄우는 시트
    PlacePicker.jsx           📍 장소 검색·확정 UI
    ClipboardPrompt.jsx       클립보드에서 SNS 링크 감지 배너
    ShareToast.jsx            공유로 받은 링크의 저장 결과 알림 (+ 수정하기)
    PhotoCarousel.jsx / embeds/   사진·인스타·유튜브·틱톡 표시
  hooks/
    useContents.js            카드 CRUD (Supabase ↔ localStorage 이중 모드)
    useCategories.js          커스텀 카테고리
    useClipboardSuggestion.js 클립보드 감시
    useSharedLink.js          공유(`?url=`/`?text=`)로 들어온 링크 1회 수신
  utils/
    linkAnalyzer.js           링크 → 카드 초안 (Edge Function 호출, oEmbed 폴백)
    placeSearch.js            장소 검색 Edge Function 호출
    categoryColors.js         태그 → 지도 핀 색 (팔레트 · 카드 대표색)
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
  functions/analyze-link/     Claude로 링크 분석 + 장소 자동 검색
  functions/place-search/     네이버 지역 검색 프록시
  functions/instagram-webhook/ 인스타 DM 웹훅 (검증용 탐침 — payload를 로그로만 남긴다)
docs/MAP_FEATURE.md           지도 기능 기획 노트 (아직 미구현 단계 포함)
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

**AI 모델은 비용 때문에 `claude-haiku-4-5`를 쓴다.** 응답은 JSON만 반환하도록 강제하고,
장소는 지어내지 말라는 규칙을 시스템 프롬프트에 유지한다.

## 데이터 모델

`contents` 행의 주요 필드: `title`, `status`(`PLANNING`|`COMPLETED`), `date`,
`categories`(text[]), `memo`, `photo_urls`(text[]), `reference_url`,
`reference_platform`, `places`(jsonb), `sort_order`.

`places` 원소:

```js
{ name, address, lat, lng, category, url, source }
// source: MANUAL | AI | INSTAGRAM | NAVER_LINK  (MANUAL = 사용자가 확정함)
// lat/lng 는 null 일 수 있다 (이름만 추가한 경우)
```

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
