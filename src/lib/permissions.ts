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
    items: [{ label: 'Overview', to: '/', anyOf: [] }],
  },
  {
    title: 'Access',
    items: [
      { label: 'Panel users', to: '/access/admins', anyOf: ['access.admin_manage'] },
      { label: 'Roles', to: '/access/roles', anyOf: ['access.role_manage'] },
      { label: 'Permissions', to: '/access/permissions', anyOf: ['access.permission_grant'] },
      { label: 'Audit trail', to: '/audit', anyOf: ['access.audit_view'] },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Live rooms', to: '/rooms', anyOf: ['rooms.view'] },
      { label: 'Room catalogue', to: '/room-catalogue', anyOf: ['rooms.view'] },
      { label: 'Users', to: '/users', anyOf: ['users.view'] },
      { label: 'Gifts', to: '/gifts', anyOf: ['gifts.view'] },
      { label: 'Store', to: '/store', anyOf: ['vip.view'] },
      { label: 'VIP & cosmetics', to: '/vip', anyOf: ['vip.view'] },
      { label: 'Levels', to: '/levels', anyOf: ['levels.view'] },
      { label: 'Security', to: '/settings/security', anyOf: ['settings.manage'] },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { label: 'Events', to: '/events', anyOf: ['events.view'] },
      { label: 'Rankings', to: '/rankings', anyOf: ['rankings.view'] },
    ],
  },
  {
    title: 'Partners',
    items: [
      { label: 'Agencies', to: '/agencies', anyOf: ['agency.view'] },
      { label: 'Hosts', to: '/hosts', anyOf: ['hosts.view'] },
      { label: 'Gift Targets', to: '/gift-targets', anyOf: ['hosts.gift_target_manage'] },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Payouts', to: '/payouts', anyOf: ['payouts.view'] },
      { label: 'Settlements', to: '/settlements', anyOf: ['agency.view'] },
      { label: 'Rates & commission', to: '/economy', anyOf: ['economy.ledger_view'] },
      { label: 'Report centre', to: '/reports', anyOf: ['reports_export.users'] },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'App content', to: '/content', anyOf: ['cms.banner_manage'] },
      { label: 'Campaigns', to: '/campaigns', anyOf: ['cms.announcement_manage'] },
    ],
  },
  {
    title: 'Safety',
    items: [
      { label: 'Support inbox', to: '/support', anyOf: ['support.view'] },
      { label: 'Reports queue', to: '/reports', anyOf: ['reports.view'] },
      { label: 'Content filter', to: '/moderation/words', anyOf: ['moderation.bannedwords_manage'] },
      { label: 'Moderator activity', to: '/moderation/activity', anyOf: ['moderation.logs_view'] },
    ],
  },
  {
    // `system.logs_view` is deliberately excluded from the `admin` baseline (RoleSeeder).
    // `requireRole` keeps this off Super Admin too — the backend route enforces the same
    // restriction (role:it_admin), so this only hides a link that would otherwise 403.
    title: 'IT Admin',
    items: [
      { label: 'System logs', to: '/system/logs', anyOf: ['system.logs_view'], requireRole: 'it_admin' },
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
