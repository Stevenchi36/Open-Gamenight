/**
 * Each page's <h1>, for screen readers, and moving focus to it on navigation. Player pages get a
 * visually hidden one (App.vue) named like the tab title; admin pages show their own.
 */
import { computed, nextTick, type ComputedRef } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { config } from './config.ts'
import { pageTitle } from './title.ts'

export function usePageHeading(route: RouteLocationNormalizedLoaded): ComputedRef<string | null> {
  return computed(() => (route.path.startsWith('/admin') ? null : pageTitle(route) || config.appName))
}

// A new page otherwise leaves focus on the link or button that led there (or nowhere), so a screen
// reader doesn't say the page changed. Not on first load, and not when only the query changes
// (the home tabs, where focus has to stay on the tab).
export function focusHeadingOnNavigate(router: Router): void {
  router.afterEach((to, from, failure) => {
    if (failure || from.matched.length === 0 || to.path === from.path) return
    void nextTick(() =>
      requestAnimationFrame(() => {
        const h1 = document.querySelector<HTMLElement>('main h1')
        if (!h1) return
        h1.tabIndex = -1
        h1.focus({ preventScroll: true })
      }),
    )
  })
}
