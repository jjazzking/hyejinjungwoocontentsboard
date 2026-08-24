/**
 * 지도 배경 오버레이 — 시·군·구 경계선.
 *
 * 두 캔버스(네이버/Leaflet)가 같은 데이터를 쓰도록 여기서 한 번만 불러서 캐시한다.
 * 데이터 자체는 `scripts/build-map-overlays.mjs`가 공개 데이터로 만든 JSON이고,
 * 235KB쯤 되므로 **경계를 처음 켤 때** 동적 import로 내려받는다
 * (지도를 안 쓰거나 경계를 꺼 둔 사람은 아예 받지 않는다).
 */

/**
 * 멀리서 보면 경계선이 그물처럼 얽혀 지명을 덮는다.
 * 10이면 서울 전체 + 인접 시가 한 화면에 들어오는 정도 — 경계를 보기 딱 좋은 배율이다.
 */
export const MIN_ZOOM_DISTRICTS = 10
/**
 * 경계선은 두 단계로 그린다.
 *
 *   시 경계 — 서울↔경기, 성남시↔용인시 같은 시·군 사이. 주황색으로 눈에 띄게
 *   구 경계 — 강남구↔서초구처럼 **같은 시 안의 구끼리**. 회색으로 조용하게
 *
 * 파선으로도 해 봤는데 지도 위에 무늬가 하나 더 얹힌 것처럼 보여서 둘 다 실선이다.
 * 해안선은 데이터에 아예 없다 (밑의 지도가 이미 보여준다 — build 스크립트 참고).
 */
// 얇게 줄였더니 이번엔 경계가 어디인지 잘 안 보여서 굵기를 다시 올린다.
// 투명도는 낮춘 값 그대로 둬서 굵어져도 핀·지명을 덮지 않게 한다.
// 시(주황)를 구(회색)보다 굵고 진하게 둬서 두 단계가 구분되게 한다.
export const CITY_STYLE = { color: '#EA580C', weight: 3.5, opacity: 0.55 }
export const DISTRICT_STYLE = { color: '#334155', weight: 2.2, opacity: 0.32 }

/** 델타(1e-4도 정수 누적합)로 접어둔 경계선을 [lat, lng] 목록으로 되돌린다 */
function decodeDistrictLine(flat) {
  const path = []
  let lat = 0
  let lng = 0
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (let i = 0; i < flat.length; i += 2) {
    lat += flat[i]
    lng += flat[i + 1]
    const y = lat / 1e4
    const x = lng / 1e4
    path.push([y, x])
    if (y < minLat) minLat = y
    if (y > maxLat) maxLat = y
    if (x < minLng) minLng = x
    if (x > maxLng) maxLng = x
  }
  return { path, minLat, maxLat, minLng, maxLng }
}

let cached = null

/**
 * 경계선 데이터를 (한 번만) 내려받는다.
 * 실패해도 지도는 살아 있어야 하므로 빈 목록을 돌려주고 다음에 다시 시도한다.
 */
export function loadDistrictBoundaries() {
  if (!cached) {
    cached = import('../../data/districtBoundaries.json')
      .then((module) => ({
        city: module.default.city.map(decodeDistrictLine),
        district: module.default.district.map(decodeDistrictLine),
      }))
      .catch((error) => {
        console.error('시·군·구 경계 데이터를 불러오지 못했습니다:', error)
        cached = null
        return { city: [], district: [] }
      })
  }
  return cached
}

/** 경계선을 자를 때 화면 밖으로 얼마나 더 가져올지 (조금 움직여도 가장자리가 비지 않게) */
const CULL_PADDING = 0.25

/**
 * 이미 그려둔 영역(prev) 안에서 조금 움직인 정도인지.
 * 그렇다면 경계선을 다시 계산할 필요가 없다 — 지도를 끌 때마다 폴리라인 수백 개를
 * 지우고 다시 만들면 눈에 띄게 버벅인다.
 */
export function stillCovered(prev, next, zoom) {
  if (!prev || prev.zoom !== zoom) return false
  // 다시 그리는 기준은 잘라둔 여유분보다 좁게 잡아야 빈 곳이 생기지 않는다
  const slack = CULL_PADDING * 0.8
  const padLat = (prev.bounds.north - prev.bounds.south) * slack
  const padLng = (prev.bounds.east - prev.bounds.west) * slack
  return (
    next.south >= prev.bounds.south - padLat &&
    next.north <= prev.bounds.north + padLat &&
    next.west >= prev.bounds.west - padLng &&
    next.east <= prev.bounds.east + padLng
  )
}

/**
 * 화면에 걸치는 경계선만 골라낸다.
 * 전국 경계선을 통째로 얹으면 폴리라인이 2,000개가 넘어 지도가 버벅인다.
 */
export function visibleDistricts(districts, bounds, zoom) {
  if (!bounds || zoom < MIN_ZOOM_DISTRICTS) return []
  const padLat = (bounds.north - bounds.south) * CULL_PADDING
  const padLng = (bounds.east - bounds.west) * CULL_PADDING
  const south = bounds.south - padLat
  const north = bounds.north + padLat
  const west = bounds.west - padLng
  const east = bounds.east + padLng
  return districts.filter(
    (line) =>
      line.maxLat >= south && line.minLat <= north && line.maxLng >= west && line.minLng <= east,
  )
}
