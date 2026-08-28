// 지역(동네) 검색 Edge Function.
//
// POST { query: string, regions: [{ no, label, area, cards: [{ title, categories, places, memo }] }] }
//  → { results: [{ no, score, reason }] }
//
// "비 오는 날 조용히 걷기 좋은 데" 처럼 **추상적인 문장**을 받아, 사용자가 이미 저장해 둔
// 카드들로 설명되는 동네 후보 중에서 어울리는 곳을 골라 관련도(0~100)와 이유를 붙인다.
// 새 장소를 추천하지는 않는다 — 후보는 **보드에 있는 동네가 전부**다.
//
// 동네 후보와 카드 요약은 프론트가 만들어 보낸다 (src/utils/regions.js).
// 사진 URL·링크처럼 판단에 필요 없는 값은 보내지 않는다.
// 번호(no)로 짝을 맞추는 이유는 analyze-time 과 같다 — 긴 uuid는 AI가 흘리기 쉽다.
//
// Anthropic API 키는 Supabase 시크릿(ANTHROPIC_API_KEY)으로만 보관한다 —
// 프론트엔드/저장소에는 절대 넣지 않는다. 배포 방법은 SUPABASE_SETUP.md 참고.
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** 한 번에 판단할 최대 동네 수 (프롬프트가 너무 길어지지 않는 선) */
const MAX_REGIONS = 40
/** 동네 하나를 설명할 때 보여줄 최대 카드 수 — 많아도 분위기는 이 정도면 드러난다 */
const MAX_CARDS_PER_REGION = 8
/** 카드 한 장에서 보여줄 최대 장소 수 */
const MAX_PLACES = 4
/** 돌려줄 최대 동네 수 */
const MAX_RESULTS = 8

function textOf(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function listOf(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, limit) : []
}

/** Claude 응답에서 JSON 본문만 뽑아 파싱한다 (```json 펜스 허용). */
function parseResultJson(text: string) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON in response')
  return JSON.parse(stripped.slice(start, end + 1))
}

interface CardInput {
  title?: unknown
  categories?: unknown
  memo?: unknown
  places?: unknown
  address?: unknown
}

interface RegionInput {
  label?: unknown
  area?: unknown
  cards?: unknown
}

/** 동네 하나를 AI에게 보여줄 몇 줄로 압축한다 (토큰을 아끼려고 빈 항목은 뺀다). */
function describeRegion(region: RegionInput, no: number) {
  const label = textOf(region.label, 30) || '(이름 없음)'
  const area = textOf(region.area, 40)
  const cards = Array.isArray(region.cards) ? region.cards.slice(0, MAX_CARDS_PER_REGION) : []
  const lines = [`[${no}] ${label}${area && area !== label ? ` (${area})` : ''} · 카드 ${cards.length}개`]

  for (const entry of cards) {
    const card = entry as CardInput
    const title = textOf(card.title, 80)
    const categories = listOf(card.categories, 5)
    const places = listOf(card.places, MAX_PLACES)
    const memo = textOf(card.memo, 120)
    // 주소를 같이 보여준다 — '충무로'처럼 사람들이 부르는 이름이 도로명에만 남아 있는
    // 동네가 있어서, 지명으로 검색했을 때 이 문자열이 유일한 단서인 경우가 많다
    const address = textOf(card.address, 60)
    const detail = [
      categories.length > 0 ? `태그: ${categories.join(',')}` : '',
      places.length > 0 ? `장소: ${places.join(', ')}` : '',
      address ? `주소: ${address}` : '',
      memo,
    ]
      .filter(Boolean)
      .join(' · ')
    lines.push(`    - ${title || '(제목 없음)'}${detail ? ` — ${detail}` : ''}`)
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `당신은 커플의 데이트 보드에서 "어느 동네에 갈지" 골라 주는 도우미입니다.
사용자의 검색어와 동네 목록을 보고, 검색어에 어울리는 동네를 골라 아래 JSON만 출력하세요.
다른 텍스트는 절대 쓰지 마세요.

{ "results": [{ "no": 1, "score": 87, "reason": "..." }] }

규칙:
- 동네 목록은 사용자가 **이미 저장해 둔 카드**로 설명됩니다. 목록에 없는 동네를 새로 만들거나
  일반 상식으로 다른 지역을 추천하지 마세요. 반드시 주어진 번호 중에서만 고릅니다.
- score: 검색어와 얼마나 맞는지 0~100. 아래를 종합해서 매기세요.
  · **지명으로 검색한 경우**(충무로, 성수, 홍대, 을지로, 서울숲, 강남역 …) — 가장 흔한
    검색입니다. 아래 순서로 점수를 주세요.
      90~100 그 지명 자체인 동네. 동네 이름·주소에 그 말이 그대로 들어 있는 곳
             ('충무로' → 주소가 "중구 충무로 52"인 카드가 있는 동네)
      60~85  같은 구 안이거나 걸어서·한두 정거장으로 갈 만한 이웃 동네
             (충무로 → 을지로·명동·필동·종로 / 성수 → 왕십리·서울숲·건대)
      40~55  같은 생활권이라고 볼 만한 정도
    ★ 행정동 이름과 부르는 이름이 다른 곳이 많습니다. 충무로·을지로·종로·홍대·서울숲은
      역·거리 이름이고, 실제 주소는 다른 동으로 적혀 있을 수 있어요. 주소 문자열까지
      보고 판단하세요.
  · 검색어가 분위기·활동이면(조용한 산책, 비 오는 날, 술 한잔, 야경) 그 동네 카드들의
    제목·태그·장소·메모가 그 분위기와 맞는지를 봅니다.
  · 카드가 많다고 무조건 높이지 마세요. 한 장이라도 딱 맞으면 높은 점수가 맞습니다.
- 40점 미만인 동네는 결과에서 빼세요. 맞는 동네가 하나도 없으면 results 는 빈 배열([])입니다.
  억지로 채우지 마세요.
- 최대 ${MAX_RESULTS}곳까지, score 높은 순으로 돌려주세요.
- reason: 왜 그 동네인지 25자 이내 한국어 한 구절. 그 동네 카드에 **실제로 있는 근거**를 쓰세요.
  ("조용한 카페 3곳", "야장·포차가 몰려 있음"). 지명 검색이면 거리 관계를 씁니다
  ("충무로 바로 옆", "한 정거장 거리"). 없는 장소를 지어내지 마세요.
- no: 입력에 붙은 동네 번호를 그대로 옮겨 적으세요.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  // 실패 사유는 화면에 그대로 보여주므로 한국어로 담아 200으로 돌려준다
  // (프론트는 실패하면 이름·태그 매칭으로 스스로 찾는다 — src/utils/regionSearch.js)
  if (!apiKey) {
    return json(200, { results: [], failed: true, detail: 'ANTHROPIC_API_KEY 시크릿이 설정되지 않았어요' })
  }

  let body: { query?: unknown; regions?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const query = textOf(body.query, 200)
  if (!query) return json(400, { error: 'query is required' })

  const regions = Array.isArray(body.regions) ? body.regions.slice(0, MAX_REGIONS) : []
  if (regions.length === 0) return json(200, { results: [] })

  const client = new Anthropic({ apiKey })
  let responseText: string | null = null
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      // 최대 8곳 × (번호·점수·이유) — 넉넉히 잡아도 이 정도면 남는다
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `검색어: ${query}\n\n동네 목록:\n${regions
            .map((region, i) => describeRegion(region as RegionInput, i + 1))
            .join('\n\n')}`,
        },
      ],
    })
    responseText = message.content.find((b) => b.type === 'text')?.text ?? null
  } catch (err) {
    console.error('anthropic error:', err)
    return json(200, { results: [], failed: true, detail: 'AI 검색에 실패했어요 (Anthropic 호출 오류)' })
  }
  if (!responseText) {
    return json(200, { results: [], failed: true, detail: 'AI가 빈 응답을 돌려줬어요' })
  }

  let parsed: { results?: unknown }
  try {
    parsed = parseResultJson(responseText)
  } catch {
    return json(200, { results: [], failed: true, detail: 'AI 응답이 JSON 형식이 아니에요' })
  }

  const rows = Array.isArray(parsed.results) ? parsed.results : []
  const results = []
  const seen = new Set<number>()
  for (const row of rows) {
    const item = row as { no?: unknown; score?: unknown; reason?: unknown }
    const no = Number(item.no)
    // 범위를 벗어나거나 같은 번호를 두 번 준 경우는 짝을 맞출 수 없어 버린다
    if (!Number.isInteger(no) || no < 1 || no > regions.length || seen.has(no)) continue
    const score = Number(item.score)
    if (!Number.isFinite(score)) continue
    seen.add(no)
    results.push({
      no,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reason: textOf(item.reason, 40),
    })
  }

  results.sort((a, b) => b.score - a.score)
  return json(200, { results: results.slice(0, MAX_RESULTS) })
})
