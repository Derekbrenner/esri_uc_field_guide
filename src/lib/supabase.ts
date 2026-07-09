import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Live location sharing lives here. It talks to a single Supabase table,
// `attendee_locations`. See SUPABASE_SETUP.md for the 2-minute setup + SQL.
//
// The whole app works WITHOUT Supabase configured — you just won't see live
// dots. When the two env vars below are present, sharing turns on.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null
if (isSupabaseConfigured) {
  client = createClient(url!, anonKey!, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 2 } },
  })
}

// Shared client for the social layer (src/lib/social.ts). Null when Supabase
// isn't configured — every consumer checks isSupabaseConfigured first.
export const supabase: SupabaseClient | null = client

// Function accessor for the same client, used by the votes modules. Returns
// null when Supabase isn't configured, so every feature can no-op.
export function getSupabase(): SupabaseClient | null {
  return client
}

export type LiveLocation = {
  id: string // stable per-device id (localStorage)
  name: string
  lat: number
  lng: number
  color: string
  updated_at: string
}

// Two tiers of presence:
//  • LIVE  — updated within LIVE_AFTER_MS → bright, pulsing "here now" dot.
//  • SEEN  — older than LIVE but within SEEN_AFTER_MS → a faded "last seen X ago"
//            dot. Rows past SEEN_AFTER_MS are dropped from the fetch entirely.
export const LIVE_AFTER_MS = 2 * 60 * 1000 // 2 min (heartbeat is every 15s)
export const SEEN_AFTER_MS = 24 * 60 * 60 * 1000 // 1 day

// Kept for backwards-compat; equals the live threshold.
export const STALE_AFTER_MS = LIVE_AFTER_MS

export function isLive(loc: Pick<LiveLocation, 'updated_at'>, now: number): boolean {
  return now - new Date(loc.updated_at).getTime() < LIVE_AFTER_MS
}

// Within the "last seen" retention window (includes live rows).
export function isSeen(loc: Pick<LiveLocation, 'updated_at'>, now: number): boolean {
  return now - new Date(loc.updated_at).getTime() < SEEN_AFTER_MS
}

export function isFresh(loc: Pick<LiveLocation, 'updated_at'>, now: number): boolean {
  return isLive(loc, now)
}

export async function upsertLocation(
  loc: Omit<LiveLocation, 'updated_at'>,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'Location sharing isn’t configured yet.' }
  const { error } = await client
    .from('attendee_locations')
    .upsert({ ...loc, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  return { error: error?.message ?? null }
}

export async function fetchLocations(): Promise<LiveLocation[]> {
  if (!client) return []
  const since = new Date(Date.now() - SEEN_AFTER_MS).toISOString()
  const { data, error } = await client
    .from('attendee_locations')
    .select('*')
    .gte('updated_at', since)
  if (error) return []
  return (data ?? []) as LiveLocation[]
}

export async function stopSharing(id: string): Promise<void> {
  if (!client) return
  await client.from('attendee_locations').delete().eq('id', id)
}

// Realtime subscription. Returns an unsubscribe function.
export function subscribeLocations(onChange: () => void): () => void {
  if (!client) return () => {}
  const channel = client
    .channel('attendee_locations_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendee_locations' },
      () => onChange(),
    )
    .subscribe()
  return () => {
    client?.removeChannel(channel)
  }
}
