import { useState } from 'react'
import { extractSnsUrl } from '../utils/linkAnalyzer.js'

/**
 * 다른 앱에서 '공유'로 넘어온 링크를 한 번 집어낸다.
 *
 * 안드로이드와 아이폰이 링크를 보내는 방식은 다르지만, 결국 둘 다 우리 사이트를
 * `?url=…` / `?text=…` 형태로 열어주게 만들 수 있어서 **받는 쪽은 이 하나면 된다.**
 *
 *   안드로이드 — 홈 화면에 추가하면 manifest의 share_target 덕에 공유 시트에 뜬다
 *   아이폰     — 애플이 share_target을 지원하지 않아 '단축어'로 같은 주소를 연다
 *   (주소창에 직접 쳐 넣어도 똑같이 동작한다 — 디버깅할 때 편하다)
 *
 * ⚠️ 인스타는 링크를 `url`이 아니라 `text`에 문장째로 담아 보내는 경우가 많다
 * ("이거 봐 https://…"). 그래서 세 칸을 다 훑어서 링크를 찾는다.
 */

const SHARE_PARAMS = ['url', 'text', 'title']

/**
 * 주소에서 공유 파라미터를 지운다.
 * 안 지우면 새로고침하거나 뒤로 갔다 올 때마다 같은 카드를 또 만든다.
 */
function clearShareParams() {
  const url = new URL(window.location.href)
  let touched = false
  for (const name of SHARE_PARAMS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name)
      touched = true
    }
  }
  if (!touched) return
  const query = url.searchParams.toString()
  window.history.replaceState({}, '', `${url.pathname}${query ? `?${query}` : ''}`)
}

/**
 * 처음 뜰 때 딱 한 번 읽는다 (useState 초기화 함수 = 렌더 전에 실행).
 * 공유는 **새 탭·새 진입**으로 오기 때문에 이후를 계속 감시할 필요가 없다.
 */
export function useSharedLink() {
  const [sharedUrl] = useState(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const found = SHARE_PARAMS.map((name) => extractSnsUrl(params.get(name) ?? '')).find(Boolean)
    clearShareParams()
    return found ?? null
  })

  return sharedUrl
}
