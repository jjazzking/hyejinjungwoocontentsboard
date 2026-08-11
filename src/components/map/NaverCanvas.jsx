import { useCallback, useEffect, useRef, useState } from 'react'
import { PIN_ANCHOR_Y, PIN_SIZE, pinHtml } from './pin.js'
import {
  DISTRICT_STYLE,
  loadDistrictBoundaries,
  stillCovered,
  visibleDistricts,
} from './overlays.js'

// 핀이 하나도 없을 때의 기본 화면 (서울시청 근처)
const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ZOOM = 11

/**
 * 네이버 지도(v3)로 핀을 그리는 캔버스.
 * 스크립트가 로드되고 인증 실패 신호도 오지 않았을 때만 마운트된다.
 *
 * LeafletCanvas와 props가 같아서 ContentMap이 둘 중 하나를 골라 끼운다.
 *
 * ⚠️ 여기서 던진 예외는 절대 밖으로 내보내지 않는다.
 * 인증이 실패하면 네이버가 반쯤 죽은 지도 객체를 남기는데, 그 상태에서 destroy()나
 * 마커 정리가 터지면 React가 트리 전체를 내려서 화면이 하얗게 된다.
 * 그래서 모든 호출을 감싸고, 실패하면 onFailure로 알려 OSM으로 넘긴다.
 */
export default function NaverCanvas({
  pins,
  selectedKey,
  onSelect,
  onFailure,
  showDistricts,
  onViewChange,
  className,
}) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const failedRef = useRef(false)
  const [map, setMap] = useState(null)
  const [districts, setDistricts] = useState(null)
  const [view, setView] = useState(null)

  const reportFailure = useCallback(
    (error) => {
      if (failedRef.current) return
      failedRef.current = true
      console.error('네이버 지도 실패 — OpenStreetMap으로 전환합니다:', error)
      onFailure?.()
    },
    [onFailure],
  )

  const iconOf = (color, done, active) => {
    const naver = window.naver
    return {
      content: pinHtml({ color, done, active }),
      size: new naver.maps.Size(PIN_SIZE, PIN_SIZE),
      anchor: new naver.maps.Point(PIN_SIZE / 2, PIN_ANCHOR_Y),
    }
  }

  // 지도 생성 (마운트 때 한 번)
  useEffect(() => {
    const el = containerRef.current
    const naver = window.naver
    if (!el || !naver?.maps) return undefined

    let instance
    try {
      instance = new naver.maps.Map(el, {
        center: new naver.maps.LatLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1]),
        zoom: DEFAULT_ZOOM,
        // 지도 위에서는 휠로 확대/축소한다 (페이지 스크롤은 지도 밖에서)
        scrollWheel: true,
      })
    } catch (error) {
      reportFailure(error)
      return undefined
    }
    setMap(instance)

    return () => {
      // 죽은 지도의 destroy()는 예외를 던진다 — 여기서 삼키지 않으면 흰 화면이 된다
      try {
        if (typeof instance.destroy === 'function') instance.destroy()
      } catch (error) {
        console.error('네이버 지도 정리 실패(무시함):', error)
      }
      setMap(null)
    }
  }, [reportFailure])

  // 지금 보고 있는 영역·배율을 따라다닌다 (경계선을 화면에 걸치는 것만 그리기 위해)
  useEffect(() => {
    const naver = window.naver
    if (!map || !naver?.maps) return undefined

    const report = () => {
      try {
        const bounds = map.getBounds()
        const sw = bounds.getSW?.() ?? bounds.getMin?.()
        const ne = bounds.getNE?.() ?? bounds.getMax?.()
        if (!sw || !ne) return
        const zoom = map.getZoom()
        const next = { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() }
        // 이미 그려둔 범위 안에서 움직인 거라면 그대로 둔다 (오버레이 재생성 방지)
        setView((prev) => (stillCovered(prev, next, zoom) ? prev : { zoom, bounds: next }))
      } catch (error) {
        // 영역을 못 읽으면 경계선만 안 그려질 뿐이라 지도를 갈아탈 일은 아니다
        console.error('네이버 지도 영역 조회 실패(무시함):', error)
      }
    }

    let listener
    try {
      listener = naver.maps.Event.addListener(map, 'idle', report)
      report()
    } catch (error) {
      reportFailure(error)
      return undefined
    }

    return () => {
      try {
        naver.maps.Event.removeListener(listener)
      } catch (error) {
        console.error('네이버 지도 리스너 정리 실패(무시함):', error)
      }
    }
  }, [map, reportFailure])

  useEffect(() => onViewChange?.(view ? view.zoom : null), [view, onViewChange])

  // 핀 다시 찍기 (필터가 바뀔 때마다)
  useEffect(() => {
    const naver = window.naver
    if (!map || !naver?.maps) return undefined

    const markers = new Map()
    try {
      for (const pin of pins) {
        const marker = new naver.maps.Marker({
          map,
          position: new naver.maps.LatLng(pin.lat, pin.lng),
          title: pin.place.name,
          icon: iconOf(pin.color, pin.content.status === 'COMPLETED', false),
          zIndex: 100,
        })
        naver.maps.Event.addListener(marker, 'click', () => onSelect(pin.key))
        markers.set(pin.key, marker)
      }

      if (pins.length > 0) {
        const lats = pins.map((pin) => pin.lat)
        const lngs = pins.map((pin) => pin.lng)
        map.fitBounds(
          naver.maps.LatLngBounds.bounds(
            new naver.maps.LatLng(Math.min(...lats), Math.min(...lngs)),
            new naver.maps.LatLng(Math.max(...lats), Math.max(...lngs)),
          ),
        )
        // 핀이 하나뿐이면 fitBounds가 최대 배율까지 당겨서 주변이 안 보인다
        if (pins.length === 1) {
          map.setCenter(new naver.maps.LatLng(pins[0].lat, pins[0].lng))
          map.setZoom(16)
        }
      }
    } catch (error) {
      reportFailure(error)
    }
    markersRef.current = markers

    return () => {
      try {
        for (const marker of markers.values()) marker.setMap(null)
      } catch (error) {
        console.error('네이버 마커 정리 실패(무시함):', error)
      }
      markersRef.current = new Map()
    }
  }, [map, pins, onSelect, reportFailure])

  // 선택한 핀만 강조 (핀을 다시 찍지 않으므로 지도 위치는 그대로 유지된다)
  useEffect(() => {
    if (!window.naver?.maps) return
    try {
      for (const pin of pins) {
        markersRef.current
          .get(pin.key)
          ?.setIcon(
            iconOf(pin.color, pin.content.status === 'COMPLETED', pin.key === selectedKey),
          )
      }
    } catch (error) {
      reportFailure(error)
    }
  }, [pins, selectedKey, reportFailure])

  // 경계를 켤 때 데이터를 받는다
  useEffect(() => {
    if (!showDistricts || districts) return undefined
    let alive = true
    loadDistrictBoundaries().then((data) => alive && setDistricts(data))
    return () => {
      alive = false
    }
  }, [showDistricts, districts])

  // 시·군·구 경계
  useEffect(() => {
    if (!map || !districts || !showDistricts) return undefined
    const lines = visibleDistricts(districts, view?.bounds, view?.zoom ?? 0)
    if (lines.length === 0) return undefined

    const drawn = []
    try {
      const naver = window.naver
      for (const line of lines) {
        drawn.push(
          new naver.maps.Polyline({
            map,
            path: line.path.map(([lat, lng]) => new naver.maps.LatLng(lat, lng)),
            strokeColor: DISTRICT_STYLE.color,
            strokeWeight: DISTRICT_STYLE.weight,
            strokeOpacity: DISTRICT_STYLE.opacity,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            clickable: false,
            zIndex: 1,
          }),
        )
      }
    } catch (error) {
      console.error('시·군·구 경계 그리기 실패(무시함):', error)
    }

    return () => {
      try {
        for (const polyline of drawn) polyline.setMap(null)
      } catch (error) {
        console.error('경계선 정리 실패(무시함):', error)
      }
    }
  }, [map, districts, showDistricts, view])

  return <div ref={containerRef} role="application" aria-label="장소 지도" className={className} />
}
