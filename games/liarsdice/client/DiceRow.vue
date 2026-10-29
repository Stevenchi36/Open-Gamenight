<template>
  <div class="d-flex flex-wrap ga-1" role="img" :aria-label="dice.length === 1 ? `Die: ${dice[0]}` : `Dice: ${dice.join(', ')}`">
    <v-icon
      v-for="(d, i) in dice"
      :key="i"
      :icon="`mdi-dice-${d}`"
      :size="size"
      :color="highlight && counts(d) ? 'primary' : undefined"
      :class="{ 'opacity-40': highlight && !counts(d) }"
    />
  </div>
</template>

<script setup lang="ts">
// A row of dice faces. With `highlight`, dice that count toward that face (wild ones included) stand out.
import { countFace } from '../shared/index.ts'

const props = withDefaults(defineProps<{ dice: number[]; size?: string | number; highlight?: number; wildOnes?: boolean }>(), {
  size: 36,
  highlight: undefined,
  wildOnes: false,
})
const counts = (d: number) => props.highlight !== undefined && countFace([d], props.highlight, props.wildOnes) > 0
</script>
