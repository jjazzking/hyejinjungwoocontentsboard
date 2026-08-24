/**
 * 태그(카테고리)별 지도 핀 색.
 *
 * 지도 위 핀은 배경(위성/도로/지하철 노선색)과 싸워야 하므로, 파스텔이 아니라
 * 진하고 채도 높은 색만 쓴다. 서로 인접해 있어도 구별되도록 색상환에서 멀리 떨어뜨렸다.
 */
export const PIN_PALETTE = [
  '#E11D48', // 로즈
  '#2563EB', // 블루
  '#7C3AED', // 바이올렛
  '#059669', // 에메랄드
  '#EA580C', // 오렌지
  '#0891B2', // 시안
  '#DB2777', // 핑크
  '#65A30D', // 라임
  '#4F46E5', // 인디고
  '#B45309', // 앰버(진한)
  '#0F766E', // 틸
  '#9F1239', // 자주
]

/** 태그가 하나도 없는 카드의 핀 색 */
export const NO_CATEGORY_COLOR = '#475569'
export const NO_CATEGORY_LABEL = '태그 없음'

/**
 * 카테고리 목록 → { 이름: 색 } Map.
 *
 * 순서대로 팔레트를 나눠 주므로, **보드 전체의 카테고리 목록**(useCategories가 주는 것)을
 * 넣어야 탭을 바꾸거나 필터를 걸어도 같은 태그가 같은 색으로 남는다.
 * 지금 화면에 보이는 카드들의 태그만 넣으면 색이 계속 바뀐다.
 *
 * overrides는 '태그 관리' 탭에서 **직접 고른 색**({ 이름: '#RRGGBB' })이다.
 * 고른 게 있으면 그 색이 이기고, 나머지는 위 규칙대로 자동 배정된다.
 */
export function buildCategoryColorMap(categories, overrides = {}) {
  const map = new Map()
  // 직접 고른 색은 먼저 잡아 둔다 — 자동 배정이 그 색을 피해 가도록
  const taken = new Set()
  for (const name of categories) {
    if (overrides[name]) {
      map.set(name, overrides[name])
      taken.add(overrides[name])
    }
  }

  categories.forEach((name, index) => {
    if (map.has(name)) return
    // 기본은 순서대로지만, 그 색을 누가 직접 골라 갔으면 다음 빈 색으로 넘어간다
    let color = PIN_PALETTE[index % PIN_PALETTE.length]
    for (let step = 1; taken.has(color) && step < PIN_PALETTE.length; step += 1) {
      color = PIN_PALETTE[(index + step) % PIN_PALETTE.length]
    }
    taken.add(color)
    map.set(name, color)
  })
  return map
}

/** 카드의 대표 색 — 태그 여러 개면 첫 번째 태그 기준 */
export function contentColor(content, colorMap) {
  for (const name of content.categories ?? []) {
    const color = colorMap.get(name)
    if (color) return color
  }
  return NO_CATEGORY_COLOR
}
