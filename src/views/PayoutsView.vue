<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { WithdrawalRow, WithdrawalStatus, WithdrawalSummary } from '@/types/api'

/** GFT-077 — the withdrawal review queue (A.7b). */
const auth = useAuthStore()

const rows = ref<WithdrawalRow[]>([])
const summary = ref<WithdrawalSummary | null>(null)
const loading = ref(true)
const total = ref(0)
const status = ref<'' | WithdrawalStatus>('pending')
const busy = ref<number | null>(null)

onMounted(async () => {
  await Promise.all([load(), loadSummary()])
  loading.value = false
})

async function load() {
  try {
    const { data, meta } = await api.get<WithdrawalRow[]>('/admin/withdrawals', {
      status: status.value || undefined,
      per_page: 50,
    })
    rows.value = data
    total.value = meta.total ?? data.length
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadSummary() {
  try {
    const { data } = await api.get<WithdrawalSummary>('/admin/withdrawals/summary')
    summary.value = data
  } catch {
    /* header degrades to nothing rather than blocking the queue */
  }
}

async function approve(row: WithdrawalRow) {
  const escalating = row.needs_super_admin && row.status === 'pending'

  try {
    await ElMessageBox.confirm(
      escalating
        ? `${money(row.net_paise)} is above the high-value threshold. Approving sends it for a Super Admin's second approval — it is not paid yet.`
        : `Approve ${money(row.net_paise)} to ${row.user?.display_name ?? row.user?.guftagu_id}? The frozen diamonds leave their wallet for good.`,
      escalating ? 'Send for second approval' : 'Approve payout',
      { confirmButtonText: escalating ? 'Send onward' : 'Approve', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = row.id
  try {
    const { message } = await api.post(`/admin/withdrawals/${row.id}/approve`)
    ElMessage.success(message)
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = null
  }
}

async function reject(row: WithdrawalRow) {
  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      `The ${row.diamonds.toLocaleString()} frozen diamonds go straight back to their spendable balance.`,
      'Reject payout',
      {
        confirmButtonText: 'Reject',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Why is this being refused? The user sees this.',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      },
    )
    reason = result.value
  } catch {
    return
  }

  busy.value = row.id
  try {
    const { message } = await api.post(`/admin/withdrawals/${row.id}/reject`, { reason })
    ElMessage.success(message)
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = null
  }
}

function money(paise: number): string {
  return `₹${(paise / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function waiting(iso: string | null): string {
  if (!iso) return '—'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// 'processing' deliberately has no entry — ElTag only accepts primary/success/info/
// warning/danger, not '', so its plain (typeless) look comes from omitting the prop.
const statusTone: Partial<Record<WithdrawalStatus, 'success' | 'warning' | 'danger' | 'info'>> = {
  pending: 'warning',
  pending_super_approval: 'danger',
  approved: 'success',
  rejected: 'info',
  paid: 'success',
  failed: 'danger',
  reverted: 'info',
}

const isSuperAdmin = computed(() => auth.isSuperAdmin)
</script>

<template>
  <PageHead
    eyebrow="Economy"
    title="Payouts"
    lede="Oldest first — the person waiting longest is dealt with first. Diamonds are frozen the moment a request is raised, and only move when you decide."
  >
    <template #actions>
      <el-select v-model="status" size="small" class="w-48" @change="load">
        <el-option label="Pending" value="pending" />
        <el-option label="Awaiting Super Admin" value="pending_super_approval" />
        <el-option label="Approved" value="approved" />
        <el-option label="Rejected" value="rejected" />
        <el-option label="All" value="" />
      </el-select>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div v-if="summary" class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="panel px-4 py-3">
        <div class="eyebrow">Waiting</div>
        <div class="mt-1 stat-figure text-[22px] leading-none">
          {{ summary.pending_count }}
        </div>
      </div>
      <div class="panel px-4 py-3" :class="summary.awaiting_super_count > 0 ? 'border-l-2 border-l-[var(--color-cut)]' : ''">
        <div class="eyebrow">Needs a Super Admin</div>
        <div
          class="mt-1 stat-figure text-[22px] leading-none"
          :class="summary.awaiting_super_count > 0 ? 'text-[var(--color-cut)]' : ''"
        >
          {{ summary.awaiting_super_count }}
        </div>
      </div>
      <div class="panel px-4 py-3">
        <div class="eyebrow">Open value</div>
        <div class="key mt-1 text-[18px]">{{ money(summary.open_total_paise) }}</div>
      </div>
      <div class="panel px-4 py-3">
        <div class="eyebrow">Approved today</div>
        <div class="key mt-1 text-[18px]">{{ money(summary.approved_today_paise) }}</div>
      </div>
    </div>

    <p v-if="summary" class="eyebrow mb-4 leading-relaxed">
      minimum withdrawal {{ summary.minimum_diamonds.toLocaleString() }} diamonds · payouts at or
      above {{ money(summary.super_approval_paise) }} need a second Super Admin approval
      <span class="text-[var(--color-legend-dim)]">· thresholds pending CI-03</span>
    </p>

    <div class="panel">
      <EmptyState
        v-if="!loading && rows.length === 0"
        title="Nothing to review"
        body="Requests appear here as users ask to cash out their diamonds."
      />

      <el-table v-else :data="rows" style="width: 100%">
        <el-table-column label="Requested" width="110">
          <template #default="{ row }: { row: WithdrawalRow }">
            <span class="key text-[var(--color-legend)]">{{ waiting(row.requested_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="User" min-width="170">
          <template #default="{ row }: { row: WithdrawalRow }">
            <RouterLink
              v-if="row.user"
              :to="`/users/${row.user.id}`"
              class="hover:text-[var(--color-signal)]"
            >
              <div class="font-medium">{{ row.user.display_name ?? '—' }}</div>
              <div class="key text-[var(--color-legend)]">{{ row.user.guftagu_id }}</div>
            </RouterLink>
          </template>
        </el-table-column>

        <el-table-column label="Diamonds" width="120" align="right">
          <template #default="{ row }: { row: WithdrawalRow }">
            <span class="key">{{ row.diamonds.toLocaleString() }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Payout" width="150" align="right">
          <template #default="{ row }: { row: WithdrawalRow }">
            <div class="key font-bold">{{ money(row.net_paise) }}</div>
            <!-- The rate it was priced at, which may no longer be today's. -->
            <div class="eyebrow">at {{ row.rate }}</div>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="180">
          <template #default="{ row }: { row: WithdrawalRow }">
            <el-tag :type="statusTone[row.status] ?? undefined" size="small">
              {{ row.status.replace(/_/g, ' ') }}
            </el-tag>
            <div v-if="row.reviewed_by" class="eyebrow mt-0.5">by {{ row.reviewed_by }}</div>
            <div v-if="row.rejection_reason" class="mt-0.5 text-[12px] text-[var(--color-legend)]">
              {{ row.rejection_reason }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="" width="200" align="right">
          <template #default="{ row }: { row: WithdrawalRow }">
            <template v-if="row.is_open">
              <el-button
                v-permission="'payouts.approve'"
                size="small"
                type="primary"
                :loading="busy === row.id"
                :disabled="row.status === 'pending_super_approval' && !isSuperAdmin"
                :title="
                  row.status === 'pending_super_approval' && !isSuperAdmin
                    ? 'Only a Super Admin can clear this one'
                    : ''
                "
                @click="approve(row)"
              >
                {{ row.status === 'pending_super_approval' ? 'Final approve' : 'Approve' }}
              </el-button>
              <el-button
                v-permission="'payouts.reject'"
                size="small"
                type="danger"
                plain
                :loading="busy === row.id"
                @click="reject(row)"
              >
                Reject
              </el-button>
            </template>
            <span v-else class="eyebrow">decided</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
