<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { DrawVerification, EventDetail, EventPhase } from '@/types/api'

/** GFT-099 detail + the draw's public proof. */
const route = useRoute()
const eventId = Number(route.params.id)

const detail = ref<EventDetail | null>(null)
const verification = ref<DrawVerification | null>(null)
const loading = ref(true)
const busy = ref(false)

const rewardDialog = ref(false)
const rewardForm = reactive({
  rank_from: 1,
  rank_to: 3,
  reward_type: 'coins',
  reward_value: 1000,
  quantity: null as number | null,
})
const rewardError = ref('')

const event = computed(() => detail.value?.event ?? null)
const draw = computed(() => detail.value?.lucky_draw ?? null)

onMounted(async () => {
  await load()
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<EventDetail>(`/admin/events/${eventId}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function addReward() {
  rewardError.value = ''
  try {
    await api.post(`/admin/events/${eventId}/rewards`, { ...rewardForm })
    ElMessage.success('Reward band added')
    rewardDialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      const clash = e.details?.overlapping as { rank_from: number; rank_to: number } | undefined
      rewardError.value = clash
        ? `Ranks ${clash.rank_from}–${clash.rank_to} are already covered by another band.`
        : e.message
    }
  }
}

async function removeReward(id: number) {
  try {
    await api.del(`/admin/events/${eventId}/rewards/${id}`)
    ElMessage.success('Band removed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function distribute() {
  try {
    await ElMessageBox.confirm(
      'Everyone in a reward band gets paid, once. Running this again later is safe — it will not pay anyone twice.',
      'Hand out the rewards?',
      { confirmButtonText: 'Distribute', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { message } = await api.post(`/admin/events/${eventId}/distribute`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function runDraw() {
  try {
    await ElMessageBox.confirm(
      'The seed becomes public and the winners are fixed. Anyone will be able to recompute the result and check it against the hash published beforehand.',
      'Run the draw?',
      { confirmButtonText: 'Draw', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { message } = await api.post(`/admin/events/${eventId}/draw`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function verify() {
  try {
    const { data } = await api.get<DrawVerification>(`/admin/events/${eventId}/draw/verify`)
    verification.value = data
    data.valid
      ? ElMessage.success('Recomputed from the seed — the result checks out')
      : ElMessage.error('The published result does not match the seed')
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

const phaseTone: Record<EventPhase, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  live: 'success', upcoming: 'warning', ended: 'info', draft: '', cancelled: 'danger',
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}
</script>

<template>
  <PageHead
    eyebrow="Engagement · event"
    :title="event?.title_en ?? `Event #${eventId}`"
    :lede="event ? `${event.type.replace('_', ' ')} · ${when(event.starts_at)} → ${when(event.ends_at)}` : ''"
  >
    <template #actions>
      <el-button
        v-if="event?.phase === 'ended'"
        v-permission="'events.reward_manage'"
        type="primary"
        size="small"
        :loading="busy"
        @click="distribute"
      >
        Distribute rewards
      </el-button>
      <RouterLink to="/events"><el-button size="small">Back</el-button></RouterLink>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div v-if="event" class="panel mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
      <div>
        <div class="eyebrow">Phase</div>
        <el-tag :type="phaseTone[event.phase]" size="small">{{ event.phase }}</el-tag>
      </div>
      <div>
        <div class="eyebrow">Status set to</div>
        <div class="key text-[13px]">{{ event.status }}</div>
      </div>
      <div>
        <div class="eyebrow">Entrants</div>
        <div class="key text-[15px]">{{ event.participant_count }}</div>
      </div>
      <div>
        <div class="eyebrow">Entry</div>
        <div class="key text-[13px]">
          {{ event.entry_type === 'coins' ? `${event.entry_cost} coins` : event.entry_type }}
        </div>
      </div>
      <p class="eyebrow ml-auto max-w-xs leading-relaxed">
        phase is worked out from the clock each time it is read — the status column only says what
        an operator chose
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[1fr_340px]">
      <!-- Leaderboard -->
      <section class="panel">
        <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Standings</div>
          <div class="key text-[var(--color-legend)]">{{ detail?.participants.length ?? 0 }} shown</div>
        </div>

        <EmptyState
          v-if="!detail?.participants.length"
          title="Nobody has entered yet"
          body="Participants appear here as they join from the app."
        />

        <el-table v-else :data="detail.participants" style="width: 100%">
          <el-table-column label="#" width="70">
            <template #default="{ row }">
              <span class="key">{{ row.rank ?? '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Player" min-width="180">
            <template #default="{ row }">
              <RouterLink :to="`/users/${row.user_id}`" class="hover:text-[var(--color-signal)]">
                <div>{{ row.display_name ?? row.guftagu_id }}</div>
                <div class="key text-[var(--color-legend)]">{{ row.guftagu_id }}</div>
              </RouterLink>
            </template>
          </el-table-column>
          <el-table-column label="Score" width="120" align="right">
            <template #default="{ row }">
              <span class="key">{{ row.score.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column label="" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'winner'" type="warning" size="small">winner</el-tag>
              <el-tag v-else-if="row.status === 'disqualified'" type="danger" size="small">out</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <aside class="space-y-4">
        <!-- Rewards -->
        <section class="panel">
          <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Reward bands</div>
            <el-button
              v-permission="'events.reward_manage'"
              size="small"
              text
              @click="rewardDialog = true"
            >
              Add
            </el-button>
          </div>

          <p v-if="!detail?.rewards.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
            No bands yet. Ranks outside every band get nothing.
          </p>

          <ul v-else class="divide-y divide-[var(--color-edge)]">
            <li v-for="reward in detail.rewards" :key="reward.id" class="px-4 py-2.5">
              <div class="flex items-baseline justify-between gap-2">
                <span class="key">
                  {{ reward.rank_from === reward.rank_to ? `#${reward.rank_from}` : `#${reward.rank_from}–${reward.rank_to}` }}
                </span>
                <span class="key font-bold">
                  {{ reward.reward_value.toLocaleString() }} {{ reward.reward_type }}
                </span>
              </div>
              <div class="mt-0.5 flex items-baseline justify-between">
                <span class="eyebrow">
                  {{ reward.claimed_count }} paid<template v-if="reward.quantity"> of {{ reward.quantity }}</template>
                </span>
                <button
                  v-if="reward.claimed_count === 0"
                  v-permission="'events.reward_manage'"
                  type="button"
                  class="eyebrow text-[var(--color-legend)] hover:text-[var(--color-cut)]"
                  @click="removeReward(reward.id)"
                >
                  remove
                </button>
              </div>
              <p v-if="!reward.payable" class="eyebrow mt-1 text-[var(--color-legend-dim)]">
                recorded as a claim — {{ reward.reward_type }} has no inventory table yet
              </p>
            </li>
          </ul>
        </section>

        <!-- Lucky draw -->
        <section v-if="draw" class="panel">
          <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Lucky draw</div>
          </div>

          <div class="space-y-3 p-4 text-[13px]">
            <div>
              <div class="eyebrow">Draws at</div>
              {{ when(draw.draw_at) }}
            </div>
            <div>
              <div class="eyebrow">Winners</div>
              {{ draw.winner_count }} · {{ draw.algorithm }}
            </div>

            <!-- The commitment, visible from the moment the draw was created. -->
            <div>
              <div class="eyebrow">Seed hash (published up front)</div>
              <div class="key mt-0.5 break-all text-[11px] text-[var(--color-legend)]">
                {{ draw.seed_hash }}
              </div>
            </div>

            <div v-if="draw.has_run">
              <div class="eyebrow">Seed (revealed after the draw)</div>
              <div class="key mt-0.5 break-all text-[11px] text-[var(--color-ok)]">{{ draw.seed }}</div>
            </div>
            <p v-else class="eyebrow leading-relaxed">
              the seed stays hidden until the draw runs — that is what stops anyone, including
              staff, working out the winners in advance
            </p>

            <div v-if="draw.result">
              <div class="eyebrow">Winners</div>
              <ul class="mt-1 space-y-0.5">
                <li v-for="userId in draw.result.winners" :key="userId" class="key">
                  <RouterLink :to="`/users/${userId}`" class="hover:text-[var(--color-signal)]">
                    user {{ userId }}
                  </RouterLink>
                </li>
              </ul>
              <p class="eyebrow mt-1">from {{ draw.result.entrant_count }} entrants</p>
            </div>

            <div class="space-y-2 border-t border-[var(--color-edge)] pt-3">
              <el-button
                v-if="!draw.has_run"
                v-permission="'events.manage'"
                type="primary"
                class="w-full"
                :loading="busy"
                @click="runDraw"
              >
                Run the draw
              </el-button>

              <template v-else>
                <el-button class="w-full" @click="verify">Verify the result</el-button>

                <div
                  v-if="verification"
                  class="border-l-2 px-3 py-2"
                  :class="verification.valid ? 'border-l-[var(--color-ok)]' : 'border-l-[var(--color-cut)]'"
                >
                  <div class="eyebrow" :class="verification.valid ? 'text-[var(--color-ok)]' : 'text-[var(--color-cut)]'">
                    {{ verification.valid ? 'Checks out' : 'Does not match' }}
                  </div>
                  <p class="eyebrow mt-1">
                    hash {{ verification.hash_matches ? 'matches' : 'differs' }} ·
                    winners {{ verification.winners_match ? 'match' : 'differ' }}
                  </p>
                </div>
              </template>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>

  <el-dialog v-model="rewardDialog" title="Add a reward band" width="400">
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
            <el-option label="Frame" value="frame" />
            <el-option label="Badge" value="badge" />
            <el-option label="VIP days" value="vip_days" />
          </el-select>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Amount</label>
          <el-input-number v-model="rewardForm.reward_value" :min="1" :step="500" class="w-full" />
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Cap</label>
        <el-input-number v-model="rewardForm.quantity" :min="1" class="w-full" />
        <p class="eyebrow mt-1">leave empty to pay everyone in the band</p>
      </div>

      <p v-if="rewardError" class="text-[12px] text-[var(--color-cut)]">{{ rewardError }}</p>
    </div>

    <template #footer>
      <el-button @click="rewardDialog = false">Cancel</el-button>
      <el-button type="primary" @click="addReward">Add band</el-button>
    </template>
  </el-dialog>
</template>
