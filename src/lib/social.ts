import { getSupabase } from './supabase'

// ---------------------------------------------------------------------------
// Social layer — data access for everything that hangs off a spot_key
// (curated venues use 'venue:<slug>', user-added spots use their DB uuid).
//
// Mirrors the style of `supabase.ts`: thin typed functions that no-op when
// Supabase isn't configured, plus one `subscribe*` per table that returns an
// unsubscribe function. Phase 2 only needs votes; later phases extend this file.
// ---------------------------------------------------------------------------

export type Vote = {
  spot_key: string
  device_id: string
  name: string
  created_at?: string
}

export async function fetchVotes(): Promise<Vote[]> {
  const client = getSupabase()
  if (!client) return []
  const { data, error } = await client.from('votes').select('*')
  if (error) return []
  return (data ?? []) as Vote[]
}

export async function addVote(vote: Vote): Promise<{ error: string | null }> {
  const client = getSupabase()
  if (!client) return { error: 'Voting isn’t configured yet.' }
  // Idempotent: re-tapping a spot you already voted for is a no-op, not a dupe.
  const { error } = await client
    .from('votes')
    .upsert(
      { spot_key: vote.spot_key, device_id: vote.device_id, name: vote.name },
      { onConflict: 'spot_key,device_id' },
    )
  return { error: error?.message ?? null }
}

export async function removeVote(
  spot_key: string,
  device_id: string,
): Promise<{ error: string | null }> {
  const client = getSupabase()
  if (!client) return { error: 'Voting isn’t configured yet.' }
  const { error } = await client
    .from('votes')
    .delete()
    .eq('spot_key', spot_key)
    .eq('device_id', device_id)
  return { error: error?.message ?? null }
}

// Realtime subscription for the votes table. Returns an unsubscribe function.
export function subscribeVotes(onChange: () => void): () => void {
  const client = getSupabase()
  if (!client) return () => {}
  const channel = client
    .channel('votes_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => onChange())
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}
