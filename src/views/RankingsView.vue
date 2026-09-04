<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { BoardResult, RankingRuleRow, RankingRulesResult } from '@/types/api'

/** GFT-100 (rules editor) and GFT-101 (payout review). */
const rules = ref<RankingRuleRow[]>([])
const computableTypes = ref<string[]>([])
const selected = ref<RankingRuleRow | null>(null)
const board = ref<BoardResult | null>(null)
const rewards = ref<Array<{ id: number; rank_from: number; rank_to: number; reward_type: string; reward_value: number }>>([])
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
    selected.value = data.rules.find((r) => r.computable) ?? data.rules[0] ?? null
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

const rewardDialog = ref(false)
const editingRewardId = ref<number | null>(null)
const rewardForm = reactive({
  rank_from: 1,
  rank_to: 1,
  reward_type: 'coins',
  reward_value: 1000,
})
const rewardError = ref('')

function openRewardDialog() {
  editingRewardId.value = null
  Object.assign(rewardForm, { rank_from: 1, rank_to: 1, reward_type: 'coins', reward_value: 1000 })
  rewardError.value = ''
  rewardDialog.value = true
}

function openEditRewardDialog(reward: (typeof rewards.value)[number]) {
  editingRewardId.value = reward.id
  Object.assign(rewardForm, {
    rank_from: reward.rank_from,
    rank_to: reward.rank_to,
    reward_type: reward.reward_type,
    reward_value: reward.reward_value,
  })
  rewardError.value = ''
  rewardDialog.value = true
}

async function saveReward() {
  if (!selected.value) return

  rewardError.value = ''
  busy.value = true
  try {
    if (editingRewardId.value === null) {
      await api.post(`/admin/ranking-rules/${selected.value.id}/rewards`, { ...rewardForm })
      ElMessage.success('Reward band added')
    } else {
      await api.patch(`/admin/ranking-rules/${selected.value.id}/rewards/${editingRewardId.value}`, { ...rewardForm })
      ElMessage.success('Reward band updated')
    }
    rewardDialog.value = false
    await loadRule(selected.value)
  } catch (e) {
    if (e instanceof ApiError) {
      const clash = e.details?.overlapping as { rank_from: number; rank_to: number } | undefined
      rewardError.value = clash
        ? `Ranks ${clash.rank_from}–${clash.rank_to} are already covered by another band.`
        : e.message
    }
  } finally {
    busy.value = false
  }
}

async function removeReward(id: number) {
  if (!selected.value) return

  try {
    await ElMessageBox.confirm('Remove this reward band?', 'Remove band', {
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await api.del(`/admin/ranking-rules/${selected.value.id}/rewards/${id}`)
    ElMessage.success('Reward band removed')
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
          <li v-for="rule in rules" :key="rule.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-left transition-colors"
              :class="
                selected?.id === rule.id
                  ? 'border-l-[var(--color-signal)] bg-[var(--color-raised)]'
                  : 'border-l-transparent hover:bg-[var(--color-raised)]'
              "
              :disabled="!rule.computable"
              @click="selected = rule"
            >
              <span class="min-w-0">
                <span class="key block truncate">{{ rule.key }}</span>
                <span class="eyebrow">{{ rule.board_type }} · {{ rule.period }}</span>
              </span>
              <el-tag v-if="!rule.computable" size="small" type="info">soon</el-tag>
              <el-tag v-else-if="!rule.is_active" size="small">off</el-tag>
            </button>
          </li>
        </ul>
        <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
          room and agency boards need modules that do not exist yet
        </p>
      </aside>

      <div v-if="selected" class="space-y-4">
        <!-- Board -->
        <section class="panel">
          <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">
              {{ selected.key }} · {{ board?.period.start }} → {{ board?.period.end }}
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
          <section class="panel">
            <div class="flex items-center justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Reward bands</div>
              <el-button
                v-permission="'rankings.rules_manage'"
                size="small"
                @click="openRewardDialog"
              >
                Add
              </el-button>
            </div>
            <p v-if="!rewards.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
              No bands — nothing would be paid for this board.
            </p>
            <ul v-else class="divide-y divide-[var(--color-edge)]">
              <li
                v-for="reward in rewards"
                :key="reward.id"
                class="flex items-baseline justify-between gap-2 px-4 py-2.5"
              >
                <span class="key">
                  {{ reward.rank_from === reward.rank_to ? `#${reward.rank_from}` : `#${reward.rank_from}–${reward.rank_to}` }}
                </span>
                <span class="key font-bold">
                  {{ reward.reward_value.toLocaleString() }} {{ reward.reward_type }}
                </span>
                <span v-permission="'rankings.rules_manage'" class="flex shrink-0 gap-1">
                  <el-button size="small" text @click="openEditRewardDialog(reward)">Edit</el-button>
                  <el-button size="small" text type="danger" @click="removeReward(reward.id)">Remove</el-button>
                </span>
              </li>
            </ul>
          </section>

          <!-- Snapshots -->
          <section class="panel">
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
                    v-permission="'rankings.reward_payout'"
                    size="small"
                    :loading="busy"
                    :disabled="!rewards.length"
                    :title="rewards.length ? '' : 'Add a reward band first'"
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

  <el-dialog v-model="rewardDialog" :title="editingRewardId === null ? 'Add a reward band' : 'Edit reward band'" width="400">
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">From rank</label>
          <el-input-number v-model="rewardForm.rank_from" :min="1" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">To rank</label>
          <el-input-number v-model="rewardForm.rank_to" :min="1" class="w-full" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Reward</label>
          <el-select v-model="rewardForm.reward_type" class="w-full">
            <el-option label="Coins" value="coins" />
            <el-option label="Diamonds" value="diamonds" />
          </el-select>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Amount</label>
          <el-input-number v-model="rewardForm.reward_value" :min="1" :step="500" class="w-full" />
        </div>
      </div>

      <p v-if="rewardError" class="text-[12px] text-[var(--color-cut)]">{{ rewardError }}</p>
    </div>

    <template #footer>
      <el-button @click="rewardDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveReward">{{ editingRewardId === null ? 'Add band' : 'Save' }}</el-button>
    </template>
  </el-dialog>
</template>
