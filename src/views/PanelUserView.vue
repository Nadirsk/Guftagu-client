<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import ModuleRack from '@/components/ModuleRack.vue'
import PageHead from '@/components/PageHead.vue'
import PermissionStrip from '@/components/PermissionStrip.vue'
import ReauthDialog from '@/components/ReauthDialog.vue'
import StateLamp from '@/components/StateLamp.vue'
import { ApiError, api } from '@/lib/api'
import { isDenied } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'
import type {
  AdminProfile,
  EffectivePermissions,
  GrantScope,
  GrantableResult,
  ModuleGroup,
  PermissionItem,
  PermissionLogRow,
} from '@/types/api'

/**
 * GFT-124 (grant UI), GFT-126 (effective viewer with origin) and the grant history, on one
 * screen — because deciding what to grant means seeing what is already there.
 */
const auth = useAuthStore()
const route = useRoute()
const adminId = Number(route.params.id)

const tab = ref<'effective' | 'grant' | 'history'>('effective')

const target = ref<AdminProfile | null>(null)
const effective = ref<EffectivePermissions | null>(null)
const grantable = ref<GrantableResult | null>(null)
const log = ref<PermissionLogRow[]>([])
const loading = ref(true)

const openRacks = reactive<Record<string, boolean>>({})
const selected = ref<Set<string>>(new Set())
const busy = ref(false)

const reauthOpen = ref(false)
const pendingHighRisk = ref<string[]>([])

const grantForm = reactive({
  reason: '',
  expires_at: '' as string,
  useScope: false,
  categories: '' as string,
  agencies: '' as string,
  shiftFrom: '18:00',
  shiftTo: '02:00',
  tz: 'Asia/Kolkata',
})

// ------------------------------------------------------------------ derived

/** Row lookup so a strip can show its origin without an O(n) scan per render. */
const rowByKey = computed(() => {
  const map = new Map<string, EffectivePermissions['detail'][number]>()
  for (const row of effective.value?.detail ?? []) map.set(row.key, row)
  return map
})

const resolution = computed(() => {
  const detail = effective.value?.detail ?? []
  return {
    role: detail.filter((r) => r.origin === 'role' || r.origin === 'role_and_direct').length,
    direct: detail.filter((r) => r.origin === 'direct_grant' || r.origin === 'role_and_direct')
      .length,
    denied: detail.filter((r) => isDenied(r.origin)).length,
    effective: effective.value?.effective_keys.length ?? 0,
  }
})

/** The viewer groups the resolved detail by module, so racks match the grant surface. */
const effectiveModules = computed<ModuleGroup[]>(() => {
  const groups = new Map<string, PermissionItem[]>()

  for (const row of effective.value?.detail ?? []) {
    const list = groups.get(row.module) ?? []
    list.push({
      id: 0,
      key: row.key,
      action: row.action,
      name: row.key,
      risk_level: row.risk_level,
    })
    groups.set(row.module, list)
  }

  return [...groups.entries()]
    .map(([module, permissions]) => ({ module, permissions }))
    .sort((a, b) => a.module.localeCompare(b.module))
})

const selectedHighRisk = computed(() => {
  const keys: string[] = []
  for (const group of grantable.value?.modules ?? []) {
    for (const permission of group.permissions) {
      if (selected.value.has(permission.key) && permission.risk_level === 'high') {
        keys.push(permission.key)
      }
    }
  }
  return keys
})

const canDelegateHere = computed(
  () => grantable.value?.can_delegate === true && target.value?.id !== auth.admin?.id,
)

// --------------------------------------------------------------------- load

onMounted(load)

async function load() {
  loading.value = true
  try {
    const [profile, perms] = await Promise.all([
      api.get<AdminProfile>(`/admin/admins/${adminId}`).catch(() => null),
      api.get<EffectivePermissions>(`/admin/admins/${adminId}/permissions`),
    ])

    target.value = profile?.data ?? null
    effective.value = perms.data

    for (const group of effectiveModules.value) openRacks[group.module] ??= true
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function loadGrantable() {
  if (grantable.value) return
  try {
    const { data } = await api.get<GrantableResult>('/admin/permissions/grantable')
    grantable.value = data
    for (const group of data.modules) openRacks[group.module] ??= false
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadLog() {
  if (log.value.length) return
  try {
    const { data } = await api.get<PermissionLogRow[]>(
      `/admin/admins/${adminId}/permission-log`,
      { per_page: 50 },
    )
    log.value = data
  } catch (e) {
    // `access.audit_view` is a separate key — not holding it is normal, not an error.
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

function onTab(next: string | number) {
  tab.value = next as typeof tab.value
  if (tab.value === 'grant') void loadGrantable()
  if (tab.value === 'history') void loadLog()
}

// -------------------------------------------------------------------- grant

function toggle(key: string, on: boolean) {
  const next = new Set(selected.value)
  on ? next.add(key) : next.delete(key)
  selected.value = next
}

function buildScope(): GrantScope | undefined {
  if (!grantForm.useScope) return undefined

  const scope: GrantScope = {}

  const categories = grantForm.categories
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
  if (categories.length) scope.room_categories = categories

  const agencies = grantForm.agencies
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
  if (agencies.length) scope.agencies = agencies

  if (grantForm.shiftFrom && grantForm.shiftTo) {
    scope.shift = { from: grantForm.shiftFrom, to: grantForm.shiftTo, tz: grantForm.tz }
  }

  return Object.keys(scope).length ? scope : undefined
}

async function grant() {
  if (!selected.value.size) return

  busy.value = true
  try {
    const { message } = await api.post(`/admin/admins/${adminId}/permissions`, {
      permissions: [...selected.value],
      scope: buildScope(),
      expires_at: grantForm.expires_at || undefined,
      reason: grantForm.reason || undefined,
    })

    ElMessage.success(message)
    selected.value = new Set()
    grantForm.reason = ''
    await refresh()
    tab.value = 'effective'
  } catch (e) {
    handleGrantError(e)
  } finally {
    busy.value = false
  }
}

/**
 * The guard responses are the interesting part of this screen, so each is reported in the
 * terms the operator needs — not as a generic red toast.
 */
function handleGrantError(e: unknown) {
  if (!(e instanceof ApiError)) {
    ElMessage.error('Something went wrong.')
    return
  }

  switch (e.code) {
    case 'MFA_REQUIRED':
      pendingHighRisk.value = (e.details?.high_risk as string[]) ?? selectedHighRisk.value
      reauthOpen.value = true
      break

    case 'PERMISSION_ESCALATION_DENIED': {
      const ungranted = (e.details?.ungranted as string[]) ?? []
      void ElMessageBox.alert(
        `You cannot grant what you do not hold yourself:\n\n${ungranted.join('\n')}\n\nNothing was granted — the whole request was refused.`,
        'Refused',
        { confirmButtonText: 'Understood', type: 'error' },
      )
      break
    }

    case 'DELEGATION_TARGET_DENIED':
      ElMessage.error('You are not allowed to grant permissions to this account.')
      break

    case 'SELF_GRANT_DENIED':
      ElMessage.error('You cannot grant permissions to yourself.')
      break

    default:
      ElMessage.error(e.message)
  }
}

async function revoke(key: string) {
  try {
    await ElMessageBox.confirm(
      `Revoke ${key}? If the role baseline still grants it, this changes nothing — use Deny for that.`,
      'Revoke direct grant',
      { confirmButtonText: 'Revoke', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    const { data } = await api.del<{ revoked: string[]; still_held_via_role: string[] }>(
      `/admin/admins/${adminId}/permissions`,
      { permissions: [key] },
    )

    if (!data.revoked.length) {
      ElMessage.info('No direct grant to remove — this comes from the role baseline.')
    } else if (data.still_held_via_role.length) {
      ElMessage.warning('Direct grant removed, but the role baseline still grants it.')
    } else {
      ElMessage.success('Revoked')
    }
    await refresh()
  } catch (e) {
    handleGrantError(e)
  }
}

async function deny(key: string) {
  try {
    await ElMessageBox.confirm(
      `Deny ${key}? A deny overrides the role baseline and always wins.`,
      'Deny permission',
      { confirmButtonText: 'Deny', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await api.post(`/admin/admins/${adminId}/permissions/deny`, { permissions: [key] })
    ElMessage.success('Denied')
    await refresh()
  } catch (e) {
    handleGrantError(e)
  }
}

async function refresh() {
  const { data } = await api.get<EffectivePermissions>(`/admin/admins/${adminId}/permissions`)
  effective.value = data
  log.value = []
  if (tab.value === 'history') await loadLog()
}

async function onReauthConfirmed() {
  await auth.fetchMe()
  await grant()
}
</script>

<template>
  <PageHead
    eyebrow="Access · panel user"
    :title="target?.name ?? effective?.admin.name ?? `Admin #${adminId}`"
    :lede="
      target?.email
        ? `${target.email} · ${target.role?.name ?? 'no role'}`
        : 'Effective permissions, and what you may delegate.'
    "
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <!-- The resolution line: role ∪ direct − deny, stated as arithmetic. -->
    <div class="panel mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div>
        <div class="eyebrow">Effective</div>
        <div class="text-[17px] font-semibold">{{ resolution.effective }}</div>
      </div>
      <div class="text-[var(--color-legend-dim)]">=</div>
      <div class="flex items-center gap-2">
        <StateLamp state="role" size="sm" />
        <div>
          <div class="eyebrow">From role</div>
          <div class="text-[14px]">{{ resolution.role }}</div>
        </div>
      </div>
      <div class="text-[var(--color-legend-dim)]">+</div>
      <div class="flex items-center gap-2">
        <StateLamp state="direct" size="sm" />
        <div>
          <div class="eyebrow">Granted directly</div>
          <div class="text-[14px]">{{ resolution.direct }}</div>
        </div>
      </div>
      <div class="text-[var(--color-legend-dim)]">−</div>
      <div class="flex items-center gap-2">
        <StateLamp state="denied" size="sm" />
        <div>
          <div class="eyebrow">Denied</div>
          <div class="text-[14px]">{{ resolution.denied }}</div>
        </div>
      </div>

      <div class="ml-auto">
        <el-tag v-if="effective?.admin.role === 'super_admin'" type="warning" size="small">
          unrestricted
        </el-tag>
      </div>
    </div>

    <el-tabs :model-value="tab" @update:model-value="onTab">
      <!-- GFT-126 -->
      <el-tab-pane label="Effective permissions" name="effective">
        <EmptyState
          v-if="!loading && effectiveModules.length === 0"
          title="This account holds nothing yet"
          body="Its role baseline is empty and nothing has been granted directly."
        />

        <div v-else class="space-y-2">
          <p class="text-[13px] text-[var(--color-legend)]">
            A denied permission is still listed, struck through, so you can see why it is missing
            rather than wondering where it went.
          </p>

          <ModuleRack
            v-for="group in effectiveModules"
            :key="group.module"
            :module="group.module"
            :held="group.permissions.filter((p) => !isDenied(rowByKey.get(p.key)!.origin)).length"
            :total="group.permissions.length"
            :open="openRacks[group.module] ?? true"
            @update:open="openRacks[group.module] = $event"
          >
            <div v-for="permission in group.permissions" :key="permission.key" class="group/strip">
              <PermissionStrip :permission="permission" :row="rowByKey.get(permission.key) ?? null" />

              <div
                v-if="canDelegateHere"
                class="mt-1 flex gap-2 opacity-0 transition-opacity group-hover/strip:opacity-100 focus-within:opacity-100"
              >
                <button
                  v-if="rowByKey.get(permission.key)?.origin.startsWith('direct')
                    || rowByKey.get(permission.key)?.origin === 'role_and_direct'"
                  type="button"
                  class="eyebrow text-[var(--color-legend)] hover:text-[var(--color-paper)]"
                  @click="revoke(permission.key)"
                >
                  revoke
                </button>
                <button
                  v-if="!isDenied(rowByKey.get(permission.key)!.origin)"
                  type="button"
                  class="eyebrow text-[var(--color-legend)] hover:text-[var(--color-cut)]"
                  @click="deny(permission.key)"
                >
                  deny
                </button>
              </div>
            </div>
          </ModuleRack>
        </div>
      </el-tab-pane>

      <!-- GFT-124 -->
      <el-tab-pane label="Grant" name="grant">
        <div v-if="grantable && !grantable.can_delegate" class="panel px-4 py-3">
          <div class="eyebrow text-[var(--color-cut)]">You cannot delegate</div>
          <p class="mt-1 text-[13px]">
            Your role may hold permissions, but it may not pass them on. Only a Super Admin or an
            Admin can grant.
          </p>
        </div>

        <div v-else-if="target?.id === auth.admin?.id" class="panel px-4 py-3">
          <div class="eyebrow text-[var(--color-cut)]">Not on your own account</div>
          <p class="mt-1 text-[13px]">
            Granting to yourself is refused by the server, so it is not offered here either.
          </p>
        </div>

        <div v-else class="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div class="space-y-2">
            <p class="text-[13px] text-[var(--color-legend)]">
              Only permissions you hold yourself are listed — you cannot pass on what you do not
              have. Keys with a hatched edge are high risk and need a fresh code to grant.
            </p>

            <ModuleRack
              v-for="group in grantable?.modules ?? []"
              :key="group.module"
              :module="group.module"
              :total="group.permissions.length"
              :selected-count="group.permissions.filter((p) => selected.has(p.key)).length"
              :open="openRacks[group.module] ?? false"
              @update:open="openRacks[group.module] = $event"
            >
              <PermissionStrip
                v-for="permission in group.permissions"
                :key="permission.key"
                :permission="permission"
                selectable
                :model-value="selected.has(permission.key)"
                :disabled="rowByKey.get(permission.key)?.origin === 'role'"
                disabled-reason="Already held through the role baseline"
                @update:model-value="toggle(permission.key, $event)"
              />
            </ModuleRack>
          </div>

          <!-- Grant options -->
          <aside class="panel h-fit lg:sticky lg:top-4">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">{{ selected.size }} selected</div>
            </div>

            <div class="space-y-4 p-4">
              <div>
                <label class="eyebrow mb-1 block" for="reason">Reason</label>
                <el-input
                  id="reason"
                  v-model="grantForm.reason"
                  type="textarea"
                  :rows="2"
                  placeholder="Night-shift moderator, music rooms only"
                />
                <p class="eyebrow mt-1">recorded in the grant log</p>
              </div>

              <div>
                <label class="eyebrow mb-1 block">Expires</label>
                <el-date-picker
                  v-model="grantForm.expires_at"
                  type="datetime"
                  placeholder="Never"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  class="w-full"
                />
                <p class="eyebrow mt-1">an expired grant stops counting immediately</p>
              </div>

              <div class="border-t border-[var(--color-edge)] pt-3">
                <el-checkbox v-model="grantForm.useScope" size="small">
                  Narrow with a scope
                </el-checkbox>

                <div v-if="grantForm.useScope" class="mt-3 space-y-3">
                  <div>
                    <label class="eyebrow mb-1 block" for="cats">Room categories</label>
                    <el-input id="cats" v-model="grantForm.categories" placeholder="3, 7" />
                  </div>
                  <div>
                    <label class="eyebrow mb-1 block" for="agencies">Agencies</label>
                    <el-input id="agencies" v-model="grantForm.agencies" placeholder="12" />
                  </div>
                  <div>
                    <label class="eyebrow mb-1 block">Shift window</label>
                    <div class="flex items-center gap-1.5">
                      <el-input v-model="grantForm.shiftFrom" class="w-20" />
                      <span class="text-[var(--color-legend)]">–</span>
                      <el-input v-model="grantForm.shiftTo" class="w-20" />
                    </div>
                    <p class="eyebrow mt-1">may cross midnight · {{ grantForm.tz }}</p>
                  </div>
                </div>
              </div>

              <el-button
                type="primary"
                class="w-full"
                :loading="busy"
                :disabled="!selected.size"
                @click="grant"
              >
                Grant {{ selected.size || '' }}
              </el-button>

              <p v-if="selectedHighRisk.length" class="eyebrow text-[var(--color-cut)]">
                {{ selectedHighRisk.length }} high-risk · you will be asked for a code
              </p>
            </div>
          </aside>
        </div>
      </el-tab-pane>

      <el-tab-pane label="History" name="history">
        <EmptyState
          v-if="!log.length"
          title="Nothing recorded"
          body="Grants, revokes and denies for this account will appear here. Reading it needs access.audit_view."
        />

        <ol v-else class="space-y-1.5">
          <li
            v-for="entry in log"
            :key="entry.id"
            class="panel flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
          >
            <span
              class="eyebrow"
              :class="
                entry.action === 'deny'
                  ? 'text-[var(--color-cut)]'
                  : entry.action === 'revoke'
                    ? 'text-[var(--color-legend)]'
                    : 'text-[var(--color-signal)]'
              "
            >
              {{ entry.action }}
            </span>
            <span class="key flex-1">{{ entry.permission }}</span>
            <span class="key text-[var(--color-legend-dim)]">
              {{ entry.effect_before ?? 'none' }} → {{ entry.effect_after ?? 'none' }}
            </span>
            <span class="text-[12px] text-[var(--color-legend)]">
              {{ entry.actor?.name ?? 'system' }}
            </span>
            <span class="eyebrow">
              {{ entry.created_at ? new Date(entry.created_at).toLocaleString() : '' }}
            </span>
            <p v-if="entry.reason" class="w-full text-[12px] text-[var(--color-legend)]">
              “{{ entry.reason }}”
            </p>
          </li>
        </ol>
      </el-tab-pane>
    </el-tabs>
  </div>

  <ReauthDialog
    v-model="reauthOpen"
    :high-risk="pendingHighRisk"
    @confirmed="onReauthConfirmed"
  />
</template>
