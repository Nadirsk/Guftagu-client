<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type {
  PackageRow,
  RatesResult,
  ReconciliationReport,
  SlabRow,
  SlabsResult,
} from '@/types/api'

/** GFT-075 (rates & packages), GFT-076 (slab builder), GFT-079 (reconciliation report). */
const rates = ref<RatesResult | null>(null)
const packages = ref<PackageRow[]>([])
const slabs = ref<SlabsResult | null>(null)
const report = ref<ReconciliationReport | null>(null)

const loading = ref(true)
const tab = ref<'rates' | 'packages' | 'commission' | 'reconciliation'>('rates')
const running = ref(false)

const rateDialog = ref(false)
const slabDialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const overlaps = ref<SlabRow[]>([])

const rateForm = reactive({
  key: 'diamond_to_inr',
  rate_numerator: 50,
  rate_denominator: 1,
  note: '',
})

const slabForm = reactive({
  applies_to: 'platform',
  metric: 'diamonds_earned',
  min_value: 0,
  max_value: null as number | null,
  percentage_bp: 2500,
})

onMounted(async () => {
  await Promise.all([loadRates(), loadPackages(), loadSlabs()])
  loading.value = false
})

async function loadRates() {
  try {
    const { data } = await api.get<RatesResult>('/admin/economy/rates')
    rates.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadPackages() {
  try {
    const { data } = await api.get<PackageRow[]>('/admin/economy/packages', { include_inactive: true })
    packages.value = data
  } catch {
    /* tab stays empty */
  }
}

async function loadSlabs() {
  try {
    const { data } = await api.get<SlabsResult>('/admin/economy/commission-slabs')
    slabs.value = data
  } catch {
    /* tab stays empty */
  }
}

function openRate(key: string) {
  const current = rates.value?.rates[key]?.current
  Object.assign(rateForm, {
    key,
    rate_numerator: current?.rate_numerator ?? 1,
    rate_denominator: current?.rate_denominator ?? 1,
    note: '',
  })
  errors.value = {}
  rateDialog.value = true
}

async function saveRate() {
  saving.value = true
  errors.value = {}
  try {
    const { message } = await api.patch('/admin/economy/rates', { ...rateForm, note: rateForm.note || null })
    ElMessage.success(message)
    rateDialog.value = false
    await loadRates()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

function openSlab() {
  Object.assign(slabForm, {
    applies_to: 'platform', metric: 'diamonds_earned',
    min_value: 0, max_value: null, percentage_bp: 2500,
  })
  errors.value = {}
  overlaps.value = []
  slabDialog.value = true
}

async function saveSlab() {
  saving.value = true
  errors.value = {}
  overlaps.value = []

  try {
    await api.post('/admin/economy/commission-slabs', slabForm)
    ElMessage.success('Slab created')
    slabDialog.value = false
    await loadSlabs()
  } catch (e) {
    if (e instanceof ApiError) {
      // A.7c — the API names the ranges it collides with, so show them rather than
      // a generic "validation failed".
      const colliding = e.details?.overlapping as SlabRow[] | undefined
      if (colliding?.length) {
        overlaps.value = colliding
      } else {
        errors.value = e.fieldErrors
        if (!Object.keys(errors.value).length) ElMessage.error(e.message)
      }
    }
  } finally {
    saving.value = false
  }
}

async function closeSlab(slab: SlabRow) {
  try {
    await ElMessageBox.confirm(
      'The slab stops applying from now. It is kept, because past settlements were computed with it.',
      'Close this slab?',
      { confirmButtonText: 'Close it', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await api.del(`/admin/economy/commission-slabs/${slab.id}`)
    ElMessage.success('Slab closed')
    await loadSlabs()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function reconcile() {
  running.value = true
  try {
    const { data, message } = await api.post<ReconciliationReport>('/admin/economy/reconciliation/run')
    report.value = data
    data.ok ? ElMessage.success(message) : ElMessage.error(message)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    running.value = false
  }
}

function money(paise: number): string {
  return `₹${(paise / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function rangeLabel(slab: SlabRow): string {
  const from = slab.min_value.toLocaleString()
  return slab.max_value === null ? `${from} and above` : `${from} – ${slab.max_value.toLocaleString()}`
}

const activeSlabs = computed(() => (slabs.value?.slabs ?? []).filter((s) => s.effective_to === null))
const closedSlabs = computed(() => (slabs.value?.slabs ?? []).filter((s) => s.effective_to !== null))

const totalMismatches = computed(() =>
  Object.values(report.value?.currencies ?? {}).reduce((sum, c) => sum + c.mismatches.length, 0),
)
</script>

<template>
  <PageHead
    eyebrow="Economy"
    title="Rates &amp; configuration"
    lede="What a coin is worth, what a recharge costs, and what the platform keeps. All of it configurable, because none of it is settled yet."
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <p class="panel mb-4 border-l-2 border-l-[var(--color-signal)] px-3 py-2 text-[12px]">
      Coin pricing, conversion rates and commission are client inputs the SoW does not contain
      (CI-01, CI-02). Everything seeded here is a placeholder living in a table, so the real
      numbers need no code change.
    </p>

    <el-tabs :model-value="tab" @update:model-value="tab = $event as typeof tab">
      <!-- Rates -->
      <el-tab-pane label="Conversion rates" name="rates">
        <div class="grid gap-4 lg:grid-cols-2">
          <section v-for="(entry, key) in rates?.rates ?? {}" :key="key" class="panel">
            <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">{{ String(key).replace(/_/g, ' ') }}</div>
              <el-button v-permission="'economy.rates_manage'" size="small" @click="openRate(String(key))">
                Change
              </el-button>
            </div>

            <div class="p-4">
              <div v-if="entry.current">
                <div class="key text-[24px] leading-none">{{ entry.current.display }}</div>
                <p class="eyebrow mt-1.5">
                  = {{ entry.current.as_decimal }} · in force since
                  {{ new Date(entry.current.effective_from!).toLocaleDateString() }}
                </p>
              </div>
              <p v-else class="text-[13px] text-[var(--color-cut)]">
                No rate set — nothing can be priced until there is one.
              </p>

              <div v-if="entry.history.length > 1" class="mt-4 border-t border-[var(--color-edge)] pt-3">
                <div class="eyebrow mb-2">Timeline</div>
                <ol class="space-y-1.5">
                  <li
                    v-for="row in entry.history"
                    :key="row.id"
                    class="flex items-baseline justify-between gap-2 text-[12px]"
                    :class="row.in_force ? '' : 'text-[var(--color-legend)]'"
                  >
                    <span class="key">{{ row.display }}</span>
                    <span class="eyebrow">
                      {{ new Date(row.effective_from!).toLocaleDateString() }}
                      <template v-if="row.effective_to">
                        → {{ new Date(row.effective_to).toLocaleDateString() }}
                      </template>
                      <template v-else> → now</template>
                    </span>
                  </li>
                </ol>
                <p class="eyebrow mt-2 leading-relaxed">
                  old rates are kept, not overwritten — a request already raised keeps the rate it
                  was priced at
                </p>
              </div>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <!-- Packages -->
      <el-tab-pane :label="`Recharge packages (${packages.length})`" name="packages">
        <el-table :data="packages" style="width: 100%">
          <el-table-column label="Package" min-width="180">
            <template #default="{ row }: { row: PackageRow }">
              <div class="font-medium">{{ row.name }}</div>
              <el-tag v-if="row.badge_text" size="small" type="warning" class="mt-0.5">
                {{ row.badge_text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Coins" width="160" align="right">
            <template #default="{ row }: { row: PackageRow }">
              <div class="key">{{ row.total_coins.toLocaleString() }}</div>
              <div v-if="row.bonus_coins" class="eyebrow text-[var(--color-ok)]">
                incl. {{ row.bonus_coins.toLocaleString() }} bonus
              </div>
            </template>
          </el-table-column>
          <el-table-column label="Price" width="120" align="right">
            <template #default="{ row }: { row: PackageRow }">
              <span class="key">{{ money(row.price_paise) }}</span>
            </template>
          </el-table-column>
          <!-- The number that makes packages comparable. -->
          <el-table-column label="Paise / coin" width="120" align="right">
            <template #default="{ row }: { row: PackageRow }">
              <span class="key text-[var(--color-legend)]">{{ row.paise_per_coin }}</span>
            </template>
          </el-table-column>
          <el-table-column label="" width="150">
            <template #default="{ row }: { row: PackageRow }">
              <el-tag v-if="row.is_first_purchase_only" size="small" type="info">first buy only</el-tag>
              <el-tag v-if="!row.is_active" size="small">hidden</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Commission -->
      <el-tab-pane label="Commission" name="commission">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[12px] text-[var(--color-legend)]">{{ slabs?.note }}</p>
          <el-button v-permission="'economy.commission_manage'" type="primary" size="small" @click="openSlab">
            Add slab
          </el-button>
        </div>

        <div class="panel">
          <el-table :data="activeSlabs" style="width: 100%">
            <el-table-column label="Applies to" width="130">
              <template #default="{ row }: { row: SlabRow }">
                <span class="key">{{ row.applies_to }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Metric" width="170">
              <template #default="{ row }: { row: SlabRow }">
                <span class="key text-[var(--color-legend)]">{{ row.metric.replace(/_/g, ' ') }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Range" min-width="200">
              <template #default="{ row }: { row: SlabRow }">
                <span class="key">{{ rangeLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Rate" width="140" align="right">
              <template #default="{ row }: { row: SlabRow }">
                <div class="key font-bold">{{ row.percent }}%</div>
                <div class="eyebrow">{{ row.percentage_bp }} bp</div>
              </template>
            </el-table-column>
            <el-table-column label="" width="100" align="right">
              <template #default="{ row }: { row: SlabRow }">
                <el-button
                  v-permission="'economy.commission_manage'"
                  size="small"
                  type="danger"
                  plain
                  @click="closeSlab(row)"
                >
                  Close
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="closedSlabs.length" class="mt-4">
          <div class="eyebrow mb-2">Closed ({{ closedSlabs.length }})</div>
          <ul class="space-y-1">
            <li
              v-for="slab in closedSlabs"
              :key="slab.id"
              class="panel flex items-baseline justify-between px-3 py-1.5 text-[12px] text-[var(--color-legend)]"
            >
              <span class="key">{{ slab.applies_to }} · {{ rangeLabel(slab) }} · {{ slab.percent }}%</span>
              <span class="eyebrow">closed {{ new Date(slab.effective_to!).toLocaleDateString() }}</span>
            </li>
          </ul>
        </div>
      </el-tab-pane>

      <!-- Reconciliation -->
      <el-tab-pane label="Reconciliation" name="reconciliation">
        <div class="panel px-4 py-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="max-w-2xl">
              <div class="eyebrow">Ledger against wallets</div>
              <p class="mt-1.5 text-[13px] text-[var(--color-legend)]">
                For every user, the signed sum of their ledger movements must equal their wallet
                balance. A mismatch means a balance moved without a ledger row beside it — the one
                thing the money rules exist to prevent. This also runs nightly.
              </p>
            </div>
            <el-button
              v-permission="'economy.reconcile'"
              type="primary"
              :loading="running"
              @click="reconcile"
            >
              Run now
            </el-button>
          </div>
        </div>

        <div
          v-if="report"
          class="panel mt-4 border-l-2 px-4 py-3"
          :class="report.ok ? 'border-l-[var(--color-ok)]' : 'border-l-[var(--color-cut)]'"
        >
          <div class="eyebrow" :class="report.ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-cut)]'">
            {{ report.ok ? 'Everything balances' : `${totalMismatches} discrepancies` }}
          </div>
          <p class="mt-1 text-[12px] text-[var(--color-legend)]">
            checked {{ new Date(report.checked_at).toLocaleString() }}
          </p>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <div v-for="(result, currency) in report.currencies" :key="currency" class="panel px-3 py-2">
              <div class="eyebrow">{{ currency }}</div>
              <div class="key mt-0.5 text-[13px]">
                {{ result.wallets }} wallets · {{ result.ledger_rows.toLocaleString() }} ledger rows
              </div>

              <ul v-if="result.mismatches.length" class="mt-2 space-y-1">
                <li
                  v-for="mismatch in result.mismatches"
                  :key="mismatch.user_id"
                  class="key text-[12px] text-[var(--color-cut)]"
                >
                  user {{ mismatch.user_id }} · wallet {{ mismatch.wallet_balance.toLocaleString() }} ·
                  ledger {{ mismatch.ledger_total.toLocaleString() }} ·
                  <strong>delta {{ mismatch.delta.toLocaleString() }}</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <!-- Rate -->
  <el-dialog v-model="rateDialog" title="Change conversion rate" width="420">
    <p class="text-[13px] text-[var(--color-legend)]">
      A rate is a fraction, not a decimal — <span class="key">1/3</span> is exact where
      <span class="key">0.333</span> is not. The current rate is kept and closed rather than
      overwritten, so requests already raised keep their price.
    </p>

    <div class="mt-4 space-y-3">
      <div>
        <label class="eyebrow mb-1 block">Rate</label>
        <div class="flex items-center gap-2">
          <el-input-number v-model="rateForm.rate_numerator" :min="1" class="w-full" />
          <span class="text-[var(--color-legend)]">/</span>
          <el-input-number v-model="rateForm.rate_denominator" :min="1" class="w-full" />
        </div>
        <p class="eyebrow mt-1">
          = {{ (rateForm.rate_numerator / rateForm.rate_denominator).toFixed(4) }}
          <template v-if="rateForm.key === 'diamond_to_inr'"> paise per diamond</template>
        </p>
      </div>
      <div>
        <label class="eyebrow mb-1 block" for="rate-note">Note</label>
        <el-input id="rate-note" v-model="rateForm.note" placeholder="Why is this changing?" />
      </div>
    </div>

    <template #footer>
      <el-button @click="rateDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="saveRate">Set rate</el-button>
    </template>
  </el-dialog>

  <!-- Slab -->
  <el-dialog v-model="slabDialog" title="Add commission slab" width="460">
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Applies to</label>
          <el-select v-model="slabForm.applies_to" class="w-full">
            <el-option v-for="a in slabs?.applies_to ?? []" :key="a" :label="a" :value="a" />
          </el-select>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Metric</label>
          <el-select v-model="slabForm.metric" class="w-full">
            <el-option v-for="m in slabs?.metrics ?? []" :key="m" :label="m.replace(/_/g, ' ')" :value="m" />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">From</label>
          <el-input-number v-model="slabForm.min_value" :min="0" :step="10000" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">To</label>
          <el-input-number v-model="slabForm.max_value" :min="1" :step="10000" class="w-full" />
          <p class="eyebrow mt-1">leave empty for "and above"</p>
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Rate</label>
        <el-input-number v-model="slabForm.percentage_bp" :min="0" :max="10000" :step="50" class="w-full" />
        <p class="eyebrow mt-1">
          basis points — {{ slabForm.percentage_bp }} bp = {{ (slabForm.percentage_bp / 100).toFixed(2) }}%
        </p>
      </div>

      <!-- A.7c — the API names the ranges it collides with. -->
      <div
        v-if="overlaps.length"
        class="border-l-2 border-l-[var(--color-cut)] bg-[var(--color-raised)] px-3 py-2"
      >
        <div class="eyebrow text-[var(--color-cut)]">Overlaps an existing slab</div>
        <ul class="mt-1 space-y-0.5">
          <li v-for="slab in overlaps" :key="slab.id" class="key text-[12px]">
            {{ rangeLabel(slab) }} at {{ slab.percent }}%
          </li>
        </ul>
        <p class="eyebrow mt-1.5">close one of those, or narrow this range</p>
      </div>
    </div>

    <template #footer>
      <el-button @click="slabDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="saveSlab">Create slab</el-button>
    </template>
  </el-dialog>
</template>
