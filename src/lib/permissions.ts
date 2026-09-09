import type { App, Directive, DirectiveBinding } from 'vue'

import { useAuthStore } from '@/stores/auth'
import type { PermissionOrigin } from '@/types/api'

/**
 * `v-permission="'users.suspend'"` removes the element when the caller lacks the key.
 * `v-permission.disable="'users.suspend'"` leaves it visible but inert, which is the
 * better choice when hiding a control would make the screen look broken or incomplete.
 *
 * This is presentation only. Every one of these keys is enforced again server-side —
 * the A.11 criteria are explicit that hiding an option in the UI proves nothing.
 */
export const permissionDirective: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    apply(el, binding)
  },
  updated(el, binding) {
    apply(el, binding)
  },
}

function apply(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
  const auth = useAuthStore()
  const allowed = auth.can(binding.value)

  if (allowed) {
    el.removeAttribute('data-permission-blocked')
    if (binding.modifiers.disable) {
      el.classList.remove('opacity-40', 'pointer-events-none')
      el.removeAttribute('aria-disabled')
    } else {
      el.style.removeProperty('display')
    }
    return
  }

  el.setAttribute('data-permission-blocked', String(binding.value))

  if (binding.modifiers.disable) {
    el.classList.add('opacity-40', 'pointer-events-none')
    el.setAttribute('aria-disabled', 'true')
    el.title = `Requires ${Array.isArray(binding.value) ? binding.value.join(', ') : binding.value}`
  } else {
    el.style.display = 'none'
  }
}

export function installPermissions(app: App) {
  app.directive('permission', permissionDirective)
}

// ------------------------------------------------------------------ nav model

export interface NavItem {
  label: string
  to: string
  /** Name of an @element-plus/icons-vue component, resolved by SideRail. */
  icon: string
  /** Shown only when the caller holds at least one of these. Empty means always. */
  anyOf: string[]
  /** Marks a section that exists in the spec but has no backend yet. */
  pending?: boolean
  /**
   * Restricts the item to one specific role, on top of `anyOf`. Unlike a permission key,
   * Super Admin's blanket bypass does NOT satisfy this — use it for the rare screen that
   * must stay off-limits even to Super Admin (see System logs below and role:it_admin
   * in routes/api.php).
   */
  requireRole?: string
}

export interface NavSection {
  title: string
  /** Name of an @element-plus/icons-vue component, used on the group header. */
  icon: string
  items: NavItem[]
}

/**
 * The sidebar is permission-driven: a Moderator granted only `reports.view` sees the
 * reports section and nothing else. Sections whose items are all hidden disappear.
 *
 * `pending` entries are modules the spec defines but this build has not reached. They are
 * listed so the shape of the finished console is visible, and rendered as unavailable
 * rather than as links that 404.
 */
export const NAV: NavSection[] = [
  {
    title: 'Console',
    icon: 'Odometer',
    items: [{ label: 'Overview', to: '/', icon: 'Odometer', anyOf: [] }],
  },
  {
    title: 'Access',
    icon: 'Lock',
    items: [
      { label: 'Panel users', to: '/access/admins', icon: 'User', anyOf: ['access.admin_manage'] },
      {
        label: 'Roles',
        to: '/access/roles',
        icon: 'UserFilled',
        anyOf: ['access.role_manage'],
        requireRole: 'it_admin',
      },
      { label: 'Permissions', to: '/access/permissions', icon: 'Key', anyOf: ['access.permission_grant'] },
      { label: 'Audit trail', to: '/audit', icon: 'Tickets', anyOf: ['access.audit_view'] },
    ],
  },
  {
    title: 'Platform',
    icon: 'Grid',
    items: [
      { label: 'Live rooms', to: '/rooms', icon: 'Mic', anyOf: ['rooms.view'] },
      { label: 'Room catalogue', to: '/room-catalogue', icon: 'Menu', anyOf: ['rooms.view'] },
      { label: 'Users', to: '/users', icon: 'User', anyOf: ['users.view'] },
      { label: 'Gifts', to: '/gifts', icon: 'Present', anyOf: ['gifts.view'] },
      { label: 'Store', to: '/store', icon: 'Shop', anyOf: ['vip.view'] },
      { label: 'VIP & cosmetics', to: '/vip', icon: 'Star', anyOf: ['vip.view'] },
      { label: 'Levels', to: '/levels', icon: 'TrendCharts', anyOf: ['levels.view'] },
      { label: 'Security', to: '/settings/security', icon: 'Lock', anyOf: ['settings.manage'] },
    ],
  },
  {
    title: 'Engagement',
    icon: 'Trophy',
    items: [
      { label: 'Events', to: '/events', icon: 'Calendar', anyOf: ['events.view'] },
      { label: 'Rankings', to: '/rankings', icon: 'Trophy', anyOf: ['rankings.view'] },
    ],
  },
  {
    title: 'Partners',
    icon: 'OfficeBuilding',
    items: [
      { label: 'Agencies', to: '/agencies', icon: 'OfficeBuilding', anyOf: ['agency.view'] },
      { label: 'Hosts', to: '/hosts', icon: 'Microphone', anyOf: ['hosts.view'] },
      { label: 'Gift Targets', to: '/gift-targets', icon: 'Aim', anyOf: ['hosts.gift_target_manage'] },
    ],
  },
  {
    title: 'Money',
    icon: 'Wallet',
    items: [
      { label: 'Payouts', to: '/payouts', icon: 'Wallet', anyOf: ['payouts.view'] },
      { label: 'Settlements', to: '/settlements', icon: 'Money', anyOf: ['agency.view'] },
      { label: 'Rates & commission', to: '/economy', icon: 'Coin', anyOf: ['economy.ledger_view'] },
      { label: 'Report centre', to: '/report-centre', icon: 'DataAnalysis', anyOf: ['reports_export.users'] },
    ],
  },
  {
    title: 'Content',
    icon: 'Postcard',
    items: [
      { label: 'App content', to: '/content', icon: 'Postcard', anyOf: ['cms.banner_manage'] },
      { label: 'Campaigns', to: '/campaigns', icon: 'Promotion', anyOf: ['cms.announcement_manage'] },
    ],
  },
  {
    title: 'Safety',
    icon: 'WarnTriangleFilled',
    items: [
      { label: 'Support inbox', to: '/support', icon: 'Service', anyOf: ['support.view'] },
      // { label: 'Reports queue', to: '/reports', icon: 'WarnTriangleFilled', anyOf: ['reports.view'] },
      // { label: 'Content filter', to: '/moderation/words', icon: 'Filter', anyOf: ['moderation.bannedwords_manage'] },
      { label: 'Moderator activity', to: '/moderation/activity', icon: 'View', anyOf: ['moderation.logs_view'] },
    ],
  },
  {
    // `system.logs_view` is deliberately excluded from the `admin` baseline (RoleSeeder).
    // `requireRole` keeps this off Super Admin too — the backend route enforces the same
    // restriction (role:it_admin), so this only hides a link that would otherwise 403.
    title: 'IT Admin',
    icon: 'Monitor',
    items: [
      {
        label: 'System logs',
        to: '/system/logs',
        icon: 'Monitor',
        anyOf: ['system.logs_view'],
        requireRole: 'it_admin',
      },
    ],
  },
]

// -------------------------------------------------------------- presentation

/** How each origin reads on a channel strip. */
export const ORIGIN_LABEL: Record<PermissionOrigin, string> = {
  super_admin: 'ALL',
  role: 'ROLE',
  direct_grant: 'DIRECT',
  role_and_direct: 'ROLE+',
  denied_over_role: 'DENIED',
  denied_direct: 'DENIED',
}

export function isDenied(origin: PermissionOrigin): boolean {
  return origin === 'denied_over_role' || origin === 'denied_direct'
}
