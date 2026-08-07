import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'couple-contents-board:categories:v1'

export const DEFAULT_CATEGORIES = ['맛집', '여행', '홈데이트', '액티비티']

function loadCustom() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === 'string')
    }
  } catch {
    // 저장된 데이터가 깨져 있으면 빈 목록으로 시작
  }
  return []
}

/**
 * 선택 가능한 카테고리 목록.
 * 기본 카테고리 + 사용자가 추가한 커스텀 카테고리(localStorage 유지)
 * + 컨텐츠에 이미 쓰이고 있는 카테고리를 합쳐서 중복 없이 반환한다.
 */
export function useCategories(contents) {
  const [custom, setCustom] = useState(loadCustom)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    } catch {
      // 저장 실패해도 화면 동작에는 지장 없음
    }
  }, [custom])

  const categories = useMemo(() => {
    const used = contents.flatMap((c) => c.categories ?? [])
    return [...new Set([...DEFAULT_CATEGORIES, ...custom, ...used])]
  }, [contents, custom])

  const addCategory = (name) => {
    const trimmed = name.trim()
    if (!trimmed || categories.includes(trimmed)) return trimmed
    setCustom((prev) => [...prev, trimmed])
    return trimmed
  }

  return { categories, addCategory }
}
