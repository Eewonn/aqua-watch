import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Droplets, Wifi, Moon, Bell, Sliders, Info, RefreshCw, Lock, Unlock, CheckCircle2, AlertCircle } from 'lucide-react-native'
import {
  getWifiSsid, setWifiSsid,
  getWifiPassword, setWifiPassword,
  getDeviceSetupUrl,
  getDarkMode, setDarkMode,
  getAlertsEnabled, setAlertsEnabled,
} from '../../lib/storage'
import { discoverDevice, USE_MOCK } from '../../lib/api'

// ─── Tokens ──────────────────────────────────────────────────────────────────
const BG = '#EEF3F8'
const TEAL = '#0A7B8E'
const CARD = '#FFFFFF'
const TEXT_DARK = '#0D1B2A'
const TEXT_MID = '#6B7E92'
const TEXT_LIGHT = '#AAB8C7'
const SHADOW = {
  shadowColor: '#1A4A5A',
  shadowOpacity: 0.09,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const

interface WifiNetwork {
  ssid: string
  rssi: number
  secure: boolean
}

// ─── Pref row ─────────────────────────────────────────────────────────────────
function PrefRow({
  Icon, iconBg, iconColor, label, subtitle, right, last,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>
  iconBg: string
  iconColor: string
  label: string
  subtitle: string
  right: React.ReactNode
  last?: boolean
}) {
  return (
    <View>
      <View style={styles.prefRow}>
        <View style={[styles.prefIcon, { backgroundColor: iconBg }]}>
          <Icon size={16} color={iconColor} strokeWidth={2} />
        </View>
        <View style={styles.prefText}>
          <Text style={styles.prefLabel}>{label}</Text>
          <Text style={styles.prefSubtitle}>{subtitle}</Text>
        </View>
        {right}
      </View>
      {!last && <View style={styles.rowDivider} />}
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const [wifiSsid, setWifiSsidState] = useState('')
  const [wifiPassword, setWifiPasswordState] = useState('')
  const [deviceSetupUrl, setDeviceSetupUrlState] = useState('http://192.168.4.1')
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [hardwareScanning, setHardwareScanning] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'idle' | 'ready' | 'error' | 'saved'>('idle')
  const [setupMessage, setSetupMessage] = useState('Waiting for device setup connection')
  const [darkMode, setDarkModeState] = useState(false)
  const [alerts, setAlertsState] = useState(true)
  const [focused, setFocused] = useState<string | null>(null)
  const savedOpacity = useRef(new Animated.Value(0)).current
  const canConfigure = Boolean(wifiSsid.trim() && !provisioning)
  const setupStatusColor =
    setupStatus === 'ready' || setupStatus === 'saved' ? '#1A8C3E'
    : setupStatus === 'error' ? '#C2410C'
    : TEXT_MID

  useEffect(() => {
    Promise.all([
      getWifiSsid(), getWifiPassword(), getDeviceSetupUrl(), getDarkMode(), getAlertsEnabled(),
    ]).then(([ssid, password, setupUrl, dm, al]) => {
      setWifiSsidState(ssid)
      setWifiPasswordState(password)
      setDeviceSetupUrlState(setupUrl)
      setDarkModeState(dm)
      setAlertsState(al)
    })
  }, [])

  async function handleSave() {
    await Promise.all([
      setWifiSsid(wifiSsid.trim()),
      setWifiPassword(wifiPassword),
      setDarkMode(darkMode),
      setAlertsEnabled(alerts),
    ])
    Animated.sequence([
      Animated.timing(savedOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(savedOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
  }

  async function handleScanNetworks() {
    setScanning(true)
    setSetupStatus('idle')
    setSetupMessage('Scanning from Feeding Nimo device')
    try {
      const res = await fetch(`${normalizeUrl(deviceSetupUrl)}/networks`)
      if (!res.ok) throw new Error(`Device returned ${res.status}`)
      const data = await res.json()
      const list = Array.isArray(data)
        ? data.filter((item): item is WifiNetwork => (
            item &&
            typeof item.ssid === 'string' &&
            typeof item.rssi === 'number' &&
            typeof item.secure === 'boolean'
          ))
        : []
      setNetworks(list.filter((network) => network.ssid).sort((a, b) => b.rssi - a.rssi))
      setSetupStatus('ready')
      setSetupMessage(list.length ? `${list.length} networks found` : 'No Wi-Fi networks found')
    } catch {
      setSetupStatus('error')
      setSetupMessage('Feeding Nimo Setup is not reachable')
    } finally {
      setScanning(false)
    }
  }

  async function handleProvisionDevice() {
    if (!wifiSsid.trim()) {
      Alert.alert('Choose Wi-Fi', 'Scan and select a Wi-Fi network first.')
      return
    }
    setProvisioning(true)
    try {
      const res = await fetch(`${normalizeUrl(deviceSetupUrl)}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: wifiSsid.trim(),
          password: wifiPassword,
        }),
      })
      if (!res.ok) throw new Error(`Device returned ${res.status}`)
      await handleSave()
      setSetupStatus('saved')
      setSetupMessage('Device settings sent')
      Alert.alert('Device configured', 'Feeding Nimo will reconnect using the selected Wi-Fi network.')
    } catch {
      setSetupStatus('error')
      setSetupMessage('Could not send settings to the device')
    } finally {
      setProvisioning(false)
    }
  }

  async function handleDiscoverHardware() {
    setHardwareScanning(true)
    setSetupStatus('idle')
    setSetupMessage('Scanning local network for Feeding Nimo')
    const result = await discoverDevice((checked) => {
      setSetupMessage(`Checked ${checked} local addresses`)
    })
    setHardwareScanning(false)
    if (result.data) {
      setSetupStatus('saved')
      setSetupMessage('Feeding Nimo hardware found')
      Alert.alert('Hardware found', 'The app is now linked to the local Feeding Nimo device.')
    } else {
      setSetupStatus('error')
      setSetupMessage(result.error ?? 'No hardware found')
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Droplets size={22} color={TEAL} strokeWidth={2} />
              <Text style={styles.appName}>Feeding Nimo</Text>
            </View>
            <Wifi size={18} color={TEXT_MID} strokeWidth={1.8} />
          </View>

          {/* Mock banner */}
          {USE_MOCK && (
            <View style={[styles.mockBanner, SHADOW]}>
              <View style={styles.mockIconWrap}>
                <Info size={16} color={TEAL} strokeWidth={2} />
              </View>
              <View style={styles.mockText}>
                <Text style={styles.mockTitle}>Mock mode is active</Text>
                <Text style={styles.mockSub}>System is currently running on simulated sensor data</Text>
              </View>
            </View>
          )}

          <Text style={styles.pageTitle}>Feeding Nimo Settings</Text>
          <Text style={styles.pageSubtitle}>Pair the device, find the hardware on your network, and tune preferences.</Text>

          {/* Device setup */}
          <View style={styles.sectionHeader}>
            <Wifi size={14} color={TEAL} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Device Setup</Text>
          </View>

          <View style={[styles.formCard, SHADOW]}>
            <View style={styles.setupPanel}>
              <View style={[styles.setupStatusIcon, { backgroundColor: `${setupStatusColor}18` }]}>
                {setupStatus === 'error'
                  ? <AlertCircle size={17} color={setupStatusColor} strokeWidth={2} />
                  : setupStatus === 'saved'
                    ? <CheckCircle2 size={17} color={setupStatusColor} strokeWidth={2} />
                    : <Wifi size={17} color={setupStatusColor} strokeWidth={2} />}
              </View>
              <View style={styles.setupStatusText}>
                <Text style={styles.setupTitle}>Feeding Nimo Setup</Text>
                <Text style={[styles.setupMessage, { color: setupStatusColor }]}>{setupMessage}</Text>
              </View>
            </View>
            <View style={styles.setupSteps}>
              <View style={styles.setupStep}>
                <Text style={styles.stepNumber}>1</Text>
                <Text style={styles.stepText}>Join setup Wi-Fi</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.setupStep}>
                <Text style={[styles.stepNumber, networks.length > 0 && styles.stepNumberActive]}>2</Text>
                <Text style={styles.stepText}>Pick network</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.setupStep}>
                <Text style={[styles.stepNumber, canConfigure && styles.stepNumberActive]}>3</Text>
                <Text style={styles.stepText}>Send settings</Text>
              </View>
            </View>
            <View style={styles.formDivider} />
            <View>
              <View style={styles.scanHeader}>
                <View>
                  <Text style={styles.fieldLabel}>WI-FI NETWORK</Text>
                  <Text style={styles.helperText}>Setup hotspot: Feeding Nimo Setup</Text>
                </View>
                <TouchableOpacity
                  style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
                  onPress={handleScanNetworks}
                  disabled={scanning}
                  activeOpacity={0.75}
                >
                  {scanning
                    ? <ActivityIndicator size="small" color={TEAL} />
                    : <>
                        <RefreshCw size={15} color={TEAL} strokeWidth={2} />
                        <Text style={styles.scanBtnText}>Scan</Text>
                      </>}
                </TouchableOpacity>
              </View>
              {networks.length > 0 && (
                <View style={styles.networkList}>
                  {networks.slice(0, 8).map((network) => {
                    const selected = wifiSsid === network.ssid
                    const SecurityIcon = network.secure ? Lock : Unlock
                    return (
                      <TouchableOpacity
                        key={`${network.ssid}-${network.rssi}`}
                        style={[styles.networkRow, selected && styles.networkRowSelected]}
                        onPress={() => setWifiSsidState(network.ssid)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.networkNameRow}>
                          <SecurityIcon size={12} color={selected ? TEAL : TEXT_LIGHT} strokeWidth={2} />
                          <Text style={[styles.networkName, selected && styles.networkNameSelected]} numberOfLines={1}>
                            {network.ssid}
                          </Text>
                        </View>
                        <Text style={styles.networkSignal}>{network.rssi} dBm</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
              <TextInput
                style={[styles.fieldInput, focused === 'ssid' && styles.fieldInputFocused, { marginTop: networks.length ? 12 : 0 }]}
                value={wifiSsid}
                onChangeText={setWifiSsidState}
                placeholder="Selected Wi-Fi"
                placeholderTextColor={TEXT_LIGHT}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused('ssid')}
                onBlur={() => setFocused(null)}
              />
              {wifiSsid.trim() ? (
                <Text style={styles.selectedHint}>Selected: {wifiSsid.trim()}</Text>
              ) : null}
            </View>
            <View style={styles.formDivider} />
            <View>
              <Text style={styles.fieldLabel}>WI-FI PASSWORD</Text>
              <TextInput
                style={[styles.fieldInput, focused === 'password' && styles.fieldInputFocused]}
                value={wifiPassword}
                onChangeText={setWifiPasswordState}
                placeholder="Network password"
                placeholderTextColor={TEXT_LIGHT}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.provisionBtn, SHADOW, !canConfigure && styles.provisionBtnDisabled]}
            onPress={handleProvisionDevice}
            disabled={!canConfigure}
            activeOpacity={0.85}
          >
            {provisioning
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.provisionBtnText}>{canConfigure ? 'Configure Feeding Nimo Device' : 'Complete Device Setup Fields'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, SHADOW, hardwareScanning && styles.scanBtnDisabled]}
            onPress={handleDiscoverHardware}
            disabled={hardwareScanning}
            activeOpacity={0.85}
          >
            {hardwareScanning
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.saveBtnText}>Scan for Hardware</Text>}
          </TouchableOpacity>

          {/* App Preferences */}
          <View style={styles.sectionHeader}>
            <Sliders size={14} color={TEAL} strokeWidth={2} />
            <Text style={styles.sectionTitle}>App Preferences</Text>
          </View>

          <View style={[styles.prefCard, SHADOW]}>
            <PrefRow
              Icon={Moon}
              iconBg="rgba(99,102,241,0.13)"
              iconColor="#6366F1"
              label="Dark Mode"
              subtitle="Switch between light and dark theme"
              right={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkModeState}
                  trackColor={{ false: 'rgba(120,120,128,0.2)', true: TEAL }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="rgba(120,120,128,0.2)"
                />
              }
            />
            <PrefRow
              Icon={Bell}
              iconBg="rgba(10,123,142,0.12)"
              iconColor={TEAL}
              label="Critical Alerts"
              subtitle="Notify when water parameters are out of range"
              last
              right={
                <Switch
                  value={alerts}
                  onValueChange={setAlertsState}
                  trackColor={{ false: 'rgba(120,120,128,0.2)', true: TEAL }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="rgba(120,120,128,0.2)"
                />
              }
            />
          </View>

          {/* Save button */}
          <TouchableOpacity style={[styles.saveBtn, SHADOW]} onPress={handleSave} activeOpacity={0.85}>
            <Animated.Text style={[styles.saveBtnText, {
              opacity: savedOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            }]}>
              Save Settings
            </Animated.Text>
            <Animated.Text style={[styles.savedText, { opacity: savedOpacity, position: 'absolute' }]}>
              Saved ✓
            </Animated.Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Feeding Nimo v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appName: { fontSize: 17, fontWeight: '700', color: TEXT_DARK, letterSpacing: 0.2 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: TEXT_DARK, marginBottom: 5, letterSpacing: 0.1 },
  pageSubtitle: { fontSize: 13, color: TEXT_MID, lineHeight: 19, marginBottom: 20 },

  mockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(10,123,142,0.1)',
    borderRadius: 14, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(10,123,142,0.2)',
  },
  mockIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(10,123,142,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  mockText: { flex: 1 },
  mockTitle: { fontSize: 13, fontWeight: '700', color: TEAL, marginBottom: 2 },
  mockSub: { fontSize: 12, color: TEXT_MID, lineHeight: 17 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, letterSpacing: 0.2 },

  formCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 24 },
  formDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: TEXT_LIGHT, letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: {
    fontSize: 15, color: TEXT_DARK, fontWeight: '400',
    backgroundColor: '#F5F8FA', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  fieldInputFocused: { borderColor: TEAL, backgroundColor: 'rgba(10,123,142,0.04)' },
  helperText: { fontSize: 11, color: TEXT_MID, marginTop: 2 },
  selectedHint: { fontSize: 11, color: TEAL, marginTop: 7, fontWeight: '700' },
  setupPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: 'rgba(10,123,142,0.08)',
  },
  setupStatusIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupStatusText: { flex: 1 },
  setupTitle: { fontSize: 14, fontWeight: '800', color: TEXT_DARK, marginBottom: 2 },
  setupMessage: { fontSize: 12, fontWeight: '700' },
  setupSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  setupStep: { width: 78, alignItems: 'center', gap: 6 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
    backgroundColor: '#E7EEF5',
    color: TEXT_MID,
    fontSize: 12,
    fontWeight: '800',
  },
  stepNumberActive: { backgroundColor: TEAL, color: '#FFFFFF' },
  stepText: { fontSize: 10, color: TEXT_MID, fontWeight: '700', textAlign: 'center' },
  stepLine: { flex: 1, height: 1, backgroundColor: '#DDE8F0', marginBottom: 20 },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  scanBtn: {
    minWidth: 76,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(10,123,142,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  scanBtnDisabled: { opacity: 0.65 },
  scanBtnText: { fontSize: 12, color: TEAL, fontWeight: '800' },
  networkList: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FBFD',
  },
  networkRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  networkRowSelected: { backgroundColor: 'rgba(10,123,142,0.1)' },
  networkNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  networkName: { flex: 1, fontSize: 13, color: TEXT_DARK, fontWeight: '600' },
  networkNameSelected: { color: TEAL },
  networkSignal: { fontSize: 11, color: TEXT_MID, fontWeight: '600' },

  prefCard: { backgroundColor: CARD, borderRadius: 16, marginBottom: 24, overflow: 'hidden' },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  prefIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1 },
  prefLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK, marginBottom: 2 },
  prefSubtitle: { fontSize: 11, color: TEXT_MID, lineHeight: 15 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginLeft: 64 },

  saveBtn: {
    backgroundColor: TEAL, borderRadius: 16,
    paddingVertical: 17, alignItems: 'center',
    justifyContent: 'center', marginBottom: 20,
  },
  provisionBtn: {
    backgroundColor: '#0D1B2A',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
    marginBottom: 24,
  },
  provisionBtnDisabled: { backgroundColor: '#8BA0B4' },
  provisionBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  savedText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  footer: { textAlign: 'center', fontSize: 11, color: TEXT_LIGHT, letterSpacing: 0.3 },
})

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
