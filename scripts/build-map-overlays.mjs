/**
 * 지도 오버레이 데이터 생성기 (개발자용 · 앱 런타임과 무관)
 *
 *   node scripts/build-map-overlays.mjs
 *
 * 공개 데이터를 내려받아 `src/data/` 아래 두 파일로 줄여 놓는다.
 * 배포 산출물에는 이 스크립트가 들어가지 않고, 만들어진 JSON만 lazy로 불린다.
 *
 *   src/data/districtBoundaries.json  시·군·구 경계선
 *     원본: southkorea/southkorea-maps (통계청 2018 시군구, 단순화 TopoJSON)
 *     TopoJSON의 arc는 맞닿은 두 구가 공유하므로, arc를 그대로 선으로 그리면
 *     경계가 딱 한 번씩만 그려진다 (폴리곤으로 풀면 같은 선을 두 번 그린다).
 *
 *   src/data/subwayLines.json         수도권 전철 노선
 *     원본: stripe2933/SeoulMetropolitanSubway (역 좌표 + 인접역 그래프)
 *     노선별로 역-역 간선을 이어붙여 하나의 선(path)으로 만든다.
 *
 * 데이터가 오래됐거나 노선이 늘면 이 스크립트를 다시 돌려 JSON을 갱신한다.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT_DIR = resolve(import.meta.dirname, '../src/data')

const TOPO_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json'
const METRO_URL =
  'https://raw.githubusercontent.com/stripe2933/SeoulMetropolitanSubway/main/data/output/metro_graph.gml'

/** 좌표를 소수점 n자리로 (4자리 ≈ 11m — 경계선 표시엔 충분하다) */
const round = (v, n) => Number(v.toFixed(n))

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

async function buildDistricts() {
  const topo = JSON.parse(await fetchText(TOPO_URL))
  const { transform, arcs } = topo

  const lines = []
  let points = 0
  for (const arc of arcs) {
    // 위경도(도) 단위 허용오차 — 0.0009도 ≈ 100m
    const simplified = simplify(decodeArc(arc, transform), 0.0009)
    if (simplified.length < 2) continue
    // 1e-4도(≈11m) 격자에 올린 뒤 앞 점과의 차이만 적는다.
    // 소수점 좌표를 그대로 쓰는 것보다 파일이 절반 이하로 줄어든다 (복원은 districts.js).
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
    lines.push(flat)
    points += simplified.length
  }

  const json = {
    _source: 'southkorea/southkorea-maps · 통계청 2018 시군구 (단순화 후 재가공)',
    _format: 'lines: 경계선 하나당 [Δlat, Δlng, …] · 1e-4도 단위 정수 누적합',
    lines,
  }
  writeFileSync(resolve(OUT_DIR, 'districtBoundaries.json'), JSON.stringify(json))
  console.log(`districtBoundaries.json — 선 ${lines.length}개 / 점 ${points}개`)
}

// ────────────────────────────── 수도권 전철 ──────────────────────────────

/**
 * 노선 코드 → 이름·색.
 * 원본 저장소의 line_no_table 값을 그대로 옮겼다 (공식 노선색과 일치).
 * 여기 없는 코드는 데이터에서 제외된다.
 */
const LINES = [
  ['1', '1호선', '#0052A4'],
  ['2', '2호선', '#00A84D'],
  ['3', '3호선', '#EF7C1C'],
  ['4', '4호선', '#00A4E3'],
  ['5', '5호선', '#996CAC'],
  ['6', '6호선', '#CD7C2F'],
  ['7', '7호선', '#747F00'],
  ['8', '8호선', '#E6186C'],
  ['9', '9호선', '#BDB092'],
  ['I', '인천1호선', '#759CCE'],
  ['I2', '인천2호선', '#F5A251'],
  ['B', '수인분당선', '#FABE00'],
  ['S', '신분당선', '#D4003B'],
  ['K', '경의중앙선', '#77C4A3'],
  ['A', '공항철도', '#0090D2'],
  ['G', '경춘선', '#178C72'],
  ['U', '의정부경전철', '#FB8100'],
  ['E', '에버라인', '#56AB2D'],
  ['KK', '경강선', '#005BAC'],
  ['W', '우이신설선', '#DBD350'],
  ['SH', '서해선', '#8FC31F'],
  ['KP', '김포골드라인', '#AD8605'],
]

/** GML의 `node [ … ]` / `edge [ … ]` 블록을 통째로 뽑아낸다 */
function gmlBlocks(text, kind) {
  const blocks = []
  const re = new RegExp(`${kind} \\[([^\\]]*)\\]`, 'g')
  let match = re.exec(text)
  while (match) {
    blocks.push(match[1])
    match = re.exec(text)
  }
  return blocks
}

const field = (block, name) => block.match(new RegExp(`\\b${name}\\s+"?([^"\\n]*)"?`))?.[1]?.trim()

/**
 * 간선 목록을 최대한 길게 이어붙여 선(path) 몇 개로 만든다.
 * 2호선처럼 순환하거나 지선이 갈라져도 남은 간선이 없을 때까지 반복하면
 * 모든 구간이 정확히 한 번씩 그려진다.
 */
function chain(edges) {
  const adjacency = new Map()
  const used = new Set()
  edges.forEach(([a, b], i) => {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a).push([b, i])
    adjacency.get(b).push([a, i])
  })

  const nextFrom = (node) => adjacency.get(node)?.find(([, i]) => !used.has(i))

  // 끝점(차수 1·홀수)부터 시작해야 선이 중간에서 잘리지 않는다
  const starts = [...adjacency.keys()].sort(
    (a, b) => (adjacency.get(a).length % 2 === 1 ? -1 : 0) - (adjacency.get(b).length % 2 === 1 ? -1 : 0),
  )

  const paths = []
  for (const start of starts) {
    let step = nextFrom(start)
    while (step) {
      const path = [start]
      let current = start
      while (step) {
        used.add(step[1])
        current = step[0]
        path.push(current)
        step = nextFrom(current)
      }
      paths.push(path)
      step = nextFrom(start)
    }
  }
  return paths
}

async function buildSubway() {
  const gml = await fetchText(METRO_URL)

  const nodes = new Map()
  for (const block of gmlBlocks(gml, 'node')) {
    const id = field(block, 'id')
    // `pos` 가 두 줄로 나온다: 첫 줄이 경도, 둘째 줄이 위도
    const pos = [...block.matchAll(/\bpos\s+(-?[\d.]+)/g)].map((m) => Number(m[1]))
    if (id === undefined || pos.length < 2) continue
    nodes.set(id, { lng: pos[0], lat: pos[1] })
  }

  const byLine = new Map()
  for (const block of gmlBlocks(gml, 'edge')) {
    const lineNo = field(block, 'line_no')
    const source = field(block, 'source')
    const target = field(block, 'target')
    if (!lineNo || !nodes.has(source) || !nodes.has(target)) continue
    if (!byLine.has(lineNo)) byLine.set(lineNo, [])
    byLine.get(lineNo).push([source, target])
  }

  const lines = []
  let segments = 0
  for (const [no, name, color] of LINES) {
    const edges = byLine.get(no)
    if (!edges || edges.length === 0) {
      console.warn(`  ⚠️ ${name}(${no}) 간선 없음 — 건너뜀`)
      continue
    }
    const paths = chain(edges).map((path) => {
      const flat = []
      for (const id of path) {
        const { lat, lng } = nodes.get(id)
        flat.push(round(lat, 5), round(lng, 5))
      }
      return flat
    })
    segments += edges.length
    lines.push({ name, color, paths })
  }

  const json = {
    _source: 'stripe2933/SeoulMetropolitanSubway · 역 좌표 + 인접역 그래프 (재가공)',
    _format: 'paths: 이어진 구간 하나당 [lat, lng, lat, lng, …]',
    lines,
  }
  writeFileSync(resolve(OUT_DIR, 'subwayLines.json'), JSON.stringify(json))
  console.log(`subwayLines.json — 노선 ${lines.length}개 / 역간 구간 ${segments}개`)
}

await buildDistricts()
await buildSubway()
