/**
 * Units for Ballpark answers. The library stores each answer in one metric unit
 * (or one that reads the same in both systems); an imperial room converts it when
 * the round starts. Pure, so the reducer can use it.
 */

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const
export type UnitSystem = (typeof UNIT_SYSTEMS)[number]

interface UnitDef {
  /** Shown beside the question in a metric room. */
  label: string
  /** Absent: the same in both systems. */
  imperial?: { label: string; convert: (value: number) => number }
}

const scale = (factor: number) => (value: number) => value * factor

export const UNITS = {
  mm: { label: 'millimetres', imperial: { label: 'inches', convert: scale(1 / 25.4) } },
  cm: { label: 'centimetres', imperial: { label: 'inches', convert: scale(1 / 2.54) } },
  m: { label: 'metres', imperial: { label: 'feet', convert: scale(1 / 0.3048) } },
  km: { label: 'kilometres', imperial: { label: 'miles', convert: scale(1 / 1.609344) } },
  m2: { label: 'square metres', imperial: { label: 'square feet', convert: scale(1 / 0.09290304) } },
  km2: { label: 'square kilometres', imperial: { label: 'square miles', convert: scale(1 / 2.589988110336) } },
  g: { label: 'grams', imperial: { label: 'ounces', convert: scale(1 / 28.349523125) } },
  kg: { label: 'kilograms', imperial: { label: 'pounds', convert: scale(1 / 0.45359237) } },
  t: { label: 'tonnes', imperial: { label: 'US tons', convert: scale(1 / 0.90718474) } },
  ml: { label: 'millilitres', imperial: { label: 'US fluid ounces', convert: scale(1 / 29.5735295625) } },
  l: { label: 'litres', imperial: { label: 'US gallons', convert: scale(1 / 3.785411784) } },
  'km/h': { label: 'km/h', imperial: { label: 'mph', convert: scale(1 / 1.609344) } },
  C: { label: '°C', imperial: { label: '°F', convert: (c) => (c * 9) / 5 + 32 } },
  '%': { label: '%' },
  s: { label: 'seconds' },
  min: { label: 'minutes' },
  h: { label: 'hours' },
  days: { label: 'days' },
  years: { label: 'years' },
} satisfies Record<string, UnitDef>

export type UnitCode = keyof typeof UNITS
export const UNIT_CODES = Object.keys(UNITS) as UnitCode[]

export function isUnitCode(code: string): code is UnitCode {
  return Object.hasOwn(UNITS, code)
}

/**
 * The answer and unit label players see. A converted answer is rounded, and that
 * rounded number is what scoring uses ("without going over" must be judged on the
 * number on screen): whole numbers from 100 up, otherwise 3 significant figures,
 * or one decimal place for temperatures (98.6 °F; 3 significant figures would turn
 * -0.04 °F into a fussy answer). Unconverted answers are kept as stored.
 */
export function toRoomUnits(answer: number, unit: UnitCode | null, system: UnitSystem): { answer: number; unit: string | null } {
  if (unit === null) return { answer, unit: null }
  const def: UnitDef = UNITS[unit]
  if (system === 'metric' || !def.imperial) return { answer, unit: def.label }
  const value = def.imperial.convert(answer)
  const rounded =
    Math.abs(value) >= 100 ? Math.round(value) : unit === 'C' ? Math.round(value * 10) / 10 : Number(value.toPrecision(3))
  // -0 would print as "0" but compare oddly in tests
  return { answer: rounded === 0 ? 0 : rounded, unit: def.imperial.label }
}
