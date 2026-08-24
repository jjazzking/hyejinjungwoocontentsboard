import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const STORAGE_KEY = 'couple-contents-board:categories:v1'
/** 태그별로 직접 고른 색 — { 태그이름: '#RRGGBB' }. 안 고른 태그는 여기 없다(자동 색) */
const COLOR_STORAGE_KEY = 'couple-contents-board:category-colors:v1'

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

function loadColors() {
  try {
    const saved = localStorage.getItem(COLOR_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    }
  } catch {
    // 색 설정이 깨져 있으면 자동 색으로 돌아간다 (기능에는 지장 없음)
  }
  return {}
}

/** localStorage 모드: 커스텀 카테고리·색을 이 브라우저에만 저장 */
function useLocalCustom() {
  const [custom, setCustom] = useState(loadCustom)
  const [colors, setColors] = useState(loadColors)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    } catch {
      // 저장 실패해도 화면 동작에는 지장 없음
    }
  }, [custom])

  useEffect(() => {
    try {
      localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors))
    } catch {
      // 위와 같다
    }
  }, [colors])

  const addCustom = (name) => setCustom((prev) => [...prev, name])
  const removeCustom = (name) => setCustom((prev) => prev.filter((c) => c !== name))
  const setColor = (name, color) =>
    setColors((prev) => {
      const next = { ...prev }
      // 색을 비우면(자동으로 되돌리기) 항목 자체를 지운다
      if (color) next[name] = color
      else delete next[name]
      return next
    })

  return { custom, colors, addCustom, removeCustom, setColor }
}

/** Supabase 모드: 커스텀 카테고리·색을 공유 DB에 저장 + 실시간 반영 */
function useSupabaseCustom() {
  // [{ name, color }] — 색만 고른 기본 태그도 여기에 행으로 남는다
  const [rows, setRows] = useState([])

  const refetch = useCallback(async () => {
    // color 컬럼이 아직 없는 DB에서도 목록은 살아 있어야 하므로 컬럼을 찍지 않는다
    const { data } = await supabase
      .from('custom_categories')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setRows(data.map((row) => ({ name: row.name, color: row.color ?? null })))
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
    setRows((prev) => (prev.some((row) => row.name === name) ? prev : [...prev, { name, color: null }]))
    supabase.from('custom_categories').upsert({ name }, { ignoreDuplicates: true }).then()
  }

  const removeCustom = (name) => {
    setRows((prev) => prev.filter((row) => row.name !== name))
    supabase.from('custom_categories').delete().eq('name', name).then()
  }

  const setColor = (name, color) => {
    setRows((prev) =>
      prev.some((row) => row.name === name)
        ? prev.map((row) => (row.name === name ? { ...row, color } : row))
        : // 기본 태그는 행이 없다 — 색을 고르는 순간 행이 생긴다
          [...prev, { name, color }],
    )
    supabase
      .from('custom_categories')
      .upsert({ name, color })
      .then(({ error }) => {
        // color 컬럼 마이그레이션 전이면 여기서 걸린다 (SUPABASE_SETUP.md 참고)
        if (error) console.error('태그 색 저장 실패:', error.message)
      })
  }

  const custom = useMemo(() => rows.map((row) => row.name), [rows])
  const colors = useMemo(
    () => Object.fromEntries(rows.filter((row) => row.color).map((row) => [row.name, row.color])),
    [rows],
  )

  return { custom, colors, addCustom, removeCustom, setColor }
}

const useCustomImpl = isSupabaseConfigured ? useSupabaseCustom : useLocalCustom

/**
 * 선택 가능한 카테고리 목록과 태그별 색.
 * 기본 카테고리 + 사용자가 추가한 커스텀 카테고리(localStorage 또는 공유 DB)
 * + 컨텐츠에 이미 쓰이고 있는 카테고리를 합쳐서 중복 없이 반환한다.
 *
 * 색(categoryColors)은 **직접 고른 것만** 담긴다. 안 고른 태그는 팔레트에서
 * 자동으로 배정되므로 buildCategoryColorMap이 채워 준다.
 */
export function useCategories(contents) {
  const { custom, colors, addCustom, removeCustom, setColor } = useCustomImpl()

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

  /** 색을 고른다. color가 null이면 자동 색으로 되돌린다 */
  const setCategoryColor = (name, color) => setColor(name, color)

  /**
   * 태그를 지운다. 카드에 붙어 있는 태그는 지워도 `used`로 다시 살아나므로
   * **아무 카드에도 안 붙은 커스텀 태그**만 부르는 쪽에서 넘겨야 한다.
   */
  const removeCategory = (name) => removeCustom(name)

  return { categories, categoryColors: colors, addCategory, setCategoryColor, removeCategory }
}
