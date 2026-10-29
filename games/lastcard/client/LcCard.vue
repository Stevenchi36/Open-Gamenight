<template>
  <div
    class="lc-card"
    :class="[`lc-card--${size}`, { 'lc-card--wild': !card.color }]"
    :style="card.color ? { '--lc-color': CARD_COLORS[card.color], '--lc-on': ON_CARD_COLORS[card.color] } : undefined"
    role="img"
    :aria-label="cardName(card)"
  >
    <span v-if="size !== 'sm'" class="lc-card__corner">{{ symbol }}</span>
    <span v-if="size !== 'sm' && card.color" class="lc-card__letter">{{ COLOR_LETTERS[card.color] }}</span>
    <span class="lc-card__oval">
      <v-icon v-if="icon" :icon="icon" class="lc-card__icon" />
      <span v-else>{{ symbol }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
// One Last Card card, face up: the card's colour (four quarters for a wild) with its number or
// symbol on a white oval, and its colour's letter in the bottom corner. Face-down cards use the core
// PlayingCard's back instead.
import { computed } from 'vue'
import type { LcCard } from '../shared/index.ts'
import { CARD_COLORS, cardName, COLOR_LETTERS, ON_CARD_COLORS } from './text.ts'

const props = withDefaults(defineProps<{ card: LcCard; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const SYMBOLS: Partial<Record<LcCard['value'], string>> = { draw2: '+2', wild4: '+4', wild: '' }
const ICONS: Partial<Record<LcCard['value'], string>> = { skip: 'mdi-cancel', reverse: 'mdi-swap-horizontal' }
const symbol = computed(() => SYMBOLS[props.card.value] ?? (ICONS[props.card.value] ? '' : props.card.value))
const icon = computed(() => ICONS[props.card.value] ?? null)
</script>

<style scoped>
.lc-card {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 2px solid #fff;
  outline: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  background: var(--lc-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  color: var(--lc-color, #222);
  font-weight: 800;
  line-height: 1;
  user-select: none;
}
.lc-card--wild {
  background: conic-gradient(#d32f2f 0 25%, #1e6fd9 0 50%, #2e9d48 0 75%, #f2b705 0);
}
.lc-card--sm {
  width: 24px;
  height: 34px;
  border-width: 1px;
  border-radius: 4px;
  font-size: 11px;
}
.lc-card--md {
  width: 46px;
  height: 66px;
  font-size: 18px;
}
.lc-card--lg {
  width: 64px;
  height: 92px;
  font-size: 26px;
}
/* The white oval, tilted as on the printed cards; a wild's shows the quarters through a ring. */
.lc-card__oval {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 78%;
  height: 58%;
  border-radius: 50%;
  background: #fff;
  transform: rotate(-24deg);
}
.lc-card__oval > * {
  transform: rotate(24deg);
}
.lc-card--wild .lc-card__oval {
  background: transparent;
  border: 3px solid #fff;
  color: #fff;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.6);
}
.lc-card--sm .lc-card__oval {
  border-width: 1px;
}
.lc-card__icon {
  font-size: 1.1em;
}
.lc-card__corner,
.lc-card__letter {
  position: absolute;
  font-size: 0.55em;
  color: var(--lc-on, #fff);
}
.lc-card__corner {
  top: 2px;
  left: 4px;
}
.lc-card__letter {
  right: 4px;
  bottom: 2px;
}
/* A wild's corner sits on the quarters, so it keeps a shadow to read on any of them. */
.lc-card--wild .lc-card__corner {
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}
</style>
