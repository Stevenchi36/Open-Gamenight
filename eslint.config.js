import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import globals from 'globals'

export default defineConfigWithVueTs(
  // dist.next/dist.old are deploy.sh's build swap folders and stay on the server between deploys
  { ignores: ['**/dist/**', '**/dist.next/**', '**/dist.old/**', '**/node_modules/**', 'data/**', 'coverage/**'] },
  js.configs.recommended,
  // correctness rules only; template formatting is left to the author
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/client/**/*.{ts,vue}', 'games/*/client/**/*.{ts,vue}', 'packages/core/src/ui/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Native elements only: it can't see inside Vuetify components (v-btn, v-text-field, ...).
  ...pluginVueA11y.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    rules: {
      // Used only on a dialog's or page's one field (Join, Rename, the clue box), where it's the point.
      'vuejs-accessibility/no-autofocus': 'off',
    },
  },
  {
    // The game boundary (root CLAUDE.md): a game reaches the platform only through @ogn/core/*,
    // which keeps it buildable on its own. Relative paths out of the game's folder are caught by
    // apps/server/test/registry.test.ts, which can resolve them; the registries import every game by design.
    files: ['games/*/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@ogn/*', '!@ogn/core'], message: 'Games import only @ogn/core/* and their own folder; server services arrive through ServerServices.' },
          { group: ['**/apps/**', '**/packages/**'], message: 'Games import the core as @ogn/core/*, never by path.' },
        ],
      }],
    },
  },
  {
    // stdout is the MCP protocol: never console.log in the MCP process.
    files: ['apps/mcp/**/*.ts', 'games/*/server/**/*.ts'],
    rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
  },
)
