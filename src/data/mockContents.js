/**
 * 커플 컨텐츠 Mock Data
 *
 * 스키마
 * - id                 : String (UUID)
 * - title              : String
 * - status             : 'PLANNING' | 'COMPLETED'
 * - date               : 'YYYY-MM-DD'
 * - reference_url      : String (아이디어 원본 링크)
 * - reference_platform : 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK' | 'NONE'
 * - photo_urls         : String[] (완료 후 직접 찍은 사진)
 * - category           : String
 * - memo               : String
 */
export const MOCK_CONTENTS = [
  {
    id: 'a1b2c3d4-0001-4a1b-9c3d-000000000001',
    title: '서해 바다 노을 드라이브',
    status: 'PLANNING',
    date: '2026-08-15',
    reference_url: 'https://www.instagram.com/reel/C8xQvXqS1aB/',
    reference_platform: 'INSTAGRAM',
    photo_urls: [],
    category: '여행',
    memo: '릴스에서 본 궁평항 노을 스팟! 김밥 싸들고 가서 차박 감성으로 보고 오자 🌅',
  },
  {
    id: 'a1b2c3d4-0002-4a1b-9c3d-000000000002',
    title: '소금빵 홈베이킹 클래스',
    status: 'PLANNING',
    date: '2026-08-22',
    reference_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    reference_platform: 'YOUTUBE',
    photo_urls: [],
    category: '홈데이트',
    memo: '쇼츠 레시피 그대로 따라해 보기. 버터는 미리 실온에 꺼내두기!',
  },
  {
    id: 'a1b2c3d4-0003-4a1b-9c3d-000000000003',
    title: '한강 피크닉 & 야경 산책',
    status: 'COMPLETED',
    date: '2026-07-12',
    reference_url: 'https://www.tiktok.com/@seoul_date/video/7361234567890123456',
    reference_platform: 'TIKTOK',
    photo_urls: [
      'https://picsum.photos/seed/hangang1/800/600',
      'https://picsum.photos/seed/hangang2/800/600',
      'https://picsum.photos/seed/hangang3/800/600',
      'https://picsum.photos/seed/hangang4/800/600',
    ],
    category: '액티비티',
    memo: '돗자리 명당 찾기 성공! 편의점 라면이 제일 맛있었다 🍜 다음엔 자전거도 타자.',
  },
  {
    id: 'a1b2c3d4-0005-4a1b-9c3d-000000000005',
    title: '집 앞 새로 생긴 와인바 가보기',
    status: 'PLANNING',
    date: '2026-08-09',
    reference_url: '',
    reference_platform: 'NONE',
    photo_urls: [],
    category: '맛집',
    memo: '지나가다 발견! 내추럴 와인 잔술 된다고 써있었음 🍷',
  },
  {
    id: 'a1b2c3d4-0006-4a1b-9c3d-000000000006',
    title: '반포 달빛 야시장 구경',
    status: 'PLANNING',
    date: '2026-08-30',
    reference_url: '',
    reference_platform: 'NONE',
    photo_urls: [],
    category: '액티비티',
    memo: '푸드트럭 털기. 저녁 먹지 말고 가기!',
  },
  {
    id: 'a1b2c3d4-0004-4a1b-9c3d-000000000004',
    title: '을지로 노포 맛집 투어',
    status: 'COMPLETED',
    date: '2026-06-28',
    reference_url: '',
    reference_platform: 'NONE',
    photo_urls: [
      'https://picsum.photos/seed/euljiro1/800/600',
      'https://picsum.photos/seed/euljiro2/800/600',
    ],
    category: '맛집',
    memo: '골뱅이무침 → 노가리 골목 코스. 웨이팅 30분이었지만 그만한 가치가 있었음 ✨',
  },
]
