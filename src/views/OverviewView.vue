<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import GroupedBars from '@/components/charts/GroupedBars.vue'
import LineChart from '@/components/charts/LineChart.vue'
import { REVENUE_SERIES, SERIES, rampStep } from '@/components/charts/palette'
import PageHead from '@/components/PageHead.vue'
import ScopedOverview from '@/components/ScopedOverview.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ScopedKpis } from '@/types/api'

/** Epic A.2 — GFT-019 (tiles + live counters), GFT-020 (revenue), GFT-021 (retention). */
const auth = useAuthStore()
const route = useRoute()

interface Kpis {
  users: { total: number; active: number; suspended: number; banned: number; new_today: number; new_7d: number }
  engagement: { active_today: number; active_30d: number; dau_mau_ratio: number }
  queues: { kyc_pending: number }
  rooms: { live: number; available: boolean }
  as_of: string
}

interface Cohort { cohort: string; signed_up: number; d1: number; d7: number; d30: number }

const kpis = ref<Kpis | null>(null)

// A scoped account gets a different payload, not a narrower one. Detected from the
// response rather than from a permission check, because the server is the only thing that
// knows what the grant says.
const scopedKpis = ref<ScopedKpis | null>(null)
const revenue = ref<{ series: Array<Record<string, number | string>>; totals: Record<string, number>; coin_total: number; streams_live: Record<string, boolean> } | null>(null)
const engagement = ref<{ series: Array<Record<string, number | string>>; retention: { measure: string; note: string; cohorts: Cohort[] } } | null>(null)

const loading = ref(true)
const granularity = ref<'day' | 'week' | 'month'>('day')
const rangeDays = ref(30)
const exporting = ref(false)

const canSeeDashboard = computed(() => auth.can('dashboard.view'))
const deniedKey = computed(() => (typeof route.query.denied === 'string' ? route.query.denied : null))

let ticker: number | undefined

onMounted(async () => {
  if (!canSeeDashboard.value) {
    loading.value = false
    return
  }

  await Promise.all([loadKpis(), loadCharts()])
  loading.value = false

  // A.2a wants the counters current within 5 seconds without a reload. The API caches
  // for 10s, so this is cheap; a WebSocket tick replaces it when Reverb lands with E.1.
  ticker = window.setInterval(loadKpis, 5000)
})

onUnmounted(() => window.clearInterval(ticker))

async function loadKpis() {
  try {
    const { data } = await api.get<Kpis | ScopedKpis>('/admin/dashboard/kpis')

    if ('scope' in data) {
      scopedKpis.value = data as ScopedKpis
      kpis.value = null
      return
    }

    scopedKpis.value = null
    kpis.value = data as Kpis
  } catch {
    // A failed background refresh should not shout; the previous figures stay on screen.
  }
}

async function loadCharts() {
  // Platform series are refused on a scoped account by design; asking anyway would put a
  // red toast on a screen that is working correctly.
  if (scopedKpis.value !== null) return

  const params = { granularity: granularity.value, from: fromDate(), to: today() }

  try {
    const [rev, eng] = await Promise.all([
      api.get<typeof revenue.value>('/admin/dashboard/revenue', params),
      api.get<typeof engagement.value>('/admin/dashboard/engagement', params),
    ])
    revenue.value = rev.data
    engagement.value = eng.data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function fromDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - (rangeDays.value - 1))
  return date.toISOString().slice(0, 10)
}

async function changeRange() {
  await loadCharts()
}

async function requestExport() {
  exporting.value = true
  try {
    const { message } = await api.post('/admin/dashboard/export', {
      type: 'revenue',
      from: fromDate(),
      to: today(),
    })
    ElMessage.success(message)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    exporting.value = false
  }
}

const signupPoints = computed(() =>
  (engagement.value?.series ?? []).map((point) => ({
    label: String(point.label),
    value: Number(point.new_users ?? 0),
  })),
)

const revenueBuckets = computed(() =>
  (revenue.value?.series ?? []).map((point) => ({
    label: String(point.label),
    values: REVENUE_SERIES.map((s) => Number(point[s.key] ?? 0)),
  })),
)

/** True while recharge, gifting and VIP all have no source — a flat chart needs explaining. */
const revenueIsEmpty = computed(
  () => revenue.value !== null && revenue.value.coin_total === 0,
)

const cohorts = computed(() => engagement.value?.retention.cohorts ?? [])

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function format(value: number | undefined): string {
  return (value ?? 0).toLocaleString()
}

function cohortLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
</script>

<template>
  <ScopedOverview v-if="scopedKpis" :data="scopedKpis" />

  <template v-else>
  <PageHead
    eyebrow="Console"
    title="Overview"
    :lede="kpis ? `Counters refresh every 5 seconds. Charts cover the last ${rangeDays} days.` : ''"
  >
    <template #actions>
      <el-select v-model="rangeDays" size="small" class="w-28" @change="changeRange">
        <el-option :value="7" label="7 days" />
        <el-option :value="30" label="30 days" />
        <el-option :value="90" label="90 days" />
      </el-select>
      <el-select v-model="granularity" size="small" class="w-28" @change="changeRange">
        <el-option value="day" label="Daily" />
        <el-option value="week" label="Weekly" />
        <el-option value="month" label="Monthly" />
      </el-select>
      <el-button
        v-permission="'dashboard.export'"
        size="small"
        :loading="exporting"
        @click="requestExport"
      >
        Export CSV
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div
      v-if="deniedKey"
      class="panel mb-5 border-l-2 border-l-[var(--color-cut)] px-4 py-3"
      role="status"
    >
      <div class="eyebrow text-[var(--color-cut)]">Not available to you</div>
      <p class="mt-1 text-[13px]">
        That screen needs <span class="key">{{ deniedKey }}</span
        >, which you do not hold.
      </p>
    </div>

    <!-- Permission-shaped fallback: a Moderator has no dashboard, so say what they DO have. -->
    <div v-if="!canSeeDashboard" class="panel px-4 py-4">
      <div class="eyebrow">No dashboard for your role</div>
      <p class="mt-1.5 text-[13px] text-[var(--color-legend)]">
        Analytics need <span class="key">dashboard.view</span>. You hold
        {{ auth.permissions.length }} permissions — the sidebar shows everything you can reach.
      </p>
    </div>

    <template v-else>
      <!-- A.2a — the numbers, as numbers. A sparkline in a stat tile would be decoration. -->
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="panel px-4 py-3">
          <div class="eyebrow">Total users</div>
          <div class="mt-1 text-[24px] leading-none font-semibold tabular-nums">
            {{ format(kpis?.users.total) }}
          </div>
          <div class="key mt-1.5 text-[var(--color-legend)]">
            +{{ format(kpis?.users.new_7d) }} in 7 days
          </div>
        </div>

        <div class="panel px-4 py-3">
          <div class="eyebrow">Active today</div>
          <div class="mt-1 text-[24px] leading-none font-semibold tabular-nums">
            {{ format(kpis?.engagement.active_today) }}
          </div>
          <div class="key mt-1.5 text-[var(--color-legend)]">
            {{ pct(kpis?.engagement.dau_mau_ratio ?? 0) }} of 30-day actives
          </div>
        </div>

        <RouterLink
          v-permission="'users.view'"
          to="/users?kyc=pending"
          class="panel block px-4 py-3 transition-colors hover:border-[var(--color-edge-bright)]"
        >
          <div class="eyebrow">KYC waiting</div>
          <div
            class="mt-1 text-[24px] leading-none font-semibold tabular-nums"
            :class="(kpis?.queues.kyc_pending ?? 0) > 0 ? 'text-[var(--color-signal)]' : ''"
          >
            {{ format(kpis?.queues.kyc_pending) }}
          </div>
          <div class="key mt-1.5 text-[var(--color-legend)]">review queue →</div>
        </RouterLink>

        <!-- Honest tile: not zero rooms, no rooms module. -->
        <div class="panel px-4 py-3 opacity-70">
          <div class="eyebrow">Live rooms</div>
          <div class="mt-1 text-[24px] leading-none font-semibold text-[var(--color-legend-dim)]">
            —
          </div>
          <div class="key mt-1.5 text-[var(--color-legend-dim)]">arrives with the rooms module</div>
        </div>
      </div>

      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <div class="panel px-4 py-2.5">
          <div class="eyebrow">Active accounts</div>
          <div class="key mt-0.5 text-[15px]">{{ format(kpis?.users.active) }}</div>
        </div>
        <div class="panel px-4 py-2.5">
          <div class="eyebrow">Suspended</div>
          <div class="key mt-0.5 text-[15px]">{{ format(kpis?.users.suspended) }}</div>
        </div>
        <div class="panel px-4 py-2.5">
          <div class="eyebrow">Banned</div>
          <div class="key mt-0.5 text-[15px]">{{ format(kpis?.users.banned) }}</div>
        </div>
      </div>

      <!-- GFT-021 — signups. One series, so the title names it and there is no legend. -->
      <section class="panel mt-5">
        <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">New signups</div>
          <div class="key text-[var(--color-legend)]">
            {{ format(signupPoints.reduce((sum, p) => sum + p.value, 0)) }} in range
          </div>
        </div>
        <div class="p-3">
          <LineChart :points="signupPoints" :color="SERIES[0]" value-label="signups" />
        </div>
      </section>

      <!-- GFT-020 — revenue by stream. -->
      <section class="panel mt-5">
        <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Coin revenue by stream</div>
          <div class="key text-[var(--color-legend)]">
            {{ format(revenue?.coin_total) }} coins in range
          </div>
        </div>

        <div class="p-3">
          <div
            v-if="revenueIsEmpty"
            class="mb-3 border-l-2 border-l-[var(--color-signal)] bg-[var(--color-raised)] px-3 py-2 text-[12px]"
          >
            Every stream reads zero because none has a source yet — recharge needs payments,
            gifting needs the gifting module, VIP needs the store. This is not "no revenue",
            it is "not built". Manual wallet adjustments are tracked separately below.
          </div>

          <GroupedBars :buckets="revenueBuckets" :series="REVENUE_SERIES" unit="coins" />

          <div class="mt-3 grid gap-3 border-t border-[var(--color-edge)] pt-3 sm:grid-cols-3">
            <div>
              <div class="eyebrow">Admin credits</div>
              <div class="key mt-0.5 text-[14px] text-[var(--color-ok)]">
                +{{ format(revenue?.totals.admin_credit) }}
              </div>
            </div>
            <div>
              <div class="eyebrow">Admin debits</div>
              <div class="key mt-0.5 text-[14px] text-[var(--color-cut)]">
                −{{ format(revenue?.totals.admin_debit) }}
              </div>
            </div>
            <div>
              <div class="eyebrow">Diamonds earned</div>
              <div class="key mt-0.5 text-[14px]">{{ format(revenue?.totals.diamonds) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- GFT-021 — retention cohorts. Sequential ramp: magnitude, not identity. -->
      <section class="panel mt-5">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Retention by signup cohort</div>
        </div>

        <div class="p-4">
          <p class="mb-3 text-[12px] text-[var(--color-legend)]">
            {{ engagement?.retention.note }}
          </p>

          <div v-if="!cohorts.length" class="py-6 text-center text-[13px] text-[var(--color-legend)]">
            No signup cohorts in the last eight weeks.
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr class="border-b border-[var(--color-edge)]">
                  <th class="eyebrow py-2 text-left">Week of</th>
                  <th class="eyebrow py-2 text-right">Signed up</th>
                  <th class="eyebrow py-2 text-right">+1 day</th>
                  <th class="eyebrow py-2 text-right">+7 days</th>
                  <th class="eyebrow py-2 text-right">+30 days</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="cohort in cohorts"
                  :key="cohort.cohort"
                  class="border-b border-[var(--color-edge)]"
                >
                  <td class="key py-1.5">{{ cohortLabel(cohort.cohort) }}</td>
                  <td class="key py-1.5 text-right text-[var(--color-legend)]">
                    {{ cohort.signed_up }}
                  </td>
                  <!-- The cell is tinted by magnitude, but the number is always printed:
                       colour is never the only way to read the value. -->
                  <td
                    v-for="horizon in (['d1', 'd7', 'd30'] as const)"
                    :key="horizon"
                    class="key py-1.5 text-right"
                  >
                    <span
                      class="inline-block min-w-[3rem] px-2 py-0.5"
                      :style="{ background: rampStep(cohort[horizon]), borderRadius: '2px' }"
                    >
                      {{ pct(cohort[horizon]) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
</template>
