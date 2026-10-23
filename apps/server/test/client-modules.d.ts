// registry.test.ts imports the client game registry, whose manifests lazy-load .vue
// files and RULES.md. Vite and vue-tsc type those for the client; plain tsc needs this.
declare module '*.vue' {
  import type { Component } from 'vue'
  const component: Component
  export default component
}

declare module '*?raw' {
  const text: string
  export default text
}
