import { createApp } from 'vue'
import 'unfonts.css'
import App from './App.vue'
import SettingSelect from './components/settings/SettingSelect.vue'
import SettingSlider from './components/settings/SettingSlider.vue'
import SettingToggle from './components/settings/SettingToggle.vue'
import { loadConfig } from './lib/config.ts'
import { connect } from './lib/room.ts'
import vuetify from './plugins/vuetify.ts'
import router from './router.ts'
import './styles/app.css'

const app = createApp(App)
app.use(vuetify)
app.use(router)
// Shared settings fields, available to every game's SettingsView without imports
// (games import only from packages/core and their own folder).
app.component('SettingSlider', SettingSlider)
app.component('SettingSelect', SettingSelect)
app.component('SettingToggle', SettingToggle)

void loadConfig()
connect()
app.mount('#app')
