import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const KEYS = {
  API_URL: 'apiUrl',
  DEVICE_ID: 'deviceId',
  WIFI_SSID: 'wifiSsid',
  WIFI_PASSWORD: 'wifiPassword',
  DEVICE_SETUP_URL: 'deviceSetupUrl',
  DARK_MODE: 'darkMode',
  ALERTS_ENABLED: 'alertsEnabled',
  TEMP_UNIT: 'tempUnit',
} as const

const DEFAULTS = {
  API_URL: String(Constants.expoConfig?.extra?.apiUrl ?? 'https://aqua-watch-backend.vercel.app'),
  DEVICE_ID: String(Constants.expoConfig?.extra?.deviceId ?? 'esp32-001'),
  WIFI_SSID: String(Constants.expoConfig?.extra?.wifiSsid ?? ''),
  WIFI_PASSWORD: String(Constants.expoConfig?.extra?.wifiPassword ?? ''),
  DEVICE_SETUP_URL: String(Constants.expoConfig?.extra?.deviceSetupUrl ?? 'http://192.168.4.1'),
}

export async function getApiUrl(): Promise<string> {
  const value = await AsyncStorage.getItem(KEYS.API_URL)
  return normalizeUrl(value ?? DEFAULTS.API_URL)
}
export async function setApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.API_URL, normalizeUrl(url))
}
export async function getDeviceId(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.DEVICE_ID)) ?? DEFAULTS.DEVICE_ID
}
export async function setDeviceId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEVICE_ID, id)
}
export async function getWifiSsid(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.WIFI_SSID)) ?? DEFAULTS.WIFI_SSID
}
export async function setWifiSsid(ssid: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.WIFI_SSID, ssid.trim())
}
export async function getWifiPassword(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.WIFI_PASSWORD)) ?? DEFAULTS.WIFI_PASSWORD
}
export async function setWifiPassword(password: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.WIFI_PASSWORD, password)
}
export async function getDeviceSetupUrl(): Promise<string> {
  const value = await AsyncStorage.getItem(KEYS.DEVICE_SETUP_URL)
  return normalizeUrl(value ?? DEFAULTS.DEVICE_SETUP_URL)
}
export async function setDeviceSetupUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEVICE_SETUP_URL, normalizeUrl(url))
}
export async function getDarkMode(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.DARK_MODE)
  return val === null ? false : val === 'true'
}
export async function setDarkMode(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.DARK_MODE, String(v))
}
export async function getAlertsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ALERTS_ENABLED)
  return val === null ? true : val === 'true'
}
export async function setAlertsEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.ALERTS_ENABLED, String(v))
}
export async function getTempUnit(): Promise<'celsius' | 'fahrenheit'> {
  const val = await AsyncStorage.getItem(KEYS.TEMP_UNIT)
  return val === 'fahrenheit' ? 'fahrenheit' : 'celsius'
}
export async function setTempUnit(v: 'celsius' | 'fahrenheit'): Promise<void> {
  await AsyncStorage.setItem(KEYS.TEMP_UNIT, v)
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
