import type SettingSelect from './components/settings/SettingSelect.vue'
import type SettingSlider from './components/settings/SettingSlider.vue'
import type SettingToggle from './components/settings/SettingToggle.vue'

declare module 'vue' {
  export interface GlobalComponents {
    SettingSlider: typeof SettingSlider
    SettingSelect: typeof SettingSelect
    SettingToggle: typeof SettingToggle
  }
}
