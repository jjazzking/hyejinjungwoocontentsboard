import { useEffect, useRef, useState } from 'react'
import { PIN_ANCHOR_Y, PIN_SIZE, pinHtml } from './pin.js'

// 핀이 하나도 없을 때의 기본 화면 (서울시청 근처)
const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ZOOM = 11

/**
 * 네이버 지도(v3)로 핀을 그리는 캔버스.
 * 스크립트가 이미 로드된 뒤에만 마운트된다 (useNaverMapsScript가 'ready'일 때).
 *
 * LeafletCanvas와 props가 같아서 ContentMap이 둘 중 하나를 골라 끼운다.
 */
export default function NaverCanvas({ pins, selectedKey, onSelect, className }) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const [map, setMap] = useState(null)

  // 지도 생성 (마운트 때 한 번)
  useEffect(() => {
    const el = containerRef.current
    const naver = window.naver
    if (!el || !naver?.maps) return undefined

    const instance = new naver.maps.Map(el, {
      center: new naver.maps.LatLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1]),
      zoom: DEFAULT_ZOOM,
      // 페이지를 스크롤하다 지도 위에서 확대되는 사고를 막는다 (드래그·버튼은 그대로)
      scrollWheel: false,
    })
    setMap(instance)

    return () => {
      if (typeof instance.destroy === 'function') instance.destroy()
      setMap(null)
    }
  }, [])

  // 핀 다시 찍기 (필터가 바뀔 때마다)
  useEffect(() => {
    const naver = window.naver
    if (!map || !naver?.maps) return undefined

    const markers = new Map()
    for (const pin of pins) {
      const marker = new naver.maps.Marker({
        map,
        position: new naver.maps.LatLng(pin.lat, pin.lng),
        title: pin.place.name,
        icon: {
          content: pinHtml(pin.content.status, false),
          size: new naver.maps.Size(PIN_SIZE, PIN_SIZE),
          anchor: new naver.maps.Point(PIN_SIZE / 2, PIN_ANCHOR_Y),
        },
      })
      naver.maps.Event.addListener(marker, 'click', () => onSelect(pin.key))
      markers.set(pin.key, marker)
    }
    markersRef.current = markers

    if (pins.length > 0) {
      const lats = pins.map((pin) => pin.lat)
      const lngs = pins.map((pin) => pin.lng)
      const bounds = naver.maps.LatLngBounds.bounds(
        new naver.maps.LatLng(Math.min(...lats), Math.min(...lngs)),
        new naver.maps.LatLng(Math.max(...lats), Math.max(...lngs)),
      )
      map.fitBounds(bounds)
      // 핀이 하나뿐이면 fitBounds가 최대 배율까지 당겨서 주변이 안 보인다
      if (pins.length === 1) {
        map.setCenter(new naver.maps.LatLng(pins[0].lat, pins[0].lng))
        map.setZoom(16)
      }
    }

    return () => {
      for (const marker of markers.values()) marker.setMap(null)
      markersRef.current = new Map()
    }
  }, [map, pins, onSelect])

  // 선택한 핀만 강조 (핀을 다시 찍지 않으므로 지도 위치는 그대로 유지된다)
  useEffect(() => {
    const naver = window.naver
    if (!naver?.maps) return
    for (const pin of pins) {
      const marker = markersRef.current.get(pin.key)
      marker?.setIcon({
        content: pinHtml(pin.content.status, pin.key === selectedKey),
        size: new naver.maps.Size(PIN_SIZE, PIN_SIZE),
        anchor: new naver.maps.Point(PIN_SIZE / 2, PIN_ANCHOR_Y),
      })
    }
  }, [pins, selectedKey])

  return <div ref={containerRef} role="application" aria-label="장소 지도" className={className} />
}
