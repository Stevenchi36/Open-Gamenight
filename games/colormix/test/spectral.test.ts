import { createRng } from '@wsfg/core/rng'
import { describe, expect, it } from 'vitest'
import { closeness, distanceBetween, hslToHex, randomColors } from '../server/colors.ts'
import { mixPaint } from '../server/spectral.ts'

// Results from the original spectral.js v3.0.0 (`mix(...colors.map((c) => [new Color(c), 1])).toString()`).
// The port matched it on 5000 random mixes of 2-6 colours when it was vendored.
const FIXTURES: [string[], string][] = [
  [['#0000ff', '#ffff00'], '#398f54'],
  [['#ff0000', '#ffffff'], '#ff424a'],
  [['#ff0000', '#0000ff'], '#4a182b'],
  [['#ff0000', '#ffff00'], '#ff440f'],
  [['#ffffff', '#000000'], '#a6a6a6'],
  [['#ff0000', '#00ff00', '#0000ff'], '#593923'],
  [['#f60ced', '#c88f05', '#d5d01b', '#66e33e', '#96fe62', '#a38756'], '#ab8747'],
  [['#0a872b', '#d0b768', '#ac0ca1', '#724dc7', '#d31fef', '#f7b177'], '#746469'],
  [['#3cc273', '#100611', '#8846fc', '#b82c2f', '#8486d2', '#ed5117'], '#745c4d'],
  [['#aea05f', '#a6c0fd'], '#aab285'],
  [['#91968c', '#af55d9', '#bcd4dc', '#da2793', '#046e08'], '#6b724e'],
  [['#a26888', '#057859', '#5cbaef'], '#428b8d'],
  [['#19ef7b', '#14d27d', '#991fc9', '#a7a017', '#3ecf05'], '#589642'],
  [['#0e9df1', '#f8a205', '#7f1456', '#0e3e51', '#503036', '#c4b951'], '#596b48'],
  [['#e0b43c', '#1a73d9', '#b23089', '#72ebf0', '#1e35b5', '#1db28a'], '#528579'],
  [['#cf94a3', '#d5cda4', '#bb78dc', '#ce2115'], '#d46560'],
  [['#144929', '#7ed092', '#fe515a', '#bc063d', '#654134'], '#754459'],
  [['#90b003', '#5645ab', '#74fc55', '#42c674', '#4f2353', '#1aa244'], '#599644'],
]

describe('mixPaint', () => {
  it.each(FIXTURES)('%j mixes to %s, like spectral.js', (colors, expected) => {
    expect(mixPaint(colors)).toBe(expected)
  })

  it('mixes like paint: blue and yellow make a green', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(mixPaint(['#0000ff', '#ffff00']).slice(i, i + 2), 16)) as [number, number, number]
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('leaves a single colour (or the same colour twice) unchanged', () => {
    expect(mixPaint(['#3a7bd5', '#3a7bd5'])).toBe(mixPaint(['#3a7bd5']))
    expect(distanceBetween(mixPaint(['#3a7bd5']), '#3a7bd5')).toBeLessThan(0.01)
  })
})

describe('colours', () => {
  it('converts HSL to hex', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.25)).toBe('#008000')
    expect(hslToHex(240, 0, 1)).toBe('#ffffff')
  })

  it('draws distinct lower-case colours, the right number of them', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      const count = 2 + (i % 5)
      const colors = randomColors(rng, count)
      expect(colors).toHaveLength(count)
      for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      expect(colors.filter((c) => c === '#ffffff').length).toBeLessThanOrEqual(1)
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) expect(colors[a]).not.toBe(colors[b])
    }
  })

  it('scores closeness from 100 (exact) down to 0 (0.25 away or more)', () => {
    expect(closeness(0)).toBe(100)
    expect(closeness(0.125)).toBe(50)
    expect(closeness(0.25)).toBe(0)
    expect(closeness(0.5)).toBe(0)
    expect(closeness(0.9)).toBe(0)
    expect(closeness(0.07531)).toBe(69.88)
    expect(closeness(0.07469)).toBe(70.12)
    expect(distanceBetween('#000000', '#ffffff')).toBeCloseTo(1, 3)
  })
})
