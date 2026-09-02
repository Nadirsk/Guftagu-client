<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { bp, money } from '@/lib/money'
import type { AgencyDetail, AgencyRow } from '@/types/api'

/** GFT-088 — agency list, approval workflow and document viewer (A.8a). */
const rows = ref<AgencyRow[]>([])
const detail = ref<AgencyDetail | null>(null)

const loading = ref(true)
const busy = ref(false)
const drawer = ref(false)

const filters = ref({ q: '', status: '' })

const createDialog = ref(false)
const form = ref({ name: '', contact_email: '', contact_phone: '', commission_bp: 1500 })

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  approved: 'success',
  pending: 'warning',
  suspended: 'danger',
  rejected: 'info',
}

onMounted(load)
watch(filters, load, { deep: true })

async function load() {
  loading.value = true
  try {
    const { data } = await api.get<AgencyRow[]>('/admin/agencies', {
      q: filters.value.q || undefined,
      status: filters.value.status || undefined,
      per_page: 50,
    })
    rows.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function open(row: AgencyRow) {
  drawer.value = true
  detail.value = null
  try {
    const { data } = await api.get<AgencyDetail>(`/admin/agencies/${row.id}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function approve(row: AgencyRow) {
  if (row.document_count === 0) {
    ElMessage.warning('No documents on file — approving would record a review that never happened.')
    return
  }

  try {
    await ElMessageBox.confirm(
      `${row.name} becomes selectable by host applicants and can be settled.`,
      'Approve this agency?',
      { confirmButtonText: 'Approve', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  await act(() => api.post(`/admin/agencies/${row.id}/approve`))
}

async function reject(row: AgencyRow) {
  const reason = window.prompt('Why is this being rejected? The applicant is told this.')
  if (reason === null || reason.trim().length < 3) return

  await act(() => api.post(`/admin/agencies/${row.id}/reject`, { reason: reason.trim() }))
}

async function suspend(row: AgencyRow) {
  const reason = window.prompt('Why is this agency being suspended?')
  if (reason === null || reason.trim().length < 3) return

  await act(async () => {
    await api.post(`/admin/agencies/${row.id}/suspend`, { reason: reason.trim() })
    // Worth saying out loud — most operators expect this to cascade.
    ElMessage.info('Their hosts keep their contracts and keep earning. Suspend a host individually if that was the intent.')
  })
}

async function reinstate(row: AgencyRow) {
  await act(() => api.post(`/admin/agencies/${row.id}/reinstate`))
}

async function create() {
  if (form.value.name.trim().length < 2) {
    ElMessage.warning('A name is required.')
    return
  }

  await act(async () => {
    await api.post('/admin/agencies', {
      name: form.value.name.trim(),
      contact_email: form.value.contact_email || null,
      contact_phone: form.value.contact_phone || null,
      commission_bp: form.value.commission_bp,
    })
    createDialog.value = false
    form.value = { name: '', contact_email: '', contact_phone: '', commission_bp: 1500 }
  })
}

async function addDocument() {
  if (!detail.value) return

  const url = window.prompt('Document URL')
  if (url === null || !url.trim()) return

  const type = window.prompt('Document type (gst, pan, agreement…)') ?? 'other'

  await act(async () => {
    await api.post(`/admin/agencies/${detail.value!.agency.id}/documents`, {
      type: type.trim() || 'other',
      url: url.trim(),
    })
    await open(detail.value!.agency)
  })
}

/** One place to run a mutation, report it, and refresh — the pattern repeats six times. */
async function act(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    ElMessage.success('Done')
    await load()
    if (detail.value) {
      const current = rows.value.find((r) => r.id === detail.value!.agency.id)
      if (current) await open(current)
    }
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Partners"
    title="Agencies"
    lede="Onboarding, approval and what each agency is earning. Pending applications sort first."
  >
    <template #actions>
      <el-button v-permission="'agency.edit'" size="small" type="primary" @click="createDialog = true">
        Add agency
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <el-input v-model="filters.q" placeholder="Name or code" size="small" clearable style="width: 220px" />
      <el-select v-model="filters.status" placeholder="Any status" size="small" clearable style="width: 160px">
        <el-option v-for="s in ['pending', 'approved', 'suspended', 'rejected']" :key="s" :label="s" :value="s" />
      </el-select>
      <span class="eyebrow ml-auto">{{ rows.length }} agencies</span>
    </div>

    <div class="panel">
      <EmptyState
        v-if="!loading && rows.length === 0"
        title="No agencies yet"
        body="Agencies onboard hosts and take a commission on what those hosts earn. Add one to get started."
      />

      <el-table v-else :data="rows" style="width: 100%" @row-click="open">
        <el-table-column label="Code" width="110">
          <template #default="{ row }"><span class="key">{{ row.code }}</span></template>
        </el-table-column>
        <el-table-column label="Agency" min-width="220">
          <template #default="{ row }">
            <div class="font-medium">{{ row.name }}</div>
            <div class="eyebrow">{{ row.owner?.guftagu_id ?? 'no owner linked' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Hosts" width="90" align="right">
          <template #default="{ row }"><span class="key">{{ row.host_count }}</span></template>
        </el-table-column>
        <el-table-column label="Commission" width="120" align="right">
          <template #default="{ row }"><span class="key">{{ bp(row.commission_bp) }}</span></template>
        </el-table-column>
        <el-table-column label="Docs" width="80" align="right">
          <template #default="{ row }">
            <span class="key" :class="row.document_count === 0 ? 'text-[var(--color-legend)]' : ''">
              {{ row.document_count }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="190" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button
                v-permission="'agency.approve'"
                size="small"
                text
                :loading="busy"
                :disabled="row.document_count === 0"
                @click.stop="approve(row)"
              >
                Approve
              </el-button>
              <el-button v-permission="'agency.approve'" size="small" text :loading="busy" @click.stop="reject(row)">
                Reject
              </el-button>
            </template>
            <el-button
              v-else-if="row.status === 'approved'"
              v-permission="'agency.approve'"
              size="small"
              text
              :loading="busy"
              @click.stop="suspend(row)"
            >
              Suspend
            </el-button>
            <el-button
              v-else-if="row.status === 'suspended'"
              v-permission="'agency.approve'"
              size="small"
              text
              :loading="busy"
              @click.stop="reinstate(row)"
            >
              Reinstate
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>

  <el-drawer v-model="drawer" size="560px" :title="detail?.agency.name ?? 'Loading…'">
    <div v-if="detail" class="space-y-4">
      <section class="panel px-4 py-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="key">{{ detail.agency.code }}</span>
          <el-tag :type="STATUS_TYPE[detail.agency.status]" size="small">{{ detail.agency.status }}</el-tag>
          <span class="eyebrow ml-auto">{{ bp(detail.agency.commission_bp) }} commission</span>
        </div>
        <p v-if="detail.agency.description" class="text-[13px]">{{ detail.agency.description }}</p>
        <dl class="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          <div><dt class="eyebrow">phone</dt><dd class="key">{{ detail.agency.contact_phone ?? '—' }}</dd></div>
          <div><dt class="eyebrow">email</dt><dd class="key">{{ detail.agency.contact_email ?? '—' }}</dd></div>
        </dl>
        <p v-if="detail.agency.rejection_reason" class="eyebrow mt-2 leading-relaxed">
          {{ detail.agency.rejection_reason }}
        </p>
      </section>

      <!-- Documents: what approval is supposed to be a review of. -->
      <section class="panel">
        <div class="flex items-center justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Documents</div>
          <el-button v-permission="'agency.edit'" size="small" text @click="addDocument">Add</el-button>
        </div>
        <EmptyState
          v-if="detail.agency.documents.length === 0"
          title="Nothing uploaded"
          body="An agency with no documents cannot be approved — there would be nothing to have reviewed."
        />
        <ul v-else>
          <li
            v-for="doc in detail.agency.documents"
            :key="doc.url"
            class="flex items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5 last:border-b-0"
          >
            <span class="key uppercase">{{ doc.type }}</span>
            <a
              :href="doc.url"
              target="_blank"
              rel="noreferrer"
              class="ml-auto text-[13px] text-[var(--color-signal)] hover:underline"
            >
              open
            </a>
          </li>
        </ul>
      </section>

      <section class="panel px-4 py-3">
        <div class="eyebrow mb-2">
          Performance · {{ detail.period.from }} → {{ detail.period.to }}
        </div>
        <dl class="grid grid-cols-2 gap-3 text-[13px]">
          <div><dt class="eyebrow">diamonds</dt><dd class="key">{{ detail.performance.diamonds.toLocaleString() }}</dd></div>
          <div><dt class="eyebrow">gross</dt><dd class="key">{{ money(detail.performance.gross_paise) }}</dd></div>
          <div>
            <dt class="eyebrow">agency cut</dt>
            <dd class="key text-[var(--color-signal)]">{{ money(detail.performance.agency_cut_paise) }}</dd>
          </div>
          <div><dt class="eyebrow">paid to hosts</dt><dd class="key">{{ money(detail.performance.host_cut_paise) }}</dd></div>
          <div>
            <dt class="eyebrow">earning hosts</dt>
            <dd class="key">{{ detail.performance.earning_hosts }} of {{ detail.performance.total_hosts }}</dd>
          </div>
          <div>
            <dt class="eyebrow">room hours</dt>
            <dd class="key text-[var(--color-legend)]">—</dd>
          </div>
        </dl>
        <p v-if="detail.note" class="eyebrow mt-3 leading-relaxed">{{ detail.note }}</p>
      </section>

      <section v-if="detail.hosts.length" class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Hosts</div></div>
        <ul>
          <li
            v-for="host in detail.hosts"
            :key="host.id"
            class="flex items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2 last:border-b-0"
          >
            <RouterLink :to="`/hosts/${host.id}`" class="key hover:text-[var(--color-signal)]">
              {{ host.guftagu_id }}
            </RouterLink>
            <span v-if="host.tier" class="eyebrow">{{ host.tier }}</span>
            <el-tag v-if="!host.under_contract" size="small" type="info" class="ml-auto">contract ended</el-tag>
          </li>
        </ul>
      </section>

      <section v-if="detail.settlements.length" class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Settlements</div></div>
        <ul>
          <li
            v-for="s in detail.settlements"
            :key="s.id"
            class="flex items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2 last:border-b-0"
          >
            <span class="key">{{ s.period_start }} → {{ s.period_end }}</span>
            <span class="key ml-auto">{{ money(s.net_payable_paise) }}</span>
            <el-tag size="small" :type="s.status === 'paid' ? 'success' : 'info'">{{ s.status }}</el-tag>
          </li>
        </ul>
      </section>
    </div>
  </el-drawer>

  <el-dialog v-model="createDialog" title="Add agency" width="440px">
    <el-form label-position="top">
      <el-form-item label="Name">
        <el-input v-model="form.name" placeholder="Mumbai Voice Collective" />
      </el-form-item>
      <el-form-item label="Contact email">
        <el-input v-model="form.contact_email" />
      </el-form-item>
      <el-form-item label="Contact phone">
        <el-input v-model="form.contact_phone" />
      </el-form-item>
      <el-form-item label="Commission">
        <el-input-number v-model="form.commission_bp" :min="0" :max="10000" :step="50" style="width: 100%" />
        <p class="eyebrow mt-1">basis points — {{ bp(form.commission_bp) }}</p>
      </el-form-item>
    </el-form>
    <p class="eyebrow leading-relaxed">
      created as pending; upload documents before approving
    </p>
    <template #footer>
      <el-button @click="createDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="create">Create</el-button>
    </template>
  </el-dialog>
</template>
