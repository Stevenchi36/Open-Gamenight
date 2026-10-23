/**
 * Colour helpers for Color Mix: drawing a round's random colours, and scoring
 * how close a guess is. Pure; randomness comes from the caller's Rng.
 */
import type { Rng } from '@wsfg/core/rng'
import { deltaE, hexToOklab } from './spectral.ts'

/** Distance at which closeness reaches 0%. */
const CLOSENESS_ZERO_AT = 0.25
/** No two colours in a round closer than this (OKLab), so none look alike. */
const MIN_APART = 0.12
const WHITE = '#ffffff'
const WHITE_CHANCE = 0.1

/** HSL (h in degrees, s and l in [0, 1]) -> `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** A vivid paint colour: any hue, saturation 50-100%, lightness 25-70%. */
function vividColor(rng: Rng): string {
  return hslToHex(rng.next() * 360, 0.5 + rng.next() * 0.5, 0.25 + rng.next() * 0.45)
}

/** `count` distinct colours; sometimes one is white, so tints come up. */
export function randomColors(rng: Rng, count: number): string[] {
  const colors: string[] = []
  const labs: number[][] = []
  while (colors.length < count) {
    const wantWhite = !colors.includes(WHITE) && rng.next() < WHITE_CHANCE
    let color = wantWhite ? WHITE : vividColor(rng)
    // A handful of tries is plenty: vivid colours rarely land this close.
    for (let tries = 0; tries < 20 && labs.some((lab) => deltaE(lab, hexToOklab(color)) < MIN_APART); tries++) {
      color = vividColor(rng)
    }
    colors.push(color)
    labs.push(hexToOklab(color))
  }
  return colors
}

export function distanceBetween(a: string, b: string): number {
  return deltaE(hexToOklab(a), hexToOklab(b))
}

/** 0-100 to 2 decimals (whole numbers tied too often): 100 is exact, 0 is CLOSENESS_ZERO_AT or further. */
export function closeness(distance: number): number {
  return Math.round(10_000 * Math.max(0, 1 - distance / CLOSENESS_ZERO_AT)) / 100
}
