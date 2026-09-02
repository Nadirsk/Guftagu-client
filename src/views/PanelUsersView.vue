<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminProfile, RoleKey } from '@/types/api'

/** GFT-127 — create, assign a role, suspend. */
const auth = useAuthStore()
const router = useRouter()

const rows = ref<AdminProfile[]>([])
const loading = ref(true)
const total = ref(0)

const query = reactive({
  q: '',
  status: '' as '' | 'active' | 'suspended',
  role: '' as '' | RoleKey,
  page: 1,
  per_page: 20,
  sort: '-created_at',
})

const creating = ref(false)
const saving = ref(false)
const form = reactive({
  name: '',
  email: '',
  password: '',
  role: 'moderator' as RoleKey,
  phone: '',
})
const formErrors = ref<Record<string, string>>({})

/** Super Admin may create any role; an Admin may create only these two. */
const assignableRoles = ref<RoleKey[]>(
  auth.isSuperAdmin ? ['admin', 'manager', 'moderator'] : ['manager', 'moderator'],
)

let searchTimer: number | undefined
watch(
  () => query.q,
  () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      query.page = 1
      void load()
    }, 300)
  },
)

watch([() => query.status, () => query.role, () => query.page], () => void load())

onMounted(load)

async function load() {
  loading.value = true
  try {
    const { data, meta } = await api.get<AdminProfile[]>('/admin/admins', {
      q: query.q || undefined,
      status: query.status || undefined,
      role: query.role || undefined,
      page: query.page,
      per_page: query.per_page,
      sort: query.sort,
    })
    rows.value = data
    total.value = meta.total ?? data.length
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function create() {
  saving.value = true
  formErrors.value = {}
  try {
    await api.post<AdminProfile>('/admin/admins', {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      phone: form.phone || undefined,
    })
    ElMessage.success(`${form.name} can now sign in`)
    creating.value = false
    Object.assign(form, { name: '', email: '', password: '', role: 'moderator', phone: '' })
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

async function setStatus(row: AdminProfile) {
  const suspending = row.status === 'active'

  try {
    await ElMessageBox.confirm(
      suspending
        ? `Suspend ${row.name}? Their sessions end immediately and they cannot sign in.`
        : `Reinstate ${row.name}? They will be able to sign in again.`,
      suspending ? 'Suspend account' : 'Reinstate account',
      {
        confirmButtonText: suspending ? 'Suspend' : 'Reinstate',
        cancelButtonText: 'Cancel',
        type: suspending ? 'warning' : 'info',
      },
    )
  } catch {
    return
  }

  try {
    await api.post(`/admin/admins/${row.id}/status`, {
      status: suspending ? 'suspended' : 'active',
    })
    ElMessage.success(suspending ? `${row.name} suspended` : `${row.name} reinstated`)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function openPermissions(row: AdminProfile) {
  void router.push({ name: 'admin-detail', params: { id: row.id } })
}
</script>

<template>
  <PageHead
    eyebrow="Access"
    title="Panel users"
    lede="Everyone who can sign in to this console. There is no sign-up — accounts are created here."
  >
    <template #actions>
      <el-button type="primary" @click="creating = true">Add panel user</el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-input
        v-model="query.q"
        placeholder="Search name or email"
        clearable
        class="w-full sm:w-64"
      />
      <el-select v-model="query.status" placeholder="Any status" clearable class="w-40">
        <el-option label="Active" value="active" />
        <el-option label="Suspended" value="suspended" />
      </el-select>
      <el-select v-model="query.role" placeholder="Any role" clearable class="w-44">
        <el-option label="Super Admin" value="super_admin" />
        <el-option label="Admin" value="admin" />
        <el-option label="Manager" value="manager" />
        <el-option label="Moderator" value="moderator" />
      </el-select>
      <span class="key ml-auto text-[var(--color-legend)]">{{ total }} accounts</span>
    </div>

    <div v-loading="loading" class="panel">
      <EmptyState
        v-if="!loading && rows.length === 0"
        title="No panel users match that"
        body="Clear the filters, or add the first account for this role."
      >
        <el-button type="primary" @click="creating = true">Add panel user</el-button>
      </EmptyState>

      <el-table v-else :data="rows" style="width: 100%">
        <el-table-column label="Name" min-width="180">
          <template #default="{ row }: { row: AdminProfile }">
            <div class="font-medium">{{ row.name }}</div>
            <div class="key text-[var(--color-legend)]">{{ row.email }}</div>
          </template>
        </el-table-column>

        <el-table-column label="Role" width="140">
          <template #default="{ row }: { row: AdminProfile }">
            <span class="key">{{ row.role?.key ?? '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="120">
          <template #default="{ row }: { row: AdminProfile }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="2FA" width="90">
          <template #default="{ row }: { row: AdminProfile }">
            <span class="key text-[var(--color-legend)]">
              {{ row.mfa_enabled ? 'on' : 'role' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Last sign-in" width="170">
          <template #default="{ row }: { row: AdminProfile }">
            <span class="key text-[var(--color-legend)]">
              {{ row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'never' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="" width="200" align="right">
          <template #default="{ row }: { row: AdminProfile }">
            <el-button
              v-permission.disable="'access.permission_grant'"
              size="small"
              @click="openPermissions(row)"
            >
              Permissions
            </el-button>
            <el-button
              v-if="row.id !== auth.admin?.id"
              size="small"
              :type="row.status === 'active' ? 'danger' : 'default'"
              plain
              @click="setStatus(row)"
            >
              {{ row.status === 'active' ? 'Suspend' : 'Reinstate' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total > query.per_page" class="flex justify-end border-t border-[var(--color-edge)] p-3">
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

  <!-- Create -->
  <el-dialog v-model="creating" title="Add panel user" width="440">
    <form class="space-y-3" @submit.prevent="create">
      <div>
        <label class="eyebrow mb-1 block" for="new-name">Name</label>
        <el-input id="new-name" v-model="form.name" />
        <p v-if="formErrors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ formErrors.name }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="new-email">Email</label>
        <el-input id="new-email" v-model="form.email" type="email" />
        <p v-if="formErrors.email" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ formErrors.email }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="new-password">Temporary password</label>
        <el-input id="new-password" v-model="form.password" type="password" show-password />
        <p class="eyebrow mt-1">at least 12 characters · they can change it once signed in</p>
        <p v-if="formErrors.password" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ formErrors.password }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Role</label>
        <el-select v-model="form.role" class="w-full">
          <el-option
            v-for="role in assignableRoles"
            :key="role"
            :label="role.replace('_', ' ')"
            :value="role"
          />
        </el-select>
        <p class="eyebrow mt-1">
          {{
            auth.isSuperAdmin
              ? 'you may create any role'
              : 'an Admin may create Managers and Moderators'
          }}
        </p>
      </div>
    </form>

    <template #footer>
      <el-button @click="creating = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.name || !form.email || form.password.length < 12"
        @click="create"
      >
        Create account
      </el-button>
    </template>
  </el-dialog>
</template>
