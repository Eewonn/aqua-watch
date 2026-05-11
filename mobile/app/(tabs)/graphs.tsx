import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LineChart } from 'react-native-gifted-charts'
import { TrendingDown, TrendingUp, BarChart2, Droplets, Wifi, Activity, RefreshCw } from 'lucide-react-native'
import { getReadingHistoryResult, type Reading } from '../../lib/api'
import { STATUS_COLORS, phStatus, tdsStatus, foodStatus } from '../../constants/ranges'

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

const { width } = Dimensions.get('window')
const CHART_W = width - 40 - 36

type Sensor = 'ph' | 'tds' | 'food_level'
const SENSORS: { key: Sensor; label: string; fullLabel: string; unit: string }[] = [
  { key: 'ph', label: 'pH', fullLabel: 'Potential Hydrogen', unit: 'pH' },
  { key: 'tds', label: 'TDS', fullLabel: 'Total Dissolved Solids', unit: 'ppm' },
  { key: 'food_level', label: 'Food', fullLabel: 'Dispenser Capacity', unit: '%' },
]

function getColor(sensor: Sensor, v: number): string {
  if (sensor === 'ph') return STATUS_COLORS[phStatus(v)]
  if (sensor === 'tds') return STATUS_COLORS[tdsStatus(v)]
  return STATUS_COLORS[foodStatus(v)]
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, unit, Icon, iconColor, iconBg,
}: {
  label: string
  value: string
  unit: string
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>
  iconColor: string
  iconBg: string
}) {
  return (
    <View style={[styles.statCard, SHADOW]}>
      <View style={[styles.statIconCircle, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconColor} strokeWidth={2.5} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={styles.statValueRow}>
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statUnit}> {unit.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function GraphsScreen() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [active, setActive] = useState<Sensor>('ph')

  const load = useCallback(async () => {
    const result = await getReadingHistoryResult(50)
    setReadings([...(result.data ?? [])].reverse())
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const sensor = SENSORS.find(s => s.key === active)!
  const latest = readings.length > 0 ? readings[readings.length - 1][active] : null
  const lineColor = latest !== null ? getColor(active, latest) : TEAL
  const chartData = readings.map(r => ({
    value: r[active],
    dataPointColor: getColor(active, r[active]),
  }))

  const stats = readings.length > 0 ? {
    min: Math.min(...readings.map(r => r[active])),
    max: Math.max(...readings.map(r => r[active])),
    avg: readings.reduce((s, r) => s + r[active], 0) / readings.length,
  } : null

  const fmt = (v: number) => active === 'ph' ? v.toFixed(2) : Math.round(v).toString()
  const first = readings.length > 1 ? readings[0][active] : null
  const delta = latest !== null && first !== null ? latest - first : null

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

        <Text style={styles.pageTitle}>Tank Analytics</Text>
        <Text style={styles.pageSubtitle}>
          {error ? 'Unable to load readings' : `${readings.length} readings · pull to refresh`}
        </Text>

        <View style={[styles.insightCard, SHADOW]}>
          <View style={styles.insightIcon}>
            <Activity size={18} color={TEAL} strokeWidth={2.2} />
          </View>
          <View style={styles.insightText}>
            <Text style={styles.insightLabel}>CURRENT TREND</Text>
            <Text style={styles.insightTitle}>
              {latest === null ? 'Waiting for readings' : `${sensor.label} ${fmt(latest)} ${sensor.unit}`}
            </Text>
            <Text style={styles.insightSub}>
              {delta === null ? 'Add sensor data to see movement over time.'
                : `${delta >= 0 ? '+' : ''}${fmt(delta)} ${sensor.unit} across this window`}
            </Text>
          </View>
        </View>

        {/* Sensor picker */}
        <View style={[styles.pickerRow, SHADOW]}>
          {SENSORS.map(s => {
            const isActive = s.key === active
            const sv = readings.length > 0 ? readings[readings.length - 1][s.key] : null
            const c = sv !== null ? getColor(s.key, sv) : TEXT_LIGHT
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.pickerBtn, isActive && { backgroundColor: CARD, borderColor: TEAL }]}
                onPress={() => setActive(s.key)}
                activeOpacity={0.7}
              >
                {isActive && sv !== null && (
                  <View style={[styles.pickerDot, { backgroundColor: c }]} />
                )}
                <Text style={[styles.pickerText, isActive && { color: TEAL, fontWeight: '700' }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Chart card */}
        <View style={[styles.chartCard, SHADOW]}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartSensorName}>{sensor.fullLabel.toUpperCase()}</Text>
              {latest !== null && (
                <View style={styles.chartCurrentRow}>
                  <Text style={[styles.chartCurrent, { color: TEXT_DARK }]}>{fmt(latest)}</Text>
                  <Text style={styles.chartUnit}> {sensor.unit}</Text>
                </View>
              )}
            </View>
            {latest !== null && (
              <View style={[styles.chartBadge, { backgroundColor: `${lineColor}18` }]}>
                <View style={[styles.chartBadgeDot, { backgroundColor: lineColor }]} />
                <Text style={[styles.chartBadgeText, { color: lineColor }]}>
                  {lineColor === STATUS_COLORS.good ? 'Optimal'
                    : lineColor === STATUS_COLORS.warning ? 'Monitor'
                    : 'Alert'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.chartDivider} />

          {loading ? (
            <View style={styles.loadingBox}><ActivityIndicator color={TEAL} /></View>
          ) : error ? (
            <View style={styles.loadingBox}>
              <Text style={styles.noDataTitle}>Could not load chart</Text>
              <Text style={styles.noData}>{error}</Text>
              <TouchableOpacity style={styles.smallAction} onPress={onRefresh} activeOpacity={0.8}>
                <RefreshCw size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.smallActionText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : readings.length === 0 ? (
            <View style={styles.loadingBox}>
              <Text style={styles.noDataTitle}>No data yet</Text>
              <Text style={styles.noData}>Readings will appear after the ESP32 posts sensor values.</Text>
            </View>
          ) : (
            <LineChart
              data={chartData}
              color={lineColor}
              thickness={2}
              dataPointsRadius={readings.length > 25 ? 0 : 3}
              dataPointsColor={lineColor}
              hideDataPoints={readings.length > 25}
              backgroundColor="transparent"
              xAxisColor="rgba(0,0,0,0.07)"
              yAxisColor="rgba(0,0,0,0.07)"
              yAxisTextStyle={{ color: TEXT_LIGHT, fontSize: 10 }}
              noOfSections={4}
              curved
              width={CHART_W}
              height={180}
              initialSpacing={6}
              endSpacing={6}
              areaChart
              startFillColor={`${lineColor}28`}
              endFillColor={`${lineColor}04`}
              startOpacity={1}
              endOpacity={0}
              rulesColor="rgba(0,0,0,0.04)"
              rulesType="solid"
            />
          )}
        </View>

        {/* Stats */}
        {stats && (
          <>
            <StatCard
              label="MINIMUM"
              value={fmt(stats.min)}
              unit={sensor.unit}
              Icon={TrendingDown}
              iconColor={RED}
              iconBg="rgba(255,59,48,0.1)"
            />
            <StatCard
              label="AVERAGE"
              value={fmt(stats.avg)}
              unit={sensor.unit}
              Icon={BarChart2}
              iconColor={TEAL}
              iconBg="rgba(10,123,142,0.1)"
            />
            <StatCard
              label="MAXIMUM"
              value={fmt(stats.max)}
              unit={sensor.unit}
              Icon={TrendingUp}
              iconColor={GREEN}
              iconBg="rgba(52,199,89,0.1)"
            />
          </>
        )}
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

  pageTitle: { fontSize: 26, fontWeight: '700', color: TEXT_DARK, marginBottom: 4, letterSpacing: 0.1 },
  pageSubtitle: { fontSize: 13, color: TEXT_MID, marginBottom: 20 },

  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(10,123,142,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightText: { flex: 1 },
  insightLabel: { fontSize: 10, color: TEXT_LIGHT, fontWeight: '800', letterSpacing: 0.8, marginBottom: 3 },
  insightTitle: { fontSize: 17, color: TEXT_DARK, fontWeight: '800', marginBottom: 2 },
  insightSub: { fontSize: 12, color: TEXT_MID, lineHeight: 17 },

  pickerRow: {
    flexDirection: 'row', gap: 8,
    backgroundColor: '#E6EFF5',
    borderRadius: 16, padding: 5,
    marginBottom: 14,
  },
  pickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  pickerDot: { width: 6, height: 6, borderRadius: 3 },
  pickerText: { fontSize: 13, fontWeight: '600', color: TEXT_MID },

  chartCard: {
    backgroundColor: CARD, borderRadius: 18,
    padding: 18, marginBottom: 14,
  },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 14,
  },
  chartSensorName: {
    fontSize: 10, fontWeight: '700', color: TEXT_LIGHT,
    letterSpacing: 0.8, marginBottom: 4,
  },
  chartCurrentRow: { flexDirection: 'row', alignItems: 'baseline' },
  chartCurrent: { fontSize: 34, fontWeight: '700' },
  chartUnit: { fontSize: 15, fontWeight: '500', color: TEXT_MID },
  chartBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  chartBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  chartBadgeText: { fontSize: 11, fontWeight: '700' },
  chartDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.07)',
    marginBottom: 14,
  },
  loadingBox: { height: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  noDataTitle: { fontSize: 15, color: TEXT_DARK, fontWeight: '800', marginBottom: 5 },
  noData: { fontSize: 13, color: TEXT_MID, textAlign: 'center', lineHeight: 18 },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 14,
  },
  smallActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  statCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD, borderRadius: 16,
    padding: 16, marginBottom: 10,
  },
  statIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statInfo: { flex: 1 },
  statLabel: {
    fontSize: 10, fontWeight: '700', color: TEXT_LIGHT,
    letterSpacing: 0.8, marginBottom: 3,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 22, fontWeight: '700', color: TEXT_DARK },
  statUnit: { fontSize: 13, fontWeight: '600', color: TEXT_MID },
})
