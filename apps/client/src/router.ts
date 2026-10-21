import { createRouter, createWebHistory } from 'vue-router'
import { authClient } from './lib/auth-client.ts'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
    { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue') },
    {
      path: '/room/:code',
      name: 'room',
      component: () => import('./pages/RoomPage.vue'),
      props: (route) => ({ code: String(route.params.code).toUpperCase() }),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/** UX only: the server enforces admin access on every admin route. */
router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin')) return true
  const { data } = await authClient.getSession()
  if (!data) return { name: 'login', query: { redirect: to.fullPath } }
  if ((data.user as { role?: string }).role !== 'admin') return { name: 'home' }
  return true
})

export default router
