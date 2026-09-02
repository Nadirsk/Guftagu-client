<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { money, moneyShort } from '@/lib/money'
import type { AgencyRow, SettlementBatchRow, SettlementRow } from '@/types/api'

/** GFT-091 — the settlement workspace (A.8d). */
const rows = ref<SettlementRow[]>([])
const batches = ref<SettlementBatchRow[]>([])
const agencies = ref<AgencyRow[]>([])
const selected = ref<number[]>([])

const loading = ref(true)
const busy = ref(false)
const tab = ref('settlements')

const filters = ref({ status: '', agency_id: '' as number | '' })

const generateDialog = ref(false)
const generateForm = ref({ agency_id: null as number | null, period_start: '', period_end: '' })

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'info' | 'danger' | ''> = {
  paid: 'success',
  admin_approved: '',
  manager_raised: 'warning',
  draft: 'info',
  rejected: 'danger',
}

onMounted(async () => {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  generateForm.value = {
    agency_id: null,
    period_start: lastMonth.toISOString().slice(0, 10),
    period_end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10),
  }

  await Promise.all([load(), loadBatches(), loadAgencies()])
  loading.value = false
})

watch(filters, load, { deep: true })

async function loadAgencies() {
  try {
    const { data } = await api.get<AgencyRow[]>('/admin/agencies', { status: 'approved', per_page: 100 })
    agencies.value = data
  } catch {
    // The dropdown degrades; the list still works.
  }
}

async function load() {
  try {
    const { data } = await api.get<SettlementRow[]>('/admin/settlements', {
      status: filters.value.status || undefined,
      agency_id: filters.value.agency_id || undefined,
      per_page: 50,
    })
    rows.value = data
    selected.value = []
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadBatches() {
  try {
    const { data } = await api.get<SettlementBatchRow[]>('/admin/settlements/batches', { per_page: 50 })
    batches.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function generate() {
  if (!generateForm.value.agency_id) {
    ElMessage.warning('Pick an agency.')
    return
  }

  await act(async () => {
    await api.post('/admin/settlements/generate', generateForm.value)
    generateDialog.value = false
  })
}

async function raise(row: SettlementRow) {
  const notes = window.prompt('Any note for the approver?') ?? ''
  await act(() => api.post(`/admin/settlements/${row.id}/raise`, { notes: notes.trim() || null }))
}

async function approve(row: SettlementRow) {
  try {
    await ElMessageBox.confirm(
      `${money(row.net_payable_paise)} to ${row.agency?.name}. Approving makes it batchable — it is not paid yet.`,
      'Approve this settlement?',
      { confirmButtonText: 'Approve', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  await act(() => api.post(`/admin/settlements/${row.id}/approve`))
}

async function reject(row: SettlementRow) {
  const reason = window.prompt('Why is this being rejected?')
  if (reason === null || reason.trim().length < 3) return

  await act(() => api.post(`/admin/settlements/${row.id}/reject`, { reason: reason.trim() }))
}

async function batch() {
  if (selected.value.length === 0) return

  await act(async () => {
    const { data } = await api.post<{ batch_number: string; total_paise: number }>(
      '/admin/settlements/batch',
      { settlement_ids: selected.value },
    )
    ElMessage.success(`${data.batch_number} — ${money(data.total_paise)}`)
    await loadBatches()
  })
}

async function process(row: SettlementBatchRow) {
  try {
    await ElMessageBox.confirm(
      `${money(row.total_paise)} across ${row.count} settlements is marked paid. Running this again is safe — nothing is paid twice.`,
      `Process ${row.batch_number}?`,
      { confirmButtonText: 'Process', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { data } = await api.post<{ newly_paid: number; already_paid: number; note: string | null }>(
      `/admin/settlements/batches/${row.id}/process`,
    )
    // Say plainly when the second run did nothing, rather than a generic success toast.
    ElMessage.success(data.note ?? `${data.newly_paid} settlements paid`)
    await Promise.all([load(), loadBatches()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function act(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    ElMessage.success('Done')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

function onSelect(picked: SettlementRow[]) {
  selected.value = picked.map((r) => r.id)
}

/** Only approved, unbatched settlements can go into a batch. */
function selectable(row: SettlementRow): boolean {
  return row.status === 'admin_approved' && row.batch_id === null
}

const selectedTotal = computed(() =>
  rows.value.filter((r) => selected.value.includes(r.id)).reduce((sum, r) => sum + r.net_payable_paise, 0),
)
</script>

<template>
  <PageHead
    eyebrow="Money"
    title="Agency settlements"
    lede="What each agency is owed for a period, and the batch that pays it."
  >
    <template #actions>
      <el-button v-permission="'agency.settlement_raise'" size="small" type="primary" @click="generateDialog = true">
        Generate
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs v-model="tab">
      <el-tab-pane label="Settlements" name="settlements">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <el-select v-model="filters.status" placeholder="Any status" size="small" clearable style="width: 170px">
            <el-option
              v-for="s in ['draft', 'manager_raised', 'admin_approved', 'paid', 'rejected']"
              :key="s"
              :label="s.replace('_', ' ')"
              :value="s"
            />
          </el-select>
          <el-select v-model="filters.agency_id" placeholder="Any agency" size="small" clearable style="width: 200px">
            <el-option v-for="a in agencies" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>

          <template v-if="selected.length">
            <span class="eyebrow ml-auto">{{ selected.length }} selected · {{ money(selectedTotal) }}</span>
            <el-button
              v-permission="'agency.settlement_process'"
              size="small"
              type="primary"
              :loading="busy"
              @click="batch"
            >
              Add to batch
            </el-button>
          </template>
        </div>

        <div class="panel">
          <EmptyState
            v-if="rows.length === 0"
            title="No settlements yet"
            body="Generate one for an agency and a period. The figures come from the host earnings rollup."
          />

          <el-table v-else :data="rows" style="width: 100%" @selection-change="onSelect">
            <el-table-column type="selection" width="44" :selectable="selectable" />
            <el-table-column label="Agency" min-width="180">
              <template #default="{ row }">
                <div>{{ row.agency?.name }}</div>
                <div class="key text-[var(--color-legend)]">{{ row.agency?.code }}</div>
              </template>
            </el-table-column>
            <el-table-column label="Period" width="200">
              <template #default="{ row }">
                <span class="key">{{ row.period_start }} → {{ row.period_end }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Gross" width="110" align="right">
              <template #default="{ row }"><span class="key">{{ moneyShort(row.gross_paise) }}</span></template>
            </el-table-column>
            <el-table-column label="Platform" width="110" align="right">
              <template #default="{ row }"><span class="key">{{ moneyShort(row.platform_cut_paise) }}</span></template>
            </el-table-column>
            <el-table-column label="Hosts" width="110" align="right">
              <template #default="{ row }"><span class="key">{{ moneyShort(row.host_cut_paise) }}</span></template>
            </el-table-column>
            <el-table-column label="Payable" width="120" align="right">
              <template #default="{ row }">
                <span class="key font-bold text-[var(--color-signal)]">{{ money(row.net_payable_paise) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="140">
              <template #default="{ row }">
                <el-tag :type="STATUS_TYPE[row.status]" size="small">{{ row.status.replace('_', ' ') }}</el-tag>
                <!-- If a split ever stopped adding up, it should be visible here, not
                     only in a log. -->
                <el-tag v-if="!row.splits_balance" type="danger" size="small" class="mt-1">split leak</el-tag>
              </template>
            </el-table-column>
            <el-table-column width="180" align="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'draft'"
                  v-permission="'agency.settlement_raise'"
                  size="small"
                  text
                  :loading="busy"
                  @click="raise(row)"
                >
                  Raise
                </el-button>
                <el-button
                  v-if="['draft', 'manager_raised'].includes(row.status)"
                  v-permission="'agency.settlement_process'"
                  size="small"
                  text
                  :loading="busy"
                  @click="approve(row)"
                >
                  Approve
                </el-button>
                <el-button
                  v-if="row.status !== 'paid' && row.status !== 'rejected'"
                  v-permission="'agency.settlement_process'"
                  size="small"
                  text
                  :loading="busy"
                  @click="reject(row)"
                >
                  Reject
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            payable is the agency commission only — host earnings go to hosts, not through the agency.
            whoever raised a settlement cannot approve it
          </p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Batches" name="batches">
        <div class="panel">
          <EmptyState
            v-if="batches.length === 0"
            title="No batches yet"
            body="Approve some settlements, select them, and add them to a batch."
          />

          <el-table v-else :data="batches" style="width: 100%">
            <el-table-column label="Batch" width="200">
              <template #default="{ row }"><span class="key">{{ row.batch_number }}</span></template>
            </el-table-column>
            <el-table-column label="Settlements" width="120" align="right">
              <template #default="{ row }"><span class="key">{{ row.count }}</span></template>
            </el-table-column>
            <el-table-column label="Total" width="140" align="right">
              <template #default="{ row }">
                <span class="key font-bold">{{ money(row.total_paise) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="130">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Processed" min-width="180">
              <template #default="{ row }">
                <span class="key text-[var(--color-legend)]">{{ row.processed_at ?? '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column width="120" align="right">
              <template #default="{ row }">
                <el-button
                  v-permission="'agency.settlement_process'"
                  size="small"
                  text
                  :loading="busy"
                  @click="process(row)"
                >
                  {{ row.status === 'completed' ? 'Re-run' : 'Process' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            re-running a completed batch is safe: only unpaid settlements are touched, and the
            total is recomputed from its members rather than added to
          </p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-dialog v-model="generateDialog" title="Generate a settlement" width="440px">
    <el-form label-position="top">
      <el-form-item label="Agency">
        <el-select v-model="generateForm.agency_id" placeholder="Pick an agency" style="width: 100%">
          <el-option v-for="a in agencies" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="Period">
        <div class="flex w-full gap-2">
          <el-input v-model="generateForm.period_start" type="date" />
          <el-input v-model="generateForm.period_end" type="date" />
        </div>
      </el-form-item>
    </el-form>
    <p class="eyebrow leading-relaxed">
      re-running this for the same period updates the draft rather than creating a second claim.
      once it has been raised, it will not be silently rebuilt
    </p>
    <template #footer>
      <el-button @click="generateDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="generate">Generate</el-button>
    </template>
  </el-dialog>
</template>
