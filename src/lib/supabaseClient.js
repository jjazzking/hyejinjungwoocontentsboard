import { createClient } from '@supabase/supabase-js'

/**
 * Supabase 클라이언트.
 *
 * 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되어 있을 때만
 * 생성되고, 없으면 null — 앱은 localStorage 모드로 계속 동작한다.
 * 설정 방법은 저장소 루트의 SUPABASE_SETUP.md 참고.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = Boolean(supabase)
