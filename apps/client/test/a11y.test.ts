import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Accessibility mistakes eslint-plugin-vuejs-accessibility can't see, because it checks native
// elements and these are Vuetify components (see docs/decisions.md).
const root = join(import.meta.dirname, '../../..')
const dirs = ['apps/client/src', 'games', 'packages/core/src']
const COMPONENTS = ['v-btn', 'v-card', 'v-icon'] as const

interface Tag {
  /** "games/cheat/client/X.vue:12" */
  at: string
  name: (typeof COMPONENTS)[number]
  attrs: string
  /** What's between the opening and closing tag; '' when self-closing. */
  body: string
}

/** Every v-btn, v-card and v-icon in a .vue template. Attribute values may contain '>' (arrow functions). */
function tags(): Tag[] {
  const out: Tag[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path)
      } else if (entry.name.endsWith('.vue')) {
        const src = readFileSync(path, 'utf8')
        const end = src.indexOf('<script')
        const template = end === -1 ? src : src.slice(0, end)
        // One pass per component, so a card's match doesn't swallow the buttons inside it.
        for (const name of COMPONENTS) {
          const re = new RegExp(String.raw`<${name}\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/>|>([\s\S]*?)<\/${name}>)`, 'g')
          for (const m of template.matchAll(re)) {
            const line = template.slice(0, m.index).split('\n').length
            out.push({ at: `${relative(root, path).replaceAll('\\', '/')}:${line}`, name, attrs: m[1]!, body: m[3] ?? '' })
          }
        }
      }
    }
  }
  for (const dir of dirs) walk(join(root, dir))
  return out
}

const all = tags()
const has = (t: Tag, attr: RegExp) => attr.test(t.attrs)
const clickable = (t: Tag) => has(t, /(@click|onClick)\b/)

/** Clickable cards that are fine as they are, and why. */
const CARD_EXCEPTIONS: Record<string, string> = {
  // Their own role="button", tabindex and key handling.
  'packages/core/src/ui/HoldToReveal.vue': 'has role, tabindex and keys',
  // A tap closes them early; they close by themselves, and on Escape.
  'packages/core/src/ui/WinCelebration.vue': 'tap to dismiss; Escape too',
  'packages/core/src/ui/LoseReveal.vue': 'tap to dismiss; Escape too',
}

describe('accessibility of Vuetify components', () => {
  it('finds the components it checks', () => {
    // Guards the scan itself: a broken pattern would pass every check below.
    expect(all.filter((t) => t.name === 'v-btn').length).toBeGreaterThan(150)
    expect(all.filter((t) => t.name === 'v-card').length).toBeGreaterThan(50)
  })

  it('names every icon-only button', () => {
    // An icon's SVG is aria-hidden, so a v-btn with only an icon has no name without aria-label.
    const iconOnly = (t: Tag) => has(t, /(?<![\w-]):?icon=/) && !t.body.replace(/<v-icon[\s\S]*?(\/>|<\/v-icon>)/g, '').trim()
    const unnamed = all.filter((t) => t.name === 'v-btn' && iconOnly(t) && !has(t, /aria-label=/))
    expect(unnamed.map((t) => t.at)).toEqual([])
  })

  it('makes clickable cards buttons', () => {
    // A v-card with @click gets no tabindex, role or Enter/Space handling: unreachable by keyboard.
    // Use tag="button", or a button over the card when it holds buttons of its own (Ballpark's SlotBoard).
    const cards = all.filter((t) => t.name === 'v-card' && clickable(t) && !has(t, /\btag="button"/) && !(t.at.split(':')[0]! in CARD_EXCEPTIONS))
    expect(cards.map((t) => t.at)).toEqual([])
  })

  it('uses a v-btn, not a clickable v-icon', () => {
    // A clickable v-icon is focusable but has no name and ignores Enter and Space.
    expect(all.filter((t) => t.name === 'v-icon' && clickable(t)).map((t) => t.at)).toEqual([])
  })
})
