/**
 * 지도 배경 오버레이 — 시·군·구 경계선과 수도권 전철 노선.
 *
 * 두 캔버스(네이버/Leaflet)가 같은 데이터를 쓰도록 여기서 한 번만 불러서 캐시한다.
 * 데이터 자체는 `scripts/build-map-overlays.mjs`가 공개 데이터로 만든 JSON이고,
 * 경계선은 280KB쯤 되므로 **오버레이를 처음 켤 때** 동적 import로 내려받는다
 * (지도를 안 쓰거나 오버레이를 꺼 둔 사람은 아예 받지 않는다).
 */

/**
 * 경계선은 전국 2,000여 개라 멀리서 보면 화면이 새까매지고 폴리라인 수도 감당이 안 된다.
 * 10이면 서울 전체 + 인접 시가 한 화면에 들어오는 정도 — '구 경계'를 보기 딱 좋은 배율이다.
 */
export const MIN_ZOOM_DISTRICTS = 10
/** 지하철은 수도권에만 있어서 조금 더 멀리서부터 보여줘도 괜찮다 */
export const MIN_ZOOM_SUBWAY = 8

/** 경계선: 얇은 파선 — 지명·핀을 가리지 않으면서 구역이 읽히는 정도 */
export const DISTRICT_STYLE = { color: '#1f2937', weight: 1.2, opacity: 0.45, dash: [5, 5] }
/** 지하철: 굵고 흐린 후광 + 그 위에 진한 심 — 노선이 지나가는 띠가 눈에 들어온다 */
export const SUBWAY_HALO = { weight: 8, opacity: 0.18 }
export const SUBWAY_CORE = { weight: 2.5, opacity: 0.8 }

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

function decodeSubwayPath(flat) {
  const path = []
  for (let i = 0; i < flat.length; i += 2) path.push([flat[i], flat[i + 1]])
  return path
}

let cached = null

/**
 * 오버레이 데이터를 (한 번만) 내려받는다.
 * 실패해도 지도는 살아 있어야 하므로 빈 데이터를 돌려주고 다음에 다시 시도한다.
 */
export function loadMapOverlays() {
  if (!cached) {
    cached = Promise.all([
      import('../../data/districtBoundaries.json'),
      import('../../data/subwayLines.json'),
    ])
      .then(([districts, subway]) => ({
        districts: districts.default.lines.map(decodeDistrictLine),
        subway: subway.default.lines.map((line) => ({
          name: line.name,
          color: line.color,
          paths: line.paths.map(decodeSubwayPath),
        })),
      }))
      .catch((error) => {
        console.error('지도 오버레이 데이터를 불러오지 못했습니다:', error)
        cached = null
        return { districts: [], subway: [] }
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
