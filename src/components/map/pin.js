/**
 * 지도 핀 마크업 — 네이버 지도와 Leaflet 양쪽에서 같은 모양을 쓰기 위해 한 곳에 둔다.
 *
 * 색은 **태그(카테고리)** 에서 오고, 모양은 **상태**를 나타낸다.
 *   한 것(done) = 색으로 꽉 채운 핀
 *   할 것       = 흰 속에 색 테두리만 두른 핀
 * 태그 색은 카드마다 달라지므로 CSS 클래스가 아니라 인라인 스타일로 넣는다.
 * 모양·그림자 같은 공통 규칙은 index.css의 `.cb-pin*` 에 있다.
 */

/** 아이콘 상자 크기 */
export const PIN_SIZE = 20
/** 회전한 물방울 모양이라 뾰족한 끝이 상자보다 아래에 온다 — 그 지점이 좌표 위치 */
export const PIN_ANCHOR_Y = 25

export function pinHtml({ color, done, active }) {
  // 어떤 배경 위에서도 색이 살아 있도록 흰 테를 한 겹 두르고 그림자를 깐다
  const fill = done ? `background:${color};border-color:#fff` : `background:#fff;border-color:${color}`
  return `<span class="cb-pin${active ? ' cb-pin-active' : ''}" style="${fill};--cb-pin-color:${color}"></span>`
}
