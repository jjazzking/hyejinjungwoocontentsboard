import { useCallback, useEffect, useRef, useState } from 'react'
import { extractSnsUrl, detectPlatform } from '../utils/linkAnalyzer.js'

/**
 * 클립보드에 아직 보드에 없는 인스타/유튜브/틱톡 링크가 있으면 제안(suggestion)을 띄운다.
 *
 * ⚠️ 자동 확인은 '클립보드 읽기'가 이미 허용된 브라우저에서만 한다.
 *   허용 전에 navigator.clipboard.readText()를 부르면 브라우저가 커서 옆에
 *   네이티브 '붙여넣기' 확인 팝업을 띄우는데, 포커스가 돌아올 때마다 읽으면
 *   화면을 누를 때마다 그 팝업이 떠서 앱을 쓸 수 없게 된다.
 *   → 권한이 granted일 때만 자동으로 읽고, 그 외에는 사용자가 직접
 *     checkClipboard()를 눌렀을 때만 읽는다 (이때 팝업이 뜨는 건 의도된 동작).
 *
 * - 권한 API가 없는 브라우저(사파리·파이어폭스)는 자동 확인을 하지 않는다.
 * - 같은 링크는 세션당 한 번만 제안한다 (무시했거나 이미 카드로 만든 링크 포함).
 *   단, 사용자가 직접 확인을 누른 경우에는 다시 제안한다.
 */
export function useClipboardSuggestion(contents) {
  const [suggestion, setSuggestion] = useState(null) // null | { url, platform }
  const [notice, setNotice] = useState(null) // 직접 확인했을 때의 결과 안내 문구
  const handledRef = useRef(new Set())
  const noticeTimerRef = useRef(null)
  const contentsRef = useRef(contents)
  contentsRef.current = contents

  // 잠깐 떴다 사라지는 안내 문구
  const showNotice = useCallback((text) => {
    clearTimeout(noticeTimerRef.current)
    setNotice(text)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(() => () => clearTimeout(noticeTimerRef.current), [])

  /** 클립보드 텍스트를 제안으로 반영한다. 결과 코드를 돌려준다. */
  const applyText = useCallback((text, { force = false } = {}) => {
    const url = extractSnsUrl(text)
    if (!url) return 'NO_LINK'
    if (contentsRef.current.some((c) => c.reference_url === url)) {
      handledRef.current.add(url)
      return 'ALREADY_ADDED'
    }
    if (!force && handledRef.current.has(url)) return 'SKIPPED'
    setSuggestion({ url, platform: detectPlatform(url) })
    return 'FOUND'
  }, [])

  // 자동 확인 — 권한이 이미 허용된 경우에만
  useEffect(() => {
    if (!navigator.clipboard?.readText) return undefined

    let cancelled = false

    const isGranted = async () => {
      try {
        const status = await navigator.permissions.query({ name: 'clipboard-read' })
        return status.state === 'granted'
      } catch {
        return false // 권한 API 미지원 · 미허용 → 자동으로 읽지 않는다
      }
    }

    const check = async () => {
      if (document.visibilityState !== 'visible') return
      if (!(await isGranted())) return
      let text
      try {
        text = await navigator.clipboard.readText()
      } catch {
        return // 권한 거부 등 — 기능 없이 동작
      }
      if (cancelled) return
      applyText(text)
    }

    window.addEventListener('focus', check)
    check()
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [applyText])

  /** 사용자가 버튼으로 직접 클립보드를 확인할 때 (여기서만 붙여넣기 팝업이 뜬다). */
  const checkClipboard = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      showNotice('이 브라우저에서는 클립보드를 읽을 수 없어요. 추가 폼에 링크를 직접 붙여넣어 주세요.')
      return
    }
    let text
    try {
      text = await navigator.clipboard.readText()
    } catch {
      showNotice('클립보드를 읽지 못했어요. 추가 폼에 링크를 직접 붙여넣어 주세요.')
      return
    }
    const result = applyText(text, { force: true })
    if (result === 'FOUND') {
      setNotice(null)
      clearTimeout(noticeTimerRef.current)
    } else if (result === 'ALREADY_ADDED') {
      showNotice('이미 보드에 있는 링크예요.')
    } else {
      showNotice('복사해 둔 인스타/유튜브/틱톡 링크를 찾지 못했어요.')
    }
  }, [applyText, showNotice])

  /** 제안을 닫고 같은 링크를 다시 제안하지 않도록 기록한다. */
  const resolveSuggestion = () => {
    setSuggestion((prev) => {
      if (prev) handledRef.current.add(prev.url)
      return null
    })
  }

  return { suggestion, resolveSuggestion, checkClipboard, notice }
}
