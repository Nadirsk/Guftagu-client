<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { RoleKey, RoleSummary } from '@/types/api'

/** GFT-011 — session timeout (A.1c) and 2FA per sub-role (A.1d). */
const auth = useAuthStore()

const roles = ref<RoleSummary[]>([])
const loading = ref(true)

const timeout = ref(auth.idleTimeoutMinutes)
const savingTimeout = ref(false)

/**
 * The API has no "read the 2FA policy" endpoint — `POST /admin/auth/mfa/toggle/{role}`
 * only writes. So the switches start from the seeded defaults in docs/02 and reflect what
 * this session has changed. Noted in the UI rather than presenting a guess as fact.
 */
const mfaPolicy = ref<Record<RoleKey, boolean>>({
  super_admin: true,
  admin: true,
  manager: false,
  moderator: false,
})
const touched = ref<Set<RoleKey>>(new Set())
const savingRole = ref<RoleKey | null>(null)

onMounted(async () => {
  try {
    const { data } = await api.get<RoleSummary[]>('/admin/roles')
    roles.value = data
  } catch {
    // Roles need `access.role_manage`, which this screen does not require. Fall back to
    // the four system roles rather than blocking the 2FA controls behind an unrelated key.
    roles.value = (['super_admin', 'admin', 'manager', 'moderator'] as RoleKey[]).map(
      (key, index) => ({
        id: index + 1,
        key,
        name: key.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: null,
        is_system: true,
        permission_count: 0,
        admin_count: 0,
      }),
    )
  } finally {
    loading.value = false
  }
})

async function saveTimeout() {
  savingTimeout.value = true
  try {
    await api.patch('/admin/settings/session-timeout', { minutes: timeout.value })
    auth.idleTimeoutMinutes = timeout.value
    ElMessage.success(
      timeout.value === 0
        ? 'Idle expiry switched off'
        : `Sessions now end after ${timeout.value} minutes idle`,
    )
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    savingTimeout.value = false
  }
}

async function toggleMfa(role: RoleKey, enabled: boolean) {
  savingRole.value = role
  try {
    await api.post(`/admin/auth/mfa/toggle/${role}`, { enabled })
    mfaPolicy.value[role] = enabled
    touched.value.add(role)
    ElMessage.success(`${enabled ? 'Enabled' : 'Disabled'} two-factor for ${role}`)
  } catch (e) {
    mfaPolicy.value[role] = !enabled // put the switch back where it was
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    savingRole.value = null
  }
}
</script>

<template>
  <PageHead
    eyebrow="Platform"
    title="Security"
    lede="Session expiry and the two-factor policy. These apply to every panel account, so a change here is felt immediately."
  />

  <div class="grid gap-5 px-5 py-5 md:px-7 lg:grid-cols-2">
    <!-- A.1c -->
    <section class="panel">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Idle session timeout</div>
      </div>

      <div class="space-y-4 p-4">
        <p class="text-[13px] text-[var(--color-legend)]">
          How long a signed-in admin can sit idle before their next request is refused and their
          token deleted. Accounts with their own override are unaffected.
        </p>

        <div class="flex items-end gap-3">
          <div>
            <label class="eyebrow mb-1 block" for="timeout">Minutes</label>
            <el-input-number id="timeout" v-model="timeout" :min="0" :max="1440" :step="5" />
          </div>
          <el-button type="primary" :loading="savingTimeout" @click="saveTimeout">Save</el-button>
        </div>

        <p
          v-if="timeout === 0"
          class="border-l-2 border-l-[var(--color-cut)] bg-[var(--color-raised)] px-3 py-2 text-[12px]"
        >
          Zero switches idle expiry off entirely. Sessions then last until the 24-hour token
          lifetime runs out.
        </p>
      </div>
    </section>

    <!-- A.1d -->
    <section class="panel">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Two-factor by role</div>
      </div>

      <div class="p-4">
        <p class="text-[13px] text-[var(--color-legend)]">
          When on, that role gets an emailed code at sign-in before any token is issued. An
          individual account can still opt in on top of a role that has it off.
        </p>

        <div v-if="loading" class="py-6 text-center text-[13px] text-[var(--color-legend)]">
          Loading roles…
        </div>

        <ul v-else class="mt-4 divide-y divide-[var(--color-edge)]">
          <li
            v-for="role in roles"
            :key="role.key"
            class="flex items-center justify-between gap-3 py-2.5"
          >
            <div class="min-w-0">
              <div class="text-[13px] font-medium">{{ role.name }}</div>
              <div class="key text-[var(--color-legend)]">
                {{ role.key }}
                <span v-if="touched.has(role.key)" class="text-[var(--color-ok)]">· updated</span>
              </div>
            </div>

            <el-switch
              :model-value="mfaPolicy[role.key]"
              :loading="savingRole === role.key"
              @update:model-value="toggleMfa(role.key, $event as boolean)"
            />
          </li>
        </ul>

        <p class="eyebrow mt-4 leading-relaxed">
          The API exposes no read endpoint for this policy, so these switches show the seeded
          defaults plus whatever you change here — not necessarily what another admin set earlier.
        </p>
      </div>
    </section>
  </div>
</template>
