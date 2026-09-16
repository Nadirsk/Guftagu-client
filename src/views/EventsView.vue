<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { EventPhase, EventRow, EventType, MetricRefType, ProgressMetric, RankingRuleRow } from '@/types/api'

/** GFT-099 — the event list and builder, plus the campaign-event types (Recharge
 * Activity, Weekly Star, and any Custom event) that open into the Event Builder instead
 * of the rank-band view. */
const router = useRouter()

const CAMPAIGN_TYPES: EventType[] = ['recharge_activity', 'weekly_star', 'custom']

const PROGRESS_METRIC_LABELS: Record<ProgressMetric, string> = {
  recharge_amount: 'Coins recharged (real money top-up)',
  coins_spent: 'Coins spent',
  diamonds_earned: 'Diamonds earned',
  gift_value: 'Gift value sent (coins)',
  gift_count: 'Gifts sent (count)',
}

const rows = ref<EventRow[]>([])
const loading = ref(true)
const total = ref(0)
const phase = ref<'' | EventPhase>('')
const type = ref<'' | EventType>('')
const rankingRules = ref<RankingRuleRow[]>([])
const gifts = ref<Array<{ id: number; name_en: string }>>([])
const giftCategories = ref<Array<{ id: number; name_en: string }>>([])

const dialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  type: 'event' as EventType,
  title_en: '',
  title_hi: '',
  description: '',
  entry_type: 'free',
  entry_cost: 0,
  starts_at: '',
  ends_at: '',
  max_participants: null as number | null,
  winner_count: 3,
  algorithm: 'random',
  period: 'monthly' as '' | 'daily' | 'weekly' | 'monthly',
  progress_metric: 'recharge_amount' as ProgressMetric,
  ranking_rule_key: '' as string,
  // custom events only — which drives standings
  standings_source: 'metric' as 'metric' | 'ranking_rule',
  metric_ref_type: '' as '' | MetricRefType,
  metric_ref_id: null as number | null,
})

onMounted(async () => {
  await Promise.all([load(), loadRankingRules(), loadGiftCatalogues()])
  loading.value = false
})

async function loadRankingRules() {
  try {
    const { data } = await api.get<{ rules: RankingRuleRow[] }>('/admin/ranking-rules')
    rankingRules.value = data.rules
  } catch {
    // Only needed for the weekly_star/custom create form — silently unavailable is fine.
  }
}

async function loadGiftCatalogues() {
  try {
    const [giftsRes, categoriesRes] = await Promise.all([
      api.get<Array<{ id: number; name_en: string }>>('/admin/gifts', { per_page: 100 }),
      api.get<Array<{ id: number; name_en: string }>>('/admin/gift-categories'),
    ])
    gifts.value = giftsRes.data
    giftCategories.value = categoriesRes.data
  } catch {
    // Only needed for a custom event's gift_value/gift_count ref picker.
  }
}

async function load() {
  try {
    const { data, meta } = await api.get<EventRow[]>('/admin/events', {
      phase: phase.value || undefined,
      type: type.value || undefined,
      per_page: 50,
    })
    rows.value = data
    total.value = meta.total ?? data.length
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function create() {
  const start = new Date(Date.now() + 86_400_000)
  const end = new Date(Date.now() + 3 * 86_400_000)

  Object.assign(form, {
    type: 'event', title_en: '', title_hi: '', description: '',
    entry_type: 'free', entry_cost: 0,
    starts_at: start.toISOString().slice(0, 19),
    ends_at: end.toISOString().slice(0, 19),
    max_participants: null, winner_count: 3, algorithm: 'random',
    period: 'monthly', progress_metric: 'recharge_amount', ranking_rule_key: '',
    standings_source: 'metric', metric_ref_type: '', metric_ref_id: null,
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}

  const body: Record<string, unknown> = {
    type: form.type,
    title_en: form.title_en,
    title_hi: form.title_hi || null,
    description: form.description || null,
    entry_type: form.entry_type,
    entry_cost: form.entry_type === 'coins' ? form.entry_cost : 0,
    starts_at: form.starts_at,
    ends_at: form.ends_at,
    max_participants: form.max_participants,
  }

  if (form.type === 'lucky_draw') {
    body.winner_count = form.winner_count
    body.algorithm = form.algorithm
  }

  if (form.type === 'recharge_activity') {
    body.progress_metric = form.progress_metric
    body.period = form.period
  }

  if (form.type === 'weekly_star') {
    body.ranking_rule_key = form.ranking_rule_key
    body.period = form.period
  }

  if (form.type === 'custom') {
    body.period = form.period || null
    if (form.standings_source === 'ranking_rule') {
      body.ranking_rule_key = form.ranking_rule_key
    } else {
      body.progress_metric = form.progress_metric
      if (form.progress_metric === 'gift_value' || form.progress_metric === 'gift_count') {
        body.metric_ref_type = form.metric_ref_type || null
        body.metric_ref_id = form.metric_ref_type ? form.metric_ref_id : null
      }
    }
  }

  try {
    await api.post('/admin/events', body)
    ElMessage.success('Created as a draft — publish it when the details are right')
    dialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

async function publish(row: EventRow) {
  try {
    await ElMessageBox.confirm(
      'Once published, the event goes live and ends on its own schedule — nobody has to flip a switch at 20:00.',
      `Publish “${row.title_en}”?`,
      { confirmButtonText: 'Publish', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/events/${row.id}/publish`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function cancel(row: EventRow) {
  let reason: string
  try {
    const result = await ElMessageBox.prompt('Why is this being cancelled?', `Cancel “${row.title_en}”`, {
      confirmButtonText: 'Cancel event',
      cancelButtonText: 'Keep it',
      inputType: 'textarea',
      inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
    })
    reason = result.value
  } catch {
    return
  }

  try {
    await api.post(`/admin/events/${row.id}/cancel`, { reason })
    ElMessage.success('Event cancelled')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function open(row: EventRow) {
  const name = CAMPAIGN_TYPES.includes(row.type) ? 'event-builder' : 'event-detail'
  void router.push({ name, params: { id: row.id } })
}

// 'draft' deliberately has no entry — ElTag only accepts primary/success/info/warning/
// danger, not '', so its plain (typeless) look comes from omitting the prop entirely.
const phaseTone: Partial<Record<EventPhase, 'success' | 'warning' | 'danger' | 'info'>> = {
  live: 'success',
  upcoming: 'warning',
  ended: 'info',
  cancelled: 'danger',
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** A draft whose window already passed can never publish — the server rejects it every time. */
function isStaleDraft(row: EventRow): boolean {
  return row.status === 'draft' && new Date(row.ends_at).getTime() <= Date.now()
}
</script>

<template>
  <PageHead
    eyebrow="Engagement"
    title="Events"
    :lede="`${total} events. A published event goes live and ends on its own — the phase comes from the clock, not from anyone remembering to change it.`"
  >
    <template #actions>
      <el-select v-model="type" placeholder="Any type" clearable size="small" class="w-40" @change="load">
        <el-option label="Event" value="event" />
        <el-option label="Tournament" value="tournament" />
        <el-option label="Lucky draw" value="lucky_draw" />
        <el-option label="Recharge Activity" value="recharge_activity" />
        <el-option label="Weekly Star" value="weekly_star" />
      </el-select>
      <el-select v-model="phase" placeholder="Any phase" clearable size="small" class="w-36" @change="load">
        <el-option label="Live" value="live" />
        <el-option label="Upcoming" value="upcoming" />
        <el-option label="Ended" value="ended" />
        <el-option label="Draft" value="draft" />
        <el-option label="Cancelled" value="cancelled" />
      </el-select>
      <el-button v-permission="'events.manage'" type="primary" size="small" @click="create">
        New event
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <EmptyState
      v-if="!loading && rows.length === 0"
      title="No events match that"
      body="Create one — it starts as a draft, so nothing goes live until you publish it."
    />

    <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="row in rows" :key="row.id" class="panel flex flex-col">
        <button type="button" class="flex-1 px-4 pt-3 pb-2 text-left" @click="open(row)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-[14px] font-semibold">{{ row.title_en }}</div>
              <div class="eyebrow mt-0.5">{{ row.type.replace('_', ' ') }}</div>
            </div>
            <el-tag :type="phaseTone[row.phase] ?? undefined" size="small">{{ row.phase }}</el-tag>
          </div>

          <div class="mt-3 space-y-0.5">
            <div class="key text-[12px] text-[var(--color-legend)]">
              {{ when(row.starts_at) }} → {{ when(row.ends_at) }}
            </div>
            <div class="key text-[12px] text-[var(--color-legend)]">
              {{ row.participant_count }} entrants
              <template v-if="row.max_participants"> of {{ row.max_participants }}</template>
            </div>
          </div>

          <div class="mt-2 flex flex-wrap gap-1.5">
            <el-tag v-if="row.is_featured" type="warning" size="small">featured</el-tag>
            <el-tag v-if="row.entry_type !== 'free'" size="small" type="info">
              {{ row.entry_type === 'coins' ? `${row.entry_cost} coins` : row.entry_type }}
            </el-tag>
          </div>
        </button>

        <div class="flex gap-2 border-t border-[var(--color-edge)] px-4 py-2">
          <el-tooltip
            v-if="row.status === 'draft'"
            :disabled="!isStaleDraft(row)"
            content="This window already ended — move the dates forward before publishing."
          >
            <el-button
              v-permission="'events.manage'"
              size="small"
              type="primary"
              :disabled="isStaleDraft(row)"
              @click="publish(row)"
            >
              Publish
            </el-button>
          </el-tooltip>
          <el-button
            v-if="row.status === 'scheduled' && row.phase !== 'ended'"
            v-permission="'events.manage'"
            size="small"
            type="danger"
            plain
            @click="cancel(row)"
          >
            Cancel
          </el-button>
          <el-button class="ml-auto" size="small" text @click="open(row)">Open</el-button>
        </div>
      </article>
    </div>
  </div>

  <el-dialog v-model="dialog" title="New event" width="500">
    <div class="space-y-3">
      <div>
        <label class="eyebrow mb-1 block">Type</label>
        <el-radio-group v-model="form.type" size="small">
          <el-radio-button value="event">Event</el-radio-button>
          <el-radio-button value="tournament">Tournament</el-radio-button>
          <el-radio-button value="lucky_draw">Lucky draw</el-radio-button>
          <el-radio-button value="recharge_activity">Recharge Activity</el-radio-button>
          <el-radio-button value="weekly_star">Weekly Star</el-radio-button>
          <el-radio-button value="custom">Custom</el-radio-button>
        </el-radio-group>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block" for="e-en">Title (English)</label>
          <el-input id="e-en" v-model="form.title_en" />
          <p v-if="errors.title_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.title_en }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block" for="e-hi">Title (Hindi)</label>
          <el-input id="e-hi" v-model="form.title_hi" />
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="e-desc">Description</label>
        <el-input id="e-desc" v-model="form.description" type="textarea" :rows="2" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Starts</label>
          <el-date-picker
            v-model="form.starts_at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Ends</label>
          <el-date-picker
            v-model="form.ends_at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
          <p v-if="errors.ends_at" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.ends_at }}</p>
        </div>
      </div>
      <p class="eyebrow">
        it flips to live and to ended at these times by itself — no scheduled job to miss
      </p>

      <div class="grid grid-cols-2 gap-3 border-t border-[var(--color-edge)] pt-3">
        <div>
          <label class="eyebrow mb-1 block">Entry</label>
          <el-select v-model="form.entry_type" class="w-full">
            <el-option label="Free" value="free" />
            <el-option label="Costs coins" value="coins" />
            <el-option label="Invite only" value="invite" />
          </el-select>
        </div>
        <div v-if="form.entry_type === 'coins'">
          <label class="eyebrow mb-1 block">Entry cost</label>
          <el-input-number v-model="form.entry_cost" :min="0" :step="100" class="w-full" />
        </div>
        <div v-else>
          <label class="eyebrow mb-1 block">Max entrants</label>
          <el-input-number v-model="form.max_participants" :min="1" class="w-full" />
        </div>
      </div>

      <div v-if="form.type === 'lucky_draw'" class="border-t border-[var(--color-edge)] pt-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">Winners</label>
            <el-input-number v-model="form.winner_count" :min="1" class="w-full" />
          </div>
          <div>
            <label class="eyebrow mb-1 block">Algorithm</label>
            <el-select v-model="form.algorithm" class="w-full">
              <el-option label="Random" value="random" />
              <el-option label="Weighted" value="weighted" />
            </el-select>
          </div>
        </div>
        <p class="eyebrow mt-2 leading-relaxed">
          a seed is committed the moment this is created and only its hash is published —
          the seed itself appears after the draw, so anyone can check the result
        </p>
      </div>

      <div v-if="form.type === 'recharge_activity'" class="border-t border-[var(--color-edge)] pt-3">
        <label class="eyebrow mb-1 block">Recharge window</label>
        <el-radio-group v-model="form.period" size="small">
          <el-radio-button value="daily">Daily</el-radio-button>
          <el-radio-button value="weekly">Weekly</el-radio-button>
          <el-radio-button value="monthly">Monthly</el-radio-button>
        </el-radio-group>
        <p class="eyebrow mt-2 leading-relaxed">
          tiers and their thresholds are added afterwards, in the builder — this only sets the
          window a user's recharge total is measured over
        </p>
      </div>

      <div v-if="form.type === 'weekly_star'" class="border-t border-[var(--color-edge)] pt-3">
        <label class="eyebrow mb-1 block">Driven by ranking rule</label>
        <el-select v-model="form.ranking_rule_key" class="w-full" placeholder="Select a rule">
          <el-option v-for="rule in rankingRules" :key="rule.key" :label="`${rule.key} (${rule.board_type} · ${rule.period})`" :value="rule.key" />
        </el-select>
        <p class="eyebrow mt-2 leading-relaxed">
          standings come from this rule's leaderboard — rank bands and reward bundles are added
          afterwards, in the builder
        </p>
      </div>

      <div v-if="form.type === 'custom'" class="space-y-3 border-t border-[var(--color-edge)] pt-3">
        <div>
          <label class="eyebrow mb-1 block">Window</label>
          <el-radio-group v-model="form.period" size="small">
            <el-radio-button value="">Fixed dates only (no recurrence)</el-radio-button>
            <el-radio-button value="daily">Daily</el-radio-button>
            <el-radio-button value="weekly">Weekly</el-radio-button>
            <el-radio-button value="monthly">Monthly</el-radio-button>
          </el-radio-group>
          <p class="eyebrow mt-1 leading-relaxed">
            "Fixed dates only" scores strictly between Starts and Ends above — e.g. a one-off
            event running Sep 9 to Nov 9. A recurring window re-opens every day/week/month instead.
          </p>
        </div>

        <div>
          <label class="eyebrow mb-1 block">Standings driven by</label>
          <el-radio-group v-model="form.standings_source" size="small">
            <el-radio-button value="metric">A progress metric</el-radio-button>
            <el-radio-button value="ranking_rule">An existing ranking rule</el-radio-button>
          </el-radio-group>
        </div>

        <template v-if="form.standings_source === 'metric'">
          <div>
            <label class="eyebrow mb-1 block">Metric</label>
            <el-select v-model="form.progress_metric" class="w-full">
              <el-option v-for="(label, key) in PROGRESS_METRIC_LABELS" :key="key" :label="label" :value="key" />
            </el-select>
          </div>

          <div v-if="form.progress_metric === 'gift_value' || form.progress_metric === 'gift_count'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="eyebrow mb-1 block">Scope</label>
              <el-select v-model="form.metric_ref_type" class="w-full" clearable placeholder="Any gift">
                <el-option label="One specific gift" value="gift" />
                <el-option label="One whole category" value="gift_category" />
              </el-select>
            </div>
            <div v-if="form.metric_ref_type">
              <label class="eyebrow mb-1 block">Which one</label>
              <el-select v-model="form.metric_ref_id" class="w-full" filterable>
                <el-option
                  v-for="g in (form.metric_ref_type === 'gift' ? gifts : giftCategories)"
                  :key="g.id"
                  :label="g.name_en"
                  :value="g.id"
                />
              </el-select>
            </div>
          </div>
          <p class="eyebrow leading-relaxed">
            e.g. "whoever sends the most Rose Gift" — metric "Gifts sent" or "Gift value", scope
            "One specific gift" → Rose Gift. Tier type (thresholds or rank bands) and reward
            bundles are added afterwards, in the builder.
          </p>
        </template>

        <div v-else>
          <label class="eyebrow mb-1 block">Ranking rule</label>
          <el-select v-model="form.ranking_rule_key" class="w-full" placeholder="Select a rule">
            <el-option v-for="rule in rankingRules" :key="rule.key" :label="`${rule.key} (${rule.board_type} · ${rule.period})`" :value="rule.key" />
          </el-select>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.title_en || !form.starts_at || !form.ends_at"
        @click="save"
      >
        Create draft
      </el-button>
    </template>
  </el-dialog>
</template>
