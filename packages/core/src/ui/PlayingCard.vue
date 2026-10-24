<template>
  <div
    class="playing-card"
    :class="[`playing-card--${size}`, card ? (red ? 'playing-card--red' : 'playing-card--black') : 'playing-card--back']"
    role="img"
    :aria-label="card ? `${card.rank} of ${SUIT_NAMES[card.suit]}` : 'Face-down card'"
  >
    <template v-if="card">
      <span class="playing-card__corner">{{ card.rank }}<br />{{ SUIT_SYMBOLS[card.suit] }}</span>
      <span v-if="size !== 'sm'" class="playing-card__pip">{{ SUIT_SYMBOLS[card.suit] }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
// One playing card, face up or (with no `card`) face down. Theme colours, so it reads in light and dark.
import { computed } from 'vue'
import type { Card, Suit } from '../kit.ts'

const props = withDefaults(defineProps<{ card?: Card | null; size?: 'sm' | 'md' | 'lg' }>(), { card: null, size: 'md' })

const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_NAMES: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }
const red = computed(() => props.card?.suit === 'H' || props.card?.suit === 'D')
</script>

<style scoped>
.playing-card {
  position: relative;
  flex: none;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  font-weight: 700;
  line-height: 1;
  user-select: none;
}
.playing-card--sm {
  width: 22px;
  height: 32px;
  border-radius: 4px;
  font-size: 10px;
}
.playing-card--md {
  width: 46px;
  height: 66px;
  font-size: 15px;
}
.playing-card--lg {
  width: 64px;
  height: 92px;
  font-size: 20px;
}
.playing-card--red {
  color: rgb(var(--v-theme-error));
}
.playing-card--black {
  color: rgb(var(--v-theme-on-surface));
}
.playing-card--back {
  border-color: rgba(var(--v-theme-on-primary), 0.6);
  background: repeating-linear-gradient(
      45deg,
      rgba(var(--v-theme-on-primary), 0.18) 0 3px,
      transparent 3px 7px
    ),
    rgb(var(--v-theme-primary));
}
.playing-card__corner {
  position: absolute;
  top: 3px;
  left: 4px;
  text-align: center;
}
.playing-card--sm .playing-card__corner {
  top: 2px;
  left: 2px;
}
.playing-card__pip {
  position: absolute;
  right: 5px;
  bottom: 3px;
  font-size: 1.6em;
}
</style>
