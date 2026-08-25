// 시간대 일괄 분석 Edge Function.
//
// POST { cards: [{ title, memo, categories, places: [{ name, category }] }] }
//  → { results: [{ no, time_slots, time_reason }] }
//
// 이미 만들어 둔 카드들의 '가기 좋은 시간대'를 뒤늦게 채우기 위한 함수다.
// analyze-link 와 달리 원본 캡션이 남아 있지 않으므로 제목·메모·태그와
// 네이버 지역 검색이 붙여 준 장소 분류(예: "음식점>카페")를 근거로 판단한다.
//
// 카드를 한 장씩 부르면 호출 수가 카드 수만큼 늘어나므로 한 번에 묶어서 보낸다.
// (프론트가 20장씩 끊어 보내고 진행률을 보여준다 — src/utils/analyzeTimeSlots.js)
// 응답은 uuid 대신 1부터 매긴 번호로 짝을 맞춘다. 긴 uuid는 AI가 흘리기 쉽다.
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

/** 한 번의 호출에서 받아줄 최대 카드 수 (응답이 잘리지 않는 선) */
const MAX_CARDS = 25

/**
 * 가기 좋은 시간대 화이트리스트.
 * AI가 다른 문자열을 만들어내면 버리고 항상 시간 순서로 정렬해서 돌려준다.
 * (프론트의 src/utils/timeSlots.js, analyze-link 와 같은 목록을 유지할 것)
 */
const TIME_SLOT_KEYS = ['MORNING', 'LUNCH', 'AFTERNOON', 'EVENING', 'NIGHT']

function sanitizeTimeSlots(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const picked = new Set(value.filter((v): v is string => typeof v === 'string'))
  return TIME_SLOT_KEYS.filter((key) => picked.has(key))
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
  memo?: unknown
  categories?: unknown
  places?: unknown
}

function textOf(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

/** 카드 한 장을 AI에게 보여줄 몇 줄로 압축한다 (토큰을 아끼려고 빈 항목은 뺀다). */
function describeCard(card: CardInput, no: number) {
  const lines = [`[${no}] 제목: ${textOf(card.title, 100) || '(없음)'}`]

  const categories = Array.isArray(card.categories)
    ? card.categories.filter((c): c is string => typeof c === 'string')
    : []
  if (categories.length > 0) lines.push(`    태그: ${categories.join(', ')}`)

  const places = Array.isArray(card.places) ? card.places : []
  for (const place of places.slice(0, 3)) {
    const p = place as { name?: unknown; category?: unknown }
    const name = textOf(p.name, 60)
    if (!name) continue
    const category = textOf(p.category, 60)
    // 네이버 지역 검색이 붙여 준 분류라서 업종 판단의 가장 강한 근거다
    lines.push(`    장소: ${name}${category ? ` (분류: ${category})` : ''}`)
  }

  const memo = textOf(card.memo, 400)
  if (memo) lines.push(`    메모: ${memo}`)

  return lines.join('\n')
}

const SYSTEM_PROMPT = `당신은 커플의 데이트·컨텐츠 아이디어 보드를 정리하는 도우미입니다.
카드 목록을 보고 각 카드가 "가기 좋은 시간대"를 판단해서 아래 JSON만 출력하세요.
다른 텍스트는 절대 쓰지 마세요.

{
  "results": [
    { "no": 1, "time_slots": ["..."], "time_reason": "..." }
  ]
}

규칙:
- 입력에 주어진 카드를 하나도 빠짐없이, 같은 개수로 돌려주세요.
- time_slots: 그 카드의 장소·활동을 즐기기 좋은 시간대를 아래 5개 중에서 고르세요.
  ★ 가능한 시간대를 전부 넣으세요. 하나만 고르려 하지 마세요.
    MORNING    아침(~11시)     등산, 해돋이, 조식, 오픈런
    LUNCH      점심(11~15시)   식사, 브런치, 낮술
    AFTERNOON  오후(15~18시)   카페, 디저트, 전시, 쇼핑, 산책
    EVENING    저녁(18~21시)   저녁 식사, 야경, 공연
    NIGHT      야간(21시~)     술집, 바, 포차, 야장, 심야식당

  아래 순서로 판단하고, 위쪽에 근거가 있으면 아래는 무시하세요.
  1순위 — 영업시간·운영시간이 적혀 있으면 그대로 따릅니다.
    "11:00-15:00" → LUNCH  /  "18시 오픈" → EVENING, NIGHT  /  "새벽 2시까지" → NIGHT
  2순위 — 아래 키워드가 있으면 업종 기본값을 덮어씁니다.
    낮술·해장             → LUNCH 를 반드시 포함
    브런치                → MORNING, LUNCH
    야장·루프탑·야경·심야  → NIGHT 를 반드시 포함
    오픈런·웨이팅         → 문 여는 시간대 하나만 (범위를 좁힙니다)
    디너코스·오마카세      → EVENING
    조식·일출·해돋이       → MORNING
  3순위 — 위 근거가 없을 때만 업종 기본값을 씁니다.
    카페·디저트·베이커리           → AFTERNOON
    전시·미술관·공방·팝업·쇼핑      → AFTERNOON
    술을 파는 곳(바·이자카야·포차)  → EVENING, NIGHT
    일반 식사 메뉴를 파는 식당      → LUNCH, EVENING
    공원·산책로·전망대·드라이브     → AFTERNOON, EVENING
    체험·액티비티·스포츠           → AFTERNOON
  ※ '노포'는 업종이 아니라 오래된 가게라는 뜻입니다. 술을 파는 곳이면 EVENING·NIGHT,
     국밥·해장국처럼 식사 위주면 LUNCH·EVENING 으로 판단하세요.

  ★ 판단할 근거가 전혀 없거나, 특정 장소가 없는 컨텐츠(집에서 요리, 온라인)면
    빈 배열이 아니라 ["LUNCH","AFTERNOON","EVENING"] 을 쓰세요.
    빈 배열은 "어느 시간에도 맞지 않는다"는 뜻이라 나중에 코스를 짤 때 제외됩니다.
  ★ 위 5개 문자열 외에는 절대 쓰지 마세요.
- time_reason: time_slots 를 그렇게 고른 근거를 15자 이내로 쓰세요.
  ("22시까지 영업", "야장 언급", "기본값: 카페"). 사람이 AI 판단을 검증하는 용도입니다.
- no: 입력에 붙은 카드 번호를 그대로 옮겨 적으세요. 순서를 바꾸거나 빼먹지 마세요.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  // 실패 사유는 화면에 그대로 보여주므로 한국어로 담아 200으로 돌려준다
  if (!apiKey) {
    return json(200, { results: [], failed: true, detail: 'ANTHROPIC_API_KEY 시크릿이 설정되지 않았어요' })
  }

  let body: { cards?: CardInput[] }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const cards = Array.isArray(body.cards) ? body.cards.slice(0, MAX_CARDS) : []
  if (cards.length === 0) return json(200, { results: [] })

  const client = new Anthropic({ apiKey })
  let responseText: string | null = null
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      // 카드 한 장당 50토큰 남짓 — 25장이어도 넉넉하게
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: cards.map((card, i) => describeCard(card, i + 1)).join('\n\n'),
        },
      ],
    })
    responseText = message.content.find((b) => b.type === 'text')?.text ?? null
  } catch (err) {
    console.error('anthropic error:', err)
    return json(200, { results: [], failed: true, detail: 'AI 분석에 실패했어요 (Anthropic 호출 오류)' })
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
    const item = row as { no?: unknown; time_slots?: unknown; time_reason?: unknown }
    const no = Number(item.no)
    // 범위를 벗어나거나 같은 번호를 두 번 준 경우는 짝을 맞출 수 없어 버린다
    if (!Number.isInteger(no) || no < 1 || no > cards.length || seen.has(no)) continue
    const timeSlots = sanitizeTimeSlots(item.time_slots)
    if (timeSlots.length === 0) continue
    seen.add(no)
    results.push({ no, time_slots: timeSlots, time_reason: textOf(item.time_reason, 40) })
  }

  return json(200, {
    results,
    // 몇 장이 짝을 못 찾았는지 프론트가 알 수 있게 (전부 실패면 화면에 사유를 띄운다)
    ...(results.length < cards.length
      ? { failed: true, detail: `${cards.length}장 중 ${results.length}장만 분석됐어요` }
      : {}),
  })
})
