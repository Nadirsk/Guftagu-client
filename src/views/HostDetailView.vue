<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { bp, money, moneyShort } from '@/lib/money'
import type { EarningsVerification, HostDetail } from '@/types/api'

/** Host earnings and targets — the screen A.8c is judged on. */
const route = useRoute()
const id = Number(route.params.id)

const detail = ref<HostDetail | null>(null)
const verification = ref<EarningsVerification | null>(null)

const loading = ref(true)
const busy = ref(false)

const range = ref({ from: '', to: '' })

onMounted(async () => {
  const now = new Date()
  range.value = {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
  await load()
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<HostDetail>(`/admin/hosts/${id}`, {
      from: range.value.from,
      to: range.value.to,
    })
    detail.value = data
    verification.value = null
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** A.8c stated as a check rather than a claim. */
async function verify() {
  busy.value = true
  try {
    const { data } = await api.get<EarningsVerification>(`/admin/hosts/${id}/earnings/verify`, {
      from: range.value.from,
      to: range.value.to,
    })
    verification.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** Tallest bar in the range, so the sparkline scales to what is actually there. */
const peak = computed(() =>
  Math.max(1, ...(detail.value?.daily ?? []).map((d) => d.diamonds_earned)),
)
</script>

<template>
  <div v-loading="loading">
    <PageHead
      eyebrow="Partners"
      :title="detail?.host.display_name ?? detail?.host.guftagu_id ?? 'Host'"
      :lede="detail?.host.agency ? `Hosting under ${detail.host.agency.name}.` : 'No agency — earning on their own.'"
    >
      <template #actions>
        <el-input v-model="range.from" type="date" size="small" style="width: 140px" @change="load" />
        <el-input v-model="range.to" type="date" size="small" style="width: 140px" @change="load" />
        <el-button v-permission="'hosts.earnings_view'" size="small" :loading="busy" @click="verify">
          Verify
        </el-button>
      </template>
    </PageHead>

    <div v-if="detail" class="space-y-4 px-5 py-5 md:px-7">
      <!-- Verification result: exactness is the whole acceptance criterion. -->
      <div
        v-if="verification"
        class="panel border-l-2 px-4 py-3"
        :class="verification.matches ? 'border-l-[#00A47C]' : 'border-l-[var(--color-cut)]'"
      >
        <div class="flex flex-wrap items-baseline gap-x-4">
          <span class="key font-bold">
            {{ verification.matches ? 'Rollup matches the ledger exactly' : 'Rollup and ledger disagree' }}
          </span>
          <span class="eyebrow">rollup {{ verification.rollup_diamonds.toLocaleString() }}</span>
          <span class="eyebrow">ledger {{ verification.ledger_diamonds.toLocaleString() }}</span>
          <span class="eyebrow">difference {{ verification.difference.toLocaleString() }}</span>
        </div>
        <p class="eyebrow mt-1 leading-relaxed">{{ verification.note }}</p>
      </div>

      <p v-if="detail.pricing_note" class="panel border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]">
        {{ detail.pricing_note }}
      </p>

      <!-- Totals -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">diamonds</div>
          <div class="key text-[18px]">{{ detail.totals.diamonds.toLocaleString() }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">gross</div>
          <div class="key text-[18px]">{{ moneyShort(detail.totals.gross_paise) }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">platform cut</div>
          <div class="key text-[18px]">{{ moneyShort(detail.totals.platform_cut_paise) }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">agency cut</div>
          <div class="key text-[18px]">{{ moneyShort(detail.totals.agency_cut_paise) }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">host keeps</div>
          <div class="key text-[18px] text-[var(--color-signal)]">{{ moneyShort(detail.totals.net_paise) }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">unique gifters</div>
          <!-- A dash, not a zero: this is uncountable, not empty. -->
          <div class="key text-[18px] text-[var(--color-legend)]">—</div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <!-- Daily -->
        <section class="panel">
          <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Daily earnings</div>
            <div class="eyebrow">{{ detail.period.from }} → {{ detail.period.to }}</div>
          </div>

          <EmptyState
            v-if="detail.daily.length === 0"
            title="Nothing earned in this range"
            body="Widen the dates, or check that the nightly rollup has run."
          />

          <div v-else>
            <!-- One bar per day. Deliberately thin marks, no gridlines. -->
            <div class="flex h-24 items-end gap-[2px] px-4 pt-4">
              <div
                v-for="d in detail.daily"
                :key="d.date"
                class="flex-1 rounded-t-[2px] bg-[#BF831F]"
                :style="{ height: `${Math.max(2, (d.diamonds_earned / peak) * 100)}%` }"
                :title="`${d.date} — ${d.diamonds_earned.toLocaleString()} diamonds`"
              />
            </div>

            <el-table :data="detail.daily" style="width: 100%" max-height="420">
              <el-table-column label="Date" width="120">
                <template #default="{ row }"><span class="key">{{ row.date }}</span></template>
              </el-table-column>
              <el-table-column label="Diamonds" width="110" align="right">
                <template #default="{ row }"><span class="key">{{ row.diamonds_earned.toLocaleString() }}</span></template>
              </el-table-column>
              <el-table-column label="Gross" width="110" align="right">
                <template #default="{ row }"><span class="key">{{ moneyShort(row.gross_paise) }}</span></template>
              </el-table-column>
              <el-table-column label="Platform" width="110" align="right">
                <template #default="{ row }"><span class="key">{{ moneyShort(row.platform_cut_paise) }}</span></template>
              </el-table-column>
              <el-table-column label="Agency" width="110" align="right">
                <template #default="{ row }"><span class="key">{{ moneyShort(row.agency_cut_paise) }}</span></template>
              </el-table-column>
              <el-table-column label="Host keeps" width="120" align="right">
                <template #default="{ row }">
                  <span class="key text-[var(--color-signal)]">{{ moneyShort(row.net_paise) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Gifters" width="90" align="right">
                <template #default="{ row }">
                  <span class="key text-[var(--color-legend)]">{{ row.unique_gifters ?? '—' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            {{ detail.note }}
          </p>
        </section>

        <aside class="space-y-4">
          <section class="panel px-4 py-3">
            <div class="eyebrow mb-2">Contract</div>
            <dl class="space-y-2 text-[13px]">
              <div class="flex justify-between">
                <dt class="eyebrow">agency</dt>
                <dd>
                  <RouterLink
                    v-if="detail.host.agency"
                    to="/agencies"
                    class="hover:text-[var(--color-signal)]"
                  >
                    {{ detail.host.agency.name }}
                  </RouterLink>
                  <span v-else class="text-[var(--color-legend)]">none</span>
                </dd>
              </div>
              <div class="flex justify-between"><dt class="eyebrow">tier</dt><dd class="key">{{ detail.host.tier ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt class="eyebrow">own cut</dt><dd class="key">{{ bp(detail.host.base_commission_bp) }}</dd></div>
              <div class="flex justify-between"><dt class="eyebrow">starts</dt><dd class="key">{{ detail.host.contract_start ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt class="eyebrow">ends</dt><dd class="key">{{ detail.host.contract_end ?? 'open' }}</dd></div>
              <div class="flex justify-between">
                <dt class="eyebrow">in force</dt>
                <dd>
                  <el-tag :type="detail.host.under_contract ? 'success' : 'info'" size="small">
                    {{ detail.host.under_contract ? 'yes' : 'ended' }}
                  </el-tag>
                </dd>
              </div>
            </dl>
            <p v-if="detail.host.notes" class="eyebrow mt-2 leading-relaxed">{{ detail.host.notes }}</p>
          </section>

          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Targets</div></div>

            <EmptyState v-if="detail.targets.length === 0" title="No targets set" />

            <ul v-else>
              <li
                v-for="t in detail.targets"
                :key="t.id"
                class="border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
              >
                <div class="flex items-baseline justify-between">
                  <span class="eyebrow">{{ t.period_start }} → {{ t.period_end }}</span>
                  <span class="key">{{ t.achievement_pct === null ? '—' : `${t.achievement_pct}%` }}</span>
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-edge)]">
                  <div
                    class="h-full rounded-full"
                    :style="{
                      width: `${Math.min(100, t.achievement_pct ?? 0)}%`,
                      background: (t.achievement_pct ?? 0) >= 100 ? '#00A47C' : '#BF831F',
                    }"
                  />
                </div>
                <div class="mt-1 flex items-baseline justify-between">
                  <span class="eyebrow">
                    {{ (t.achieved_diamonds ?? 0).toLocaleString() }} / {{ t.target_diamonds.toLocaleString() }}
                  </span>
                  <span v-if="t.incentive_paise !== null" class="eyebrow">{{ money(t.incentive_paise) }}</span>
                </div>
                <p class="eyebrow mt-1">{{ t.is_frozen ? 'frozen at evaluation' : 'live' }}</p>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
