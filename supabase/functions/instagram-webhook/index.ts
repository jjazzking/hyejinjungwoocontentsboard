// 인스타그램 DM 웹훅 — **검증용 탐침(probe)**
//
// 목적은 딱 하나다: 릴스를 DM으로 보냈을 때 Meta가 주는 payload에
// **원본 게시물 주소(permalink)가 들어 있는지** 확인하는 것.
// 그게 없으면 "DM으로 보내면 카드가 생긴다" 구상은 여기서 끝난다.
//
// 그래서 지금은 카드를 만들지 않는다. 받은 걸 로그로 남기기만 한다.
// 확인이 끝나면 이 파일에 카드 생성 로직을 얹는다 (docs/INSTAGRAM_DM.md 참고).
//
// 두 가지 요청을 받는다:
//   GET  — Meta가 웹훅을 등록할 때 하는 확인 절차 (hub.challenge 되돌려주기)
//   POST — 실제 이벤트. 서명을 확인하고 payload를 통째로 로그에 남긴다
//
// 필요한 시크릿 (Supabase → Edge Functions → Secrets):
//   META_VERIFY_TOKEN : 웹훅 등록 화면에 적을 아무 문자열 (양쪽이 같기만 하면 된다)
//   META_APP_SECRET   : Meta 앱 설정의 앱 시크릿 — 서명 검증용
//
// ⚠️ 이 함수는 **JWT 검증을 꺼야** 한다. Meta는 Supabase anon 키를 붙여주지 않으므로
//    켜둔 채로는 요청이 함수에 닿기도 전에 401로 막힌다 (SUPABASE_SETUP.md 9번 참고).
//    그래서 이 엔드포인트는 사실상 공개다 — META_APP_SECRET 서명 검증이 유일한 자물쇠다.

/** 로그에 한 번에 남길 payload 길이 상한 (너무 길면 잘려서 오히려 안 보인다) */
const MAX_LOG_CHARS = 12000

/** 인스타 게시물 주소로 보이는지 — /p/, /reel/, /reels/, /tv/ 어느 형태든 잡는다 */
const PERMALINK_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+/i

/** 문자열 안의 http(s) 링크 전부 */
const URL_RE = /https?:\/\/[^\s"'<>\\]+/g

/**
 * payload 어디에 링크가 숨어 있을지 모르니 객체를 통째로 훑는다.
 * 키 이름에 기대지 않는 게 핵심 — 지금 우리는 구조를 모르는 상태다.
 */
function collectUrls(value: unknown, found: Set<string>, depth = 0) {
  if (depth > 12) return
  if (typeof value === 'string') {
    for (const match of value.match(URL_RE) ?? []) found.add(match)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, found, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUrls(item, found, depth + 1)
    }
  }
}

/** X-Hub-Signature-256 검증 — 본문을 **읽은 그대로** 넣어야 한다 (JSON 재직렬화 금지) */
async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false
  const expected = header.slice('sha256='.length).toLowerCase()

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const actual = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  // 길이가 다르면 아래 비교가 의미 없으므로 먼저 거른다
  if (actual.length !== expected.length) return false
  // 타이밍 공격을 피하려고 전체를 끝까지 비교한다
  let diff = 0
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** 첨부의 종류만 뽑아본다 — 공유(share)인지 릴스(ig_reel)인지가 payload 해석의 실마리다 */
function describeAttachments(body: unknown): string[] {
  const notes: string[] = []
  const entries = (body as { entry?: unknown[] })?.entry ?? []
  for (const entry of entries) {
    const events = (entry as { messaging?: unknown[] })?.messaging ?? []
    for (const event of events) {
      const message = (event as { message?: Record<string, unknown> })?.message
      if (!message) {
        notes.push(`(message 없는 이벤트: ${Object.keys(event as object).join(', ')})`)
        continue
      }
      const attachments = (message.attachments ?? []) as Record<string, unknown>[]
      if (attachments.length === 0) {
        notes.push(`text만 있음: ${JSON.stringify(message.text ?? null)}`)
        continue
      }
      for (const attachment of attachments) {
        const payload = (attachment.payload ?? {}) as Record<string, unknown>
        notes.push(
          `첨부 type=${attachment.type} · payload 키=[${Object.keys(payload).join(', ')}]`,
        )
      }
    }
  }
  return notes
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── 1. 웹훅 등록 확인 (Meta가 콜백 URL을 저장하기 전에 한 번 부른다)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expected = Deno.env.get('META_VERIFY_TOKEN')

    if (!expected) {
      console.error('instagram-webhook: META_VERIFY_TOKEN 시크릿이 없습니다')
      return new Response('META_VERIFY_TOKEN 시크릿을 먼저 등록하세요', { status: 500 })
    }
    if (mode === 'subscribe' && token === expected && challenge) {
      console.log('instagram-webhook: 등록 확인 통과')
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    console.error(`instagram-webhook: 등록 확인 실패 (mode=${mode}, token 일치=${token === expected})`)
    return new Response('검증 실패', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('지원하지 않는 메서드', { status: 405 })
  }

  // ── 2. 이벤트 수신
  // Meta는 200이 아니면 같은 이벤트를 계속 재전송한다. 안에서 뭐가 터지든
  // 결론은 200으로 끝내고, 문제는 로그로만 남긴다.
  try {
    const rawBody = await req.text()
    const secret = Deno.env.get('META_APP_SECRET')

    if (secret) {
      const ok = await verifySignature(rawBody, req.headers.get('x-hub-signature-256'), secret)
      if (!ok) {
        console.error('instagram-webhook: 서명 불일치 — 무시합니다')
        return new Response('ok', { status: 200 })
      }
    } else {
      console.warn(
        'instagram-webhook: ⚠️ META_APP_SECRET이 없어 서명 검증을 건너뜁니다 (검증 단계에서만 허용)',
      )
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.error(`instagram-webhook: JSON 파싱 실패 — 원문: ${rawBody.slice(0, 500)}`)
      return new Response('ok', { status: 200 })
    }

    // 여기부터가 이 함수의 존재 이유 — 받은 걸 최대한 보기 좋게 남긴다
    const pretty = JSON.stringify(body, null, 2)
    console.log(
      `instagram-webhook: 📦 payload (${pretty.length}자)\n${pretty.slice(0, MAX_LOG_CHARS)}${
        pretty.length > MAX_LOG_CHARS ? '\n…(잘림)' : ''
      }`,
    )

    for (const note of describeAttachments(body)) {
      console.log(`instagram-webhook: 🧩 ${note}`)
    }

    const urls = new Set<string>()
    collectUrls(body, urls)
    if (urls.size === 0) {
      console.log('instagram-webhook: 🔎 payload 안에 링크가 하나도 없습니다')
    } else {
      console.log(`instagram-webhook: 🔎 발견한 링크 ${urls.size}개\n${[...urls].join('\n')}`)
    }

    const permalink = [...urls].find((candidate) => PERMALINK_RE.test(candidate))
    if (permalink) {
      console.log(`instagram-webhook: ✅ 게시물 주소를 찾았습니다 → ${permalink}`)
    } else {
      console.log(
        'instagram-webhook: ❌ 게시물 주소(instagram.com/reel/… 형태)는 없습니다 — DM 방식은 여기까지',
      )
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('instagram-webhook: 처리 중 예외(무시하고 200 반환):', error)
    return new Response('ok', { status: 200 })
  }
})
