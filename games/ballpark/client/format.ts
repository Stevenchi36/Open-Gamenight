/** Number display for guesses and answers: grouped digits, up to 3 decimals, a real minus sign. */
export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 }).replace('-', '−')
}

/** "1,083 feet", "37 °C", "12%", or just the number when there's no unit. */
export function formatValue(value: number, unit: string | null): string {
  if (!unit) return formatNumber(value)
  return unit === '%' ? `${formatNumber(value)}%` : `${formatNumber(value)} ${unit}`
}

/** Parse what a player typed: commas and spaces as digit grouping are ignored. null if it isn't a number. */
export function parseGuess(text: string): number | null {
  const cleaned = text.trim().replace(/[\s,]/g, '').replace('−', '-')
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
