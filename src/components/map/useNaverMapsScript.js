import { useEffect, useState } from 'react'

/**
 * 네이버 지도 JS API(v3) 로더.
 *
 * 키는 브라우저에 노출되는 것을 전제로 한 값이라 GitHub Actions 시크릿 →
 * 빌드 주입으로 넣는다 (검색 API의 Client Secret과는 성격이 다르다 —
 * 그쪽은 절대 프론트에 두지 않는다).
 *
 * 상태:
 *   'off'       — 키가 없음 (아직 NCP 등록 전) → Leaflet/OSM으로 그린다
 *   'loading'   — 스크립트 내려받는 중
 *   'verifying' — 로드는 됐고 인증 실패 통보를 기다리는 중
 *   'ready'     — window.naver.maps 사용 가능
 *   'failed'    — 인증 실패·네트워크 실패 → Leaflet/OSM으로 떨어진다
 *
 * 인증 실패(키 오류, 서비스 URL 미등록)는 예외로 오지 않고 네이버가 부르는
 * 전역 콜백 `navermap_authFailure`로, 그것도 **스크립트 로드가 끝난 뒤에** 온다.
 * 로드 직후 바로 'ready'로 넘기면 인증에 실패한 지도를 한 번 만들었다가 부수게 되는데,
 * 그 과정에서 네이버가 예외를 던져 화면이 하얗게 될 수 있다.
 * 그래서 로드 후 잠깐 'verifying'으로 기다렸다가 아무 소식이 없을 때만 'ready'로 간다.
 */

export const naverMapClientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? ''

export const isNaverMapConfigured = Boolean(naverMapClientId)

const SCRIPT_URL = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
  naverMapClientId,
)}`

// 스크립트가 응답이 없을 때 지도 자리가 영영 비어 있지 않게 시간 제한을 둔다
const LOAD_TIMEOUT = 8000
// 로드 후 인증 실패 통보를 기다리는 시간
const AUTH_GRACE = 700

export function useNaverMapsScript() {
  const [state, setState] = useState(() => {
    if (!isNaverMapConfigured) return 'off'
    return window.naver?.maps ? 'verifying' : 'loading'
  })

  // 인증 실패는 스크립트 로드 이후에 통보되므로 콜백을 먼저 걸어둔다
  useEffect(() => {
    if (!isNaverMapConfigured) return undefined
    window.navermap_authFailure = () => setState('failed')
    return undefined
  }, [])

  useEffect(() => {
    if (state !== 'loading') return undefined

    let script = document.querySelector('script[data-naver-maps]')
    if (!script) {
      script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.dataset.naverMaps = 'true'
      document.head.appendChild(script)
    }

    const onLoad = () => setState(window.naver?.maps ? 'verifying' : 'failed')
    const onError = () => setState('failed')
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    const timer = setTimeout(
      () => setState((prev) => (prev === 'loading' ? 'failed' : prev)),
      LOAD_TIMEOUT,
    )

    return () => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
      clearTimeout(timer)
    }
  }, [state])

  // 인증 실패 통보를 잠깐 기다렸다가, 조용하면 진짜로 쓸 수 있다고 본다
  useEffect(() => {
    if (state !== 'verifying') return undefined
    const timer = setTimeout(
      () => setState((prev) => (prev === 'verifying' ? 'ready' : prev)),
      AUTH_GRACE,
    )
    return () => clearTimeout(timer)
  }, [state])

  return state
}
