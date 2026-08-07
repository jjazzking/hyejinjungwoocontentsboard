import { useEffect, useState } from 'react'
import { MOCK_CONTENTS } from '../data/mockContents.js'

const STORAGE_KEY = 'couple-contents-board:v1'

// 예전 스키마(category: String)를 새 스키마(categories: String[])로 변환
function migrate(item) {
  if (Array.isArray(item.categories)) return item
  const { category, ...rest } = item
  return { ...rest, categories: category ? [category] : [] }
}

function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved).map(migrate)
  } catch {
    // 저장된 데이터가 깨져 있으면 Mock 데이터로 초기화
  }
  return MOCK_CONTENTS
}

/**
 * 컨텐츠 목록 상태 + CRUD.
 * 변경 사항은 localStorage에 저장되어 새로고침해도 유지된다.
 * 최초 방문(저장된 데이터 없음) 시에는 Mock 데이터를 시드로 사용한다.
 */
export function useContents() {
  const [contents, setContents] = useState(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contents))
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

  return { contents, addContent, updateContent, removeContent, toggleStatus }
}
