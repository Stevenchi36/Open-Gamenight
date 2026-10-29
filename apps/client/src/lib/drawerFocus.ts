// Keyboard focus for a temporary v-navigation-drawer opened from a button. Vuetify's drawer leaves
// focus where it was, so on open this moves it to the current item (or the first), and on close hands
// it back to the button unless something else took it (a dialog opened from the drawer).
// Pair it with `retain-focus` on the drawer, so Tab stays inside, and close it on Escape.
import { nextTick, ref, watch, type Ref } from 'vue'

export function useDrawerFocus(open: Ref<boolean>) {
  const drawer = ref<{ $el: HTMLElement } | null>(null)
  const button = ref<{ $el: HTMLElement } | null>(null)
  watch(open, async (now) => {
    await nextTick()
    const el = drawer.value?.$el
    const active = document.activeElement
    if (now) (el?.querySelector<HTMLElement>('.v-list-item--active') ?? el?.querySelector<HTMLElement>('.v-list-item'))?.focus()
    else if (!active || active === document.body || el?.contains(active)) button.value?.$el.focus()
  })
  return { drawer, button }
}
