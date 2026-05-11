import { getApiUrl, getDeviceId } from './storage'

export const USE_MOCK = false

export interface Reading {
  id: string
  device_id: string
  ph: number
  tds: number
  food_level: number
  created_at: string
}

export interface FeedCommand {
  id: string
  device_id: string
  executed: boolean
  created_at: string
}

export interface Schedule {
  id: string
  device_id: string
  time: string
  enabled: boolean
  created_at: string
}

interface ApiResult<T> {
  data: T | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function mockHistory(): Reading[] {
  const now = Date.now()
  return Array.from({ length: 50 }, (_, i) => {
    const t = now - (49 - i) * 5 * 60 * 1000 // every 5 min
    return {
      id: String(i),
      device_id: 'esp32-001',
      ph: parseFloat((7.1 + Math.sin(i / 5) * 0.4 + (Math.random() - 0.5) * 0.1).toFixed(2)),
      tds: Math.round(320 + Math.cos(i / 8) * 60 + (Math.random() - 0.5) * 20),
      food_level: Math.max(10, Math.round(85 - i * 0.6 + (Math.random() - 0.5) * 3)),
      created_at: new Date(t).toISOString(),
    }
  })
}

const MOCK_HISTORY = mockHistory()
const MOCK_LATEST = MOCK_HISTORY[MOCK_HISTORY.length - 1]

const MOCK_SCHEDULES: Schedule[] = [
  { id: '1', device_id: 'esp32-001', time: '08:00', enabled: true, created_at: new Date().toISOString() },
  { id: '2', device_id: 'esp32-001', time: '18:30', enabled: true, created_at: new Date().toISOString() },
]

// ---------------------------------------------------------------------------
// Real API helpers
// ---------------------------------------------------------------------------

async function base(): Promise<{ url: string; deviceId: string }> {
  const [url, deviceId] = await Promise.all([getApiUrl(), getDeviceId()])
  return { url, deviceId }
}

async function safeFetch(...args: Parameters<typeof fetch>): Promise<Response | null> {
  try {
    return await fetch(...args)
  } catch {
    return null
  }
}

async function readError(res: Response | null): Promise<string> {
  if (!res) return 'Could not reach the API.'
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // Fall through to status-based message.
  }
  return `API request failed with status ${res.status}.`
}

async function readJson<T>(res: Response | null): Promise<ApiResult<T>> {
  if (!res?.ok) return { data: null, error: await readError(res) }
  try {
    return { data: await res.json() as T, error: null }
  } catch {
    return { data: null, error: 'API returned invalid JSON.' }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLatestReading(): Promise<Reading | null> {
  const result = await getLatestReadingResult()
  return result.data
}

export async function getLatestReadingResult(): Promise<ApiResult<Reading>> {
  if (USE_MOCK) return { data: MOCK_LATEST, error: null }
  const { url, deviceId } = await base()
  const res = await safeFetch(`${url}/api/readings?device_id=${encodeURIComponent(deviceId)}`)
  return readJson<Reading>(res)
}

export async function getReadingHistory(limit = 50): Promise<Reading[]> {
  const result = await getReadingHistoryResult(limit)
  return result.data ?? []
}

export async function getReadingHistoryResult(limit = 50): Promise<ApiResult<Reading[]>> {
  if (USE_MOCK) return { data: MOCK_HISTORY.slice(-limit), error: null }
  const { url, deviceId } = await base()
  const res = await safeFetch(
    `${url}/api/readings/history?device_id=${encodeURIComponent(deviceId)}&limit=${encodeURIComponent(String(limit))}`
  )
  return readJson<Reading[]>(res)
}

export async function triggerFeed(): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK) return { success: true }
  const { url, deviceId } = await base()
  const res = await safeFetch(`${url}/api/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  })
  if (!res?.ok) return { success: false, error: await readError(res) }
  return res.json()
}

export async function getSchedules(): Promise<Schedule[]> {
  const result = await getSchedulesResult()
  return result.data ?? []
}

export async function getSchedulesResult(): Promise<ApiResult<Schedule[]>> {
  if (USE_MOCK) return { data: MOCK_SCHEDULES, error: null }
  const { url, deviceId } = await base()
  const res = await safeFetch(`${url}/api/schedule?device_id=${encodeURIComponent(deviceId)}`)
  return readJson<Schedule[]>(res)
}

export async function addSchedule(time: string): Promise<Schedule | null> {
  if (USE_MOCK) {
    const s: Schedule = { id: String(Date.now()), device_id: 'esp32-001', time, enabled: true, created_at: new Date().toISOString() }
    MOCK_SCHEDULES.push(s)
    return s
  }
  const { url, deviceId } = await base()
  const res = await safeFetch(`${url}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, time }),
  })
  return (await readJson<Schedule>(res)).data
}

export async function updateSchedule(
  id: string,
  updates: { time?: string; enabled?: boolean }
): Promise<Schedule | null> {
  if (USE_MOCK) {
    const idx = MOCK_SCHEDULES.findIndex((s) => s.id === id)
    if (idx === -1) return null
    MOCK_SCHEDULES[idx] = { ...MOCK_SCHEDULES[idx], ...updates }
    return MOCK_SCHEDULES[idx]
  }
  const { url } = await base()
  const res = await safeFetch(`${url}/api/schedule/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return (await readJson<Schedule>(res)).data
}

export async function deleteSchedule(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const idx = MOCK_SCHEDULES.findIndex((s) => s.id === id)
    if (idx !== -1) MOCK_SCHEDULES.splice(idx, 1)
    return true
  }
  const { url } = await base()
  const res = await safeFetch(`${url}/api/schedule/${id}`, { method: 'DELETE' })
  return res?.ok ?? false
}
