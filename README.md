# 혜진 ♥ 정우 컨텐츠 보드

연인과 함께할/함께한 데이트 및 액티비티 컨텐츠를 기록하고 관리하는 커플 컨텐츠 대시보드입니다.

## 기술 스택

- React 18 + Vite
- Tailwind CSS v4

## 실행 방법

```bash
npm install
npm run dev
```

## 주요 기능

- **탭 필터링**: `할 것들(PLANNING)` / `한 것들(COMPLETED)` 탭으로 전환
- **카드 갤러리**: 반응형 그리드(1/2/3열) 카드 레이아웃
- **미디어 임베드 분기**: `reference_platform` 값에 따라 Instagram 릴스 / YouTube 쇼츠 / TikTok 임베드 컴포넌트로 분기
- **사진 캐러셀**: 완료된 컨텐츠에 사진이 있으면 임베드 대신 직접 찍은 사진 슬라이드를 표시

## 프로젝트 구조

```
src/
├── data/
│   └── mockContents.js        # 스키마 준수 Mock 데이터 4건
├── components/
│   ├── Dashboard.jsx          # 메인 대시보드 (탭 + 그리드)
│   ├── ContentCard.jsx        # 컨텐츠 카드 (미디어 영역 분기 처리)
│   ├── PhotoCarousel.jsx      # 완료 사진 슬라이드 캐러셀
│   └── embeds/
│       ├── MediaEmbed.jsx     # 플랫폼별 임베드 디스패처
│       ├── InstagramEmbed.jsx # 인스타그램 릴스/게시물 임베드
│       ├── YouTubeEmbed.jsx   # 유튜브 쇼츠/영상 임베드
│       └── TikTokEmbed.jsx    # 틱톡 임베드
└── App.jsx
```

## 데이터 스키마

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | String (UUID) | 컨텐츠 고유 식별자 |
| `title` | String | 컨텐츠 이름 |
| `status` | `'PLANNING'` \| `'COMPLETED'` | 예정 / 완료 |
| `date` | String (`YYYY-MM-DD`) | 실행 예정일 또는 실행한 날짜 |
| `reference_url` | String | 아이디어 원본 링크 |
| `reference_platform` | `'INSTAGRAM'` \| `'YOUTUBE'` \| `'TIKTOK'` \| `'NONE'` | 임베드 분기용 플랫폼 구분 |
| `photo_urls` | String[] | 완료 후 등록한 사진 URL 배열 |
| `category` | String | 맛집, 여행, 홈데이트, 액티비티 등 |
| `memo` | String | 기대감 또는 완료 후기 |
