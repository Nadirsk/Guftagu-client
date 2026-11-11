<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { isItemReward, REWARD_TYPE_LABELS, REWARD_TYPES } from '@/lib/rewardTypes'
import type {
  BoardResult,
  RankingRewardRow,
  RankingRuleRow,
  RankingRulesResult,
  StoreItemRow,
  StoreItemsResult,
} from '@/types/api'

/** GFT-100 (rules editor) and GFT-101 (payout review). */
const rules = ref<RankingRuleRow[]>([])
const computableTypes = ref<string[]>([])

/**
 * The panel picks a board (Rich / Charm …) on the left and a period in the filter above
 * the table; together they name exactly one rule, the way the app's Rankings screen does.
 */
const BOARD_LABELS: Record<string, string> = { wealth: 'Rich', charm: 'Charm', cp: 'CP', room: 'Room', agency: 'Agency' }
const PERIOD_ORDER = ['daily', 'weekly', 'monthly', 'all_time']
const PERIOD_LABELS: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', all_time: 'All time' }

const selectedBoard = ref<string | null>(null)
const selectedPeriod = ref<string | null>(null)

const boards = computed(() =>
  [...new Set(rules.value.map((r) => r.board_type))].map((type) => ({
    type,
    label: BOARD_LABELS[type] ?? type,
    computable: computableTypes.value.includes(type),
    // CP cannot be ranked yet but its rewards can be set, so it stays selectable.
    rewardsOnly: rules.value.some((r) => r.board_type === type && r.rewards_only),
  })),
)
const periods = computed(() =>
  rules.value
    .filter((r) => r.board_type === selectedBoard.value)
    .map((r) => r.period)
    .sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b)),
)
const selected = computed(
  () => rules.value.find((r) => r.board_type === selectedBoard.value && r.period === selectedPeriod.value) ?? null,
)

function pickBoard(type: string) {
  selectedBoard.value = type
  // Keep the period when the new board has it, so Rich Weekly → Charm stays on Weekly.
  if (!periods.value.includes(selectedPeriod.value ?? '')) selectedPeriod.value = periods.value[0] ?? null
}
const board = ref<BoardResult | null>(null)
const rewards = ref<RankingRewardRow[]>([])
const storeItems = ref<StoreItemRow[]>([])
const snapshots = ref<Array<{ period_start: string; period_end: string; places: number; top_score: number; paid: number }>>([])

const loading = ref(true)
const busy = ref(false)

onMounted(async () => {
  await loadRules()
  loading.value = false
})

watch(selected, async (rule) => {
  board.value = null
  rewards.value = []
  snapshots.value = []
  if (rule) await loadRule(rule)
})

async function loadRules() {
  try {
    const { data } = await api.get<RankingRulesResult>('/admin/ranking-rules', { include_inactive: true })
    rules.value = data.rules
    computableTypes.value = data.computable_board_types
    const first = data.rules.find((r) => r.computable) ?? data.rules[0]
    if (first) {
      selectedPeriod.value = first.period
      pickBoard(first.board_type)
    }
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadRule(rule: RankingRuleRow) {
  try {
    const [b, r, s] = await Promise.all([
      api.get<BoardResult>(`/admin/ranking-rules/${rule.id}/board`),
      api.get<typeof rewards.value>(`/admin/ranking-rules/${rule.id}/rewards`),
      api.get<typeof snapshots.value>(`/admin/ranking-rules/${rule.id}/snapshots`),
    ])
    board.value = b.data
    rewards.value = r.data
    snapshots.value = s.data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function snapshot() {
  if (!selected.value) return

  try {
    await ElMessageBox.confirm(
      'This freezes the current standings as the record for this period. Taking it again replaces it.',
      'Snapshot the board?',
      { confirmButtonText: 'Snapshot', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { message } = await api.post(`/admin/ranking-rules/${selected.value.id}/snapshot`)
    ElMessage.success(message)
    await loadRule(selected.value)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function payRewards(periodStart: string) {
  if (!selected.value) return

  try {
    await ElMessageBox.confirm(
      'Everyone in a reward band for this period gets paid. Running it again is safe — nobody is paid twice.',
      'Pay the ranking rewards?',
      { confirmButtonText: 'Pay', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { message } = await api.post(`/admin/ranking-rules/${selected.value.id}/pay-rewards`, {
      period_start: periodStart,
    })
    ElMessage.success(message)
    await loadRule(selected.value)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** The Weekly List card has three slots and the CP Reward card four; the server refuses one more on a rank. */
const maxPerRank = computed(() => selected.value?.max_rewards_per_rank ?? 3)
const isCp = computed(() => selected.value?.rewards_only === true)

const PERIOD_PREFIX: Record<string, string> = { daily: 'Day ', weekly: 'Week ', monthly: 'Month ' }
const rankTitle = (rank: number) => `${PERIOD_PREFIX[selected.value?.period ?? ''] ?? ''}Top ${rank}`

/** The cards that always show: Top 1–3 on the Weekly List, Top 1–5 on CP Reward (6–10 is a range). */
const shownRanks = computed(() => (isCp.value ? [1, 2, 3, 4, 5] : [1, 2, 3]))
const topRanks = computed(() =>
  shownRanks.value.map((rank) => ({
    rank,
    own: rewards.value.filter((r) => r.rank_from === rank && r.rank_to === rank),
    full: rewards.value.filter((r) => r.is_active && r.rank_from <= rank && r.rank_to >= rank).length >= maxPerRank.value,
  })),
)
/** Bands over a range (#1–3, #6–10…) — still shown in the app, listed under the cards. */
const otherRewards = computed(() =>
  rewards.value.filter((r) => !(r.rank_from === r.rank_to && r.rank_from <= shownRanks.value.length)),
)

function rewardSummary(r: RankingRewardRow): string {
  if (r.item) return `${r.item.name} · ${r.duration_days ? `${r.duration_days} days` : 'permanent'}`
  return `${r.reward_value.toLocaleString()} ${r.reward_type}`
}

const rankLabel = (r: RankingRewardRow) => (r.rank_from === r.rank_to ? `#${r.rank_from}` : `#${r.rank_from}–${r.rank_to}`)

const rewardDialog = ref(false)
const editingRewardId = ref<number | null>(null)
const rewardForm = reactive({
  rank_from: 1,
  rank_to: 1,
  reward_type: 'coins',
  reward_value: 1000,
  store_item_id: null as number | null,
  permanent: false,
  duration_days: 7,
})
const rewardError = ref('')
const rewardFieldErrors = ref<Record<string, string>>({})

const rewardIsItem = computed(() => isItemReward(rewardForm.reward_type))
const itemChoices = computed(() => storeItems.value.filter((i) => i.type === rewardForm.reward_type && i.is_active))

async function loadStoreItems() {
  if (storeItems.value.length) return
  try {
    const { data } = await api.get<StoreItemsResult>('/admin/store-items')
    storeItems.value = data.items
  } catch {
    /* item rewards just have nothing to pick from */
  }
}

function openRewardDialog(rank = 1) {
  editingRewardId.value = null
  Object.assign(rewardForm, {
    rank_from: rank,
    rank_to: rank,
    reward_type: 'coins',
    reward_value: 1000,
    store_item_id: null,
    permanent: false,
    duration_days: 7,
  })
  rewardError.value = ''
  rewardFieldErrors.value = {}
  rewardDialog.value = true
  loadStoreItems()
}

function openEditRewardDialog(reward: RankingRewardRow) {
  editingRewardId.value = reward.id
  Object.assign(rewardForm, {
    rank_from: reward.rank_from,
    rank_to: reward.rank_to,
    reward_type: reward.reward_type,
    reward_value: reward.item ? 1000 : reward.reward_value,
    store_item_id: reward.store_item_id,
    permanent: reward.item !== null && reward.duration_days === null,
    duration_days: reward.duration_days ?? 7,
  })
  rewardError.value = ''
  rewardFieldErrors.value = {}
  rewardDialog.value = true
  loadStoreItems()
}

async function saveReward() {
  if (!selected.value) return

  rewardError.value = ''
  rewardFieldErrors.value = {}
  busy.value = true
  const body = {
    rank_from: rewardForm.rank_from,
    rank_to: rewardForm.rank_to,
    reward_type: rewardForm.reward_type,
    ...(rewardIsItem.value
      ? {
          store_item_id: rewardForm.store_item_id,
          duration_days: rewardForm.permanent ? null : rewardForm.duration_days,
        }
      : { reward_value: rewardForm.reward_value }),
  }
  try {
    if (editingRewardId.value === null) {
      await api.post(`/admin/ranking-rules/${selected.value.id}/rewards`, body)
      ElMessage.success('Reward added')
    } else {
      await api.patch(`/admin/ranking-rules/${selected.value.id}/rewards/${editingRewardId.value}`, body)
      ElMessage.success('Reward updated')
    }
    rewardDialog.value = false
    await loadRule(selected.value)
  } catch (e) {
    if (e instanceof ApiError) {
      rewardFieldErrors.value = e.fieldErrors
      if (!Object.keys(rewardFieldErrors.value).length) rewardError.value = e.message
    }
  } finally {
    busy.value = false
  }
}

async function removeReward(id: number) {
  if (!selected.value) return

  try {
    await ElMessageBox.confirm('Remove this reward?', 'Remove reward', {
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await api.del(`/admin/ranking-rules/${selected.value.id}/rewards/${id}`)
    ElMessage.success('Reward removed')
    await loadRule(selected.value)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

const belowThresholdNote = computed(() =>
  selected.value && selected.value.min_threshold > 0
    ? `Anyone under ${selected.value.min_threshold.toLocaleString()} ${selected.value.metric.replace('_', ' ')} never appears here, even when places are open.`
    : null,
)
</script>

<template>
  <PageHead
    eyebrow="Engagement"
    title="Rankings"
    lede="Boards, the snapshots that become the record, and the rewards paid from them."
  >
    <template #actions>
      <el-button
        v-if="selected?.computable"
        v-permission="'rankings.rules_manage'"
        size="small"
        :loading="busy"
        @click="snapshot"
      >
        Snapshot now
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- Rules -->
      <aside class="panel h-fit">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Boards</div>
        </div>
        <ul>
          <li v-for="b in boards" :key="b.type">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-left transition-colors"
              :class="
                selectedBoard === b.type
                  ? 'border-l-[var(--color-signal)] bg-[var(--color-raised)]'
                  : 'border-l-transparent hover:bg-[var(--color-raised)]'
              "
              :disabled="!b.computable && !b.rewardsOnly"
              @click="pickBoard(b.type)"
            >
              <span class="min-w-0">
                <span class="block truncate text-[14px] font-medium">{{ b.label }}</span>
                <span class="eyebrow">{{ b.type }}</span>
              </span>
              <el-tag v-if="b.rewardsOnly" size="small" type="warning">rewards only</el-tag>
              <el-tag v-else-if="!b.computable" size="small" type="info">soon</el-tag>
            </button>
          </li>
        </ul>
        <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
          room and agency boards need modules that do not exist yet · CP takes rewards only (no pairs or points yet)
        </p>
      </aside>

      <div v-if="selected" class="space-y-4">
        <!-- Period filter: with the board on the left, this picks the rule. -->
        <div class="flex justify-center">
          <el-radio-group v-model="selectedPeriod">
            <el-radio-button v-for="p in periods" :key="p" :value="p">{{ PERIOD_LABELS[p] ?? p }}</el-radio-button>
          </el-radio-group>
        </div>

        <!-- Board -->
        <section v-if="isCp" class="panel">
          <p class="px-4 py-3 text-[13px] text-[var(--color-legend)]">
            {{ selected.key }} · CP pairs and points are not tracked yet, so there is no board to rank or pay.
            What you set below is exactly what the app's CP Reward tab shows for each place.
          </p>
        </section>
        <section v-else class="panel">
          <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">
              {{ selected.key }} · {{ board?.period.start }} → {{ board?.period.end }}
              <el-tag v-if="!selected.is_active" size="small" class="ml-1">off</el-tag>
            </div>
            <div class="key text-[var(--color-legend)]">top {{ selected.top_n }}</div>
          </div>

          <p
            v-if="board && !board.source.live"
            class="border-b border-[var(--color-edge)] px-4 py-2 text-[12px] text-[var(--color-legend)]"
          >
            {{ board.source.note }}
          </p>

          <EmptyState
            v-if="board && board.entries.length === 0"
            title="Nobody qualifies yet"
            :body="belowThresholdNote ?? 'No users have any activity on this metric.'"
          />

          <el-table v-else-if="board" :data="board.entries" style="width: 100%">
            <el-table-column label="#" width="70">
              <template #default="{ row }">
                <span class="key font-bold" :class="row.rank <= 3 ? 'text-[var(--color-signal)]' : ''">
                  {{ row.rank }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Player" min-width="200">
              <template #default="{ row }">
                <RouterLink :to="`/users/${row.entity_id}`" class="hover:text-[var(--color-signal)]">
                  <div>{{ row.display_name ?? row.guftagu_id }}</div>
                  <div class="key text-[var(--color-legend)]">{{ row.guftagu_id }}</div>
                </RouterLink>
              </template>
            </el-table-column>
            <el-table-column label="Score" width="140" align="right">
              <template #default="{ row }">
                <span class="key">{{ row.score.toLocaleString() }}</span>
              </template>
            </el-table-column>
          </el-table>

          <p v-if="belowThresholdNote" class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            {{ belowThresholdNote }}
          </p>
        </section>

        <div class="grid gap-4 md:grid-cols-2">
          <!-- Rewards -->
          <!-- Only the weekly board has a reward screen in the app (the Weekly List). -->
          <section v-if="selected.period === 'weekly'" class="panel md:col-span-2">
            <div class="flex items-center justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">
                Rewards · shown on the app's {{ isCp ? 'CP Reward tab' : `${selected.period} list` }}
              </div>
              <el-button
                v-permission="'rankings.rules_manage'"
                size="small"
                text
                @click="openRewardDialog(isCp ? 6 : 4)"
              >
                Add a range
              </el-button>
            </div>

            <div class="grid gap-3 p-3 sm:grid-cols-3">
              <div v-for="top in topRanks" :key="top.rank" class="flex flex-col gap-2 rounded border border-[var(--color-edge)] p-3">
                <div class="flex items-baseline justify-between">
                  <span class="text-[14px] font-medium">{{ rankTitle(top.rank) }}</span>
                  <span class="eyebrow">{{ top.own.length }}/{{ maxPerRank }}</span>
                </div>

                <p v-if="!top.own.length" class="text-[12px] text-[var(--color-legend)]">
                  Nothing set: this card shows "Coming soon" in the app.
                </p>
                <div
                  v-for="reward in top.own"
                  :key="reward.id"
                  class="flex items-center gap-2"
                  :class="reward.is_active ? '' : 'opacity-50'"
                >
                  <img
                    v-if="reward.item?.image_url"
                    :src="reward.item.image_url"
                    :alt="reward.item.name"
                    class="h-9 w-9 shrink-0 object-contain"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[13px] font-medium">{{ rewardSummary(reward) }}</div>
                    <div class="key text-[var(--color-legend)]">{{ REWARD_TYPE_LABELS[reward.reward_type] }}</div>
                    <div v-if="!reward.payable" class="text-[11px] text-[var(--color-signal)]">
                      Not payable: its item is missing or inactive.
                    </div>
                  </div>
                  <span v-permission="'rankings.rules_manage'" class="flex shrink-0">
                    <el-button size="small" text @click="openEditRewardDialog(reward)">Edit</el-button>
                    <el-button size="small" text type="danger" @click="removeReward(reward.id)">Remove</el-button>
                  </span>
                </div>

                <el-button
                  v-permission="'rankings.rules_manage'"
                  class="mt-auto"
                  size="small"
                  :disabled="top.full"
                  :title="top.full ? `Top ${top.rank} already has ${maxPerRank} rewards` : ''"
                  @click="openRewardDialog(top.rank)"
                >
                  Add reward
                </el-button>
              </div>
            </div>

            <ul v-if="otherRewards.length" class="divide-y divide-[var(--color-edge)] border-t border-[var(--color-edge)]">
              <li
                v-for="reward in otherRewards"
                :key="reward.id"
                class="flex items-baseline justify-between gap-2 px-4 py-2.5"
              >
                <span class="key">{{ rankLabel(reward) }}</span>
                <span class="key font-bold">{{ rewardSummary(reward) }}</span>
                <span v-permission="'rankings.rules_manage'" class="flex shrink-0 gap-1">
                  <el-button size="small" text @click="openEditRewardDialog(reward)">Edit</el-button>
                  <el-button size="small" text type="danger" @click="removeReward(reward.id)">Remove</el-button>
                </span>
              </li>
            </ul>
          </section>

          <!-- Snapshots (CP has no standings to freeze) -->
          <section v-if="!isCp" class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Snapshots</div>
            </div>
            <p v-if="!snapshots.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
              None yet. A snapshot is what rewards are paid against.
            </p>
            <ul v-else class="divide-y divide-[var(--color-edge)]">
              <li v-for="snap in snapshots" :key="snap.period_start" class="px-4 py-2.5">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="key">{{ snap.period_start }}</span>
                  <span class="eyebrow">{{ snap.places }} places</span>
                </div>
                <div class="mt-1 flex items-center justify-between gap-2">
                  <span class="eyebrow" :class="snap.paid > 0 ? 'text-[var(--color-ok)]' : ''">
                    {{ snap.paid > 0 ? `${snap.paid} paid` : 'not paid' }}
                  </span>
                  <el-button
                    v-if="selected.period === 'weekly'"
                    v-permission="'rankings.reward_payout'"
                    size="small"
                    :loading="busy"
                    :disabled="!rewards.length"
                    :title="rewards.length ? '' : 'Add a reward first'"
                    @click="payRewards(snap.period_start)"
                  >
                    {{ snap.paid > 0 ? 'Pay again' : 'Pay rewards' }}
                  </el-button>
                </div>
              </li>
            </ul>
            <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
              paying twice is safe — nobody is paid a second time for the same period
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>

  <el-dialog v-model="rewardDialog" :title="editingRewardId === null ? 'Add a reward' : 'Edit reward'" width="440">
    <el-form label-position="top" @submit.prevent="saveReward">
      <div class="grid grid-cols-2 gap-3">
        <el-form-item label="From rank" :error="rewardFieldErrors.rank_from">
          <el-input-number v-model="rewardForm.rank_from" :min="1" class="w-full" />
        </el-form-item>
        <el-form-item label="To rank" :error="rewardFieldErrors.rank_to">
          <el-input-number v-model="rewardForm.rank_to" :min="1" class="w-full" />
        </el-form-item>
      </div>

      <el-form-item label="Reward type" :error="rewardFieldErrors.reward_type">
        <el-select v-model="rewardForm.reward_type" class="w-full" @change="rewardForm.store_item_id = null">
          <el-option v-for="t in REWARD_TYPES" :key="t" :label="REWARD_TYPE_LABELS[t]" :value="t" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="!rewardIsItem" label="Amount" :error="rewardFieldErrors.reward_value">
        <el-input-number v-model="rewardForm.reward_value" :min="1" :step="500" class="w-full" />
      </el-form-item>

      <template v-else>
        <el-form-item label="Store item" :error="rewardFieldErrors.store_item_id">
          <el-select v-model="rewardForm.store_item_id" class="w-full" filterable placeholder="Pick from the Store catalogue">
            <el-option v-for="i in itemChoices" :key="i.id" :label="i.name" :value="i.id" />
          </el-select>
          <div v-if="!itemChoices.length" class="mt-1 text-[12px] text-[var(--color-legend)]">
            No active {{ REWARD_TYPE_LABELS[rewardForm.reward_type].toLowerCase() }} in the Store yet. Add one there first.
          </div>
        </el-form-item>
        <el-form-item label="Duration" :error="rewardFieldErrors.duration_days">
          <el-checkbox v-model="rewardForm.permanent">Permanent</el-checkbox>
          <el-input-number v-if="!rewardForm.permanent" v-model="rewardForm.duration_days" :min="1" :max="3650" class="ml-3" />
          <span v-if="!rewardForm.permanent" class="ml-2 text-[12px]">days</span>
        </el-form-item>
      </template>

      <p v-if="rewardError" class="text-[12px] text-[var(--color-cut)]">{{ rewardError }}</p>
    </el-form>

    <template #footer>
      <el-button @click="rewardDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveReward">{{ editingRewardId === null ? 'Add reward' : 'Save' }}</el-button>
    </template>
  </el-dialog>
</template>
