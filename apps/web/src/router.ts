import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { ensureAuth } from './composables/useAuth';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  {
    path: '/',
    component: () => import('./views/MainLayout.vue'),
    children: [
      { path: '', name: 'hall', component: () => import('./views/HallView.vue') },
      { path: 'workspace', name: 'workspace', component: () => import('./views/WorkspaceView.vue') },
      { path: 'printers', name: 'printers', component: () => import('./views/PrintersView.vue') },
      { path: 'notifications', name: 'notifications', component: () => import('./views/NotificationsView.vue') },
      { path: 'profile', name: 'profile', component: () => import('./views/ProfileView.vue') },
      { path: 'demands/:id', name: 'demand-detail', component: () => import('./views/DemandDetailView.vue') },
    ],
  },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue') },
  { path: '/dev', name: 'dev', component: () => import('./views/DevView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async (to) => {
  if (to.name === 'dev') return true;
  const user = await ensureAuth();
  if (to.name === 'login') return user ? { name: 'hall' } : true;
  if (!user) return { name: 'login' };
  if (to.name === 'admin' && !user.isAdmin) return { name: 'hall' };
  return true;
});
