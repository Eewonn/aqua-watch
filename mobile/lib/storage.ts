import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const KEYS = {
  DEVICE_URL: 'deviceUrl',
  WIFI_SSID: 'wifiSsid',
  WIFI_PASSWORD: 'wifiPassword',
  DEVICE_SETUP_URL: 'deviceSetupUrl',
  DARK_MODE: 'darkMode',
  ALERTS_ENABLED: 'alertsEnabled',
} as const

const DEFAULTS = {
  DEVICE_URL: String(Constants.expoConfig?.extra?.deviceUrl ?? ''),
  WIFI_SSID: String(Constants.expoConfig?.extra?.wifiSsid ?? ''),
  WIFI_PASSWORD: String(Constants.expoConfig?.extra?.wifiPassword ?? ''),
  DEVICE_SETUP_URL: String(Constants.expoConfig?.extra?.deviceSetupUrl ?? 'http://192.168.4.1'),
}

export async function getDeviceUrl(): Promise<string> {
  const value = await AsyncStorage.getItem(KEYS.DEVICE_URL)
  return normalizeUrl(value ?? DEFAULTS.DEVICE_URL)
}

export async function setDeviceUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEVICE_URL, normalizeUrl(url))
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

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
