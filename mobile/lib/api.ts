import { getDeviceUrl, setDeviceUrl } from './storage'

export const USE_MOCK = false
export const DEVICE_PORT = 8020

export interface DeviceSchedule {
  hour: number
  minute: number
}

export interface DeviceStatus {
  time: string
  weight: number
  level: 'LOW' | 'MEDIUM' | 'HIGH' | string
  ph: number
  safety: 'SAFE' | 'UNSAFE' | string
  schedule: DeviceSchedule[]
}

export interface Reading {
  id: string
  device_id: string
  ph: number
  weight: number
  level: string
  safety: string
  food_level: number
  created_at: string
}

export interface Schedule {
  id: string
  time: string
  enabled: boolean
  created_at: string
}

interface ApiResult<T> {
  data: T | null
  error: string | null
}

const DISCOVERY_HOSTS = [
  'http://feeding-nimo.local:8020',
  ...range('192.168.1'),
  ...range('192.168.0'),
  ...range('10.0.0'),
]

let readingHistory: Reading[] = []

function range(prefix: string): string[] {
  return Array.from({ length: 253 }, (_, i) => `http://${prefix}.${i + 2}:${DEVICE_PORT}`)
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

async function safeFetch(url: string, timeoutMs = 2500): Promise<Response | null> {
  try {
    return await fetch(url, { signal: withTimeout(timeoutMs) })
  } catch {
    return null
  }
}

async function readError(res: Response | null): Promise<string> {
  if (!res) return 'Could not reach Feeding Nimo on the local network.'
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // Fall through to status message.
  }
  return `Device request failed with status ${res.status}.`
}

function statusToReading(status: DeviceStatus, deviceUrl: string): Reading {
  const foodLevel = status.level === 'HIGH' ? 90 : status.level === 'MEDIUM' ? 55 : 15
  return {
    id: String(Date.now()),
    device_id: deviceUrl,
    ph: Number(status.ph) || 0,
    weight: Number(status.weight) || 0,
    level: String(status.level ?? 'LOW'),
    safety: String(status.safety ?? 'UNSAFE'),
    food_level: foodLevel,
    created_at: new Date().toISOString(),
  }
}

function schedulesFromStatus(status: DeviceStatus): Schedule[] {
  return (Array.isArray(status.schedule) ? status.schedule : []).map((item, index) => ({
    id: `${item.hour}:${item.minute}:${index}`,
    time: `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`,
    enabled: true,
    created_at: new Date().toISOString(),
  }))
}

async function getStatusFrom(url: string): Promise<ApiResult<DeviceStatus>> {
  const res = await safeFetch(`${url}/status`)
  if (!res?.ok) return { data: null, error: await readError(res) }
  try {
    const data = await res.json() as DeviceStatus
    if (typeof data.time !== 'string' || typeof data.ph !== 'number' || !Array.isArray(data.schedule)) {
      return { data: null, error: 'Device returned invalid status data.' }
    }
    return { data, error: null }
  } catch {
    return { data: null, error: 'Device returned invalid JSON.' }
  }
}

async function requireDeviceUrl(): Promise<ApiResult<string>> {
  const url = await getDeviceUrl()
  if (!url) return { data: null, error: 'Run hardware scan in Settings first.' }
  return { data: url, error: null }
}

export async function discoverDevice(onProgress?: (checked: number) => void): Promise<ApiResult<string>> {
  const saved = await getDeviceUrl()
  const candidates = saved ? [saved, ...DISCOVERY_HOSTS.filter((url) => url !== saved)] : DISCOVERY_HOSTS
  let checked = 0

  for (let i = 0; i < candidates.length; i += 24) {
    const chunk = candidates.slice(i, i + 24)
    const results = await Promise.all(chunk.map(async (url) => {
      const status = await getStatusFrom(url)
      return status.data ? url : null
    }))
    checked += chunk.length
    onProgress?.(checked)
    const found = results.find(Boolean)
    if (found) {
      await setDeviceUrl(found)
      return { data: found, error: null }
    }
  }

  return { data: null, error: 'No Feeding Nimo device found on common local subnets.' }
}

export async function getLatestReading(): Promise<Reading | null> {
  const result = await getLatestReadingResult()
  return result.data
}

export async function getLatestReadingResult(): Promise<ApiResult<Reading>> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return { data: null, error: deviceUrl.error }

  const result = await getStatusFrom(deviceUrl.data)
  if (!result.data) return { data: null, error: result.error }

  const reading = statusToReading(result.data, deviceUrl.data)
  readingHistory = [...readingHistory, reading].slice(-50)
  return { data: reading, error: null }
}

export async function getReadingHistory(limit = 50): Promise<Reading[]> {
  const result = await getReadingHistoryResult(limit)
  return result.data ?? []
}

export async function getReadingHistoryResult(limit = 50): Promise<ApiResult<Reading[]>> {
  const latest = await getLatestReadingResult()
  if (latest.error && readingHistory.length === 0) return { data: null, error: latest.error }
  return { data: readingHistory.slice(-limit), error: null }
}

export async function triggerFeed(): Promise<{ success: boolean; error?: string }> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return { success: false, error: deviceUrl.error ?? undefined }

  const res = await safeFetch(`${deviceUrl.data}/feed`)
  if (!res?.ok) return { success: false, error: await readError(res) }
  return { success: true }
}

export async function getSchedules(): Promise<Schedule[]> {
  const result = await getSchedulesResult()
  return result.data ?? []
}

export async function getSchedulesResult(): Promise<ApiResult<Schedule[]>> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return { data: null, error: deviceUrl.error }

  const result = await getStatusFrom(deviceUrl.data)
  if (!result.data) return { data: null, error: result.error }
  return { data: schedulesFromStatus(result.data), error: null }
}

export async function addSchedule(time: string): Promise<Schedule | null> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return null

  const [hour, minute] = time.split(':').map(Number)
  const res = await safeFetch(`${deviceUrl.data}/schedule?hour=${hour}&minute=${minute}`)
  if (!res?.ok) return null
  return { id: `${hour}:${minute}:${Date.now()}`, time, enabled: true, created_at: new Date().toISOString() }
}

export async function clearSchedules(): Promise<boolean> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return false

  const res = await safeFetch(`${deviceUrl.data}/schedule?clear=1`)
  return res?.ok ?? false
}

export async function syncDeviceTime(date = new Date()): Promise<{ success: boolean; error?: string }> {
  const deviceUrl = await requireDeviceUrl()
  if (!deviceUrl.data) return { success: false, error: deviceUrl.error ?? undefined }

  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  const res = await safeFetch(`${deviceUrl.data}/settime?hour=${hour}&minute=${minute}&second=${second}`)
  if (!res?.ok) return { success: false, error: await readError(res) }
  return { success: true }
}
