<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref, toRef } from 'vue'

import ImageUpload from '@/components/ImageUpload.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useHindiAutofill } from '@/lib/translate'
import type { LevelType, WealthCharmLevelRow } from '@/types/api'

/**
 * GFT-027 / docs/00 §7 — the wealth/charm level ladder. A user's actual level is never
 * stored: it is resolved server-side from wallet lifetime totals against this ladder, or
 * from an admin override on the user's detail page. This screen only edits the ladder.
 */
const levels = ref<WealthCharmLevelRow[]>([])
const loading = ref(true)
const tab = ref<LevelType>('wealth')

const dialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const badgeUpload = ref<InstanceType<typeof ImageUpload> | null>(null)

const form = reactive({
  id: null as number | null,
  type: 'wealth' as LevelType,
  level: 1,
  name_en: '',
  name_hi: '',
  threshold: 0,
  badge_url: null as string | null,
  is_active: true,
})
const levelHindi = useHindiAutofill(toRef(form, 'name_hi'))

onMounted(load)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get<WealthCharmLevelRow[]>('/admin/levels', { include_inactive: true })
    levels.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function rowsFor(type: LevelType) {
  return levels.value.filter((l) => l.type === type).sort((a, b) => a.level - b.level)
}

function create() {
  const existing = rowsFor(tab.value)
  const nextLevel = existing.length ? Math.max(...existing.map((l) => l.level)) + 1 : 1
  const lastThreshold = existing.length ? Math.max(...existing.map((l) => l.threshold)) : 0

  Object.assign(form, {
    id: null, type: tab.value, level: nextLevel, name_en: '', name_hi: '',
    threshold: lastThreshold + 1000, badge_url: null, is_active: true,
  })
  errors.value = {}
  dialog.value = true
}

function edit(level: WealthCharmLevelRow) {
  Object.assign(form, {
    id: level.id,
    type: level.type,
    level: level.level,
    name_en: level.name_en,
    name_hi: level.name_hi ?? '',
    threshold: level.threshold,
    badge_url: level.badge_url,
    is_active: level.is_active,
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}

  const body = {
    name_en: form.name_en,
    name_hi: form.name_hi || null,
    threshold: form.threshold,
    badge_url: form.badge_url,
    is_active: form.is_active,
  }

  try {
    if (form.id === null) {
      const { data } = await api.post<WealthCharmLevelRow>('/admin/levels', { ...body, type: form.type, level: form.level })

      if (badgeUpload.value?.hasPendingFile) {
        await badgeUpload.value.uploadNow(data.id)
      }

      ElMessage.success('Level created')
    } else {
      await api.patch(`/admin/levels/${form.id}`, body)
      ElMessage.success('Level updated')
    }
    dialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Store"
    title="Wealth &amp; charm levels"
    lede="The ladder a user's wealth and charm progress climbs. Nothing is stored on a user directly — a level is resolved from lifetime coins spent / diamonds earned against these thresholds, unless a moderator overrides it on the user's own page."
  >
    <template #actions>
      <el-button v-permission="'levels.manage'" type="primary" size="small" @click="create">
        Add level
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs :model-value="tab" @update:model-value="tab = $event as LevelType">
      <el-tab-pane :label="`Wealth (${rowsFor('wealth').length})`" name="wealth" />
      <el-tab-pane :label="`Charm (${rowsFor('charm').length})`" name="charm" />
    </el-tabs>

    <div class="panel overflow-x-auto">
      <table class="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-[var(--color-edge)]">
            <th class="eyebrow px-3 py-2 text-left">Level</th>
            <th class="eyebrow px-3 py-2 text-left">Name</th>
            <th class="eyebrow px-3 py-2 text-right">Threshold</th>
            <th class="eyebrow px-3 py-2 text-left">Status</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="level in rowsFor(tab)"
            :key="level.id"
            class="border-b border-[var(--color-edge)]"
            :class="level.is_active ? '' : 'opacity-50'"
          >
            <td class="px-3 py-2">
              <div class="flex items-center gap-2.5">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
                  style="border-radius: 4px"
                >
                  <img v-if="level.badge_url" :src="level.badge_url" alt="" class="h-full w-full object-cover" />
                </div>
                <span class="key">{{ level.level }}</span>
              </div>
            </td>
            <td class="px-3 py-2">{{ level.name_en }}</td>
            <td class="key px-3 py-2 text-right">{{ level.threshold.toLocaleString() }}</td>
            <td class="px-3 py-2">
              <el-tag :type="level.is_active ? 'success' : 'info'" size="small">
                {{ level.is_active ? 'active' : 'inactive' }}
              </el-tag>
            </td>
            <td class="px-3 py-2 text-right">
              <el-button v-permission.disable="'levels.manage'" size="small" @click="edit(level)">
                Edit
              </el-button>
            </td>
          </tr>
          <tr v-if="!loading && rowsFor(tab).length === 0">
            <td colspan="5" class="px-3 py-6 text-center text-[13px] text-[var(--color-legend)]">
              No {{ tab }} levels yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="eyebrow mt-3">
      thresholds must strictly increase with level — a higher level asking for fewer coins
      than the one below it is refused
    </p>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? 'Edit level' : 'Add level'" width="440">
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Track</label>
          <el-select v-model="form.type" :disabled="form.id !== null" class="w-full">
            <el-option label="Wealth" value="wealth" />
            <el-option label="Charm" value="charm" />
          </el-select>
        </div>
        <div v-if="form.id === null">
          <label class="eyebrow mb-1 block">Level</label>
          <el-input-number v-model="form.level" :min="1" :max="999" class="w-full" />
          <p class="eyebrow mt-1">unique within the track</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block" for="l-en">Name (English)</label>
          <el-input id="l-en" v-model="form.name_en" @input="levelHindi.onEnglishInput" />
          <p v-if="errors.name_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name_en }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block" for="l-hi">Name (Hindi)</label>
          <el-input id="l-hi" v-model="form.name_hi" />
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Threshold</label>
        <el-input-number v-model="form.threshold" :min="0" :step="1000" class="w-full" />
        <p class="eyebrow mt-1">
          coins spent (wealth) or diamonds earned (charm) needed to reach this level
        </p>
        <p v-if="errors.threshold" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.threshold }}</p>
      </div>

      <ImageUpload
        ref="badgeUpload"
        v-model="form.badge_url"
        upload-url="/admin/levels/badge"
        label="Badge"
        :record-id="form.id"
        @saved="load"
      />

      <el-checkbox v-model="form.is_active" size="small">Offer this level</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" :disabled="!form.name_en" @click="save">
        Save
      </el-button>
    </template>
  </el-dialog>
</template>
