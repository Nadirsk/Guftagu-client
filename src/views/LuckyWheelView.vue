<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { isItemReward, REWARD_TYPE_LABELS as TYPE_LABELS, REWARD_TYPES as typeOptions } from '@/lib/rewardTypes'
import { useAuthStore } from '@/stores/auth'
import type {
  ImageUploadResult,
  LuckyWheelMode,
  LuckyWheelPrizeRow,
  LuckyWheelRow,
  StoreItemRow,
  StoreItemsResult,
} from '@/types/api'

/**
 * The two Lucky Wheels (Classic, Glory). Each has eight fixed slots round the wheel; a slot
 * is saved in place, never added or removed. A slot's chance is its weight over the total
 * weight of the slots that can actually be drawn (active, weighted, payable).
 */
const SLOTS = 8
const ICON_MAX_MB = 2

const auth = useAuthStore()
const canManage = computed(() => auth.can('wheel.manage'))

const wheels = ref<LuckyWheelRow[]>([])
const items = ref<StoreItemRow[]>([])
const loading = ref(true)
const tab = ref<LuckyWheelMode>('classic')

const wheel = computed(() => wheels.value.find((w) => w.mode === tab.value) ?? null)

const slots = computed(() =>
  Array.from({ length: SLOTS }, (_, i) => ({
    position: i + 1,
    prize: wheel.value?.prizes.find((p) => p.position === i + 1) ?? null,
  })),
)

onMounted(async () => {
  await Promise.all([load(), loadItems()])
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<LuckyWheelRow[]>('/admin/lucky-wheels')
    wheels.value = data
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

/**
 * PATCH / PUT answer with the whole wheel, but without spin totals (those only come from
 * the index). Keep the totals already on screen so the stat tiles don't drop to zero.
 */
function replaceWheel(next: LuckyWheelRow) {
  const i = wheels.value.findIndex((w) => w.id === next.id)
  if (i === -1) return
  wheels.value[i] = { ...next, totals: wheels.value[i].totals }
}

// ------------------------------------------------------------------ wheel settings

const settings = reactive({ name: '', is_active: true, spin_cost: 1, multi_count: 10, multi_cost: 10 })
const settingsErrors = ref<Record<string, string>>({})
const savingSettings = ref(false)

function resetSettings() {
  const w = wheel.value
  if (!w) return
  Object.assign(settings, {
    name: w.name,
    is_active: w.is_active,
    spin_cost: w.spin_cost,
    multi_count: w.multi_count,
    multi_cost: w.multi_cost,
  })
  settingsErrors.value = {}
}

watch(() => wheel.value?.id, resetSettings)

const settingsDirty = computed(() => {
  const w = wheel.value
  if (!w) return false
  return (
    settings.name !== w.name ||
    settings.is_active !== w.is_active ||
    settings.spin_cost !== w.spin_cost ||
    settings.multi_count !== w.multi_count ||
    settings.multi_cost !== w.multi_cost
  )
})

/** How the multi-spin price compares with buying the same spins one at a time. */
const multiHint = computed(() => {
  const full = settings.spin_cost * settings.multi_count
  if (!full || !settings.multi_cost) return ''
  const off = Math.round((1 - settings.multi_cost / full) * 100)
  if (off > 0) return `${off}% off ${settings.multi_count} single spins (${full.toLocaleString()} coins)`
  if (off < 0) return `costs more than ${settings.multi_count} single spins (${full.toLocaleString()} coins)`
  return `same as ${settings.multi_count} single spins`
})

async function saveSettings() {
  const w = wheel.value
  if (!w) return
  savingSettings.value = true
  settingsErrors.value = {}
  try {
    const { data } = await api.patch<LuckyWheelRow>(`/admin/lucky-wheels/${w.id}`, {
      name: settings.name,
      is_active: settings.is_active,
      spin_cost: settings.spin_cost,
      multi_count: settings.multi_count,
      multi_cost: settings.multi_cost,
    })
    replaceWheel(data)
    resetSettings()
    ElMessage.success(`${data.name} saved`)
  } catch (e) {
    if (e instanceof ApiError) {
      settingsErrors.value = e.fieldErrors
      if (!Object.keys(settingsErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    savingSettings.value = false
  }
}

// ------------------------------------------------------------------ stat tiles

const payoutHigh = computed(() => (wheel.value?.payout_rate ?? 0) > 100)

const actualRate = computed(() => {
  const t = wheel.value?.totals
  if (!t || !t.coins_in) return null
  return Math.round((t.coins_out / t.coins_in) * 1000) / 10
})

// ------------------------------------------------------------------ slot display

function summary(p: LuckyWheelPrizeRow): string {
  if (p.reward_type === 'coins') return `${p.reward_value.toLocaleString()} coins`
  if (p.reward_type === 'diamonds') return `${p.reward_value.toLocaleString()} diamonds`
  const span = p.duration_days ? `${p.duration_days} days` : 'permanent'
  return `${TYPE_LABELS[p.reward_type] ?? p.reward_type}: ${p.item?.name ?? 'missing item'} · ${span}`
}

function iconFor(p: LuckyWheelPrizeRow): string | null {
  return p.icon_url || p.item?.image_url || null
}

// ------------------------------------------------------------------ edit dialog

const dialog = ref(false)
const saving = ref(false)
const uploading = ref(false)
const errors = ref<Record<string, string>>({})
const iconInput = ref<HTMLInputElement | null>(null)

const form = reactive({
  position: 1,
  label: '',
  reward_type: 'coins',
  reward_value: 100,
  store_item_id: null as number | null,
  permanent: false,
  duration_days: 7,
  icon_url: '',
  weight: 10,
  is_active: true,
})

const isItem = computed(() => isItemReward(form.reward_type))
const itemChoices = computed(() => items.value.filter((i) => i.type === form.reward_type && i.is_active))
const pickedItem = computed(() => items.value.find((i) => i.id === form.store_item_id) ?? null)

/** What the app would show on the slot if the label stays empty — mirrors displayLabel() server-side. */
const autoLabel = computed(() => {
  if (form.reward_type === 'coins') return (form.reward_value || 0).toLocaleString()
  if (form.reward_type === 'diamonds') return `${(form.reward_value || 0).toLocaleString()} 💎`
  return pickedItem.value?.name ?? 'Prize'
})

const previewIcon = computed(() => form.icon_url.trim() || (isItem.value ? pickedItem.value?.image_url : null) || null)

/** Same rule as the server's isPayable(): currency needs an amount, an item must be active. */
const formPayable = computed(() =>
  isItem.value ? pickedItem.value?.is_active === true : (form.reward_value ?? 0) > 0,
)

/** Live chance for the slot being edited, against the other slots as they stand now. */
const othersWeight = computed(() =>
  (wheel.value?.prizes ?? [])
    .filter((p) => p.position !== form.position && p.is_active && p.weight > 0 && p.payable)
    .reduce((sum, p) => sum + p.weight, 0),
)
const formDrawable = computed(() => form.is_active && form.weight > 0 && formPayable.value)
const previewChance = computed(() => {
  const own = formDrawable.value ? form.weight : 0
  const total = othersWeight.value + own
  return total > 0 ? (own / total) * 100 : 0
})

function edit(position: number, p: LuckyWheelPrizeRow | null) {
  const item = p !== null && isItemReward(p.reward_type)
  Object.assign(form, {
    position,
    label: p?.label ?? '',
    reward_type: p?.reward_type ?? 'coins',
    reward_value: p && !item ? p.reward_value : 100,
    store_item_id: p?.store_item_id ?? null,
    permanent: item ? p!.duration_days === null : false,
    duration_days: p?.duration_days ?? 7,
    icon_url: p?.icon_url ?? '',
    weight: p?.weight ?? 10,
    is_active: p?.is_active ?? true,
  })
  errors.value = {}
  dialog.value = true
}

async function onIconPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > ICON_MAX_MB * 1024 * 1024) {
    ElMessage.error(`That image is larger than ${ICON_MAX_MB} MB.`)
    return
  }
  uploading.value = true
  const body = new FormData()
  body.append('file', file)
  try {
    const { data } = await api.post<ImageUploadResult>('/admin/lucky-wheels/icon', body)
    form.icon_url = data.url
    delete errors.value.icon_url
    ElMessage.success('Icon uploaded · save the slot to use it')
  } catch (e) {
    if (e instanceof ApiError) {
      const fe = e.fieldErrors
      if (fe.file) errors.value = { ...errors.value, icon_url: fe.file }
      else ElMessage.error(e.message)
    }
  } finally {
    uploading.value = false
  }
}

async function save() {
  const w = wheel.value
  if (!w) return
  saving.value = true
  errors.value = {}
  const body = {
    label: form.label.trim() || null,
    reward_type: form.reward_type,
    icon_url: form.icon_url.trim() || null,
    weight: form.weight,
    is_active: form.is_active,
    ...(isItem.value
      ? { store_item_id: form.store_item_id, duration_days: form.permanent ? null : form.duration_days }
      : { reward_value: form.reward_value }),
  }
  try {
    const { data } = await api.put<LuckyWheelRow>(`/admin/lucky-wheels/${w.id}/prizes/${form.position}`, body)
    replaceWheel(data)
    ElMessage.success(`Slot ${form.position} saved`)
    dialog.value = false
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

function pct(n: number): string {
  return `${n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, '')}%`
}
</script>

<template>
  <PageHead
    eyebrow="Engagement"
    title="Lucky Wheel"
    lede="Each wheel has 8 fixed slots, numbered clockwise from the top. A slot's chance is its weight ÷ the total weight of the active slots; weight 0 means it never lands. A slot that can't pay (missing or inactive item) is skipped in the draw."
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs :model-value="tab" @update:model-value="tab = $event as LuckyWheelMode">
      <el-tab-pane
        v-for="w in wheels"
        :key="w.id"
        :label="w.is_active ? w.name : `${w.name} (off)`"
        :name="w.mode"
      />
    </el-tabs>

    <template v-if="wheel">
      <!-- settings -->
      <div class="panel p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="eyebrow">{{ wheel.mode }} wheel · settings</div>
          <el-switch v-model="settings.is_active" :disabled="!canManage" active-text="Active" />
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="eyebrow mb-1 block" for="w-name">Name</label>
            <el-input id="w-name" v-model="settings.name" :disabled="!canManage" maxlength="60" />
            <p v-if="settingsErrors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ settingsErrors.name }}</p>
          </div>
          <div>
            <label class="eyebrow mb-1 block">Single spin (coins)</label>
            <el-input-number v-model="settings.spin_cost" :disabled="!canManage" :min="1" :max="10000000" class="w-full" />
            <p v-if="settingsErrors.spin_cost" class="mt-1 text-[12px] text-[var(--color-cut)]">
              {{ settingsErrors.spin_cost }}
            </p>
          </div>
          <div>
            <label class="eyebrow mb-1 block">Multi-spin count</label>
            <el-input-number v-model="settings.multi_count" :disabled="!canManage" :min="2" :max="100" class="w-full" />
            <p v-if="settingsErrors.multi_count" class="mt-1 text-[12px] text-[var(--color-cut)]">
              {{ settingsErrors.multi_count }}
            </p>
          </div>
          <div>
            <label class="eyebrow mb-1 block">Multi-spin price (coins)</label>
            <el-input-number v-model="settings.multi_cost" :disabled="!canManage" :min="1" :max="1000000000" class="w-full" />
            <p v-if="settingsErrors.multi_cost" class="mt-1 text-[12px] text-[var(--color-cut)]">
              {{ settingsErrors.multi_cost }}
            </p>
            <p v-else-if="multiHint" class="eyebrow mt-1">{{ multiHint }}</p>
          </div>
        </div>

        <div v-permission="'wheel.manage'" class="mt-4 flex justify-end gap-2">
          <el-button size="small" :disabled="!settingsDirty" @click="resetSettings">Reset</el-button>
          <el-button
            size="small"
            type="primary"
            :loading="savingSettings"
            :disabled="!settingsDirty || !settings.name.trim()"
            @click="saveSettings"
          >
            Save
          </el-button>
        </div>
      </div>

      <!-- stats -->
      <div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <div class="panel px-3 py-2.5" :class="payoutHigh ? 'border-l-2 border-l-[var(--color-cut)]' : ''">
          <div class="eyebrow">payout rate</div>
          <div class="stat-figure text-[20px]" :class="payoutHigh ? 'text-[var(--color-cut)]' : ''">
            {{ wheel.payout_rate === null ? '—' : `${wheel.payout_rate}%` }}
          </div>
          <div class="eyebrow" :class="payoutHigh ? 'text-[var(--color-cut)]' : ''">
            {{
              wheel.payout_rate === null
                ? 'no slot can be drawn'
                : payoutHigh
                  ? 'pays out more than it takes'
                  : 'expected, per single spin'
            }}
          </div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">total spins</div>
          <div class="stat-figure text-[20px]">{{ wheel.totals.spins.toLocaleString() }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">players</div>
          <div class="stat-figure text-[20px]">{{ wheel.totals.players.toLocaleString() }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">coins in</div>
          <div class="stat-figure text-[20px]">{{ wheel.totals.coins_in.toLocaleString() }}</div>
        </div>
        <div class="panel px-3 py-2.5">
          <div class="eyebrow">coins out</div>
          <div class="stat-figure text-[20px]">{{ wheel.totals.coins_out.toLocaleString() }}</div>
          <div class="eyebrow">
            {{ actualRate === null ? 'actual, coin prizes only' : `${actualRate}% of coins in · actual` }}
          </div>
        </div>
      </div>

      <!-- slots -->
      <div class="panel mt-3 overflow-x-auto">
        <table class="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-[var(--color-edge)]">
              <th class="eyebrow px-3 py-2 text-left">Slot</th>
              <th class="eyebrow px-3 py-2 text-left">Label</th>
              <th class="eyebrow px-3 py-2 text-left">Reward</th>
              <th class="eyebrow px-3 py-2 text-right">Weight</th>
              <th class="eyebrow px-3 py-2 text-right">Chance</th>
              <th class="eyebrow px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in slots"
              :key="s.position"
              class="border-b border-[var(--color-edge)]"
              :class="s.prize && !s.prize.is_active ? 'opacity-50' : ''"
            >
              <td class="px-3 py-2">
                <div class="flex items-center gap-2.5">
                  <span class="key w-3 text-right">{{ s.position }}</span>
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
                    style="border-radius: 4px"
                  >
                    <img
                      v-if="s.prize && iconFor(s.prize)"
                      :src="iconFor(s.prize)!"
                      alt=""
                      class="h-full w-full object-contain"
                    />
                    <svg
                      v-else-if="s.prize?.reward_type === 'coins'"
                      viewBox="0 0 24 24"
                      class="h-5 w-5 text-[#c99a1e]"
                      fill="none"
                      aria-label="coins"
                    >
                      <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" />
                      <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.2" />
                    </svg>
                    <svg
                      v-else-if="s.prize?.reward_type === 'diamonds'"
                      viewBox="0 0 24 24"
                      class="h-5 w-5 text-[var(--color-signal)]"
                      fill="none"
                      aria-label="diamonds"
                    >
                      <path
                        d="M7 4h10l4 5-9 11L3 9l4-5zM3 9h18M12 20 8.5 9 12 4l3.5 5L12 20"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" class="h-4 w-4 text-[var(--color-legend)]" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                      <path d="M21 15l-5-5-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                  </div>
                </div>
              </td>

              <template v-if="s.prize">
                <td class="px-3 py-2">
                  {{ s.prize.display_label }}
                  <span v-if="s.prize.label === null" class="eyebrow ml-1">(auto)</span>
                </td>
                <td class="px-3 py-2">{{ summary(s.prize) }}</td>
                <td class="key px-3 py-2 text-right">{{ s.prize.weight.toLocaleString() }}</td>
                <td class="key px-3 py-2 text-right">{{ pct(s.prize.chance) }}</td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap gap-1">
                    <el-tag :type="s.prize.is_active ? 'success' : 'info'" size="small">
                      {{ s.prize.is_active ? 'active' : 'inactive' }}
                    </el-tag>
                    <el-tag v-if="!s.prize.payable" type="danger" size="small" title="Its item is missing or inactive">
                      not payable
                    </el-tag>
                    <el-tag v-else-if="s.prize.weight === 0" type="info" size="small">never lands</el-tag>
                  </div>
                </td>
              </template>
              <td v-else colspan="5" class="px-3 py-2 text-[var(--color-legend)]">
                Not set: this slot never lands.
              </td>

              <td class="px-3 py-2 text-right">
                <el-button v-permission.disable="'wheel.manage'" size="small" @click="edit(s.position, s.prize)">
                  {{ s.prize ? 'Edit' : 'Set' }}
                </el-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p v-else-if="!loading" class="panel px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
      No wheel found.
    </p>
  </div>

  <el-dialog v-model="dialog" :title="`${wheel?.name ?? 'Wheel'} · slot ${form.position}`" width="480px">
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="Reward type" :error="errors.reward_type">
        <el-select v-model="form.reward_type" class="w-full" @change="form.store_item_id = null">
          <el-option v-for="t in typeOptions" :key="t" :label="TYPE_LABELS[t]" :value="t" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="!isItem" label="Amount" :error="errors.reward_value">
        <el-input-number v-model="form.reward_value" :min="1" :max="1000000000" class="w-full" />
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

      <el-form-item label="Label" :error="errors.label">
        <el-input v-model="form.label" :placeholder="autoLabel" maxlength="40" clearable />
        <div class="eyebrow mt-1">leave empty to show the auto label</div>
      </el-form-item>

      <el-form-item label="Icon" :error="errors.icon_url">
        <div class="flex w-full items-center gap-3">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
            style="border-radius: 4px"
          >
            <img v-if="previewIcon" :src="previewIcon" alt="" class="h-full w-full object-contain" />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex gap-2">
              <el-input v-model="form.icon_url" placeholder="https://… or upload a file" clearable />
              <el-button :loading="uploading" @click="iconInput?.click()">Upload</el-button>
            </div>
            <div class="eyebrow">
              JPG, PNG, WEBP or GIF · up to {{ ICON_MAX_MB }} MB{{ isItem ? ' · empty uses the item image' : '' }}
            </div>
          </div>
          <input
            ref="iconInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="hidden"
            @change="onIconPicked"
          />
        </div>
      </el-form-item>

      <el-form-item label="Weight" :error="errors.weight">
        <el-input-number v-model="form.weight" :min="0" :max="1000000" class="w-full" />
        <div class="eyebrow mt-1">
          <template v-if="!formDrawable">
            chance 0% ·
            {{ !form.is_active ? 'slot is off' : form.weight === 0 ? 'weight 0 never lands' : 'not payable' }}
          </template>
          <template v-else>
            chance {{ pct(previewChance) }} · {{ form.weight.toLocaleString() }} of
            {{ (othersWeight + form.weight).toLocaleString() }} total weight
          </template>
        </div>
      </el-form-item>

      <el-form-item>
        <el-switch v-model="form.is_active" active-text="Active" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" :disabled="uploading" @click="save">Save</el-button>
    </template>
  </el-dialog>
</template>
