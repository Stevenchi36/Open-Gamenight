/** Vuetify with light/dark themes; the primary color comes from APP_PRIMARY_COLOR at runtime. */
import { h } from 'vue'
import 'vuetify/styles'
import { createVuetify, type IconProps, type IconSet } from 'vuetify'
import { aliases, mdi as mdiSvg } from 'vuetify/iconsets/mdi-svg'
import { load } from '@ogn/core/ui/storage'
import { icons } from './icons.ts'

export const THEME_KEY = 'ogn.theme'

/**
 * Templates keep writing MDI names (icon="mdi-home"); this set draws the matching SVG path from icons.ts,
 * so only the icons we use ship instead of the whole MDI font (~450 KB on first load).
 * Vuetify's own aliases ($close, $checkboxOn, ...) come as SVG paths from its SVG iconset.
 */
const mdi: IconSet = {
  component: (props: IconProps) => {
    const path = typeof props.icon === 'string' ? icons[props.icon] : undefined
    if (!path && import.meta.env.DEV) console.warn(`Icon ${String(props.icon)} is missing from plugins/icons.ts`)
    return h(mdiSvg.component, { ...props, icon: path })
  },
}

export default createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
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
