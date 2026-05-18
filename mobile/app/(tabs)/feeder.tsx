import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Fish, Sun, Moon, Wifi, Plus, Trash2, Droplets, Clock3, RefreshCw } from 'lucide-react-native'
import {
  triggerFeed,
  getSchedulesResult,
  addSchedule,
  clearSchedules,
  syncDeviceTime,
  getLatestReading,
  type Schedule,
} from '../../lib/api'

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTimeParts(hhmm: string): { time: string; period: string } {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  const full = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
  const parts = full.split(' ')
  return { time: parts[0] ?? hhmm, period: parts[1] ?? '' }
}

function scheduleIconProps(hhmm: string) {
  const h = parseInt(hhmm.split(':')[0], 10)
  return h >= 6 && h < 18
    ? { Icon: Sun, bg: 'rgba(251,191,36,0.15)', color: '#D97706' }
    : { Icon: Moon, bg: 'rgba(99,102,241,0.13)', color: '#6366F1' }
}

// ─── Schedule row ─────────────────────────────────────────────────────────────
function ScheduleRow({
  schedule,
}: {
  schedule: Schedule
}) {
  const { Icon, bg, color } = scheduleIconProps(schedule.time)
  const { time, period } = fmtTimeParts(schedule.time)
  return (
    <View style={[styles.scheduleCard, SHADOW]}>
      <View style={[styles.scheduleIconCircle, { backgroundColor: bg }]}>
        <Icon size={18} color={color} strokeWidth={1.8} />
      </View>
      <View style={styles.scheduleCenter}>
        <View style={styles.scheduleTimeRow}>
          <Text style={[styles.scheduleTime, !schedule.enabled && styles.disabledText]}>{time}</Text>
          <Text style={[styles.schedulePeriod, !schedule.enabled && styles.disabledText]}> {period}</Text>
        </View>
        <View style={styles.schedulePills}>
          <View style={styles.pillTeal}><Text style={styles.pillTealText}>DAILY</Text></View>
          <View style={styles.pillGray}><Text style={styles.pillGrayText}>1X PORTION</Text></View>
        </View>
      </View>
      <View style={styles.scheduleRight}>
        <View style={styles.activePill}><Text style={styles.activePillText}>ACTIVE</Text></View>
      </View>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function FeederScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [feeding, setFeeding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [foodLevel, setFoodLevel] = useState<number | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState(new Date())

  const scaleAnim = useRef(new Animated.Value(1)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulseAnim])

  const loadData = useCallback(async () => {
    const [sched, reading] = await Promise.all([getSchedulesResult(), getLatestReading()])
    setSchedules(sched.data ?? [])
    setScheduleError(sched.error)
    if (reading) setFoodLevel(reading.food_level)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  async function handleFeedNow() {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
    ]).start()
    setFeeding(true)
    const result = await triggerFeed()
    setFeeding(false)
    Alert.alert(
      result.success ? 'Feeding!' : 'Error',
      result.success ? 'The feeder will dispense food shortly.' : (result.error ?? 'Could not reach feeder.')
    )
  }

  async function onPickerChange(_: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowPicker(false)
    if (date) {
      setPickerDate(date)
      if (Platform.OS === 'android') await handleAdd(date)
    }
  }

  async function handleAdd(date = pickerDate) {
    if (Platform.OS === 'ios') setShowPicker(false)
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    const s = await addSchedule(`${h}:${m}`)
    if (s) setSchedules(p => [...p, s])
  }

  function handleClearSchedules() {
    Alert.alert('Clear schedules?', 'This removes every feeding schedule from the ESP32.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          if (await clearSchedules()) setSchedules([])
        },
      },
    ])
  }

  async function handleSyncTime() {
    setSyncing(true)
    const result = await syncDeviceTime()
    setSyncing(false)
    Alert.alert(result.success ? 'Time synced' : 'Sync failed', result.success ? 'Device clock now matches this phone.' : (result.error ?? 'Could not reach device.'))
    if (result.success) await loadData()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
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

        <View style={[styles.commandCard, SHADOW]}>
          <View style={styles.commandTop}>
            <View>
              <Text style={styles.commandEyebrow}>FEEDER CONTROL</Text>
              <Text style={styles.pageTitle}>Instant Nourishment</Text>
              <Text style={styles.pageSubtitle}>Dispense one standard portion.</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshMini} activeOpacity={0.75}>
              <RefreshCw size={15} color={TEAL} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.scanBtnDisabled]}
            onPress={handleSyncTime}
            disabled={syncing}
            activeOpacity={0.8}
          >
            <Clock3 size={15} color={TEAL} strokeWidth={2.2} />
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing time...' : 'Sync Device Time'}</Text>
          </TouchableOpacity>

          <View style={styles.feedCenter}>
            <Animated.View style={[styles.feedGlow, { transform: [{ scale: pulseAnim }] }]} />
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity onPress={handleFeedNow} disabled={feeding} activeOpacity={0.88}>
                <LinearGradient
                  colors={feeding ? ['#5BA8B5', '#3D7A88'] : ['#1B8FA3', '#0A6273']}
                  style={styles.feedBtn}
                >
                  <Fish size={34} color="rgba(255,255,255,0.95)" strokeWidth={1.5} />
                  <Text style={styles.feedBtnLabel}>{feeding ? 'Feeding...' : 'Feed Now'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>PORTION</Text>
              <Text style={styles.infoValue}>Standard</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>STATUS</Text>
              <View style={styles.statusDot}>
                <View style={[styles.dot, { backgroundColor: feeding ? '#FF9500' : '#34C759' }]} />
                <Text style={[styles.infoValue, { color: feeding ? '#FF9500' : '#34C759' }]}>
                  {feeding ? 'Feeding' : 'Ready'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Schedules header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Feeding Schedules</Text>
            <Text style={styles.sectionSubtitle}>Automated routines for your sanctuary</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowPicker(p => !p)}
            activeOpacity={0.75}
          >
            <Plus size={13} color={TEAL} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>Add Schedule</Text>
          </TouchableOpacity>
          {schedules.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClearSchedules}
              activeOpacity={0.75}
            >
              <Trash2 size={13} color="rgba(255,59,48,0.75)" strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>

        {/* Time picker */}
        {showPicker && (
          <View style={[styles.pickerCard, SHADOW]}>
            <DateTimePicker
              value={pickerDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickerChange}
              themeVariant="light"
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.confirmBtn} onPress={() => handleAdd()} activeOpacity={0.8}>
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Schedule list */}
        {scheduleError ? (
          <View style={[styles.emptyCard, SHADOW]}>
            <Text style={styles.emptyText}>Could not load schedules</Text>
            <Text style={styles.emptyHint}>{scheduleError}</Text>
          </View>
        ) : schedules.length === 0 ? (
          <View style={[styles.emptyCard, SHADOW]}>
            <Text style={styles.emptyText}>No schedules yet</Text>
            <Text style={styles.emptyHint}>Create a daily routine for consistent feeding.</Text>
            <TouchableOpacity style={styles.emptyAction} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
              <Clock3 size={14} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.emptyActionText}>Add first schedule</Text>
            </TouchableOpacity>
          </View>
        ) : (
          schedules.map(s => (
            <ScheduleRow
              key={s.id}
              schedule={s}
            />
          ))
        )}

        {/* Bottom stats */}
        <View style={styles.bottomRow}>
          <View style={[styles.bottomCard, SHADOW]}>
            <Text style={styles.bottomLabel}>FOOD LEVEL</Text>
            <Text style={styles.bottomValue}>
              {foodLevel !== null ? `${Math.round(foodLevel)}%` : '—'}
            </Text>
            {foodLevel !== null && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(foodLevel, 100)}%` as any }]} />
              </View>
            )}
          </View>
          <View style={[styles.bottomCard, SHADOW]}>
            <Text style={styles.bottomLabel}>SCHEDULES</Text>
            <Text style={styles.bottomValue}>{schedules.length}</Text>
            <Text style={styles.bottomHint}>{schedules.filter(s => s.enabled).length} active</Text>
          </View>
        </View>
      </ScrollView>
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

  commandCard: { backgroundColor: CARD, borderRadius: 22, padding: 18, marginBottom: 26 },
  commandTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  commandEyebrow: { fontSize: 10, color: TEXT_LIGHT, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: TEXT_DARK, marginBottom: 5, letterSpacing: 0.1 },
  pageSubtitle: { fontSize: 13, color: TEXT_MID, lineHeight: 19 },
  refreshMini: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(10,123,142,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,123,142,0.1)',
    borderRadius: 12,
    paddingVertical: 11,
  },
  scanBtnDisabled: { opacity: 0.65 },
  syncBtnText: { color: TEAL, fontSize: 13, fontWeight: '800' },

  feedCenter: { alignItems: 'center', marginTop: 22, marginBottom: 22 },
  feedGlow: {
    position: 'absolute',
    width: 210, height: 210, borderRadius: 105,
    backgroundColor: 'rgba(10,123,142,0.1)',
    top: -25,
  },
  feedBtn: {
    width: 160, height: 160, borderRadius: 80,
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    shadowColor: TEAL, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  feedBtnLabel: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F7FAFC', borderRadius: 16,
    paddingVertical: 16,
  },
  infoCell: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: TEXT_LIGHT, letterSpacing: 0.8, marginBottom: 4 },
  infoValue: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  infoDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: 'rgba(0,0,0,0.1)' },
  statusDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: TEXT_DARK },
  sectionSubtitle: { fontSize: 12, color: TEXT_MID, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: CARD,
    borderWidth: 1.5, borderColor: TEAL,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: TEAL },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,59,48,0.25)',
  },

  pickerCard: { backgroundColor: CARD, borderRadius: 18, marginBottom: 12, overflow: 'hidden' },
  confirmBtn: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: TEAL, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  scheduleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 16,
    padding: 14, marginBottom: 10,
  },
  scheduleIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scheduleCenter: { flex: 1 },
  scheduleTimeRow: { flexDirection: 'row', alignItems: 'baseline' },
  scheduleTime: { fontSize: 22, fontWeight: '700', color: TEXT_DARK },
  schedulePeriod: { fontSize: 13, fontWeight: '600', color: TEXT_MID },
  disabledText: { color: TEXT_LIGHT },
  schedulePills: { flexDirection: 'row', gap: 6, marginTop: 5 },
  pillTeal: {
    backgroundColor: 'rgba(10,123,142,0.1)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  pillTealText: { fontSize: 10, fontWeight: '700', color: TEAL, letterSpacing: 0.4 },
  pillGray: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  pillGrayText: { fontSize: 10, fontWeight: '700', color: TEXT_MID, letterSpacing: 0.4 },
  scheduleRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activePill: { backgroundColor: 'rgba(52,199,89,0.12)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  activePillText: { color: '#1A8C3E', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 28,
    alignItems: 'center', marginBottom: 10,
  },
  emptyText: { fontSize: 15, fontWeight: '600', color: TEXT_DARK, marginBottom: 4 },
  emptyHint: { fontSize: 13, color: TEXT_MID, textAlign: 'center', lineHeight: 18 },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  emptyActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  bottomRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  bottomCard: { flex: 1, backgroundColor: CARD, borderRadius: 16, padding: 16 },
  bottomLabel: { fontSize: 10, fontWeight: '700', color: TEXT_LIGHT, letterSpacing: 0.8, marginBottom: 6 },
  bottomValue: { fontSize: 22, fontWeight: '700', color: TEXT_DARK, marginBottom: 8 },
  bottomHint: { fontSize: 12, color: TEXT_MID },
  progressTrack: { height: 5, backgroundColor: '#E0EBF0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: TEAL, borderRadius: 3 },
})
