import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const BASE_FIELDS =
  'id, name, kind, summary, start_date, end_date, place, thumbnail_url, mention_count, hidden, added_content_id, first_seen_at, last_seen_at'
// 좋아요 컬럼은 나중에 추가됐다 — SQL을 아직 안 돌렸으면 빼고 읽어서 탭은 살린다
const SPOT_FIELDS = `${BASE_FIELDS}, liked_by`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Edge Function 호출 — 실패도 { ok:false, detail } 모양으로 맞춰 돌려준다 */
async function invoke(step) {
  try {
    const { data, error } = await supabase.functions.invoke('xmas-collect', { body: { step } })
    if (error) {
      return {
        ok: false,
        detail: [`수집 함수 호출 실패 — ${error.message} (xmas-collect 함수를 배포했는지 확인)`],
      }
    }
    return data ?? { ok: false, detail: ['빈 응답'] }
  } catch (err) {
    return { ok: false, detail: [`수집 함수 호출 오류 — ${err?.message ?? err}`] }
  }
}

/**
 * 🎄 크리스마스 후보 장소 (xmas_spots).
 * Supabase 전용 기능이라 설정이 없으면 available=false 만 돌려준다.
 */
export function useXmasSpots() {
  const [spots, setSpots] = useState([])
  const [lastRun, setLastRun] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState(null)
  // liked_by 컬럼이 있는지 (없으면 좋아요 버튼을 숨기고 이유를 알린다)
  const [likesReady, setLikesReady] = useState(true)
  // 수집 진행: null | { message, log: string[], done?: boolean }
  const [collect, setCollect] = useState(null)
  const alive = useRef(true)

  const refetch = useCallback(async () => {
    if (!supabase) return
    const loadSpots = (fields) =>
      supabase.from('xmas_spots').select(fields).order('mention_count', { ascending: false })
    const [firstRes, runRes] = await Promise.all([
      loadSpots(SPOT_FIELDS),
      supabase
        .from('xmas_runs')
        .select('step, status, stats, detail, created_at')
        .neq('step', 'instagram_start')
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    let spotsRes = firstRes
    const missingLikes = Boolean(firstRes.error?.message?.includes('liked_by'))
    if (missingLikes) spotsRes = await loadSpots(BASE_FIELDS)
    if (!alive.current) return
    setLikesReady(!missingLikes)
    if (spotsRes.error) {
      setError(
        `후보를 못 불러왔어요 — ${spotsRes.error.message} (SUPABASE_SETUP.md의 크리스마스 SQL을 실행했는지 확인)`,
      )
    } else {
      setError(null)
      setSpots(spotsRes.data ?? [])
    }
    setLastRun(runRes.data?.[0] ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    refetch()
    return () => {
      alive.current = false
    }
  }, [refetch])

  const patch = useCallback((id, values) => {
    setSpots((prev) => prev.map((s) => (s.id === id ? { ...s, ...values } : s)))
    supabase
      .from('xmas_spots')
      .update(values)
      .eq('id', id)
      .then(({ error: updateError }) => updateError && setError(`저장 실패 — ${updateError.message}`))
  }, [])

  /** 좋아요 토글 — 다른 사람이 방금 누른 것을 덮어쓰지 않도록 DB의 최신값에 더하거나 뺀다 */
  const toggleLike = useCallback(async (id, who) => {
    const { data } = await supabase.from('xmas_spots').select('liked_by').eq('id', id).single()
    const current = data?.liked_by ?? []
    const next = current.includes(who) ? current.filter((name) => name !== who) : [...current, who]
    patch(id, { liked_by: next })
  }, [patch])

  /** 출처 글 목록 (펼칠 때만 불러온다) */
  const loadSources = useCallback(async (spotId) => {
    const { data } = await supabase
      .from('xmas_sources')
      .select('url, type, title, posted_at')
      .eq('spot_id', spotId)
      .order('posted_at', { ascending: false })
      .limit(30)
    return data ?? []
  }, [])

  /**
   * 지금 수집: 네이버 → 인스타 시작 → 끝날 때까지 기다렸다가 수거.
   * 인스타는 Apify가 몇 분 걸리므로 15초마다 상태를 묻는다. 화면을 닫아도
   * 매주 자동 수집(pg_cron)의 수거 단계가 남은 걸 가져가므로 손해는 없다.
   */
  const runCollect = useCallback(async () => {
    const log = []
    const say = (message, line) => {
      if (line) log.push(line)
      if (alive.current) setCollect({ message, log: [...log] })
    }
    const describe = (label, stats) =>
      stats
        ? `${label}: 새 글 ${stats.fresh}개 중 관련 ${stats.relevant}개 → 새 후보 ${stats.spotsNew}곳, 갱신 ${stats.spotsUpdated}곳` +
          (stats.resolvedLater ? ` · 미확인 ${stats.resolvedLater}곳 위치 찾음` : '') +
          (stats.leftover ? ` (남은 ${stats.leftover}개는 다음에)` : '')
        : `${label}: 건너뜀`

    say('📰 네이버 블로그·뉴스 읽는 중… (1~2분)')
    const naver = await invoke('naver')
    say('📸 인스타 수집 시작하는 중…', describe('네이버', naver.naver))
    for (const line of naver.detail ?? []) log.push(`⚠️ ${line}`)
    await refetch()

    const start = await invoke('instagram_start')
    for (const line of start.detail ?? []) log.push(`⚠️ ${line}`)
    // 지난 수집 이후 게시물만 받는다 (Apify는 받은 게시물 수만큼 과금)
    if (start.instagram?.since) log.push(`인스타: ${start.instagram.since.slice(5).replace('-', '/')} 이후 게시물만 가져옴`)
    if (start.instagram?.runId) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        say(`📸 인스타 해시태그 수집 중… (${Math.round((attempt * 15) / 60)}분 경과, 보통 2~5분)`)
        await sleep(15000)
        if (!alive.current) return
        const ingest = await invoke('instagram_ingest')
        if (ingest.pending) continue
        log.push(describe('인스타', ingest.stats))
        for (const line of ingest.detail ?? []) log.push(`⚠️ ${line}`)
        // 시간이 모자라 남은 글이 있으면 한 번 더 수거
        if (ingest.stats?.leftover) continue
        break
      }
    }
    await refetch()

    // 마무리: 장소 못 찾은 곳 다시 찾기 + 사진 채우기 (사진이 없으면 출처 글의 대표 사진)
    say('🖼️ 사진·위치 채우는 중…')
    const enrich = await invoke('enrich')
    if (enrich.ok !== false) {
      log.push(`마무리: 사진 ${enrich.thumbnails?.filled ?? 0}곳 · 위치 ${enrich.resolved ?? 0}곳 채움`)
    }
    for (const line of enrich.detail ?? []) log.push(`⚠️ ${line}`)
    await refetch()
    if (alive.current) setCollect({ message: '✅ 수집 끝', log: [...log], done: true })
  }, [refetch])

  /** 수집 없이 사진·위치만 채우기 (한 번에 최대 40곳) */
  const runEnrich = useCallback(async () => {
    if (alive.current) setCollect({ message: '🖼️ 사진·위치 채우는 중…', log: [] })
    const enrich = await invoke('enrich')
    const log = []
    if (enrich.ok !== false) {
      log.push(`사진 ${enrich.thumbnails?.filled ?? 0}곳 · 위치 ${enrich.resolved ?? 0}곳 채움`)
    }
    for (const line of enrich.detail ?? []) log.push(`⚠️ ${line}`)
    await refetch()
    if (alive.current) setCollect({ message: '✅ 끝', log, done: true })
  }, [refetch])

  return {
    runEnrich,
    available: isSupabaseConfigured,
    spots,
    lastRun,
    loading,
    error,
    collect,
    clearCollect: () => setCollect(null),
    refetch,
    patch,
    loadSources,
    runCollect,
    likesReady,
    toggleLike,
  }
}
