<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { moneyShort } from '@/lib/money'
import type { GiftTargetPolicyRow, HostGiftTargetResultRow } from '@/types/api'

/**
 * mehfil's "Policies" screen, ported. A host clears a coin-spent + live-minutes
 * threshold each calendar month and both they and their agency earn a flat reward —
 * separate from the Hosts screen's own per-host targets, which pay only the host a
 * percentage of their diamond earnings.
 */
const policies = ref<GiftTargetPolicyRow[]>([])
const loadingPolicies = ref(true)

const dialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  id: null as number | null,
  time_minutes: 0,
  target_coins: 0,
  host_reward_paise: 0,
  agency_reward_paise: 0,
  is_active: true,
})

// Rupees in the form, paise on the wire — same convention as everywhere else money shows up.
const hostRewardRupees = ref(0)
const agencyRewardRupees = ref(0)

onMounted(async () => {
  await loadPolicies()
  loadingPolicies.value = false
})

async function loadPolicies() {
  try {
    const { data } = await api.get<GiftTargetPolicyRow[]>('/admin/gift-target-policies', { include_inactive: true })
    policies.value = data.sort((a, b) => a.target_coins - b.target_coins)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function create() {
  Object.assign(form, {
    id: null, time_minutes: 0, target_coins: 0, host_reward_paise: 0, agency_reward_paise: 0, is_active: true,
  })
  hostRewardRupees.value = 0
  agencyRewardRupees.value = 0
  errors.value = {}
  dialog.value = true
}

function edit(policy: GiftTargetPolicyRow) {
  Object.assign(form, {
    id: policy.id,
    time_minutes: policy.time_minutes,
    target_coins: policy.target_coins,
    host_reward_paise: policy.host_reward_paise,
    agency_reward_paise: policy.agency_reward_paise,
    is_active: policy.is_active,
  })
  hostRewardRupees.value = policy.host_reward_paise / 100
  agencyRewardRupees.value = policy.agency_reward_paise / 100
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}

  const body = {
    time_minutes: form.time_minutes,
    target_coins: form.target_coins,
    host_reward_paise: Math.round(hostRewardRupees.value * 100),
    agency_reward_paise: Math.round(agencyRewardRupees.value * 100),
    is_active: form.is_active,
  }

  try {
    if (form.id === null) {
      await api.post('/admin/gift-target-policies', body)
      ElMessage.success('Target created')
    } else {
      await api.patch(`/admin/gift-target-policies/${form.id}`, body)
      ElMessage.success('Target updated')
    }
    dialog.value = false
    await loadPolicies()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------- evaluation

const period = ref(new Date().toISOString().slice(0, 7))
const results = ref<HostGiftTargetResultRow[]>([])
const loadingResults = ref(false)
const evaluatingAll = ref(false)

async function loadResults() {
  loadingResults.value = true
  try {
    const { data } = await api.get<HostGiftTargetResultRow[]>('/admin/hosts/gift-targets', { period: period.value })
    results.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loadingResults.value = false
  }
}

async function evaluateAll() {
  evaluatingAll.value = true
  try {
    const { message } = await api.post('/admin/hosts/gift-targets/evaluate-all', { period: period.value })
    ElMessage.success(message)
    await loadResults()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    evaluatingAll.value = false
  }
}

onMounted(loadResults)
</script>

<template>
  <PageHead
    eyebrow="Partners"
    title="Gift targets"
    lede="A shared monthly ladder — any host who clears a tier's coin-spent and live-minutes thresholds earns it, along with their agency. Separate from a host's own individual targets on the Hosts screen."
  >
    <template #actions>
      <el-button v-permission="'hosts.gift_target_manage'" type="primary" size="small" @click="create">
        Add rung
      </el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div v-loading="loadingPolicies" class="panel overflow-x-auto">
      <table class="w-full min-w-[700px] border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-[var(--color-edge)]">
            <th class="eyebrow px-3 py-2 text-left">Live minutes</th>
            <th class="eyebrow px-3 py-2 text-right">Coins spent</th>
            <th class="eyebrow px-3 py-2 text-right">Host reward</th>
            <th class="eyebrow px-3 py-2 text-right">Agency reward</th>
            <th class="eyebrow px-3 py-2 text-left">Status</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="policy in policies"
            :key="policy.id"
            class="border-b border-[var(--color-edge)]"
            :class="policy.is_active ? '' : 'opacity-50'"
          >
            <td class="key px-3 py-2">{{ policy.time_minutes }} min</td>
            <td class="key px-3 py-2 text-right">{{ policy.target_coins.toLocaleString() }}</td>
            <td class="key px-3 py-2 text-right">{{ moneyShort(policy.host_reward_paise) }}</td>
            <td class="key px-3 py-2 text-right">{{ moneyShort(policy.agency_reward_paise) }}</td>
            <td class="px-3 py-2">
              <el-tag :type="policy.is_active ? 'success' : 'info'" size="small">
                {{ policy.is_active ? 'active' : 'inactive' }}
              </el-tag>
            </td>
            <td class="px-3 py-2 text-right">
              <el-button v-permission.disable="'hosts.gift_target_manage'" size="small" @click="edit(policy)">
                Edit
              </el-button>
            </td>
          </tr>
          <tr v-if="!loadingPolicies && policies.length === 0">
            <td colspan="6" class="px-3 py-6 text-center text-[13px] text-[var(--color-legend)]">
              No rungs on the ladder yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="eyebrow mt-3">
      both thresholds must be cleared within the calendar month · a host lands on the
      highest rung they qualify for, not every rung they pass
    </p>

    <!-- Evaluation -->
    <div class="panel mt-6">
      <div class="flex flex-wrap items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Evaluate</div>
        <el-date-picker
          v-model="period"
          type="month"
          value-format="YYYY-MM"
          placeholder="Month"
          size="small"
          class="w-40"
          @change="loadResults"
        />
        <el-button
          v-permission="'hosts.gift_target_manage'"
          size="small"
          type="primary"
          :loading="evaluatingAll"
          @click="evaluateAll"
        >
          Evaluate every host
        </el-button>
        <span class="eyebrow ml-auto">
          admin-triggered, not a nightly job — it shows up in the audit log against whoever ran it
        </span>
      </div>

      <div v-loading="loadingResults" class="overflow-x-auto">
        <table class="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-[var(--color-edge)]">
              <th class="eyebrow px-3 py-2 text-left">Host</th>
              <th class="eyebrow px-3 py-2 text-left">Agency</th>
              <th class="eyebrow px-3 py-2 text-right">Coins sent</th>
              <th class="eyebrow px-3 py-2 text-right">Minutes live</th>
              <th class="eyebrow px-3 py-2 text-right">Host reward</th>
              <th class="eyebrow px-3 py-2 text-right">Agency reward</th>
              <th class="eyebrow px-3 py-2 text-left">Evaluated</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in results" :key="row.id" class="border-b border-[var(--color-edge)]">
              <td class="px-3 py-2">{{ row.host.display_name ?? `#${row.host.id}` }}</td>
              <td class="key px-3 py-2 text-[var(--color-legend)]">{{ row.host.agency?.name ?? '—' }}</td>
              <td class="key px-3 py-2 text-right">{{ row.coins_sent.toLocaleString() }}</td>
              <td class="key px-3 py-2 text-right">{{ row.minutes_live }}</td>
              <td class="px-3 py-2 text-right">
                <span v-if="row.policy_id" class="key">{{ moneyShort(row.host_reward_paise) }}</span>
                <span v-else class="text-[var(--color-legend)]">no tier</span>
              </td>
              <td class="key px-3 py-2 text-right">
                {{ row.agency_reward_paise > 0 ? moneyShort(row.agency_reward_paise) : '—' }}
              </td>
              <td class="eyebrow px-3 py-2">
                {{ row.evaluated_at ? new Date(row.evaluated_at).toLocaleDateString() : '—' }}
              </td>
            </tr>
            <tr v-if="!loadingResults && results.length === 0">
              <td colspan="7" class="px-3 py-6 text-center text-[13px] text-[var(--color-legend)]">
                No hosts evaluated for {{ period }} yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? 'Edit rung' : 'Add rung'" width="440">
    <div class="space-y-3">
      <div>
        <label class="eyebrow mb-1 block">Live minutes required (this month)</label>
        <el-input-number v-model="form.time_minutes" :min="0" :step="10" class="w-full" />
        <p v-if="errors.time_minutes" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.time_minutes }}</p>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Coins spent sending gifts required (this month)</label>
        <el-input-number v-model="form.target_coins" :min="0" :step="1000" class="w-full" />
        <p v-if="errors.target_coins" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.target_coins }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 border-t border-[var(--color-edge)] pt-3">
        <div>
          <label class="eyebrow mb-1 block">Host reward ₹</label>
          <el-input-number v-model="hostRewardRupees" :min="0" :step="100" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Agency reward ₹</label>
          <el-input-number v-model="agencyRewardRupees" :min="0" :step="100" class="w-full" />
          <p class="eyebrow mt-1">paid only if the host has an agency</p>
        </div>
      </div>

      <el-checkbox v-model="form.is_active" size="small">Offer this rung</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="save">Save</el-button>
    </template>
  </el-dialog>
</template>
