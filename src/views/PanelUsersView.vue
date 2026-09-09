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

/** Mirrors AdminUserController::mayManage — who this signed-in admin may edit at all. */
function canManage(row: AdminProfile): boolean {
  if (auth.isSuperAdmin) return true
  if (row.id === auth.admin?.id) return true
  return auth.roleKey === 'admin' && (row.role?.key === 'manager' || row.role?.key === 'moderator')
}

const editing = ref<AdminProfile | null>(null)
const editSaving = ref(false)
const editForm = reactive({
  name: '',
  email: '',
  phone: '',
  role: 'moderator' as RoleKey,
  mfa_enabled: false,
  session_timeout_minutes: null as number | null,
})
const editErrors = ref<Record<string, string>>({})

function openEdit(row: AdminProfile) {
  editing.value = row
  editErrors.value = {}
  Object.assign(editForm, {
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    role: row.role?.key ?? 'moderator',
    mfa_enabled: row.mfa_enabled,
    session_timeout_minutes: row.session_timeout_minutes ?? null,
  })
}

/** The role select must still show the row's current role even if the actor could not
 * have assigned it themselves (e.g. an Admin editing their own Admin-role row). */
function editableRoles(row: AdminProfile | null): RoleKey[] {
  const roles = new Set(assignableRoles.value)
  if (row?.role?.key) roles.add(row.role.key)
  return [...roles]
}

async function saveEdit() {
  if (!editing.value) return
  editSaving.value = true
  editErrors.value = {}
  try {
    // Only send `role` when it actually changed — the backend runs the delegation-ladder
    // check whenever the key is present at all, and self-edits (e.g. an Admin renaming
    // themselves) must not trip that check just because the unchanged role was echoed back.
    const roleChanged = editForm.role !== (editing.value.role?.key ?? null)

    await api.patch<AdminProfile>(`/admin/admins/${editing.value.id}`, {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone || null,
      ...(roleChanged ? { role: editForm.role } : {}),
      mfa_enabled: editForm.mfa_enabled,
      session_timeout_minutes: editForm.session_timeout_minutes,
    })
    ElMessage.success(`${editForm.name} updated`)
    editing.value = null
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      editErrors.value = e.fieldErrors
      if (!Object.keys(editErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    editSaving.value = false
  }
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

        <el-table-column label="" width="280" align="right">
          <template #default="{ row }: { row: AdminProfile }">
            <el-button v-if="canManage(row)" size="small" @click="openEdit(row)"> Edit </el-button>
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

  <!-- Edit -->
  <el-dialog
    :model-value="editing !== null"
    title="Edit panel user"
    width="440"
    @update:model-value="(v: boolean) => !v && (editing = null)"
  >
    <form v-if="editing" class="space-y-3" @submit.prevent="saveEdit">
      <div>
        <label class="eyebrow mb-1 block" for="edit-name">Name</label>
        <el-input id="edit-name" v-model="editForm.name" />
        <p v-if="editErrors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ editErrors.name }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="edit-email">Email</label>
        <el-input id="edit-email" v-model="editForm.email" type="email" />
        <p class="eyebrow mt-1">this is also their sign-in username</p>
        <p v-if="editErrors.email" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ editErrors.email }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="edit-phone">Phone</label>
        <el-input id="edit-phone" v-model="editForm.phone" />
        <p v-if="editErrors.phone" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ editErrors.phone }}
        </p>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Role</label>
        <el-select v-model="editForm.role" class="w-full">
          <el-option
            v-for="role in editableRoles(editing)"
            :key="role"
            :label="role.replace('_', ' ')"
            :value="role"
          />
        </el-select>
        <p v-if="editErrors.role" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ editErrors.role }}
        </p>
      </div>

      <div class="flex items-center justify-between">
        <label class="eyebrow" for="edit-mfa">Require 2FA</label>
        <el-switch id="edit-mfa" v-model="editForm.mfa_enabled" />
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="edit-timeout">Session timeout (minutes)</label>
        <el-input-number
          id="edit-timeout"
          v-model="editForm.session_timeout_minutes"
          :min="0"
          :max="1440"
          class="w-full"
        />
        <p class="eyebrow mt-1">blank uses the console default</p>
        <p v-if="editErrors.session_timeout_minutes" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ editErrors.session_timeout_minutes }}
        </p>
      </div>
    </form>

    <template #footer>
      <el-button @click="editing = null">Cancel</el-button>
      <el-button
        type="primary"
        :loading="editSaving"
        :disabled="!editForm.name || !editForm.email"
        @click="saveEdit"
      >
        Save changes
      </el-button>
    </template>
  </el-dialog>
</template>
