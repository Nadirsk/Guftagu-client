<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { RoleSummary } from '@/types/api'

const roles = ref<RoleSummary[]>([])
const loading = ref(true)

const detail = ref<{ role: RoleSummary; permissions: string[] } | null>(null)
const detailOpen = ref(false)

onMounted(async () => {
  try {
    const { data } = await api.get<RoleSummary[]>('/admin/roles')
    roles.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
})

async function open(role: RoleSummary) {
  detailOpen.value = true
  detail.value = null
  try {
    const { data } = await api.get<{ permissions: string[] }>(`/admin/roles/${role.id}`)
    detail.value = { role, permissions: data.permissions }
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
    detailOpen.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Access"
    title="Roles"
    lede="The baseline each role starts from. Everything beyond a baseline is granted to individual accounts."
  />

  <div class="px-5 py-5 md:px-7">
    <div v-loading="loading" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <button
        v-for="role in roles"
        :key="role.id"
        type="button"
        class="panel px-4 py-3 text-left transition-colors hover:border-[var(--color-edge-bright)]"
        @click="open(role)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[14px] font-semibold">{{ role.name }}</div>
            <div class="key text-[var(--color-legend)]">{{ role.key }}</div>
          </div>
          <el-tag v-if="role.is_system" size="small">system</el-tag>
        </div>

        <p
          v-if="role.description"
          class="mt-2 text-[12px] leading-snug text-[var(--color-legend)]"
        >
          {{ role.description }}
        </p>

        <div class="mt-3 flex items-end justify-between">
          <div>
            <div class="eyebrow">Baseline</div>
            <div class="text-[15px] font-semibold">{{ role.permission_count }}</div>
          </div>
          <div class="text-right">
            <div class="eyebrow">Accounts</div>
            <div class="text-[15px] font-semibold">{{ role.admin_count }}</div>
          </div>
        </div>
      </button>
    </div>

    <p class="eyebrow mt-4 leading-relaxed">
      Super Admin holds no baseline rows — it resolves to everything by short-circuit, so its count
      reports the full catalogue. Moderator is deliberately thin: its real powers are granted per
      account, which is the whole point of the delegation model.
    </p>
  </div>

  <el-dialog v-model="detailOpen" :title="detail?.role.name ?? 'Role'" width="560">
    <div v-if="!detail" class="py-6 text-center text-[13px] text-[var(--color-legend)]">
      Loading…
    </div>

    <div v-else>
      <p class="mb-3 text-[13px] text-[var(--color-legend)]">
        {{ detail.permissions.length }} permissions in this baseline.
      </p>
      <div class="max-h-80 overflow-y-auto">
        <div class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <span v-for="key in detail.permissions" :key="key" class="key truncate">{{ key }}</span>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
