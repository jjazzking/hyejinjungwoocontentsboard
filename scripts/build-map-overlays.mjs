/**
 * 지도 오버레이 데이터 생성기 (개발자용 · 앱 런타임과 무관)
 *
 *   node scripts/build-map-overlays.mjs
 *
 * 공개 데이터를 내려받아 `src/data/districtBoundaries.json` 하나로 줄여 놓는다.
 * 배포 산출물에는 이 스크립트가 들어가지 않고, 만들어진 JSON만 lazy로 불린다.
 *
 *   원본: southkorea/southkorea-maps (통계청 2018 시군구, 원본 해상도 TopoJSON)
 *   TopoJSON의 arc는 맞닿은 두 구가 공유하므로, arc를 그대로 선으로 그리면
 *   경계가 딱 한 번씩만 그려진다 (폴리곤으로 풀면 같은 선을 두 번 그린다).
 *   그 '공유하는 구들'이 누구인지를 보고 시 경계와 구 경계를 갈라 놓는다.
 *
 * 행정구역이 바뀌면 이 스크립트를 다시 돌려 JSON을 갱신한다.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT_DIR = resolve(import.meta.dirname, '../src/data')

// `-topo-simple` 쪽(553KB)도 있지만 이미 5배쯤 뭉개진 데이터라, 확대하면 경계가
// 각진 다각형처럼 보인다. 2MB짜리 원본을 받아서 우리가 필요한 만큼만 줄인다.
const TOPO_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo.json'
async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.text()
}

// ────────────────────────────── 시·군·구 경계 ──────────────────────────────

/** TopoJSON arc 하나를 델타 해제해서 [lng, lat] 목록으로 되돌린다 */
function decodeArc(arc, transform) {
  const { scale, translate } = transform
  const out = []
  let x = 0
  let y = 0
  for (const [dx, dy] of arc) {
    x += dx
    y += dy
    out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]])
  }
  return out
}

/**
 * Douglas–Peucker 단순화.
 * 경계선은 원본이 매우 촘촘해서 그대로 두면 파일도 크고 그리기도 느리다.
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points
  const sqTol = tolerance * tolerance
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()
    let maxSq = 0
    let index = -1
    const [x1, y1] = points[first]
    const [x2, y2] = points[last]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = dx * dx + dy * dy

    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i]
      let t = len === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len
      t = Math.max(0, Math.min(1, t))
      const ex = x1 + t * dx - px
      const ey = y1 + t * dy - py
      const sq = ex * ex + ey * ey
      if (sq > maxSq) {
        maxSq = sq
        index = i
      }
    }

    if (index !== -1 && maxSq > sqTol) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  return points.filter((_, i) => keep[i] === 1)
}

/**
 * 행정구역 하나를 "어느 시에 속하는가" 키로 바꾼다.
 * 이 키가 같고 둘 다 구이면 그 사이 선은 **구 경계**, 아니면 **시 경계**다.
 *
 *   수원시장안구 · 수원시팔달구  → '수원시'  (일반구는 이름에 상위 시가 붙어 있다)
 *   종로구 · 중구               → '11'      (특별·광역시의 자치구는 시도 코드로 묶는다)
 *   성남시 · 가평군             → 자기 자신  (시·군은 그 자체가 한 덩어리)
 *
 * 부산 중구와 대구 중구처럼 이름이 겹치는 자치구가 있어서, 자치구는 이름이 아니라
 * 코드 앞 두 자리(시도)로 묶어야 한다.
 */
function cityKeyOf({ name, code }) {
  const general = name.match(/^(.+?시)(.+구)$/)
  if (general) return general[1]
  if (name.endsWith('구')) return code.slice(0, 2)
  return code
}

async function buildDistricts() {
  const topo = JSON.parse(await fetchText(TOPO_URL))
  const { transform, arcs } = topo
  const geometries = Object.values(topo.objects)[0].geometries

  // arc 번호 → 그 선을 경계로 쓰는 행정구역들
  const owners = new Map()
  const remember = (index, unit) => {
    // 음수는 같은 arc를 거꾸로 쓴다는 표시다 (~index 가 실제 번호)
    const key = index < 0 ? ~index : index
    if (!owners.has(key)) owners.set(key, [])
    owners.get(key).push(unit)
  }
  const walk = (node, unit) => {
    if (typeof node === 'number') remember(node, unit)
    else for (const child of node) walk(child, unit)
  }
  for (const geometry of geometries) {
    const { name, code } = geometry.properties
    walk(geometry.arcs, { name, code, cityKey: cityKeyOf(geometry.properties) })
  }

  /**
   * 선 하나를 분류한다.
   *
   *   'district' — 같은 시에 속한 구끼리 맞닿은 선 (회색)
   *   'city'     — 그 밖의 행정구역이 맞닿은 선 (주황)
   *   null       — 한 구역만 쓰는 선 = 해안선·국경·섬 테두리 → **그리지 않는다**
   *
   * 해안선을 빼는 이유: 전체 2,155개 중 1,487개(69%)가 바다 쪽 선이라 그대로 그리면
   * 남해안·섬이 전부 주황색이 된다. 물가는 밑에 깔린 지도가 이미 보여주고 있어서
   * 우리가 한 번 더 그릴 이유가 없다. 뺀 덕에 그릴 선이 668개로 줄었다.
   */
  const classify = (index) => {
    const units = owners.get(index) ?? []
    if (units.length < 2) return null
    const sameCityDistricts = units.every(
      (unit) => unit.name.endsWith('구') && unit.cityKey === units[0].cityKey,
    )
    return sameCityDistricts ? 'district' : 'city'
  }

  const city = []
  const district = []
  let points = 0
  arcs.forEach((arc, index) => {
    // 위경도(도) 단위 허용오차 — 0.0002도 ≈ 22m.
    // 배율 14에서 1픽셀이 ~9m라 오차가 2px 안쪽이다. 더 줄여도 눈에 안 띄는데 용량만 는다.
    const kind = classify(index)
    if (!kind) return
    const simplified = simplify(decodeArc(arc, transform), 0.0002)
    if (simplified.length < 2) return
    // 1e-4도(≈11m) 격자에 올린 뒤 앞 점과의 차이만 적는다.
    // 소수점 좌표를 그대로 쓰는 것보다 파일이 절반 이하로 줄어든다 (복원은 overlays.js).
    const flat = []
    let prevLat = 0
    let prevLng = 0
    for (const [lng, lat] of simplified) {
      const y = Math.round(lat * 1e4)
      const x = Math.round(lng * 1e4)
      flat.push(y - prevLat, x - prevLng)
      prevLat = y
      prevLng = x
    }
    ;(kind === 'district' ? district : city).push(flat)
    points += simplified.length
  })

  const json = {
    _source: 'southkorea/southkorea-maps · 통계청 2018 시군구 (22m 단순화 후 재가공)',
    _format: 'city/district: 경계선 하나당 [Δlat, Δlng, …] · 1e-4도 단위 정수 누적합',
    city,
    district,
  }
  writeFileSync(resolve(OUT_DIR, 'districtBoundaries.json'), JSON.stringify(json))
  console.log(
    `districtBoundaries.json — 시 경계 ${city.length}개 / 구 경계 ${district.length}개 / 점 ${points}개`,
  )
}

await buildDistricts()
