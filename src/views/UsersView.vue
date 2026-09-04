<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { KycStatus, UserRow, UserStatus } from '@/types/api'

type CreatableKycStatus = '' | Exclude<KycStatus, 'none'>

/** GFT-031 — the user list. */
const router = useRouter()
const auth = useAuthStore()

const rows = ref<UserRow[]>([])
const loading = ref(true)
const total = ref(0)

// Real phone/email per row — still gated by `users.view_pii` and audit-logged per row
// server-side, just fetched for the whole page instead of one click at a time.
const pii = reactive<Record<number, { phone: string; email: string }>>({})

const query = reactive({
  q: '',
  status: '' as '' | UserStatus,
  kyc: '' as '' | KycStatus,
  page: 1,
  per_page: 20,
  sort: '-created_at',
})

/**
 * `phone` is encrypted, so the API hashes the term and looks it up exactly — a partial
 * number matches nothing. Saying so beats letting someone conclude the user is missing.
 */
const searchLooksPartial = ref(false)

let timer: number | undefined
watch(
  () => query.q,
  (term) => {
    const digits = term.replace(/\D/g, '')
    searchLooksPartial.value = digits.length >= 4 && digits.length < 10

    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      query.page = 1
      void load()
    }, 300)
  },
)

watch([() => query.status, () => query.kyc, () => query.page], () => void load())

onMounted(load)

// ----------------------------------------------------------------- create user

const creating = ref(false)
const saving = ref(false)
const formErrors = ref<Record<string, string>>({})

type DocSide = 'doc_front' | 'doc_back' | 'selfie'

const emptyForm = () => ({
  display_name: '',
  phone: '',
  country_code: '+91',
  email: '',
  status: 'active' as UserStatus,
  initial_coins: 0,
  initial_diamonds: 0,
  kyc_status: '' as CreatableKycStatus,
  doc_type: 'aadhaar',
  doc_number: '',
  doc_front_url: null as string | null,
  doc_back_url: null as string | null,
  selfie_url: null as string | null,
})

const form = reactive(emptyForm())

// No user id exists yet at this point in the flow, unlike every other admin upload —
// this endpoint just stores the file and hands back a URL, which rides along in the
// `kyc` object when the user is actually created.
const uploadingDoc = reactive<Record<DocSide, boolean>>({
  doc_front: false,
  doc_back: false,
  selfie: false,
})

const docUrlField: Record<DocSide, 'doc_front_url' | 'doc_back_url' | 'selfie_url'> = {
  doc_front: 'doc_front_url',
  doc_back: 'doc_back_url',
  selfie: 'selfie_url',
}

const docInputs: Partial<Record<DocSide, HTMLInputElement>> = {}

async function uploadDoc(side: DocSide, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploadingDoc[side] = true
  const body = new FormData()
  body.append('file', file)
  body.append('side', side)

  try {
    const { data } = await api.post<{ url: string }>('/admin/users/kyc-documents', body)
    form[docUrlField[side]] = data.url
    ElMessage.success('Document uploaded')
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    uploadingDoc[side] = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

async function create() {
  saving.value = true
  formErrors.value = {}
  try {
    const { data } = await api.post<UserRow>('/admin/users', {
      display_name: form.display_name,
      phone: form.phone,
      country_code: form.country_code || undefined,
      email: form.email || undefined,
      status: form.status,
      initial_coins: form.initial_coins || undefined,
      initial_diamonds: form.initial_diamonds || undefined,
      kyc: form.kyc_status
        ? {
            status: form.kyc_status,
            doc_type: form.doc_type || undefined,
            doc_number: form.doc_number || undefined,
            doc_front_url: form.doc_front_url ?? undefined,
            doc_back_url: form.doc_back_url ?? undefined,
            selfie_url: form.selfie_url ?? undefined,
          }
        : undefined,
    })
    ElMessage.success(`${data.guftagu_id} created`)
    creating.value = false
    Object.assign(form, emptyForm())
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      formErrors.value = e.fieldErrors
      if (!Object.keys(formErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const { data, meta } = await api.get<UserRow[]>('/admin/users', {
      q: query.q || undefined,
      status: query.status || undefined,
      kyc: query.kyc || undefined,
      page: query.page,
      per_page: query.per_page,
      sort: query.sort,
    })
    rows.value = data
    total.value = meta.total ?? data.length
    void revealPage(data)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function revealPage(pageRows: UserRow[]) {
  if (!auth.can('users.view_pii')) return

  await Promise.all(
    pageRows.map(async (row) => {
      try {
        const { data } = await api.get<{ phone: string; email: string }>(`/admin/users/${row.id}/pii`)
        pii[row.id] = data
      } catch {
        // Leave that row masked rather than fail the whole page over one lookup.
      }
    }),
  )
}

function open(row: UserRow) {
  void router.push({ name: 'user-detail', params: { id: row.id } })
}

const statusTone: Record<UserStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'success',
  suspended: 'warning',
  banned: 'danger',
  deleted: 'info',
}

const kycTone: Record<KycStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
  none: 'info',
}

function format(value: number): string {
  return value.toLocaleString()
}

function relative(iso: string | null): string {
  if (!iso) return 'never'

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}
</script>

<template>
  <PageHead
    eyebrow="Platform"
    title="Users"
    lede="Everyone with a Guftagu account."
  >
    <template #actions>
      <el-button v-permission.disable="'users.create'" type="primary" @click="creating = true">
        Add user
      </el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-input
        v-model="query.q"
        placeholder="Full phone, Guftagu ID, or name"
        clearable
        class="w-full sm:w-72"
      />
      <el-select v-model="query.status" placeholder="Any status" clearable class="w-40">
        <el-option label="Active" value="active" />
        <el-option label="Suspended" value="suspended" />
        <el-option label="Banned" value="banned" />
      </el-select>
      <el-select v-model="query.kyc" placeholder="Any KYC" clearable class="w-40">
        <el-option label="Verified" value="verified" />
        <el-option label="Pending" value="pending" />
        <el-option label="Rejected" value="rejected" />
        <el-option label="Not submitted" value="none" />
      </el-select>
      <span class="key ml-auto text-[var(--color-legend)]">{{ format(total) }} users</span>
    </div>

    <p
      v-if="searchLooksPartial"
      class="panel mb-3 border-l-2 border-l-[var(--color-signal)] px-3 py-2 text-[12px]"
    >
      Phone numbers are stored encrypted, so a search matches the <strong>whole</strong> number
      only. Enter all ten digits — a partial number will return nothing even if the user exists.
    </p>

    <div v-loading="loading" class="panel">
      <EmptyState
        v-if="!loading && rows.length === 0"
        title="No users match that"
        body="Clear the filters, or check that you entered the full phone number."
      />

      <el-table v-else :data="rows" style="width: 100%" @row-click="open">
        <el-table-column label="User" min-width="200">
          <template #default="{ row }: { row: UserRow }">
            <div class="font-medium">{{ row.display_name ?? '—' }}</div>
            <div class="key text-[var(--color-legend)]">{{ row.guftagu_id }}</div>
          </template>
        </el-table-column>

        <el-table-column label="Contact" min-width="180">
          <template #default="{ row }: { row: UserRow }">
            <div class="key">{{ pii[row.id]?.phone ?? row.phone_masked ?? '—' }}</div>
            <div class="key truncate text-[var(--color-legend)]">{{ pii[row.id]?.email ?? row.email_masked ?? '' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="110">
          <template #default="{ row }: { row: UserRow }">
            <el-tag :type="statusTone[row.status]" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="KYC" width="110">
          <template #default="{ row }: { row: UserRow }">
            <el-tag :type="kycTone[row.kyc_status]" size="small">{{ row.kyc_status }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Balance" width="150" align="right">
          <template #default="{ row }: { row: UserRow }">
            <div class="key">{{ format(row.coin_balance) }} <span class="text-[var(--color-legend)]">coins</span></div>
            <div class="key text-[var(--color-legend)]">
              {{ format(row.diamond_balance) }} diamonds
            </div>
            <el-tag v-if="row.wallet_frozen" type="danger" size="small" class="mt-0.5">frozen</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Last active" width="120">
          <template #default="{ row }: { row: UserRow }">
            <span class="key text-[var(--color-legend)]">{{ relative(row.last_active_at) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div
        v-if="total > query.per_page"
        class="flex justify-end border-t border-[var(--color-edge)] p-3"
      >
        <el-pagination
          v-model:current-page="query.page"
          :page-size="query.per_page"
          :total="total"
          layout="prev, pager, next"
          background
        />
      </div>
    </div>
  </div>

  <el-dialog v-model="creating" title="Add user" width="460">
    <form class="space-y-3" @submit.prevent="create">
      <div>
        <label class="eyebrow mb-1 block" for="new-user-name">Display name</label>
        <el-input id="new-user-name" v-model="form.display_name" />
        <p v-if="formErrors.display_name" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ formErrors.display_name }}
        </p>
      </div>

      <div class="flex gap-2">
        <div class="w-24">
          <label class="eyebrow mb-1 block" for="new-user-cc">Country code</label>
          <el-input id="new-user-cc" v-model="form.country_code" />
        </div>
        <div class="flex-1">
          <label class="eyebrow mb-1 block" for="new-user-phone">Phone</label>
          <el-input id="new-user-phone" v-model="form.phone" placeholder="+919876543210" />
          <p v-if="formErrors.phone" class="mt-1 text-[12px] text-[var(--color-cut)]">
            {{ formErrors.phone }}
          </p>
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="new-user-email">Email (optional)</label>
        <el-input id="new-user-email" v-model="form.email" type="email" />
        <p v-if="formErrors.email" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ formErrors.email }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Status</label>
        <el-select v-model="form.status" class="w-full">
          <el-option label="Active" value="active" />
          <el-option label="Suspended" value="suspended" />
          <el-option label="Banned" value="banned" />
        </el-select>
      </div>

      <div class="flex gap-2">
        <div class="flex-1">
          <label class="eyebrow mb-1 block" for="new-user-coins">Starting coins</label>
          <el-input-number id="new-user-coins" v-model="form.initial_coins" :min="0" class="w-full" />
        </div>
        <div class="flex-1">
          <label class="eyebrow mb-1 block" for="new-user-diamonds">Starting diamonds</label>
          <el-input-number id="new-user-diamonds" v-model="form.initial_diamonds" :min="0" class="w-full" />
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block">KYC</label>
        <el-select v-model="form.kyc_status" placeholder="Not submitted" clearable class="w-full">
          <el-option label="Pending" value="pending" />
          <el-option label="Verified" value="verified" />
          <el-option label="Rejected" value="rejected" />
        </el-select>
      </div>

      <template v-if="form.kyc_status">
        <div class="flex gap-2">
          <div class="w-32">
            <label class="eyebrow mb-1 block">Document type</label>
            <el-select v-model="form.doc_type" class="w-full">
              <el-option label="Aadhaar" value="aadhaar" />
              <el-option label="PAN" value="pan" />
              <el-option label="Passport" value="passport" />
              <el-option label="Driving licence" value="dl" />
            </el-select>
          </div>
          <div class="flex-1">
            <label class="eyebrow mb-1 block" for="new-user-doc-number">Document number</label>
            <el-input id="new-user-doc-number" v-model="form.doc_number" placeholder="auto-generated if left blank" />
          </div>
        </div>

        <div>
          <label class="eyebrow mb-1 block">Documents (optional)</label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="side in (['doc_front', 'doc_back', 'selfie'] as const)" :key="side">
              <div
                class="flex aspect-square items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
                style="border-radius: 4px"
              >
                <img
                  v-if="form[docUrlField[side]]"
                  :src="form[docUrlField[side]]!"
                  alt=""
                  class="h-full w-full object-cover"
                />
                <span v-else class="eyebrow">empty</span>
              </div>
              <el-button
                size="small"
                class="mt-1 w-full"
                :loading="uploadingDoc[side]"
                @click="(docInputs[side] as HTMLInputElement | undefined)?.click()"
              >
                {{ form[docUrlField[side]] ? 'Replace' : 'Upload' }}
              </el-button>
              <p class="eyebrow mt-0.5 text-center">{{ side === 'doc_front' ? 'front' : side === 'doc_back' ? 'back' : 'selfie' }}</p>
              <input
                :ref="(el) => (docInputs[side] = el as HTMLInputElement)"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                @change="uploadDoc(side, $event)"
              />
            </div>
          </div>
          <p class="eyebrow mt-1">
            no real documents exist for an admin-created account, so a slot left empty gets a
            labelled placeholder instead of "not supplied"
          </p>
        </div>
      </template>
    </form>

    <template #footer>
      <el-button @click="creating = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.display_name || !form.phone"
        @click="create"
      >
        Create user
      </el-button>
    </template>
  </el-dialog>
</template>
