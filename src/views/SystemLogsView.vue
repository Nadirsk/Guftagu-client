<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { FrontendErrorLogRow, LaravelLogEntry, LaravelLogResult } from '@/types/api'

/**
 * IT Admin epic — behind `system.logs_view` and, on top of that, the `it_admin` role
 * itself (router meta `requireRole`, backend `role:it_admin`). Super Admin's blanket
 * permission bypass deliberately does not reach this screen.
 */
const tab = ref('laravel')
const loading = ref(true)

const laravelEntries = ref<LaravelLogEntry[]>([])
const laravelTruncated = ref(false)
const laravelFileSize = ref(0)
const laravelFilters = ref({ level: '', q: '' })
const laravelDetail = ref<LaravelLogEntry | null>(null)
const laravelDrawer = ref(false)

const frontendRows = ref<FrontendErrorLogRow[]>([])
const frontendFilters = ref({ level: '', q: '', from: '', to: '' })
const frontendDetail = ref<FrontendErrorLogRow | null>(null)
const frontendDrawer = ref(false)

onMounted(async () => {
  await Promise.all([loadLaravel(), loadFrontend()])
  loading.value = false
})

watch(laravelFilters, loadLaravel, { deep: true })
watch(frontendFilters, loadFrontend, { deep: true })

async function loadLaravel() {
  try {
    const { data } = await api.get<LaravelLogResult>('/admin/system/logs/laravel', {
      level: laravelFilters.value.level || undefined,
      q: laravelFilters.value.q || undefined,
      lines: 300,
    })
    laravelEntries.value = data.entries
    laravelTruncated.value = data.truncated
    laravelFileSize.value = data.file_size
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadFrontend() {
  try {
    const { data } = await api.get<FrontendErrorLogRow[]>('/admin/system/logs/frontend', {
      level: frontendFilters.value.level || undefined,
      q: frontendFilters.value.q || undefined,
      from: frontendFilters.value.from || undefined,
      to: frontendFilters.value.to || undefined,
      per_page: 100,
    })
    frontendRows.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

function openLaravel(entry: LaravelLogEntry) {
  laravelDetail.value = entry
  laravelDrawer.value = true
}

function openFrontend(row: FrontendErrorLogRow) {
  frontendDetail.value = row
  frontendDrawer.value = true
}

function levelTag(level: string): 'danger' | 'warning' | 'info' {
  const upper = level.toUpperCase()
  if (['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR'].includes(upper)) return 'danger'
  if (['WARNING', 'NOTICE'].includes(upper)) return 'warning'
  return 'info'
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <PageHead
    eyebrow="IT Admin"
    title="System logs"
    lede="The Laravel debug log, and browser errors the admin panel has reported about itself."
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs v-model="tab">
      <el-tab-pane label="Laravel log" name="laravel">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <el-select v-model="laravelFilters.level" placeholder="Any level" size="small" clearable style="width: 150px">
            <el-option v-for="l in ['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG']" :key="l" :label="l" :value="l" />
          </el-select>
          <el-input v-model="laravelFilters.q" placeholder="Search message" size="small" clearable style="width: 260px" />
          <el-button size="small" @click="loadLaravel">Refresh</el-button>
          <span class="eyebrow ml-auto">
            {{ bytes(laravelFileSize) }} on disk
            <template v-if="laravelTruncated">· showing the most recent 2 MB</template>
          </span>
        </div>

        <div class="panel">
          <EmptyState
            v-if="laravelEntries.length === 0"
            title="Nothing to show"
            body="Either the log is empty, or nothing matches the filter."
          />

          <ul v-else>
            <li
              v-for="(entry, i) in laravelEntries"
              :key="i"
              class="cursor-pointer border-b border-[var(--color-edge)] px-4 py-2.5 last:border-b-0 hover:bg-[var(--color-raised)]"
              @click="openLaravel(entry)"
            >
              <div class="flex items-center gap-2">
                <el-tag :type="levelTag(entry.level)" size="small">{{ entry.level }}</el-tag>
                <span class="key text-[var(--color-legend)]">{{ entry.timestamp }}</span>
                <span v-if="entry.stack" class="eyebrow">has stack</span>
              </div>
              <p class="key mt-1 truncate">{{ entry.message }}</p>
            </li>
          </ul>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Frontend errors" name="frontend">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <el-select v-model="frontendFilters.level" placeholder="Any level" size="small" clearable style="width: 140px">
            <el-option label="Error" value="error" />
            <el-option label="Warning" value="warning" />
            <el-option label="Info" value="info" />
          </el-select>
          <el-input v-model="frontendFilters.q" placeholder="Search message or page" size="small" clearable style="width: 260px" />
          <el-input v-model="frontendFilters.from" type="date" size="small" style="width: 150px" />
          <el-input v-model="frontendFilters.to" type="date" size="small" style="width: 150px" />
          <el-button size="small" @click="loadFrontend">Refresh</el-button>
        </div>

        <div class="panel">
          <EmptyState
            v-if="frontendRows.length === 0"
            title="No frontend errors reported"
            body="The admin panel reports its own uncaught errors here as they happen."
          />

          <el-table v-else :data="frontendRows" style="width: 100%" @row-click="openFrontend">
            <el-table-column label="When" width="170">
              <template #default="{ row }">
                <span class="key text-[var(--color-legend)]">
                  {{ row.created_at?.slice(0, 19).replace('T', ' ') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Level" width="100">
              <template #default="{ row }"><el-tag :type="levelTag(row.level)" size="small">{{ row.level }}</el-tag></template>
            </el-table-column>
            <el-table-column label="Message" min-width="260">
              <template #default="{ row }"><span class="key truncate">{{ row.message }}</span></template>
            </el-table-column>
            <el-table-column label="Page" width="160">
              <template #default="{ row }"><span class="key text-[var(--color-legend)]">{{ row.source_url ?? '—' }}</span></template>
            </el-table-column>
            <el-table-column label="Reported by" width="150">
              <template #default="{ row }">
                <span v-if="row.admin">{{ row.admin.name }}</span>
                <span v-else class="eyebrow">unknown</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-drawer v-model="laravelDrawer" size="620px" title="Log entry">
    <div v-if="laravelDetail" class="space-y-3">
      <dl class="grid grid-cols-2 gap-3 text-[13px]">
        <div><dt class="eyebrow">level</dt><dd class="key">{{ laravelDetail.level }}</dd></div>
        <div><dt class="eyebrow">when</dt><dd class="key">{{ laravelDetail.timestamp }}</dd></div>
      </dl>
      <p class="key panel px-4 py-3 whitespace-pre-wrap">{{ laravelDetail.message }}</p>
      <pre v-if="laravelDetail.stack" class="key panel overflow-x-auto px-4 py-3 text-[12px] whitespace-pre-wrap">{{ laravelDetail.stack }}</pre>
    </div>
  </el-drawer>

  <el-drawer v-model="frontendDrawer" size="620px" title="Frontend error">
    <div v-if="frontendDetail" class="space-y-3">
      <dl class="grid grid-cols-2 gap-3 text-[13px]">
        <div><dt class="eyebrow">level</dt><dd class="key">{{ frontendDetail.level }}</dd></div>
        <div><dt class="eyebrow">when</dt><dd class="key">{{ frontendDetail.created_at?.slice(0, 19).replace('T', ' ') }}</dd></div>
        <div><dt class="eyebrow">page</dt><dd class="key">{{ frontendDetail.source_url ?? '—' }}</dd></div>
        <div><dt class="eyebrow">reported by</dt><dd class="key">{{ frontendDetail.admin?.name ?? 'unknown' }}</dd></div>
      </dl>
      <p class="key panel px-4 py-3 whitespace-pre-wrap">{{ frontendDetail.message }}</p>
      <pre v-if="frontendDetail.stack" class="key panel overflow-x-auto px-4 py-3 text-[12px] whitespace-pre-wrap">{{ frontendDetail.stack }}</pre>
      <p v-if="frontendDetail.user_agent" class="eyebrow leading-relaxed">{{ frontendDetail.user_agent }}</p>
    </div>
  </el-drawer>
</template>
