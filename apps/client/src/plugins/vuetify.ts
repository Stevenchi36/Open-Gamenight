/** Vuetify with light/dark themes; the primary color comes from APP_PRIMARY_COLOR at runtime. */
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { load } from '@ogn/core/ui/storage'

export const THEME_KEY = 'ogn.theme'

export default createVuetify({
  theme: {
    defaultTheme: load<string>(THEME_KEY) ?? 'system',
    themes: {
      light: { colors: { primary: '#6750A4' } },
      dark: { colors: { primary: '#D0BCFF' } },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg' },
    // the global rounded-lg would otherwise round every segment inside a group
    VBtnToggle: { rounded: 'lg', VBtn: { rounded: false } },
    VBtnGroup: { rounded: 'lg', VBtn: { rounded: false } },
    // .rounded-card in styles/app.css
    VCard: { rounded: 'card' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
})
