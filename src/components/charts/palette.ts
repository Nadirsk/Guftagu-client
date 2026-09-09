/**
 * Chart colour, computed rather than chosen.
 *
 * Re-validated for the 2026-09-08 ledger redesign against both chart surfaces:
 *
 *   node scripts/validate_palette.js "#3B6FDB,#A8720F,#1E9E7C" --mode light --surface "#FFFFFF"
 *   node scripts/validate_palette.js "#5F8DF2,#BF831F,#00A47C" --mode dark  --surface "#1B1E25"
 *   → both: lightness band PASS · chroma floor PASS · CVD separation PASS
 *     · normal-vision floor PASS · contrast PASS
 *
 * Two things about them are deliberate and should survive edits:
 *
 *  1. They are NOT the UI tokens. The interface's one accent (--color-signal) is spent
 *     on actionable things; a chart series is identity, a different job with its own
 *     lightness/chroma constraints. Do not "simplify" these back to --color-signal etc.
 *
 *  2. The ORDER matters. The gold and teal are tritan-confusable (ΔE ~7), so blue sits
 *     between them and the confusable pair is never adjacent. A 6-8 ΔE is only legal with
 *     secondary encoding, which is why every chart using these also carries a legend,
 *     direct labels and gaps between marks — never colour alone.
 *
 * Re-run the validator if you change a value or a chart surface colour.
 */
export const SERIES = {
  light: ['#3B6FDB', '#A8720F', '#1E9E7C'],
  dark: ['#5F8DF2', '#BF831F', '#00A47C'],
} as const

/** Fixed assignment: colour follows the entity, never its position in a filtered list. */
export const REVENUE_KEYS = [
  { key: 'recharge_coins', label: 'Recharge' },
  { key: 'gifting_coins', label: 'Gifting' },
  { key: 'vip_coins', label: 'VIP' },
] as const

export function seriesFor(isDark: boolean) {
  const colors = isDark ? SERIES.dark : SERIES.light
  return REVENUE_KEYS.map((s, i) => ({ ...s, color: colors[i] }))
}

/**
 * Sequential ramp for the retention cohort table: one hue (the interface's own blue),
 * monotonically lighter as the value falls, so a glance at magnitude never needs the
 * printed number — the number is still always printed alongside it regardless.
 */
const RETENTION_RAMP = {
  light: [
    '#eef1fb', // ~0 — barely above the white panel
    '#c7d6f5',
    '#96b3ea',
    '#5f8dde',
    '#2952cc', // ~1 — the interface accent itself
  ],
  dark: [
    '#222b3d', // ~0 — barely above the graphite surface
    '#2c3e63',
    '#3a5490',
    '#4e71c4',
    '#6e93ff', // ~1
  ],
} as const

export function rampStep(rate: number, isDark: boolean): string {
  const ramp = isDark ? RETENTION_RAMP.dark : RETENTION_RAMP.light
  if (rate <= 0) return ramp[0]
  const index = Math.min(ramp.length - 1, Math.ceil(rate * (ramp.length - 1)))
  return ramp[index]
}

/** Ink stays ink: values and labels never wear the series colour. */
export const INK = {
  primary: 'var(--color-paper)',
  secondary: 'var(--color-legend)',
  muted: 'var(--color-legend-dim)',
  grid: 'var(--color-edge)',
  surface: 'var(--color-panel)',
}
