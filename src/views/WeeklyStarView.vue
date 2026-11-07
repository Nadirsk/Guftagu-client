<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { EventPhase, EventTierRewardRow, EventTierRow, WeeklyStarDetail, WeeklyStarRound } from '@/types/api'

/**
 * Weekly Star, laid out like the app screen: the campaign's dates (N rounds of 7 days),
 * the three Event Gifts that are the only way to score, a reward bundle for each of
 * Top 1–3, and the rounds — each pays its Top 3 by itself when it ends.
 */
const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

const detail = ref<WeeklyStarDetail | null>(null)
const loading = ref(true)
const busy = ref(false)

type GiftOption = { id: number; name_en: string; coin_price: number; thumbnail_url: string | null; is_active: boolean }
const giftOptions = ref<GiftOption[]>([])
const storeItems = ref<Array<{ id: number; type: string; name: string; is_active: boolean }>>([])
const vipTiers = ref<Array<{ id: number; level: number; name_en: string }>>([])
const badges = ref<Array<{ id: number; name_en: string }>>([])

onMounted(async () => {
  await Promise.all([load(), loadOptions()])
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<WeeklyStarDetail>(`/admin/weekly-stars/${id}`)
    detail.value = data
    Object.assign(basic, {
      title_en: data.event.title_en,
      starts_on: data.event.starts_at.slice(0, 10),
      weeks: data.event.weeks,
      rules: data.event.rules.join('\n'),
    })
    giftIds.value = data.gifts.map((g) => g.id)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadOptions() {
  try {
    const [gifts, items, vips, cosmetics] = await Promise.all([
      api.get<GiftOption[]>('/admin/gifts', { per_page: 100 }),
      api.get<{ items: typeof storeItems.value }>('/admin/store-items'),
      api.get<{ tiers: typeof vipTiers.value }>('/admin/vip-tiers'),
      api.get<{ badges: typeof badges.value }>('/admin/cosmetics'),
    ])
    giftOptions.value = gifts.data
    storeItems.value = items.data.items
    vipTiers.value = vips.data.tiers
    badges.value = cosmetics.data.badges
  } catch {
    /* the pickers just have nothing to offer */
  }
}

const event = computed(() => detail.value?.event ?? null)
const started = computed(() => !!event.value && new Date(event.value.starts_at).getTime() <= Date.now())

const phaseTone: Partial<Record<EventPhase, 'success' | 'warning' | 'danger' | 'info'>> = {
  live: 'success',
  upcoming: 'warning',
  ended: 'info',
  cancelled: 'danger',
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ------------------------------------------------------------------ basics

const basic = reactive({ title_en: '', starts_on: '', weeks: 1, rules: '' })
const basicErrors = ref<Record<string, string>>({})

async function saveBasics() {
  busy.value = true
  basicErrors.value = {}
  try {
    await api.patch(`/admin/weekly-stars/${id}`, {
      title_en: basic.title_en,
      ...(started.value ? {} : { starts_on: basic.starts_on }),
      weeks: basic.weeks,
      rules: basic.rules.split('\n').map((l) => l.trim()).filter(Boolean),
    })
    ElMessage.success('Saved')
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      basicErrors.value = e.fieldErrors
      if (!Object.keys(basicErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    busy.value = false
  }
}

async function publish() {
  try {
    await ElMessageBox.confirm(
      'It goes live on its start date in the app. Every 7 days the Top 3 are paid automatically.',
      'Publish this Weekly Star?',
      { confirmButtonText: 'Publish', cancelButtonText: 'Not yet' },
    )
  } catch {
    return
  }
  try {
    const { message } = await api.post(`/admin/events/${id}/publish`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function cancel() {
  let reason: string
  try {
    const result = await ElMessageBox.prompt('Why is this being cancelled?', 'Cancel Weekly Star', {
      confirmButtonText: 'Cancel it',
      cancelButtonText: 'Keep it',
      inputType: 'textarea',
      inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
    })
    reason = result.value
  } catch {
    return
  }
  try {
    await api.post(`/admin/events/${id}/cancel`, { reason })
    ElMessage.success('Cancelled')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

// ------------------------------------------------------------------- gifts

const MAX_GIFTS = 3
const giftIds = ref<number[]>([])
const giftById = computed(() => new Map(giftOptions.value.map((g) => [g.id, g])))

async function saveGifts() {
  busy.value = true
  try {
    await api.put(`/admin/weekly-stars/${id}/gifts`, { gift_ids: giftIds.value })
    ElMessage.success('Event gifts saved')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

// ----------------------------------------------------------------- rewards

const REWARD_TYPES: Record<string, string> = {
  coins: 'Coins',
  diamonds: 'Diamonds',
  frame: 'Frame',
  entry_effect: 'Entry effect',
  chat_bubble: 'Chat bubble',
  vip: 'VIP',
  badge: 'Medal',
}
const STORE_TYPE: Record<string, string> = { frame: 'frame', entry_effect: 'entrance_effect', chat_bubble: 'bubble' }

const rewardDialog = ref(false)
const rewardTier = ref<EventTierRow | null>(null)
const rewardForm = reactive({
  reward_type: 'coins',
  ref_id: null as number | null,
  reward_value: 10000,
  permanent: false,
  duration_days: 7,
})
const rewardErrors = ref<Record<string, string>>({})

const isCurrency = computed(() => ['coins', 'diamonds'].includes(rewardForm.reward_type))
const refChoices = computed(() => {
  const type = rewardForm.reward_type
  if (type === 'vip') return vipTiers.value.map((v) => ({ id: v.id, label: `VIP ${v.level} — ${v.name_en}` }))
  if (type === 'badge') return badges.value.map((b) => ({ id: b.id, label: b.name_en }))
  const storeType = STORE_TYPE[type]
  return storeItems.value.filter((i) => i.type === storeType && i.is_active).map((i) => ({ id: i.id, label: i.name }))
})

function rewardLine(r: EventTierRewardRow): string {
  const key = r.catalog.handler_key
  if (key === 'coins' || key === 'diamonds') return `${(r.reward_value ?? 0).toLocaleString()} ${REWARD_TYPES[key]}`
  return `${r.catalog.handler_ref_label ?? r.catalog.name} · ${r.duration_days ? `${r.duration_days} days` : 'permanent'}`
}

function openReward(tier: EventTierRow) {
  rewardTier.value = tier
  Object.assign(rewardForm, { reward_type: 'coins', ref_id: null, reward_value: 10000, permanent: false, duration_days: 7 })
  rewardErrors.value = {}
  rewardDialog.value = true
}

async function addReward() {
  if (!rewardTier.value) return
  busy.value = true
  rewardErrors.value = {}
  const vip = rewardForm.reward_type === 'vip'
  try {
    await api.post(`/admin/weekly-stars/${id}/tiers/${rewardTier.value.id}/rewards`, {
      reward_type: rewardForm.reward_type,
      ...(isCurrency.value
        ? { reward_value: rewardForm.reward_value }
        : {
            ref_id: rewardForm.ref_id,
            // VIP always needs days; anything else may be permanent.
            duration_days: rewardForm.permanent && !vip ? null : rewardForm.duration_days,
          }),
    })
    ElMessage.success('Reward added')
    rewardDialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      rewardErrors.value = e.fieldErrors
      if (!Object.keys(rewardErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    busy.value = false
  }
}

async function removeReward(tier: EventTierRow, reward: EventTierRewardRow) {
  try {
    await ElMessageBox.confirm(`Remove “${rewardLine(reward)}” from ${tier.label}?`, 'Remove reward', { type: 'warning' })
  } catch {
    return
  }
  try {
    await api.del(`/admin/events/${id}/tiers/${tier.id}/rewards/${reward.id}`)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

// ------------------------------------------------------------------ rounds

const roundTone: Record<WeeklyStarRound['state'], 'success' | 'warning' | 'info' | undefined> = {
  settled: 'success',
  live: 'warning',
  due: undefined,
  upcoming: 'info',
}
const roundLabel: Record<WeeklyStarRound['state'], string> = {
  settled: 'paid',
  live: 'running',
  due: 'paying soon',
  upcoming: 'upcoming',
}

async function settle(round: WeeklyStarRound) {
  try {
    await ElMessageBox.confirm(
      'This normally happens by itself within 15 minutes of the round ending. Running it again never pays anyone twice.',
      `Pay week ${round.week} now?`,
      { confirmButtonText: 'Pay now', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const { message } = await api.post(`/admin/weekly-stars/${id}/settle`, { period_start: round.period_start })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Engagement · Events"
    :title="event?.title_en ?? 'Weekly Star'"
    lede="Only the Event Gifts score, by coin value. Every 7 days the Top 3 senders get their rewards automatically."
  >
    <template #actions>
      <el-button size="small" text @click="router.push({ name: 'events' })">All events</el-button>
      <el-tag v-if="event" :type="phaseTone[event.phase] ?? undefined">{{ event.phase }}</el-tag>
      <el-button
        v-if="event?.status === 'draft'"
        v-permission="'events.approve'"
        type="primary"
        size="small"
        @click="publish"
      >
        Publish
      </el-button>
      <el-button
        v-if="event?.status === 'scheduled' && event.phase !== 'ended'"
        v-permission="'events.manage'"
        type="danger"
        plain
        size="small"
        @click="cancel"
      >
        Cancel
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="space-y-4 px-5 py-5 md:px-7">
    <template v-if="detail && event">
      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Basics -->
        <section class="panel p-4">
          <div class="eyebrow mb-3">Schedule</div>
          <el-form label-position="top" @submit.prevent="saveBasics">
            <el-form-item label="Title" :error="basicErrors.title_en">
              <el-input v-model="basic.title_en" />
            </el-form-item>
            <div class="grid grid-cols-2 gap-3">
              <el-form-item label="Start date" :error="basicErrors.starts_on">
                <el-date-picker
                  v-model="basic.starts_on"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="w-full"
                  :disabled="started"
                />
              </el-form-item>
              <el-form-item label="Runs for (weeks)" :error="basicErrors.weeks">
                <el-input-number v-model="basic.weeks" :min="1" :max="52" class="w-full" />
              </el-form-item>
            </div>
            <p class="eyebrow mb-3 leading-relaxed">
              {{ day(event.starts_at) }} → {{ day(event.ends_at) }} · {{ event.weeks }} rounds of 7 days
              <template v-if="started"> · the start date is fixed once it has begun</template>
            </p>
            <el-form-item label="Rules (one per line — the app's Rules popup)">
              <el-input v-model="basic.rules" type="textarea" :rows="3" />
            </el-form-item>
            <el-button v-permission="'events.manage'" type="primary" size="small" :loading="busy" @click="saveBasics">
              Save
            </el-button>
          </el-form>
        </section>

        <!-- Event gifts -->
        <section class="panel p-4">
          <div class="eyebrow mb-1">Event Gifts · {{ giftIds.length }}/{{ MAX_GIFTS }}</div>
          <p class="mb-3 text-[12px] text-[var(--color-legend)]">
            Shown on the app's Ranking tab. Only sending these counts — each one scores its coin price.
          </p>
          <el-select
            v-model="giftIds"
            multiple
            filterable
            :multiple-limit="MAX_GIFTS"
            placeholder="Pick up to 3 gifts"
            class="w-full"
          >
            <el-option
              v-for="g in giftOptions"
              :key="g.id"
              :label="`${g.name_en} · ${g.coin_price.toLocaleString()} coins`"
              :value="g.id"
              :disabled="!g.is_active"
            />
          </el-select>

          <div class="mt-3 grid grid-cols-3 gap-2">
            <div
              v-for="gid in giftIds"
              :key="gid"
              class="flex flex-col items-center gap-1 rounded border border-[var(--color-edge)] p-2"
            >
              <img
                v-if="giftById.get(gid)?.thumbnail_url"
                :src="giftById.get(gid)?.thumbnail_url ?? undefined"
                :alt="giftById.get(gid)?.name_en"
                class="h-12 w-12 object-contain"
              />
              <div class="truncate text-[12px] font-medium">{{ giftById.get(gid)?.name_en }}</div>
              <div class="key text-[var(--color-legend)]">{{ giftById.get(gid)?.coin_price.toLocaleString() }}</div>
            </div>
          </div>
          <p v-if="!giftIds.length" class="mt-2 text-[12px] text-[var(--color-signal)]">
            No gifts picked: nobody can score until at least one is set.
          </p>

          <el-button v-permission="'events.manage'" class="mt-3" type="primary" size="small" :loading="busy" @click="saveGifts">
            Save gifts
          </el-button>
        </section>
      </div>

      <!-- Rewards -->
      <section class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Rewards · the app's Reward tab</div>
        </div>
        <div class="grid gap-3 p-3 md:grid-cols-3">
          <div
            v-for="tier in detail.tiers"
            :key="tier.id"
            class="flex flex-col gap-2 rounded border border-[var(--color-edge)] p-3"
          >
            <div class="text-[14px] font-medium">{{ tier.label }}</div>
            <p v-if="!tier.rewards.length" class="text-[12px] text-[var(--color-legend)]">
              Nothing set: this card shows empty in the app.
            </p>
            <div v-for="r in tier.rewards" :key="r.id" class="flex items-center gap-2">
              <img
                v-if="r.catalog.image_url"
                :src="r.catalog.image_url"
                :alt="r.catalog.name"
                class="h-9 w-9 shrink-0 object-contain"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] font-medium">{{ rewardLine(r) }}</div>
                <div class="key text-[var(--color-legend)]">{{ REWARD_TYPES[r.catalog.handler_key] ?? r.catalog.handler_key }}</div>
              </div>
              <el-button
                v-permission="'events.reward_manage'"
                size="small"
                text
                type="danger"
                @click="removeReward(tier, r)"
              >
                Remove
              </el-button>
            </div>
            <el-button v-permission="'events.reward_manage'" class="mt-auto" size="small" @click="openReward(tier)">
              Add reward
            </el-button>
          </div>
        </div>
      </section>

      <div class="grid gap-4 lg:grid-cols-[1fr_340px]">
        <!-- Rounds -->
        <section class="panel">
          <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Rounds · each pays its Top 3 by itself when it ends</div>
          </div>
          <el-table :data="detail.rounds" style="width: 100%">
            <el-table-column label="Week" width="70">
              <template #default="{ row }">
                <span class="key">{{ row.week }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Dates" width="150">
              <template #default="{ row }">
                <span class="key text-[12px]">{{ day(row.period_start) }} → {{ day(row.period_end) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="roundTone[row.state as WeeklyStarRound['state']]">
                  {{ roundLabel[row.state as WeeklyStarRound['state']] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Top 3" min-width="220">
              <template #default="{ row }">
                <div v-if="row.standings.length" class="space-y-0.5">
                  <div v-for="s in row.standings.slice(0, 3)" :key="s.user_id" class="text-[12px]">
                    <span class="key font-bold">#{{ s.rank }}</span>
                    {{ s.display_name ?? s.guftagu_id }}
                    <span class="key text-[var(--color-legend)]">· {{ s.score.toLocaleString() }}</span>
                  </div>
                  <div v-if="row.settled_at" class="eyebrow">paid {{ dayTime(row.settled_at) }}</div>
                </div>
                <span v-else-if="row.state === 'settled'" class="text-[12px] text-[var(--color-legend)]">nobody sent an Event Gift</span>
              </template>
            </el-table-column>
            <el-table-column width="110" align="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.state === 'due' || row.state === 'settled'"
                  v-permission="'events.reward_manage'"
                  size="small"
                  text
                  :loading="busy"
                  @click="settle(row)"
                >
                  {{ row.state === 'due' ? 'Pay now' : 'Pay again' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- Live board -->
        <section class="panel h-fit">
          <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">This round so far</div>
          </div>
          <p v-if="!detail.board.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
            {{ event.phase === 'live' ? 'Nobody has sent an Event Gift yet this round.' : 'Shows once the Weekly Star is live.' }}
          </p>
          <ul v-else class="divide-y divide-[var(--color-edge)]">
            <li v-for="row in detail.board" :key="row.entity_id" class="flex items-baseline justify-between gap-2 px-4 py-2">
              <span class="min-w-0 truncate text-[13px]">
                <span class="key font-bold" :class="row.rank <= 3 ? 'text-[var(--color-signal)]' : ''">#{{ row.rank }}</span>
                {{ row.display_name ?? row.guftagu_id }}
              </span>
              <span class="key">{{ row.score.toLocaleString() }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>

  <el-dialog v-model="rewardDialog" :title="`Add a reward to ${rewardTier?.label ?? ''}`" width="440px">
    <el-form label-position="top" @submit.prevent="addReward">
      <el-form-item label="Reward type" :error="rewardErrors.reward_type">
        <el-select v-model="rewardForm.reward_type" class="w-full" @change="rewardForm.ref_id = null">
          <el-option v-for="(label, key) in REWARD_TYPES" :key="key" :label="label" :value="key" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="isCurrency" label="Amount" :error="rewardErrors.reward_value">
        <el-input-number v-model="rewardForm.reward_value" :min="1" :step="1000" class="w-full" />
      </el-form-item>

      <template v-else>
        <el-form-item label="Which one" :error="rewardErrors.ref_id">
          <el-select v-model="rewardForm.ref_id" class="w-full" filterable placeholder="Pick one">
            <el-option v-for="c in refChoices" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
          <div v-if="!refChoices.length" class="mt-1 text-[12px] text-[var(--color-legend)]">
            Nothing of this type exists yet — add it in the Store / VIP / Cosmetics first.
          </div>
        </el-form-item>
        <el-form-item label="Duration" :error="rewardErrors.duration_days">
          <el-checkbox v-if="rewardForm.reward_type !== 'vip'" v-model="rewardForm.permanent">Permanent</el-checkbox>
          <template v-if="!rewardForm.permanent || rewardForm.reward_type === 'vip'">
            <el-input-number v-model="rewardForm.duration_days" :min="1" :max="3650" class="ml-3" />
            <span class="ml-2 text-[12px]">days</span>
          </template>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="rewardDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="addReward">Add</el-button>
    </template>
  </el-dialog>
</template>
