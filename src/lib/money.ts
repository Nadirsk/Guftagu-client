/**
 * Paise in, rupees out. Integers are the truth everywhere in this codebase (docs/02 §15);
 * this exists only so the same number is not divided by 100 in six different places with
 * six different rounding habits.
 */
export function money(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—'

  return `₹${(paise / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Compact form for a table cell, where two decimal places is noise. */
export function moneyShort(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—'

  return `₹${Math.round(paise / 100).toLocaleString()}`
}

/** 1500 → "15%". Basis points are integers; this is display only. */
export function bp(basisPoints: number | null | undefined): string {
  if (basisPoints === null || basisPoints === undefined) return '—'

  return `${(basisPoints / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}
