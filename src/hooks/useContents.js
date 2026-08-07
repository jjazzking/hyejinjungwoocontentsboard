import { useEffect, useState } from 'react'
import { MOCK_CONTENTS } from '../data/mockContents.js'

// v2부터는 배열 순서가 곧 표시 순서 (편집 모드에서 수동 배치 가능)
const STORAGE_KEY = 'couple-contents-board:v2'
const LEGACY_KEY = 'couple-contents-board:v1'

// 예전 스키마(category: String)를 새 스키마(categories: String[])로 변환
function migrate(item) {
  if (Array.isArray(item.categories)) return item
  const { category, ...rest } = item
  return { ...rest, categories: category ? [category] : [] }
}

// v1까지는 날짜순(할 것: 임박순, 한 것: 최근순)으로 보여줬으므로
// 수동 배치의 시작 순서도 그 순서로 맞춘다. 상태가 다르면 탭이 달라
// 화면에서 섞이지 않으므로 상대 순서를 유지한다(안정 정렬).
function legacyOrder(a, b) {
  if (a.status !== b.status) return 0
  return a.status === 'PLANNING' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
}

function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved).map(migrate)
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return JSON.parse(legacy).map(migrate).sort(legacyOrder)
  } catch {
    // 저장된 데이터가 깨져 있으면 Mock 데이터로 초기화
  }
  return [...MOCK_CONTENTS].sort(legacyOrder)
}

/**
 * 컨텐츠 목록 상태 + CRUD + 수동 배치.
 * 변경 사항은 localStorage에 저장되어 새로고침해도 유지된다.
 * 최초 방문(저장된 데이터 없음) 시에는 Mock 데이터를 시드로 사용한다.
 */
export function useContents() {
  const [contents, setContents] = useState(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contents))
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      // 저장 공간 부족 등으로 실패해도 화면 동작에는 지장 없음
    }
  }, [contents])

  const addContent = (data) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    setContents((prev) => [...prev, { ...data, id }])
  }

  const updateContent = (id, data) => {
    setContents((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, id } : c)))
  }

  const removeContent = (id) => {
    setContents((prev) => prev.filter((c) => c.id !== id))
  }

  const toggleStatus = (id) => {
    setContents((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: c.status === 'PLANNING' ? 'COMPLETED' : 'PLANNING' } : c,
      ),
    )
  }

  /** id 카드를 targetId 카드 앞으로 이동한다. targetId가 null이면 맨 뒤로. */
  const moveContent = (id, targetId) => {
    setContents((prev) => {
      const from = prev.findIndex((c) => c.id === id)
      if (from === -1 || id === targetId) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const to = targetId == null ? next.length : next.findIndex((c) => c.id === targetId)
      if (to === -1) return prev
      next.splice(to, 0, moved)
      return next
    })
  }

  return { contents, addContent, updateContent, removeContent, toggleStatus, moveContent }
}
