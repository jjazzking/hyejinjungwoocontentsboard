/**
 * 지도 핀 마크업 — 네이버 지도와 Leaflet 양쪽에서 같은 모양을 쓰기 위해 한 곳에 둔다.
 * 실제 색·모양은 index.css의 `.cb-pin*` 규칙에 있다.
 */

/** 아이콘 상자 크기 */
export const PIN_SIZE = 18
/** 회전한 물방울 모양이라 뾰족한 끝이 상자보다 아래에 온다 — 그 지점이 좌표 위치 */
export const PIN_ANCHOR_Y = 22

export function pinHtml(status, active) {
  const tone = status === 'COMPLETED' ? 'cb-pin-done' : 'cb-pin-todo'
  return `<span class="cb-pin ${tone}${active ? ' cb-pin-active' : ''}"></span>`
}
