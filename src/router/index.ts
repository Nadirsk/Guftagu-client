import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Permission key required to open the route. Checked again server-side. */
    permission?: string
    public?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: 'Sign in' },
    },
    {
      path: '/',
      component: () => import('@/components/AppShell.vue'),
      children: [
        {
          path: '',
          name: 'overview',
          component: () => import('@/views/OverviewView.vue'),
          meta: { title: 'Overview' },
        },
        {
          path: 'account',
          name: 'account',
          component: () => import('@/views/AccountView.vue'),
          meta: { title: 'Your account' },
        },
        {
          path: 'access/admins',
          name: 'admins',
          component: () => import('@/views/PanelUsersView.vue'),
          meta: { permission: 'access.admin_manage', title: 'Panel users' },
        },
        {
          path: 'access/admins/:id',
          name: 'admin-detail',
          component: () => import('@/views/PanelUserView.vue'),
          meta: { permission: 'access.permission_grant', title: 'Permissions' },
        },
        {
          path: 'access/roles',
          name: 'roles',
          component: () => import('@/views/RolesView.vue'),
          meta: { permission: 'access.role_manage', title: 'Roles' },
        },
        {
          path: 'access/permissions',
          name: 'permissions',
          component: () => import('@/views/CatalogueView.vue'),
          meta: { permission: 'access.permission_grant', title: 'Permission catalogue' },
        },
        {
          path: 'rooms',
          name: 'rooms',
          component: () => import('@/views/RoomsView.vue'),
          meta: { permission: 'rooms.view', title: 'Rooms' },
        },
        {
          path: 'rooms/:id',
          name: 'room-detail',
          component: () => import('@/views/RoomDetailView.vue'),
          meta: { permission: 'rooms.view', title: 'Room' },
        },
        {
          path: 'room-catalogue',
          name: 'room-catalogue',
          component: () => import('@/views/RoomCatalogueView.vue'),
          meta: { permission: 'rooms.view', title: 'Room catalogue' },
        },
        {
          path: 'events',
          name: 'events',
          component: () => import('@/views/EventsView.vue'),
          meta: { permission: 'events.view', title: 'Events' },
        },
        {
          path: 'events/:id',
          name: 'event-detail',
          component: () => import('@/views/EventDetailView.vue'),
          meta: { permission: 'events.view', title: 'Event' },
        },
        {
          path: 'rankings',
          name: 'rankings',
          component: () => import('@/views/RankingsView.vue'),
          meta: { permission: 'rankings.view', title: 'Rankings' },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('@/views/ReportsView.vue'),
          meta: { permission: 'reports.view', title: 'Reports queue' },
        },
        {
          path: 'moderation/words',
          name: 'moderation-words',
          component: () => import('@/views/BannedWordsView.vue'),
          meta: { permission: 'moderation.bannedwords_manage', title: 'Content filter' },
        },
        {
          path: 'moderation/activity',
          name: 'moderation-activity',
          component: () => import('@/views/ModerationActivityView.vue'),
          meta: { permission: 'moderation.logs_view', title: 'Moderator activity' },
        },
        {
          path: 'agencies',
          name: 'agencies',
          component: () => import('@/views/AgenciesView.vue'),
          meta: { permission: 'agency.view', title: 'Agencies' },
        },
        {
          path: 'hosts',
          name: 'hosts',
          component: () => import('@/views/HostsView.vue'),
          meta: { permission: 'hosts.view', title: 'Hosts' },
        },
        {
          path: 'hosts/:id',
          name: 'host-detail',
          component: () => import('@/views/HostDetailView.vue'),
          meta: { permission: 'hosts.view', title: 'Host' },
        },
        {
          path: 'settlements',
          name: 'settlements',
          component: () => import('@/views/SettlementsView.vue'),
          meta: { permission: 'agency.view', title: 'Settlements' },
        },
        {
          path: 'content',
          name: 'content',
          component: () => import('@/views/ContentView.vue'),
          meta: { permission: 'cms.banner_manage', title: 'App content' },
        },
        {
          path: 'campaigns',
          name: 'campaigns',
          component: () => import('@/views/CampaignsView.vue'),
          meta: { permission: 'cms.announcement_manage', title: 'Campaigns' },
        },
        {
          path: 'reports',
          name: 'report-centre',
          component: () => import('@/views/ReportCentreView.vue'),
          meta: { permission: 'reports_export.users', title: 'Report centre' },
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/AuditLogView.vue'),
          meta: { permission: 'access.audit_view', title: 'Audit trail' },
        },
        {
          path: 'support',
          name: 'support',
          component: () => import('@/views/SupportView.vue'),
          meta: { permission: 'support.view', title: 'Support inbox' },
        },
        {
          path: 'payouts',
          name: 'payouts',
          component: () => import('@/views/PayoutsView.vue'),
          meta: { permission: 'payouts.view', title: 'Payouts' },
        },
        {
          path: 'economy',
          name: 'economy',
          component: () => import('@/views/EconomyView.vue'),
          meta: { permission: 'economy.ledger_view', title: 'Economy' },
        },
        {
          path: 'gifts',
          name: 'gifts',
          component: () => import('@/views/GiftsView.vue'),
          meta: { permission: 'gifts.view', title: 'Gifts' },
        },
        {
          path: 'vip',
          name: 'vip',
          component: () => import('@/views/VipView.vue'),
          meta: { permission: 'vip.view', title: 'VIP' },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { permission: 'users.view', title: 'Users' },
        },
        {
          path: 'users/:id',
          name: 'user-detail',
          component: () => import('@/views/UserDetailView.vue'),
          meta: { permission: 'users.view', title: 'User' },
        },
        {
          path: 'settings/security',
          name: 'security',
          component: () => import('@/views/SecurityView.vue'),
          meta: { permission: 'settings.manage', title: 'Security' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Not found' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Resolve a stored token once, before the first guarded decision.
  if (!auth.ready) await auth.restore()

  if (to.meta.public) {
    return auth.isAuthenticated ? { name: 'overview' } : true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  }

  // Deny by default is the server's job; here it just avoids opening a screen whose every
  // request would 403.
  if (to.meta.permission && !auth.can(to.meta.permission)) {
    return { name: 'overview', query: { denied: to.meta.permission } }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Guftagu Console` : 'Guftagu Console'
})

export default router
