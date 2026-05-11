import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, G } from 'react-native-svg'
import { Droplets, FlaskConical, Droplet, Box, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react-native'
import { getLatestReadingResult, type Reading } from '../../lib/api'
import { phStatus, tdsStatus, foodStatus } from '../../constants/ranges'
import type { RangeStatus } from '../../constants/ranges'

// ─── Tokens ──────────────────────────────────────────────────────────────────
const BG = '#EEF3F8'
const TEAL = '#0A7B8E'
const CARD = '#FFFFFF'
const TEXT_DARK = '#0D1B2A'
const TEXT_MID = '#6B7E92'
const TEXT_LIGHT = '#AAB8C7'
const ORANGE = '#FF9500'
const RED = '#FF3B30'
const GREEN = '#34C759'
const SHADOW = {
  shadowColor: '#1A4A5A',
  shadowOpacity: 0.09,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const
const OFFLINE_MS = 10 * 60 * 1000

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusColor(s: RangeStatus): string {
  return s === 'good' ? TEAL : s === 'warning' ? ORANGE : RED
}

function phSubtitle(ph: number, s: RangeStatus): string {
  if (s === 'good') return ph < 7.2 ? 'Slightly Acidic' : ph > 7.8 ? 'Slightly Alkaline' : 'Neutral Balance'
  if (s === 'warning') return ph < 7 ? 'Acidic Levels' : 'Alkaline Levels'
  return 'Critical pH Level'
}

function tdsSubtitle(tds: number, s: RangeStatus): string {
  if (s === 'good') return tds < 200 ? 'Ultra Pure Water' : tds < 400 ? 'Clear Clarity' : 'Good Clarity'
  if (s === 'warning') return 'Moderate Minerals'
  return 'High Mineral Content'
}

function foodSubtitle(food: number): string {
  if (food >= 70) return 'Well stocked'
  if (food >= 50) return 'Good supply'
  if (food >= 20) return 'Refill soon'
  return 'Urgent: Refill needed'
}

// ─── Ring gauge ──────────────────────────────────────────────────────────────
const RS = 72, RR = 28, RC = RS / 2
const RCIRC = 2 * Math.PI * RR

function CardRing({ fill, color, Icon }: { fill: number; color: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }) {
  const dash = Math.min(Math.max(fill, 0), 1) * RCIRC
  return (
    <View style={{ width: RS, height: RS, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RS} height={RS} style={StyleSheet.absoluteFill}>
        <G rotation={-90} originX={RC} originY={RC}>
          <Circle cx={RC} cy={RC} r={RR} strokeWidth={5} stroke="#DDE8F0" fill="none" />
          <Circle cx={RC} cy={RC} r={RR} strokeWidth={5} stroke={color} fill="none"
            strokeDasharray={[dash, RCIRC]} strokeLinecap="round" />
        </G>
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={color} strokeWidth={1.5} />
      </View>
    </View>
  )
}

// ─── Sensor card ─────────────────────────────────────────────────────────────
function SensorCard({ label, value, unit, subtitle, fill, color, Icon }: {
  label: string
  value: string
  unit?: string
  subtitle: string
  fill: number
  color: string
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>
}) {
  return (
    <View style={[styles.sensorCard, SHADOW]}>
      <View style={styles.sensorInner}>
        <View style={styles.sensorLeft}>
          <Text style={[styles.sensorLabel, { color }]}>{label}</Text>
          <View style={styles.sensorValueRow}>
            <Text style={styles.sensorValue}>{value}</Text>
            {unit ? <Text style={styles.sensorUnit}>{unit}</Text> : null}
          </View>
          <Text style={styles.sensorSubtitle}>{subtitle}</Text>
        </View>
        <CardRing fill={fill} color={color} Icon={Icon} />
      </View>
    </View>
  )
}

// ─── Quality index ────────────────────────────────────────────────────────────
function QualityCard({ reading }: { reading: Reading }) {
  const phS = phStatus(reading.ph)
  const tdsS = tdsStatus(reading.tds)
  const overall =
    phS === 'danger' || tdsS === 'danger' ? 'danger'
    : phS === 'warning' || tdsS === 'warning' ? 'warning'
    : 'good'
  const word = overall === 'good' ? 'Optimal' : overall === 'warning' ? 'Monitor' : 'Critical'
  const desc =
    overall === 'good' ? 'Biological ecosystem is thriving'
    : overall === 'warning' ? 'Some parameters need attention'
    : 'Immediate action required'

  return (
    <LinearGradient colors={['#0A5F72', '#074858']} style={styles.qualityCard}>
      <Text style={styles.qualityBadge}>QUALITY INDEX</Text>
      <Text style={styles.qualityWord}>{word}</Text>
      <Text style={styles.qualityDesc}>{desc}</Text>
      <View style={styles.qualitySep} />
      <View style={styles.qualityRow}>
        <View style={styles.qualityStat}>
          <Text style={styles.qualityStatLabel}>PH LEVEL</Text>
          <Text style={styles.qualityStatValue}>{reading.ph.toFixed(1)}</Text>
        </View>
        <View style={styles.qualityDivider} />
        <View style={styles.qualityStat}>
          <Text style={styles.qualityStatLabel}>TDS</Text>
          <Text style={styles.qualityStatValue}>{Math.round(reading.tds)} ppm</Text>
        </View>
      </View>
    </LinearGradient>
  )
}

function SummaryStrip({ reading, online, lastTime }: { reading: Reading; online: boolean; lastTime: string | null }) {
  const food = Math.round(reading.food_level)
  return (
    <View style={[styles.summaryCard, SHADOW]}>
      <View style={styles.summaryTop}>
        <View>
          <Text style={styles.summaryEyebrow}>SYSTEM STATE</Text>
          <Text style={styles.summaryTitle}>{online ? 'Live monitoring' : 'Needs attention'}</Text>
        </View>
        <View style={[styles.summaryPill, { backgroundColor: online ? 'rgba(52,199,89,0.14)' : 'rgba(255,149,0,0.14)' }]}>
          <View style={[styles.onlineDot, { backgroundColor: online ? GREEN : ORANGE }]} />
          <Text style={[styles.summaryPillText, { color: online ? '#1A8C3E' : '#B45309' }]}>
            {online ? 'ONLINE' : 'STALE'}
          </Text>
        </View>
      </View>
      <View style={styles.summaryMetrics}>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>pH</Text>
          <Text style={styles.summaryValue}>{reading.ph.toFixed(1)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>TDS</Text>
          <Text style={styles.summaryValue}>{Math.round(reading.tds)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>Food</Text>
          <Text style={styles.summaryValue}>{food}%</Text>
        </View>
      </View>
      {lastTime && <Text style={styles.summaryFoot}>Last update {lastTime}</Text>}
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [reading, setReading] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  const load = useCallback(async () => {
    const result = await getLatestReadingResult()
    setReading(result.data)
    setError(result.error)
    setLoading(false)
    Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start()
  }, [fadeAnim])

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const online = reading
    ? Date.now() - new Date(reading.created_at).getTime() < OFFLINE_MS
    : false
  const lastTime = reading?.created_at
    ? new Date(reading.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

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
          {online
            ? <Wifi size={18} color={TEXT_MID} strokeWidth={1.8} />
            : <WifiOff size={18} color="#AAB8C7" strokeWidth={1.8} />}
        </View>

        {/* Title + status */}
        <Text style={styles.pageTitle}>Tank Monitor</Text>
        <View style={styles.statusRow}>
          <View style={[styles.onlinePill, { backgroundColor: online ? 'rgba(52,199,89,0.14)' : 'rgba(0,0,0,0.06)' }]}>
            <View style={[styles.onlineDot, { backgroundColor: online ? GREEN : '#AAB8C7' }]} />
            <Text style={[styles.onlineText, { color: online ? '#1A8C3E' : '#AAB8C7' }]}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
          {lastTime && <Text style={styles.lastReading}>Last reading: {lastTime}</Text>}
        </View>

        {/* Cards */}
        <Animated.View style={{ opacity: loading ? 0.4 : fadeAnim }}>
          {reading ? (
            <>
              <SummaryStrip reading={reading} online={online} lastTime={lastTime} />
              <SensorCard
                label="POTENTIAL HYDROGEN"
                value={reading.ph.toFixed(1)}
                subtitle={phSubtitle(reading.ph, phStatus(reading.ph))}
                fill={reading.ph / 14}
                color={statusColor(phStatus(reading.ph))}
                Icon={FlaskConical}
              />
              <SensorCard
                label="TOTAL DISSOLVED SOLIDS"
                value={String(Math.round(reading.tds))}
                unit=" ppm"
                subtitle={tdsSubtitle(reading.tds, tdsStatus(reading.tds))}
                fill={Math.min(reading.tds / 800, 1)}
                color={statusColor(tdsStatus(reading.tds))}
                Icon={Droplet}
              />
              <SensorCard
                label="DISPENSER CAPACITY"
                value={`${Math.round(reading.food_level)}%`}
                subtitle={foodSubtitle(reading.food_level)}
                fill={reading.food_level / 100}
                color={statusColor(foodStatus(reading.food_level))}
                Icon={Box}
              />
              <QualityCard reading={reading} />
            </>
          ) : !loading ? (
            <View style={[styles.emptyCard, SHADOW]}>
              <View style={styles.emptyIcon}>
                <AlertCircle size={22} color={TEAL} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{error ? 'No live reading' : 'No readings yet'}</Text>
              <Text style={styles.emptyHint}>
                {error === 'API request failed with status 404.'
                  ? 'Waiting for the ESP32 to post its first reading.'
                  : error ?? 'Pull down to refresh.'}
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.8}>
                <RefreshCw size={14} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appName: { fontSize: 17, fontWeight: '700', color: TEXT_DARK, letterSpacing: 0.2 },

  pageTitle: { fontSize: 26, fontWeight: '700', color: TEXT_DARK, marginBottom: 10, letterSpacing: 0.1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  onlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  onlineText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  lastReading: { fontSize: 13, color: TEXT_MID },

  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,123,142,0.08)',
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  summaryEyebrow: { fontSize: 10, color: TEXT_LIGHT, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  summaryTitle: { fontSize: 20, color: TEXT_DARK, fontWeight: '800' },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  summaryPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  summaryMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  summaryMetric: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: TEXT_LIGHT, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  summaryValue: { fontSize: 22, color: TEXT_DARK, fontWeight: '800' },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: 'rgba(0,0,0,0.08)' },
  summaryFoot: { marginTop: 12, color: TEXT_MID, fontSize: 12, fontWeight: '600' },

  sensorCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    marginBottom: 12,
    padding: 18,
  },
  sensorInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sensorLeft: { flex: 1, marginRight: 14 },
  sensorLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9, marginBottom: 6 },
  sensorValueRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 },
  sensorValue: { fontSize: 40, fontWeight: '700', color: TEXT_DARK, lineHeight: 46 },
  sensorUnit: { fontSize: 16, fontWeight: '500', color: TEXT_MID, marginLeft: 3 },
  sensorSubtitle: { fontSize: 13, color: TEXT_MID },

  qualityCard: { borderRadius: 18, padding: 20, marginBottom: 12 },
  qualityBadge: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2, marginBottom: 8,
  },
  qualityWord: { fontSize: 32, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  qualityDesc: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 },
  qualitySep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  qualityRow: { flexDirection: 'row', alignItems: 'center' },
  qualityStat: { flex: 1, alignItems: 'center' },
  qualityStatLabel: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8, marginBottom: 4,
  },
  qualityStatValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  qualityDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  emptyCard: { backgroundColor: CARD, borderRadius: 20, padding: 28, alignItems: 'center' },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(10,123,142,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT_DARK, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: TEXT_MID, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 18,
  },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
})
