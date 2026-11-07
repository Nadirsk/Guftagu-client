<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { isItemReward, REWARD_TYPE_LABELS as TYPE_LABELS, REWARD_TYPES as typeOptions } from '@/lib/rewardTypes'
import type { CheckinRewardRow, StoreItemRow, StoreItemsResult } from '@/types/api'

/** The 7-day ladder the app's Daily Rewards popup shows: whatever is set here is what players get. */
const rewards = ref<CheckinRewardRow[]>([])
const items = ref<StoreItemRow[]>([])
const loading = ref(true)
const saving = ref(false)
const dialog = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  streak_day: 1,
  id: null as number | null,
  reward_type: 'coins',
  reward_value: 100,
  store_item_id: null as number | null,
  permanent: false,
  duration_days: 7,
  is_active: true,
})

const isItem = computed(() => isItemReward(form.reward_type))
const itemChoices = computed(() => items.value.filter((i) => i.type === form.reward_type && i.is_active))

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    reward: rewards.value.find((r) => r.streak_day === i + 1) ?? null,
  })),
)

onMounted(async () => {
  await Promise.all([load(), loadItems()])
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<CheckinRewardRow[]>('/admin/checkin-rewards')
    rewards.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadItems() {
  try {
    const { data } = await api.get<StoreItemsResult>('/admin/store-items')
    items.value = data.items
  } catch {
    /* item rewards just have nothing to pick from */
  }
}

function summary(r: CheckinRewardRow): string {
  if (r.item) {
    const span = r.duration_days ? `${r.duration_days} days` : 'permanent'
    return `${r.item.name} · ${span}`
  }
  return `${r.reward_value.toLocaleString()} ${r.reward_type}`
}

function edit(day: number, r: CheckinRewardRow | null) {
  Object.assign(form, {
    streak_day: day,
    id: r?.id ?? null,
    reward_type: r?.reward_type ?? 'coins',
    reward_value: r && !r.item ? r.reward_value : 100,
    store_item_id: r?.store_item_id ?? null,
    permanent: r ? r.item !== null && r.duration_days === null : false,
    duration_days: r?.duration_days ?? 7,
    is_active: r?.is_active ?? true,
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}
  const body = {
    streak_day: form.streak_day,
    reward_type: form.reward_type,
    is_active: form.is_active,
    ...(isItem.value
      ? {
          store_item_id: form.store_item_id,
          duration_days: form.permanent ? null : form.duration_days,
        }
      : { reward_value: form.reward_value }),
  }
  try {
    if (form.id === null) await api.post('/admin/checkin-rewards', body)
    else await api.patch(`/admin/checkin-rewards/${form.id}`, body)
    ElMessage.success(`Day ${form.streak_day} saved`)
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

async function remove(r: CheckinRewardRow) {
  try {
    await ElMessageBox.confirm(`Remove the Day ${r.streak_day} reward? That day will show as unavailable in the app.`, 'Remove reward', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await api.del(`/admin/checkin-rewards/${r.id}`)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}
</script>

<template>
  <PageHead
    eyebrow="Engagement"
    title="Daily rewards"
    lede="The 7-day sign-in ladder shown in the app. Each day can pay coins, diamonds, or an item from the Store (frame, entry effect...)."
  />

  <div v-loading="loading" class="grid gap-3 px-5 py-5 sm:grid-cols-2 md:px-7 lg:grid-cols-4">
    <div
      v-for="d in days"
      :key="d.day"
      class="panel flex flex-col gap-2 p-3"
      :class="d.reward && !d.reward.is_active ? 'opacity-50' : ''"
    >
      <div class="eyebrow">Day {{ d.day }}</div>

      <template v-if="d.reward">
        <img
          v-if="d.reward.item?.image_url"
          :src="d.reward.item.image_url"
          :alt="d.reward.item.name"
          class="h-16 w-16 object-contain"
        />
        <div class="text-[14px] font-medium">{{ summary(d.reward) }}</div>
        <div class="key text-[var(--color-legend)]">{{ TYPE_LABELS[d.reward.reward_type] }}</div>
        <p v-if="!d.reward.payable" class="text-[12px] text-[var(--color-signal)]">
          Not payable: its item is missing or inactive.
        </p>
        <div class="mt-auto flex gap-2 pt-2">
          <el-button v-permission="'checkin.manage'" size="small" @click="edit(d.day, d.reward)">Edit</el-button>
          <el-button v-permission="'checkin.manage'" size="small" text type="danger" @click="remove(d.reward)">
            Remove
          </el-button>
        </div>
      </template>
      <template v-else>
        <div class="text-[13px] text-[var(--color-legend)]">Not set: shows as unavailable in the app.</div>
        <el-button v-permission="'checkin.manage'" class="mt-auto" size="small" type="primary" @click="edit(d.day, null)">
          Set reward
        </el-button>
      </template>
    </div>
  </div>

  <el-dialog v-model="dialog" :title="`Day ${form.streak_day} reward`" width="440px">
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="Reward type" :error="errors.reward_type">
        <el-select v-model="form.reward_type" class="w-full" @change="form.store_item_id = null">
          <el-option v-for="t in typeOptions" :key="t" :label="TYPE_LABELS[t]" :value="t" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="!isItem" label="Amount" :error="errors.reward_value">
        <el-input-number v-model="form.reward_value" :min="1" class="w-full" />
      </el-form-item>

      <template v-else>
        <el-form-item label="Store item" :error="errors.store_item_id">
          <el-select v-model="form.store_item_id" class="w-full" filterable placeholder="Pick from the Store catalogue">
            <el-option v-for="i in itemChoices" :key="i.id" :label="i.name" :value="i.id" />
          </el-select>
          <div v-if="!itemChoices.length" class="mt-1 text-[12px] text-[var(--color-legend)]">
            No active {{ TYPE_LABELS[form.reward_type].toLowerCase() }} in the Store yet. Add one there first.
          </div>
        </el-form-item>
        <el-form-item label="Duration" :error="errors.duration_days">
          <el-checkbox v-model="form.permanent">Permanent</el-checkbox>
          <el-input-number v-if="!form.permanent" v-model="form.duration_days" :min="1" :max="3650" class="ml-3" />
          <span v-if="!form.permanent" class="ml-2 text-[12px]">days</span>
        </el-form-item>
      </template>

      <el-form-item>
        <el-switch v-model="form.is_active" active-text="Active" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="save">Save</el-button>
    </template>
  </el-dialog>
</template>
