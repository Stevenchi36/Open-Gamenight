import { save } from '@ogn/core/ui/storage'
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { THEME_KEY } from '../plugins/vuetify.ts'

// The light/dark toggle, shared by the app bar and the in-game menu.
export function useThemeToggle() {
  const theme = useTheme()
  const isDark = computed(() => theme.global.current.value.dark)
  function toggleTheme() {
    const next = isDark.value ? 'light' : 'dark'
    void theme.change(next)
    save(THEME_KEY, next)
  }
  return { theme, isDark, toggleTheme }
}
