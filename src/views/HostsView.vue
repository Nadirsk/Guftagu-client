<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { bp, money } from '@/lib/money'
import type { AgencyRow, HostApplicationRow, HostRow, HostTargetRow } from '@/types/api'

/** GFT-089 (approval queue) and GFT-090 (targets with progress bars). */
const tab = ref('applications')

const applications = ref<HostApplicationRow[]>([])
const hosts = ref<HostRow[]>([])
const targets = ref<HostTargetRow[]>([])
const agencies = ref<AgencyRow[]>([])

const loading = ref(true)
const busy = ref(false)

const hostFilters = ref({ q: '', status: '', agency_id: '' as number | '' })

/** Which application is being approved, and into which agency. */
const approveDialog = ref(false)
const approving = ref<HostApplicationRow | null>(null)
const approveAgency = ref<number | null>(null)

const targetDialog = ref(false)
const targetHost = ref<HostRow | null>(null)
const targetForm = ref({
  period_start: '',
  period_end: '',
  target_diamonds: 100000,
  target_days: 20,
})

onMounted(async () => {
  await Promise.all([loadApplications(), loadHosts(), loadTargets(), loadAgencies()])
  loading.value = false
})

watch(hostFilters, loadHosts, { deep: true })

async function loadAgencies() {
  try {
    const { data } = await api.get<AgencyRow[]>('/admin/agencies', { status: 'approved', per_page: 100 })
    agencies.value = data
  } catch {
    // A missing agency list only costs the dropdown; the queue still works.
  }
}

async function loadApplications() {
  try {
    const { data } = await api.get<HostApplicationRow[]>('/admin/host-applications', { per_page: 50 })
    applications.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadHosts() {
  try {
    const { data } = await api.get<HostRow[]>('/admin/hosts', {
      q: hostFilters.value.q || undefined,
      status: hostFilters.value.status || undefined,
      agency_id: hostFilters.value.agency_id || undefined,
      per_page: 50,
    })
    hosts.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadTargets() {
  try {
    const { data } = await api.get<HostTargetRow[]>('/admin/hosts/targets', { per_page: 50 })
    targets.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

function startApprove(application: HostApplicationRow) {
  approving.value = application
  approveAgency.value = application.agency?.id ?? null
  approveDialog.value = true
}

async function confirmApprove() {
  if (!approving.value) return

  busy.value = true
  try {
    await api.post(`/admin/host-applications/${approving.value.id}/approve`, {
      agency_id: approveAgency.value,
    })
    ElMessage.success('Host approved')
    approveDialog.value = false
    await Promise.all([loadApplications(), loadHosts()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function rejectApplication(application: HostApplicationRow) {
  const reason = window.prompt('Why is this being rejected? The applicant is told this.')
  if (reason === null || reason.trim().length < 3) return

  busy.value = true
  try {
    await api.post(`/admin/host-applications/${application.id}/reject`, { reason: reason.trim() })
    ElMessage.success('Application rejected')
    await loadApplications()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function reassign(host: HostRow, agencyId: number | null) {
  busy.value = true
  try {
    const { data } = await api.post<{ note: string }>(`/admin/hosts/${host.id}/agency`, { agency_id: agencyId })
    ElMessage.success('Host reassigned')
    ElMessage.info(data.note)
    await loadHosts()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

function startTarget(host: HostRow) {
  targetHost.value = host

  const now = new Date()
  targetForm.value = {
    period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    target_diamonds: 100000,
    target_days: 20,
  }

  targetDialog.value = true
}

async function saveTarget() {
  if (!targetHost.value) return

  busy.value = true
  try {
    await api.post(`/admin/hosts/${targetHost.value.id}/targets`, targetForm.value)
    ElMessage.success('Target set')
    targetDialog.value = false
    await loadTargets()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function evaluateTarget(target: HostTargetRow) {
  try {
    await ElMessageBox.confirm(
      'This freezes the achievement and the incentive. They will not move afterwards, even if a late credit lands.',
      'Close out this target?',
      { confirmButtonText: 'Evaluate', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    await api.post(`/admin/hosts/targets/${target.id}/evaluate`)
    ElMessage.success('Target evaluated')
    await loadTargets()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** Amber under target, teal once met — the same signal colour as everywhere else. */
function barColour(pct: number | null): string {
  if (pct === null) return 'var(--color-edge-bright)'
  return pct >= 100 ? '#00A47C' : '#BF831F'
}
</script>

<template>
  <PageHead
    eyebrow="Partners"
    title="Hosts"
    lede="The approval queue, active contracts, and how each host is tracking against their target."
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs v-model="tab">
      <!-- GFT-089 -->
      <el-tab-pane name="applications">
        <template #label>
          Applications
          <el-badge v-if="applications.length" :value="applications.length" class="ml-2" />
        </template>

        <div class="panel">
          <EmptyState
            v-if="applications.length === 0"
            title="Nothing waiting"
            body="Every host application has been reviewed."
          />

          <ul v-else>
            <li
              v-for="a in applications"
              :key="a.id"
              class="border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
            >
              <div class="flex flex-wrap items-baseline gap-x-3">
                <RouterLink
                  v-if="a.user"
                  :to="`/users/${a.user.id}`"
                  class="font-medium hover:text-[var(--color-signal)]"
                >
                  {{ a.user.display_name ?? a.user.guftagu_id }}
                </RouterLink>
                <span class="key text-[var(--color-legend)]">{{ a.user?.guftagu_id }}</span>
                <span class="eyebrow">{{ a.agency?.name ?? 'no agency chosen' }}</span>
                <span
                  class="eyebrow ml-auto"
                  :class="(a.waiting_days ?? 0) > 3 ? 'text-[var(--color-signal)]' : ''"
                >
                  waiting {{ a.waiting_days }}d
                </span>
              </div>

              <p v-if="a.experience" class="mt-1 text-[13px] text-[var(--color-legend)]">{{ a.experience }}</p>

              <!-- The clip is the whole point of this queue. -->
              <audio
                v-if="a.intro_audio_url"
                :src="a.intro_audio_url"
                controls
                preload="none"
                class="mt-2 h-8 w-full max-w-md"
              />
              <p v-else class="eyebrow mt-2">no intro clip submitted</p>

              <div class="mt-2 flex gap-2">
                <el-button
                  v-permission="'hosts.approve'"
                  size="small"
                  type="primary"
                  :loading="busy"
                  @click="startApprove(a)"
                >
                  Approve
                </el-button>
                <el-button v-permission="'hosts.approve'" size="small" :loading="busy" @click="rejectApplication(a)">
                  Reject
                </el-button>
              </div>
            </li>
          </ul>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Hosts" name="hosts">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <el-input v-model="hostFilters.q" placeholder="Search hosts" size="small" clearable style="width: 200px" />
          <el-select v-model="hostFilters.status" placeholder="Any status" size="small" clearable style="width: 150px">
            <el-option v-for="s in ['approved', 'pending', 'suspended', 'left']" :key="s" :label="s" :value="s" />
          </el-select>
          <el-select v-model="hostFilters.agency_id" placeholder="Any agency" size="small" clearable style="width: 200px">
            <el-option v-for="a in agencies" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </div>

        <div class="panel">
          <EmptyState v-if="hosts.length === 0" title="No hosts match" />

          <el-table v-else :data="hosts" style="width: 100%">
            <el-table-column label="Host" min-width="200">
              <template #default="{ row }">
                <RouterLink :to="`/hosts/${row.id}`" class="hover:text-[var(--color-signal)]">
                  <div>{{ row.display_name ?? row.guftagu_id }}</div>
                  <div class="key text-[var(--color-legend)]">{{ row.guftagu_id }}</div>
                </RouterLink>
              </template>
            </el-table-column>
            <el-table-column label="Agency" min-width="170">
              <template #default="{ row }">
                <el-select
                  v-permission.disable="'hosts.approve'"
                  :model-value="row.agency?.id ?? null"
                  size="small"
                  clearable
                  placeholder="Unassigned"
                  style="width: 100%"
                  @change="(v: number | null) => reassign(row, v ?? null)"
                >
                  <el-option v-for="a in agencies" :key="a.id" :label="a.name" :value="a.id" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="Tier" width="90">
              <template #default="{ row }"><span class="key">{{ row.tier ?? '—' }}</span></template>
            </el-table-column>
            <el-table-column label="Own cut" width="100" align="right">
              <template #default="{ row }"><span class="key">{{ bp(row.base_commission_bp) }}</span></template>
            </el-table-column>
            <el-table-column label="Contract" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.under_contract" size="small" type="success">active</el-tag>
                <el-tag v-else size="small" type="info">ended</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="110">
              <template #default="{ row }"><span class="key">{{ row.status }}</span></template>
            </el-table-column>
            <el-table-column width="110" align="right">
              <template #default="{ row }">
                <el-button v-permission="'hosts.target_manage'" size="small" text @click="startTarget(row)">
                  Set target
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- GFT-090 -->
      <el-tab-pane label="Targets" name="targets">
        <div class="panel">
          <EmptyState
            v-if="targets.length === 0"
            title="No targets set"
            body="A target gives a host something to earn an incentive against. Set one from the Hosts tab."
          />

          <ul v-else>
            <li
              v-for="t in targets"
              :key="t.id"
              class="border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
            >
              <div class="flex flex-wrap items-baseline gap-x-3">
                <RouterLink :to="`/hosts/${t.host_id}`" class="key hover:text-[var(--color-signal)]">
                  {{ t.guftagu_id }}
                </RouterLink>
                <span class="eyebrow">{{ t.agency ?? 'no agency' }}</span>
                <span class="eyebrow">{{ t.period_start }} → {{ t.period_end }}</span>
                <el-tag
                  v-if="t.status !== 'active'"
                  size="small"
                  :type="t.status === 'achieved' ? 'success' : 'info'"
                  class="ml-auto"
                >
                  {{ t.status }}
                </el-tag>
                <span v-else class="eyebrow ml-auto">running</span>
              </div>

              <div class="mt-2 flex items-center gap-3">
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-edge)]">
                  <div
                    class="h-full rounded-full transition-all"
                    :style="{
                      width: `${Math.min(100, t.achievement_pct ?? 0)}%`,
                      background: barColour(t.achievement_pct),
                    }"
                  />
                </div>
                <span class="key w-14 text-right">{{ t.achievement_pct === null ? '—' : `${t.achievement_pct}%` }}</span>
              </div>

              <div class="mt-1 flex flex-wrap items-baseline gap-x-4">
                <span class="eyebrow">
                  {{ (t.achieved_diamonds ?? 0).toLocaleString() }} / {{ t.target_diamonds.toLocaleString() }} diamonds
                </span>
                <span v-if="t.incentive_paise !== null" class="eyebrow">
                  incentive {{ money(t.incentive_paise) }} at {{ bp(t.incentive_bp) }}
                </span>
                <!-- Whether these numbers are still moving matters more than their value. -->
                <span class="eyebrow ml-auto">{{ t.source }}</span>
                <el-button
                  v-if="!t.is_frozen && !t.is_open"
                  v-permission="'hosts.target_manage'"
                  size="small"
                  text
                  :loading="busy"
                  @click="evaluateTarget(t)"
                >
                  Close out
                </el-button>
              </div>

              <p v-if="t.note" class="eyebrow mt-1 leading-relaxed">{{ t.note }}</p>
            </li>
          </ul>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-dialog v-model="approveDialog" title="Approve this host" width="440px">
    <el-form label-position="top">
      <el-form-item label="Assign to agency">
        <el-select v-model="approveAgency" clearable placeholder="No agency" style="width: 100%">
          <el-option v-for="a in agencies" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
        <p class="eyebrow mt-1 leading-relaxed">
          only approved agencies appear here — a pending one cannot take hosts
        </p>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="approveDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="confirmApprove">Approve</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="targetDialog" :title="`Target for ${targetHost?.guftagu_id ?? ''}`" width="440px">
    <el-form label-position="top">
      <el-form-item label="Period">
        <div class="flex w-full gap-2">
          <el-input v-model="targetForm.period_start" type="date" />
          <el-input v-model="targetForm.period_end" type="date" />
        </div>
      </el-form-item>
      <el-form-item label="Diamonds">
        <el-input-number v-model="targetForm.target_diamonds" :min="0" :step="10000" style="width: 100%" />
      </el-form-item>
      <el-form-item label="Active days">
        <el-input-number v-model="targetForm.target_days" :min="0" :max="366" style="width: 100%" />
      </el-form-item>
    </el-form>
    <p class="eyebrow leading-relaxed">
      only the metrics you set count towards achievement — leave one at zero to ignore it
    </p>
    <template #footer>
      <el-button @click="targetDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveTarget">Set target</el-button>
    </template>
  </el-dialog>
</template>
