import { describe, expect, it } from 'vitest'
import { toRoomUnits, UNIT_CODES, UNITS } from '../shared/units.ts'

describe('toRoomUnits', () => {
  it('keeps metric answers as stored, with the unit label', () => {
    expect(toRoomUnits(330, 'm', 'metric')).toEqual({ answer: 330, unit: 'metres' })
    expect(toRoomUnits(42.195, 'km', 'metric')).toEqual({ answer: 42.195, unit: 'kilometres' })
  })

  it('leaves plain numbers and unconverted units alone in both systems', () => {
    expect(toRoomUnits(1969, null, 'imperial')).toEqual({ answer: 1969, unit: null })
    expect(toRoomUnits(8.3, 'min', 'imperial')).toEqual({ answer: 8.3, unit: 'minutes' })
    expect(toRoomUnits(243, 'days', 'imperial')).toEqual({ answer: 243, unit: 'days' })
  })

  it('rounds converted answers to whole numbers from 100 up, else 3 significant figures', () => {
    expect(toRoomUnits(330, 'm', 'imperial')).toEqual({ answer: 1083, unit: 'feet' })
    expect(toRoomUnits(42.195, 'km', 'imperial')).toEqual({ answer: 26.2, unit: 'miles' })
    expect(toRoomUnits(3.05, 'm', 'imperial')).toEqual({ answer: 10, unit: 'feet' })
    expect(toRoomUnits(0.914, 'm', 'imperial')).toEqual({ answer: 3, unit: 'feet' })
    expect(toRoomUnits(1.4, 'kg', 'imperial')).toEqual({ answer: 3.09, unit: 'pounds' })
    expect(toRoomUnits(5, 'l', 'imperial')).toEqual({ answer: 1.32, unit: 'US gallons' })
    expect(toRoomUnits(149_600_000, 'km', 'imperial')).toEqual({ answer: 92_957_130, unit: 'miles' })
  })

  it('converts temperatures to Fahrenheit, one decimal place below 100, below zero too', () => {
    expect(toRoomUnits(37, 'C', 'imperial')).toEqual({ answer: 98.6, unit: '°F' })
    expect(toRoomUnits(1538, 'C', 'imperial')).toEqual({ answer: 2800, unit: '°F' })
    expect(toRoomUnits(-89.2, 'C', 'imperial')).toEqual({ answer: -129, unit: '°F' })
    expect(toRoomUnits(-17.8, 'C', 'imperial')).toEqual({ answer: 0, unit: '°F' })
  })

  it('has an imperial label for every unit that converts', () => {
    for (const code of UNIT_CODES) {
      const def = UNITS[code] as { label: string; imperial?: { label: string } }
      expect(def.label).toBeTruthy()
      if (def.imperial) expect(def.imperial.label).not.toBe(def.label)
    }
  })
})
