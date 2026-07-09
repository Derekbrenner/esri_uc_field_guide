import { supabase, isSupabaseConfigured } from './supabase'

// ---------------------------------------------------------------------------
// Social layer data access. Mirrors src/lib/supabase.ts: thin, typed helpers
// over the anon Supabase client. Every table has wide-open RLS (see
// supabase.sql). All of this is inert when Supabase isn't configured — each
// helper returns an empty list / a no-op result so callers degrade gracefully.
//
// spot_key convention: curated venues use 'venue:<slug>' (see data/venues.ts),
// user-added spots use their `spots.id` uuid.
// ---------------------------------------------------------------------------

// --- Row types -------------------------------------------------------------

export type Spot = {
  id: string
  name: string
  category: string | null
  lat: number | null
  lng: number | null
  note: string | null
  added_by_name: string | null
  added_by_device: string | null
  created_at: string
}

export type Vote = {
  spot_key: string
  device_id: string
  name: string | null
  created_at: string
}

export type Checkin = {
  id: string
  spot_key: string
  spot_name: string | null
  device_id: string
  name: string | null
  squad_id: string | null
  verified: boolean
  lat: number | null
  lng: number | null
  created_at: string
  ended_at: string | null
}

export type Squad = {
  id: string
  name: string
  emoji: string | null
  created_by_device: string | null
  created_at: string
}

export type SquadMember = {
  squad_id: string
  device_id: string
  name: string | null
  joined_at: string
}

export type Photo = {
  id: string
  spot_key: string | null
  lat: number | null
  lng: number | null
  device_id: string
  name: string | null
  storage_path: string
  caption: string | null
  created_at: string
}

export type Meetup = {
  id: string
  spot_key: string | null
  spot_name: string | null
  lat: number | null
  lng: number | null
  meet_at: string | null
  note: string | null
  squad_id: string | null
  created_by_device: string | null
  created_by_name: string | null
  cancelled: boolean
  created_at: string
}

export type MeetupRsvp = {
  meetup_id: string
  device_id: string
  name: string | null
  going: boolean
}

export type AttendeeRow = {
  id: string
  name: string
  group_size: number | null
  org: string | null
  arrive_date: string | null
  depart_date: string | null
  note: string | null
  sort_order: number | null
  updated_by: string | null
  updated_at: string | null
}

export type ScheduleItemRow = {
  id: string
  day: string | null
  time_label: string | null
  title: string
  note: string | null
  spot_key: string | null
  sort_order: number | null
  updated_by: string | null
  updated_at: string | null
}

export type BingoClaim = {
  square_id: string
  device_id: string
  name: string | null
  created_at: string
}

// The device identity used to attribute records. Reuses the localStorage triple
// established by useLiveLocations (deviceId, name, color).
export type Identity = { deviceId: string; name: string }

// --- Shared helpers --------------------------------------------------------

const PHOTO_BUCKET = 'spot-photos'

// Realtime subscription for one table. Returns an unsubscribe function.
// Mirrors subscribeLocations() in supabase.ts.
function subscribeTable(table: string, onChange: () => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`${table}_changes_${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
    .subscribe()
  return () => {
    supabase?.removeChannel(channel)
  }
}

async function fetchAll<T>(table: string, order?: { column: string; ascending?: boolean }): Promise<T[]> {
  if (!supabase) return []
  let query = supabase.from(table).select('*')
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true })
  const { data, error } = await query
  if (error) return []
  return (data ?? []) as T[]
}

// --- Spots -----------------------------------------------------------------

export function fetchSpots(): Promise<Spot[]> {
  return fetchAll<Spot>('spots', { column: 'created_at', ascending: true })
}

export async function insertSpot(input: {
  name: string
  category?: string | null
  lat: number
  lng: number
  note?: string | null
  added_by_name: string
  added_by_device: string
}): Promise<{ data: Spot | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const { data, error } = await supabase.from('spots').insert(input).select().single()
  return { data: (data as Spot) ?? null, error: error?.message ?? null }
}

export async function updateSpot(
  id: string,
  patch: Partial<Pick<Spot, 'name' | 'category' | 'note' | 'lat' | 'lng'>>,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('spots').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteSpot(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('spots').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export function subscribeSpots(onChange: () => void): () => void {
  return subscribeTable('spots', onChange)
}

// --- Votes -----------------------------------------------------------------

export function fetchVotes(): Promise<Vote[]> {
  return fetchAll<Vote>('votes')
}

export async function addVote(spot_key: string, id: Identity): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('votes')
    .upsert({ spot_key, device_id: id.deviceId, name: id.name }, { onConflict: 'spot_key,device_id' })
  return { error: error?.message ?? null }
}

export async function removeVote(spot_key: string, deviceId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('votes').delete().eq('spot_key', spot_key).eq('device_id', deviceId)
  return { error: error?.message ?? null }
}

export function subscribeVotes(onChange: () => void): () => void {
  return subscribeTable('votes', onChange)
}

// --- Check-ins -------------------------------------------------------------

export function fetchCheckins(): Promise<Checkin[]> {
  return fetchAll<Checkin>('checkins', { column: 'created_at', ascending: false })
}

// Close any open (ended_at is null) check-in for this device. Enforces the
// "one active check-in per person" rule before a new check-in is inserted.
export async function endOpenCheckins(deviceId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('checkins')
    .update({ ended_at: new Date().toISOString() })
    .eq('device_id', deviceId)
    .is('ended_at', null)
  return { error: error?.message ?? null }
}

export async function insertCheckin(input: {
  spot_key: string
  spot_name: string
  device_id: string
  name: string
  squad_id?: string | null
  verified: boolean
  lat?: number | null
  lng?: number | null
}): Promise<{ data: Checkin | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  await endOpenCheckins(input.device_id)
  const { data, error } = await supabase
    .from('checkins')
    .insert({ ...input, squad_id: input.squad_id ?? null })
    .select()
    .single()
  return { data: (data as Checkin) ?? null, error: error?.message ?? null }
}

export function subscribeCheckins(onChange: () => void): () => void {
  return subscribeTable('checkins', onChange)
}

// --- Squads ----------------------------------------------------------------

export function fetchSquads(): Promise<Squad[]> {
  return fetchAll<Squad>('squads', { column: 'created_at', ascending: true })
}

export async function insertSquad(input: {
  name: string
  emoji: string
  created_by_device: string
}): Promise<{ data: Squad | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const { data, error } = await supabase.from('squads').insert(input).select().single()
  return { data: (data as Squad) ?? null, error: error?.message ?? null }
}

export function subscribeSquads(onChange: () => void): () => void {
  return subscribeTable('squads', onChange)
}

export function fetchSquadMembers(): Promise<SquadMember[]> {
  return fetchAll<SquadMember>('squad_members')
}

// Join a squad. One squad per person: any prior membership is dropped first.
export async function joinSquad(squad_id: string, id: Identity): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  await leaveAllSquads(id.deviceId)
  const { error } = await supabase
    .from('squad_members')
    .upsert(
      { squad_id, device_id: id.deviceId, name: id.name, joined_at: new Date().toISOString() },
      { onConflict: 'squad_id,device_id' },
    )
  return { error: error?.message ?? null }
}

export async function leaveAllSquads(deviceId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('squad_members').delete().eq('device_id', deviceId)
  return { error: error?.message ?? null }
}

export function subscribeSquadMembers(onChange: () => void): () => void {
  return subscribeTable('squad_members', onChange)
}

// --- Photos ----------------------------------------------------------------

export function fetchPhotos(): Promise<Photo[]> {
  return fetchAll<Photo>('photos', { column: 'created_at', ascending: false })
}

// Public URL for a stored photo. Empty string when unconfigured / no path.
export function photoUrl(storage_path: string | null | undefined): string {
  if (!supabase || !storage_path) return ''
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storage_path).data.publicUrl
}

function extForType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  return 'jpg'
}

// Upload a (already downscaled) image to Storage, then insert its photos row.
export async function uploadPhoto(
  file: Blob,
  meta: {
    device_id: string
    name: string
    spot_key?: string | null
    lat?: number | null
    lng?: number | null
    caption?: string | null
  },
): Promise<{ data: Photo | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const contentType = file.type || 'image/jpeg'
  const ext = extForType(contentType)
  const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
  const path = `${meta.device_id}/${uid}.${ext}`

  const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType, upsert: false })
  if (up.error) return { data: null, error: up.error.message }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      spot_key: meta.spot_key ?? null,
      lat: meta.lat ?? null,
      lng: meta.lng ?? null,
      device_id: meta.device_id,
      name: meta.name,
      storage_path: path,
      caption: meta.caption ?? null,
    })
    .select()
    .single()
  if (error) {
    // Roll back the orphaned object so Storage doesn't accumulate junk.
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
    return { data: null, error: error.message }
  }
  return { data: (data as Photo) ?? null, error: null }
}

// Delete a photo: remove the row and its Storage object.
export async function deletePhoto(photo: Pick<Photo, 'id' | 'storage_path'>): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  if (photo.storage_path) await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  return { error: error?.message ?? null }
}

export function subscribePhotos(onChange: () => void): () => void {
  return subscribeTable('photos', onChange)
}

// --- Meetups ---------------------------------------------------------------

export function fetchMeetups(): Promise<Meetup[]> {
  return fetchAll<Meetup>('meetups', { column: 'meet_at', ascending: true })
}

export async function insertMeetup(input: {
  spot_key?: string | null
  spot_name: string
  lat: number
  lng: number
  meet_at: string
  note?: string | null
  squad_id?: string | null
  created_by_device: string
  created_by_name: string
}): Promise<{ data: Meetup | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const { data, error } = await supabase
    .from('meetups')
    .insert({ ...input, spot_key: input.spot_key ?? null, note: input.note ?? null, squad_id: input.squad_id ?? null })
    .select()
    .single()
  return { data: (data as Meetup) ?? null, error: error?.message ?? null }
}

export async function cancelMeetup(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('meetups').update({ cancelled: true }).eq('id', id)
  return { error: error?.message ?? null }
}

export function subscribeMeetups(onChange: () => void): () => void {
  return subscribeTable('meetups', onChange)
}

export function fetchMeetupRsvps(): Promise<MeetupRsvp[]> {
  return fetchAll<MeetupRsvp>('meetup_rsvps')
}

export async function upsertRsvp(
  meetup_id: string,
  going: boolean,
  id: Identity,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('meetup_rsvps')
    .upsert({ meetup_id, device_id: id.deviceId, name: id.name, going }, { onConflict: 'meetup_id,device_id' })
  return { error: error?.message ?? null }
}

export function subscribeMeetupRsvps(onChange: () => void): () => void {
  return subscribeTable('meetup_rsvps', onChange)
}

// --- Attendees -------------------------------------------------------------

export function fetchAttendees(): Promise<AttendeeRow[]> {
  return fetchAll<AttendeeRow>('attendees', { column: 'sort_order', ascending: true })
}

export async function insertAttendee(
  input: Omit<AttendeeRow, 'id' | 'updated_at'> & { updated_by: string },
): Promise<{ data: AttendeeRow | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const { data, error } = await supabase
    .from('attendees')
    .insert({ ...input, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: (data as AttendeeRow) ?? null, error: error?.message ?? null }
}

export async function updateAttendee(
  id: string,
  patch: Partial<Omit<AttendeeRow, 'id'>>,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('attendees')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteAttendee(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('attendees').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export function subscribeAttendees(onChange: () => void): () => void {
  return subscribeTable('attendees', onChange)
}

// --- Schedule items --------------------------------------------------------

export function fetchScheduleItems(): Promise<ScheduleItemRow[]> {
  return fetchAll<ScheduleItemRow>('schedule_items', { column: 'sort_order', ascending: true })
}

export async function insertScheduleItem(
  input: Omit<ScheduleItemRow, 'id' | 'updated_at'> & { updated_by: string },
): Promise<{ data: ScheduleItemRow | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Not configured' }
  const { data, error } = await supabase
    .from('schedule_items')
    .insert({ ...input, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: (data as ScheduleItemRow) ?? null, error: error?.message ?? null }
}

export async function updateScheduleItem(
  id: string,
  patch: Partial<Omit<ScheduleItemRow, 'id'>>,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('schedule_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteScheduleItem(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('schedule_items').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export function subscribeScheduleItems(onChange: () => void): () => void {
  return subscribeTable('schedule_items', onChange)
}

// --- Bingo claims ----------------------------------------------------------

export function fetchBingoClaims(): Promise<BingoClaim[]> {
  return fetchAll<BingoClaim>('bingo_claims')
}

export async function addBingoClaim(square_id: string, id: Identity): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase
    .from('bingo_claims')
    .upsert({ square_id, device_id: id.deviceId, name: id.name }, { onConflict: 'square_id,device_id' })
  return { error: error?.message ?? null }
}

export async function removeBingoClaim(square_id: string, deviceId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' }
  const { error } = await supabase.from('bingo_claims').delete().eq('square_id', square_id).eq('device_id', deviceId)
  return { error: error?.message ?? null }
}

export function subscribeBingoClaims(onChange: () => void): () => void {
  return subscribeTable('bingo_claims', onChange)
}

// Re-export so consumers can gate UI without importing supabase.ts directly.
export { isSupabaseConfigured }
