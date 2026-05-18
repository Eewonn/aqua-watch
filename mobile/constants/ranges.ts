export type RangeStatus = 'good' | 'warning' | 'danger'

export function phStatus(value: number): RangeStatus {
  if (value >= 6.5 && value <= 8.5) return 'good'
  if ((value >= 6.0 && value < 6.5) || (value > 8.5 && value <= 9.0)) return 'warning'
  return 'danger'
}

export function foodStatus(value: number): RangeStatus {
  if (value >= 50) return 'good'
  if (value >= 20) return 'warning'
  return 'danger'
}

// iOS system colors
export const STATUS_COLORS: Record<RangeStatus, string> = {
  good: '#30d158',
  warning: '#ff9f0a',
  danger: '#ff375f',
}

export const STATUS_BG: Record<RangeStatus, string> = {
  good: 'rgba(48,209,88,0.12)',
  warning: 'rgba(255,159,10,0.12)',
  danger: 'rgba(255,55,95,0.12)',
}
