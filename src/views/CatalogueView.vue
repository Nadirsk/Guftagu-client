<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import ModuleRack from '@/components/ModuleRack.vue'
import PageHead from '@/components/PageHead.vue'
import PermissionStrip from '@/components/PermissionStrip.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ModuleGroup, RiskLevel } from '@/types/api'

/** The whole catalogue, and which parts of it you personally hold. */
const auth = useAuthStore()

const modules = ref<ModuleGroup[]>([])
const loading = ref(true)
const openRacks = reactive<Record<string, boolean>>({})

const search = ref('')
const riskFilter = ref<'' | RiskLevel>('')
const heldOnly = ref(false)

onMounted(async () => {
  try {
    const { data } = await api.get<{ modules: ModuleGroup[] }>('/admin/permissions')
    modules.value = data.modules
    for (const group of data.modules) openRacks[group.module] ??= false
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
})

const filtered = computed(() =>
  modules.value
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) => {
        if (riskFilter.value && permission.risk_level !== riskFilter.value) return false
        if (heldOnly.value && !auth.can(permission.key)) return false
        if (!search.value) return true

        const needle = search.value.toLowerCase()
        return (
          permission.key.toLowerCase().includes(needle) ||
          permission.name.toLowerCase().includes(needle)
        )
      }),
    }))
    .filter((group) => group.permissions.length > 0),
)

const counts = computed(() => {
  const all = modules.value.flatMap((group) => group.permissions)
  return {
    total: all.length,
    held: all.filter((permission) => auth.can(permission.key)).length,
    high: all.filter((permission) => permission.risk_level === 'high').length,
  }
})

/** The catalogue is a reference, so every rack opens when someone is searching it. */
function expandAll(open: boolean) {
  for (const group of modules.value) openRacks[group.module] = open
}
</script>

<template>
  <PageHead
    eyebrow="Access"
    title="Permission catalogue"
    lede="Every key the platform defines. Adding one is a code change; removing one needs a migration that revokes it everywhere first."
  >
    <template #actions>
      <el-button size="small" @click="expandAll(true)">Expand all</el-button>
      <el-button size="small" @click="expandAll(false)">Collapse all</el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-input
        v-model="search"
        placeholder="Search key or description"
        clearable
        class="w-full sm:w-72"
      />
      <el-select v-model="riskFilter" placeholder="Any risk" clearable class="w-36">
        <el-option label="Low" value="low" />
        <el-option label="Medium" value="medium" />
        <el-option label="High" value="high" />
      </el-select>
      <el-checkbox v-model="heldOnly" size="small">Only what I hold</el-checkbox>

      <span class="key ml-auto text-[var(--color-legend)]">
        you hold {{ counts.held }} of {{ counts.total }} · {{ counts.high }} high risk
      </span>
    </div>

    <div v-loading="loading" class="space-y-2">
      <ModuleRack
        v-for="group in filtered"
        :key="group.module"
        :module="group.module"
        :held="group.permissions.filter((p) => auth.can(p.key)).length"
        :total="group.permissions.length"
        :open="openRacks[group.module] ?? false"
        @update:open="openRacks[group.module] = $event"
      >
        <PermissionStrip
          v-for="permission in group.permissions"
          :key="permission.key"
          :permission="permission"
          :row="
            auth.can(permission.key)
              ? {
                  key: permission.key,
                  module: group.module,
                  action: permission.action,
                  risk_level: permission.risk_level,
                  origin: auth.isSuperAdmin ? 'super_admin' : 'role',
                  expires_at: null,
                  scope: null,
                }
              : null
          "
        />
      </ModuleRack>
    </div>
  </div>
</template>
