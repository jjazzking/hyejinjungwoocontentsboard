import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

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

/** localStorage 모드: 커스텀 카테고리를 이 브라우저에만 저장 */
function useLocalCustom() {
  const [custom, setCustom] = useState(loadCustom)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    } catch {
      // 저장 실패해도 화면 동작에는 지장 없음
    }
  }, [custom])

  const addCustom = (name) => setCustom((prev) => [...prev, name])

  return { custom, addCustom }
}

/** Supabase 모드: 커스텀 카테고리를 공유 DB에 저장 + 실시간 반영 */
function useSupabaseCustom() {
  const [custom, setCustom] = useState([])

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('custom_categories')
      .select('name, created_at')
      .order('created_at', { ascending: true })
    if (data) setCustom(data.map((row) => row.name))
    return data
  }, [])

  // 최초 로드 시 DB가 비어 있으면 이 브라우저의 로컬 커스텀 카테고리를 이관
  useEffect(() => {
    ;(async () => {
      const rows = await refetch()
      if (rows && rows.length === 0) {
        const local = loadCustom()
        if (local.length > 0) {
          await supabase
            .from('custom_categories')
            .upsert(local.map((name) => ({ name })), { ignoreDuplicates: true })
          refetch()
        }
      }
    })()
  }, [refetch])

  useEffect(() => {
    const channel = supabase
      .channel('categories-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'custom_categories' },
        () => refetch(),
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [refetch])

  const addCustom = (name) => {
    setCustom((prev) => [...prev, name])
    supabase.from('custom_categories').upsert({ name }, { ignoreDuplicates: true }).then()
  }

  return { custom, addCustom }
}

const useCustomImpl = isSupabaseConfigured ? useSupabaseCustom : useLocalCustom

/**
 * 선택 가능한 카테고리 목록.
 * 기본 카테고리 + 사용자가 추가한 커스텀 카테고리(localStorage 또는 공유 DB)
 * + 컨텐츠에 이미 쓰이고 있는 카테고리를 합쳐서 중복 없이 반환한다.
 */
export function useCategories(contents) {
  const { custom, addCustom } = useCustomImpl()

  const categories = useMemo(() => {
    const used = contents.flatMap((c) => c.categories ?? [])
    return [...new Set([...DEFAULT_CATEGORIES, ...custom, ...used])]
  }, [contents, custom])

  const addCategory = (name) => {
    const trimmed = name.trim()
    if (!trimmed || categories.includes(trimmed)) return trimmed
    addCustom(trimmed)
    return trimmed
  }

  return { categories, addCategory }
}
