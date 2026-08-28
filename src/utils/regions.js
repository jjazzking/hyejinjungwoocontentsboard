/**
 * 카드의 장소 주소 → '동네' 묶기.
 *
 * 지역 검색(RegionSearch)이 "어느 동네를 추천할지" 고를 때 쓰는 후보 목록을 만든다.
 * 새 컬럼도, 외부 API도 쓰지 않는다 — 이미 저장된 `places[].address` 문자열만 판다.
 *
 * ★ 동 우선, 구까지 폴백.
 *   저장된 주소는 대부분 **도로명주소**라서 동 이름이 아예 없다
 *   ("서울 성동구 아차산로17길 49"). 그래서 이렇게 정한다.
 *     1. 주소에 지번(동/읍/면/리)이 있으면 그 동네가 한 묶음
 *     2. 없으면 카드의 제목·메모에 적힌 '○○동'을 딱 하나일 때만 빌려 쓴다
 *        (인스타 카드 제목은 대개 "성수동 조용한 카페"처럼 동네가 박혀 있다)
 *     3. 그래도 없으면 **구·시·군 단위**로 묶는다
 *   그래서 결과 목록에는 '성수동'과 '광진구'가 나란히 나올 수 있다. 의도한 것이다.
 *
 * 한 카드에 여러 동네의 장소가 있으면 그 카드는 여러 동네에 같이 들어간다
 * (데이트 코스 게시물 한 장이 성수동 카페 + 왕십리 술집인 경우).
 */

/** '서울특별시' → '서울' 처럼 화면에서 읽기 쉬운 짧은 이름으로 */
const SIDO_SHORT = [
  ['서울특별시', '서울'],
  ['부산광역시', '부산'],
  ['대구광역시', '대구'],
  ['인천광역시', '인천'],
  ['광주광역시', '광주'],
  ['대전광역시', '대전'],
  ['울산광역시', '울산'],
  ['세종특별자치시', '세종'],
  ['경기도', '경기'],
  ['강원특별자치도', '강원'],
  ['강원도', '강원'],
  ['충청북도', '충북'],
  ['충청남도', '충남'],
  ['전북특별자치도', '전북'],
  ['전라북도', '전북'],
  ['전라남도', '전남'],
  ['경상북도', '경북'],
  ['경상남도', '경남'],
  ['제주특별자치도', '제주'],
  ['제주도', '제주'],
]

const SIDO_NAMES = new Set(SIDO_SHORT.flat())

function shortSido(token) {
  for (const [full, short] of SIDO_SHORT) if (token === full || token === short) return short
  return token
}

/**
 * 시/군/구 토큰인지 ('고양시', '일산동구', '양평군', '중구').
 * ★ '중구'·'동구'·'서구'처럼 **두 글자짜리 구**가 아주 많다 — 이름 부분을 한 글자
 *   이상으로 받아야 한다 (두 글자 이상으로 잡으면 서울 중구가 통째로 안 잡힌다).
 */
const isSigungu = (token) => /^[가-힣]{1,5}(시|군|구)$/.test(token) && !SIDO_NAMES.has(token)

/**
 * 지번 동네 토큰을 표준형으로. 없으면 null.
 *   '성수동2가' → '성수동' / '역삼1동' → '역삼동' / '안덕면' → '안덕면'
 *   '충무로2가' → '충무로' / '을지로3가' → '을지로' / '종로1가' → '종로'
 *   '신반포로11길'(도로명 + 건물번호) 은 동네가 아니므로 null
 *
 * ★ 'N가'로 끝나는 법정동(충무로2가·을지로3가·종로1가)의 앞부분은 사람들이 실제로
 *   부르는 동네 이름 그 자체다 — "충무로에서 보자". 검색어와 바로 맞으므로
 *   숫자와 '가'를 떼어 낸 형태로 묶는다.
 */
function normalizeDong(token) {
  const dong = token.match(/^([가-힣]{1,6}?)\d*동(\d+가)?$/)
  if (dong) return `${dong[1]}동`
  const ga = token.match(/^([가-힣]{2,6})\d+가$/)
  if (ga) return ga[1]
  const other = token.match(/^([가-힣]{1,6}(읍|면|리))$/)
  return other ? other[1] : null
}

/**
 * 주소 문자열 → { sido, sigungu, dong }.
 * 판독에 실패한 자리는 빈 문자열이다 (해외 주소·빈 값이면 전부 빈 문자열).
 */
export function parseAddressRegion(address) {
  const empty = { sido: '', sigungu: '', dong: '' }
  if (typeof address !== 'string' || !address.trim()) return empty

  const tokens = address.trim().split(/\s+/)
  let index = 0
  let sido = ''
  if (SIDO_NAMES.has(tokens[0])) {
    sido = shortSido(tokens[0])
    index = 1
  }

  // '고양시 일산동구'처럼 시 + 구가 이어지면 둘을 한 덩어리로 본다
  const parts = []
  while (index < tokens.length && parts.length < 2 && isSigungu(tokens[index])) {
    parts.push(tokens[index])
    index += 1
  }
  const sigungu = parts.join(' ')

  let dong = ''
  for (const token of tokens.slice(index)) {
    const normalized = normalizeDong(token)
    if (normalized) {
      dong = normalized
      break
    }
  }
  return { sido, sigungu, dong }
}

/**
 * 카드 글(제목·메모)에서 동네 이름을 빌려 온다 — 딱 하나만 나올 때만.
 * 캡션 원문은 쓰지 않는다: 길고 다른 동네가 여럿 섞여 있어 엉뚱한 곳에 묶인다.
 * 여러 개가 나오면 어느 장소의 동네인지 알 수 없으므로 포기하고 구 단위로 간다.
 */
function guessDongFromCard(content) {
  const text = `${content.title ?? ''} ${content.memo ?? ''}`
  const found = new Set()
  for (const match of text.matchAll(/[가-힣]{1,5}\d*동(?![가-힣])/g)) {
    const normalized = normalizeDong(match[0])
    if (normalized) found.add(normalized)
  }
  return found.size === 1 ? [...found][0] : ''
}

const isCoord = (value) => typeof value === 'number' && Number.isFinite(value)

/** 주소 토큰에서 도로명만 뽑는다. '아차산로17길' → '아차산로', '충무로' → '충무로' */
function roadOf(token) {
  const branch = token.match(/^([가-힣]{2,10}로)\d*번?길$/)
  if (branch) return branch[1]
  return /^[가-힣]{2,10}(대로|로|길)$/.test(token) ? token : null
}

/**
 * 동을 못 뽑아 구·시·군으로 묶인 동네에 붙일 힌트 — 장소 절반 이상이 같은 도로면 그 도로 이름.
 * '충무로'처럼 **사람들이 부르는 이름이 도로명에만 남아 있는** 곳 때문이다.
 * 결과에 '중구'라고만 뜨면 충무로를 찾은 사람은 자기가 찾던 곳인지 알 수가 없다.
 */
function dominantRoad(places) {
  const counts = new Map()
  for (const place of places) {
    const tokens = typeof place?.address === 'string' ? place.address.trim().split(/\s+/) : []
    for (const token of tokens) {
      const road = roadOf(token)
      if (road) {
        counts.set(road, (counts.get(road) ?? 0) + 1)
        break
      }
    }
  }
  let top = null
  for (const [road, count] of counts) if (!top || count > top.count) top = { road, count }
  return top && top.count * 2 >= places.length ? top.road : ''
}

/** 같은 동네인지 구분하는 키 — 이름이 같아도 구가 다르면 다른 동네다 */
function regionKey({ sido, sigungu, dong }) {
  return `${sido}|${sigungu}|${dong}`
}

/**
 * 카드 한 장이 속한 동네들.
 * → [{ key, sido, sigungu, dong, label, fullLabel, places }]
 * 주소를 못 읽은 장소, 장소가 아예 없는 카드는 빈 배열이다 (동네를 정할 수 없다).
 */
export function contentRegions(content) {
  const places = Array.isArray(content?.places) ? content.places : []
  if (places.length === 0) return []

  // 주소에 동이 없을 때만 쓰는 폴백이라 카드당 한 번만 계산한다
  let guessed = null
  const byKey = new Map()

  for (const place of places) {
    const parsed = parseAddressRegion(place?.address)
    if (!parsed.sigungu && !parsed.dong) continue
    if (!parsed.dong) {
      guessed ??= guessDongFromCard(content)
      parsed.dong = guessed
    }
    const key = regionKey(parsed)
    const region = byKey.get(key) ?? {
      key,
      ...parsed,
      // 화면에 크게 쓰는 이름은 동네 이름, 없으면 구·시·군
      label: parsed.dong || parsed.sigungu,
      fullLabel: [parsed.sido, parsed.sigungu, parsed.dong].filter(Boolean).join(' '),
      places: [],
    }
    region.places.push(place)
    byKey.set(key, region)
  }
  return [...byKey.values()]
}

/** 이 카드가 속한 동네 키 집합 (필터에서 카드를 거를 때 쓴다) */
export function contentRegionKeys(content) {
  return new Set(contentRegions(content).map((region) => region.key))
}

/**
 * 카드 목록 → 동네 목록 (카드가 많은 동네 순).
 * → [{ key, label, hint, fullLabel, sido, sigungu, dong, contents, places, lat, lng }]
 * hint 는 구 단위로 묶인 동네에만 붙는 대표 도로명이다 ('중구' → '충무로').
 * lat/lng 는 좌표가 있는 장소들의 평균 — 결과를 정렬할 때 '가까운 동네' 판단에 쓴다.
 */
export function buildRegions(contents) {
  const byKey = new Map()

  for (const content of contents ?? []) {
    for (const region of contentRegions(content)) {
      const entry = byKey.get(region.key) ?? {
        key: region.key,
        sido: region.sido,
        sigungu: region.sigungu,
        dong: region.dong,
        label: region.label,
        fullLabel: region.fullLabel,
        contents: [],
        places: [],
      }
      entry.contents.push(content)
      entry.places.push(...region.places)
      byKey.set(region.key, entry)
    }
  }

  const regions = [...byKey.values()].map((entry) => {
    // 동네 이름이 이미 있으면 힌트가 필요 없다 ('성수동'에 도로명을 덧붙일 이유가 없다)
    const hint = entry.dong ? '' : dominantRoad(entry.places)
    const coords = entry.places.filter((p) => isCoord(p.lat) && isCoord(p.lng))
    const center = coords.length
      ? {
          lat: coords.reduce((sum, p) => sum + p.lat, 0) / coords.length,
          lng: coords.reduce((sum, p) => sum + p.lng, 0) / coords.length,
        }
      : { lat: null, lng: null }
    return { ...entry, hint, ...center }
  })

  return regions.sort(
    (a, b) => b.contents.length - a.contents.length || a.fullLabel.localeCompare(b.fullLabel),
  )
}

/** 두 동네 중심 사이의 대략적인 거리(km). 좌표가 없으면 null */
export function regionDistanceKm(a, b) {
  if (!a || !b || !isCoord(a.lat) || !isCoord(b.lat) || !isCoord(a.lng) || !isCoord(b.lng)) {
    return null
  }
  // 한국 위도대에서 위도 1도 ≈ 111km, 경도 1도 ≈ 88km. 순서만 매기면 되므로 이 정도면 충분하다
  const dy = (a.lat - b.lat) * 111
  const dx = (a.lng - b.lng) * 88
  return Math.sqrt(dx * dx + dy * dy)
}
