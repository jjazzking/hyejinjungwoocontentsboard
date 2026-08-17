import { useCallback, useEffect, useState } from 'react'
import { MOCK_CONTENTS } from '../data/mockContents.js'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

// v2부터는 배열 순서가 곧 표시 순서 (편집 모드에서 수동 배치 가능)
const STORAGE_KEY = 'couple-contents-board:v2'
const LEGACY_KEY = 'couple-contents-board:v1'
// Supabase로 localStorage 데이터를 한 번 옮겼는지 표시 (브라우저마다 1회)
const MIGRATED_KEY = 'couple-contents-board:migrated-to-supabase'

// DB에 저장하는 컬럼 화이트리스트 — 폼/로컬 데이터에 섞인 여분 필드를 걸러낸다
const ROW_FIELDS = [
  'title',
  'status',
  'date',
  'reference_url',
  'reference_platform',
  'photo_urls',
  'categories',
  'places',
  'memo',
]

function toRow(data) {
  const row = {}
  for (const key of ROW_FIELDS) if (key in data) row[key] = data[key]
  return row
}

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

// 이 브라우저에 실제로 저장된 데이터만 반환 (Mock 시드는 제외 — DB 마이그레이션용)
function loadSavedLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved).map(migrate)
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return JSON.parse(legacy).map(migrate).sort(legacyOrder)
  } catch {
    // 깨진 데이터는 옮길 수 없으니 무시
  }
  return null
}

function loadInitial() {
  return loadSavedLocal() ?? [...MOCK_CONTENTS].sort(legacyOrder)
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** localStorage 모드: Supabase 키가 없을 때의 기존 동작 그대로 */
function useLocalContents() {
  const [contents, setContents] = useState(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contents))
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      // 저장 공간 부족 등으로 실패해도 화면 동작에는 지장 없음
    }
  }, [contents])

  // 만든 카드의 id를 돌려준다 — 공유로 바로 저장했을 때 '수정하기'로 열어주기 위해
  const addContent = (data) => {
    const id = newId()
    setContents((prev) => [...prev, { ...data, id }])
    return id
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

  return {
    contents,
    loading: false,
    error: null,
    addContent,
    updateContent,
    removeContent,
    toggleStatus,
    moveContent,
  }
}

/**
 * Supabase 모드: 두 사람이 같은 보드를 공유한다.
 * - 표시 순서는 sort_order 오름차순 (이동 시 앞뒤 값의 중간값을 부여)
 * - 화면은 즉시 반영(낙관적 업데이트)하고 DB 저장은 뒤에서 진행,
 *   실패하면 다시 불러와서 실제 상태로 되돌린다
 * - Realtime 구독으로 상대가 바꾼 내용도 자동 반영
 * - 최초 접속 시 DB가 비어 있으면 이 브라우저의 localStorage 데이터를 1회 이관
 */
function useSupabaseContents() {
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('contents')
      .select('*')
      .order('sort_order', { ascending: true })
    if (fetchError) {
      setError('서버에서 목록을 불러오지 못했어요. 네트워크를 확인해 주세요.')
      return null
    }
    setError(null)
    setContents(data)
    return data
  }, [])

  // DB 쓰기 공통 처리: 실패하면 알리고 서버 상태로 되돌린다
  const run = useCallback(
    async (query) => {
      const { error: writeError } = await query
      if (writeError) {
        setError('저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
        refetch()
      }
    },
    [refetch],
  )

  // 최초 로드 + localStorage → DB 1회 마이그레이션
  useEffect(() => {
    ;(async () => {
      const rows = await refetch()
      if (rows && rows.length === 0 && !localStorage.getItem(MIGRATED_KEY)) {
        const local = loadSavedLocal()
        if (local && local.length > 0) {
          const { error: migrateError } = await supabase
            .from('contents')
            .insert(local.map((item, i) => ({ ...toRow(item), sort_order: i + 1 })))
          if (!migrateError) await refetch()
        }
      }
      try {
        // DB에 이미 데이터가 있었다면(상대가 먼저 이관) 이 브라우저 데이터는 옮기지 않는다
        localStorage.setItem(MIGRATED_KEY, '1')
      } catch {
        // 표시용 플래그라 실패해도 무방
      }
      setLoading(false)
    })()
  }, [refetch])

  // 실시간 반영: 상대(또는 다른 탭)의 변경을 잠깐 모았다가 다시 불러온다
  useEffect(() => {
    let timer
    const channel = supabase
      .channel('contents-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contents' }, () => {
        clearTimeout(timer)
        timer = setTimeout(refetch, 200)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [refetch])

  // 만든 카드의 id를 돌려준다 — 공유로 바로 저장했을 때 '수정하기'로 열어주기 위해
  const addContent = (data) => {
    const row = {
      ...toRow(data),
      id: newId(),
      sort_order: (contents.at(-1)?.sort_order ?? 0) + 1,
    }
    setContents((prev) => [...prev, row])
    run(supabase.from('contents').insert(row))
    return row.id
  }

  const updateContent = (id, data) => {
    const patch = toRow(data)
    setContents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    run(supabase.from('contents').update(patch).eq('id', id))
  }

  const removeContent = (id) => {
    setContents((prev) => prev.filter((c) => c.id !== id))
    run(supabase.from('contents').delete().eq('id', id))
  }

  const toggleStatus = (id) => {
    const current = contents.find((c) => c.id === id)
    if (!current) return
    const status = current.status === 'PLANNING' ? 'COMPLETED' : 'PLANNING'
    setContents((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
    run(supabase.from('contents').update({ status }).eq('id', id))
  }

  /** id 카드를 targetId 카드 앞으로 이동한다. targetId가 null이면 맨 뒤로. */
  const moveContent = (id, targetId) => {
    const from = contents.findIndex((c) => c.id === id)
    if (from === -1 || id === targetId) return
    const next = [...contents]
    const [moved] = next.splice(from, 1)
    const to = targetId == null ? next.length : next.findIndex((c) => c.id === targetId)
    if (to === -1) return
    const before = next[to - 1]?.sort_order
    const after = next[to]?.sort_order
    const sort_order =
      before == null && after == null
        ? 1
        : before == null
          ? after - 1
          : after == null
            ? before + 1
            : (before + after) / 2
    next.splice(to, 0, { ...moved, sort_order })
    setContents(next)
    run(supabase.from('contents').update({ sort_order }).eq('id', id))
  }

  return { contents, loading, error, addContent, updateContent, removeContent, toggleStatus, moveContent }
}

// isSupabaseConfigured는 빌드 시 결정되는 상수라 렌더 간 바뀌지 않는다
const useImpl = isSupabaseConfigured ? useSupabaseContents : useLocalContents

/**
 * 컨텐츠 목록 상태 + CRUD + 수동 배치.
 * Supabase 키가 설정돼 있으면 공유 DB(실시간 동기화)를,
 * 없으면 이 브라우저의 localStorage를 사용한다.
 */
export function useContents() {
  return useImpl()
}
