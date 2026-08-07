import { useEffect, useRef, useState } from 'react'
import { extractSnsUrl, detectPlatform } from '../utils/linkAnalyzer.js'

/**
 * 창에 포커스가 돌아올 때마다 클립보드를 확인해서
 * 아직 보드에 없는 인스타/유튜브/틱톡 링크가 있으면 제안(suggestion)을 띄운다.
 *
 * - 클립보드 읽기는 브라우저 권한이 필요하다. 거부되거나 미지원(Firefox 등)이면
 *   조용히 아무것도 하지 않는다.
 * - 같은 링크는 세션당 한 번만 제안한다 (무시했거나 이미 카드로 만든 링크 포함).
 */
export function useClipboardSuggestion(contents) {
  const [suggestion, setSuggestion] = useState(null) // null | { url, platform }
  const handledRef = useRef(new Set())
  const contentsRef = useRef(contents)
  contentsRef.current = contents

  useEffect(() => {
    if (!navigator.clipboard?.readText) return undefined

    const check = async () => {
      if (document.visibilityState !== 'visible') return
      let text
      try {
        text = await navigator.clipboard.readText()
      } catch {
        return // 권한 거부 등 — 기능 없이 동작
      }
      const url = extractSnsUrl(text)
      if (!url || handledRef.current.has(url)) return
      if (contentsRef.current.some((c) => c.reference_url === url)) {
        handledRef.current.add(url)
        return
      }
      setSuggestion({ url, platform: detectPlatform(url) })
    }

    window.addEventListener('focus', check)
    check()
    return () => window.removeEventListener('focus', check)
  }, [])

  /** 제안을 닫고 같은 링크를 다시 제안하지 않도록 기록한다. */
  const resolveSuggestion = () => {
    setSuggestion((prev) => {
      if (prev) handledRef.current.add(prev.url)
      return null
    })
  }

  return { suggestion, resolveSuggestion }
}
