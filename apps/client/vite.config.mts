import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Fonts from 'unplugin-fonts/vite'
import { defineConfig, type Plugin } from 'vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

const API = `http://localhost:${process.env.PORT ?? 3000}`

/**
 * Stamps each production build with an id: compiled into the bundle as __BUILD_ID__ and
 * written into index.html, where the server reads it and sends it in the `session`
 * message. A tab still running an older bundle after a deploy sees a different id and
 * reloads. Dev builds get '' and never reload.
 */
function buildId(): Plugin {
  const id = Date.now().toString(36)
  let isBuild = false
  return {
    name: 'ogn-build-id',
    config(_config, { command }) {
      isBuild = command === 'build'
      return { define: { __BUILD_ID__: JSON.stringify(isBuild ? id : '') } }
    },
    transformIndexHtml() {
      return isBuild ? [{ tag: 'meta', attrs: { name: 'ogn-build', content: id }, injectTo: 'head' }] : []
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    buildId(),
    Vue({ template: { transformAssetUrls } }),
    // Auto-imports the Vuetify components used in any .vue file, including games/*/client.
    Vuetify({ autoImport: true, styles: { configFile: 'src/styles/settings.scss' } }),
    Fonts({
      fontsource: { families: [{ name: 'Roboto', weights: [400, 500, 700], styles: ['normal'] }] },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('src', import.meta.url)) },
    // Game packages import vue/vuetify too; make sure everyone shares one copy.
    dedupe: ['vue', 'vuetify', 'vue-router'],
  },
  // Vuetify's auto-import adds deep imports (vuetify/components/VSwitch) after Vite's dep scan, so each
  // component first seen on a lazy page was a "new dependency": re-bundle plus a full page reload.
  optimizeDeps: { include: ['vuetify/components/*', 'vuetify/directives'] },
  server: {
    port: 5173,
    strictPort: true,
    // Dev: the browser talks to Vite; /api and /ws go to Express. Same origin either way.
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/ws': { target: API, ws: true, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
