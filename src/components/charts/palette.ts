/**
 * Chart colour, computed rather than chosen.
 *
 * These three were produced by running the dataviz validator against the panel surface
 * (#1A2230) and stepping each hue until every check passed:
 *
 *   node scripts/validate_palette.js "#BF831F,#5E7FC7,#00A47C" --mode dark --surface "#1A2230"
 *   → lightness band PASS · chroma floor PASS · CVD separation PASS
 *     · normal-vision floor PASS · contrast PASS   (also under --pairs all)
 *
 * Two things about them are deliberate and should survive edits:
 *
 *  1. They are NOT the UI tokens. The interface amber (#F0A93B) and teal (#3FBFA0) sit
 *     above the L 0.48–0.67 band a dark surface needs, and failed the lightness check as
 *     chart fills. Darkening the teal then dropped it under the 0.1 chroma floor, so it
 *     was re-saturated. Do not "fix" these back to the UI values.
 *
 *  2. The ORDER matters. Amber and teal are tritan-confusable (ΔE 6.7), so blue is placed
 *     between them and the confusable pair is never adjacent. A 6-8 ΔE is only legal with
 *     secondary encoding, which is why every chart using these also carries a legend,
 *     direct labels and gaps between marks — never colour alone.
 *
 * Re-run the validator if you change a value.
 */
export const SERIES = ['#BF831F', '#5E7FC7', '#00A47C'] as const

/** Fixed assignment: colour follows the entity, never its position in a filtered list. */
export const REVENUE_SERIES = [
  { key: 'recharge_coins', label: 'Recharge', color: SERIES[0] },
  { key: 'gifting_coins', label: 'Gifting', color: SERIES[1] },
  { key: 'vip_coins', label: 'VIP', color: SERIES[2] },
] as const

/**
 * Sequential ramp for the retention cohort table: one hue, monotonically lighter as the
 * value rises. Never a rainbow — magnitude is not identity.
 */
export const RETENTION_RAMP = [
  '#232C3C', // ~0    — barely above the surface
  '#3D3520',
  '#5E4A22',
  '#8A6626',
  '#BF831F', // ~1
] as const

export function rampStep(rate: number): string {
  if (rate <= 0) return RETENTION_RAMP[0]
  const index = Math.min(RETENTION_RAMP.length - 1, Math.ceil(rate * (RETENTION_RAMP.length - 1)))
  return RETENTION_RAMP[index]
}

/** Ink stays ink: values and labels never wear the series colour. */
export const INK = {
  primary: 'var(--color-paper)',
  secondary: 'var(--color-legend)',
  muted: 'var(--color-legend-dim)',
  grid: 'var(--color-edge)',
  surface: 'var(--color-panel)',
}
