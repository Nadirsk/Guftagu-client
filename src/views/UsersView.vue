<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { KycStatus, UserRow, UserStatus } from '@/types/api'

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
  />

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
</template>
