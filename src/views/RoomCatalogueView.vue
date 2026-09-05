<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref, toRef, watch } from 'vue'

import ImageUpload from '@/components/ImageUpload.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useHindiAutofill } from '@/lib/translate'
import type { RoomCategoryRow, RoomSeatTemplateRow, RoomThemeRow, VipTiersResult, VipTierRow } from '@/types/api'

/** GFT-045 — categories, themes and seat templates. The catalogue the app reads from. */
const categories = ref<RoomCategoryRow[]>([])
const themes = ref<RoomThemeRow[]>([])
const seatTemplates = ref<RoomSeatTemplateRow[]>([])
const vipTiers = ref<VipTierRow[]>([])
const loading = ref(true)
const tab = ref<'categories' | 'themes' | 'seats'>('categories')

const categoryDialog = ref(false)
const themeDialog = ref(false)
const templateDialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const categoryForm = reactive({
  id: null as number | null,
  key: '',
  name_en: '',
  name_hi: '',
  sort_order: 100,
  is_active: true,
})
const categoryHindi = useHindiAutofill(toRef(categoryForm, 'name_hi'))

const themeForm = reactive({
  id: null as number | null,
  name: '',
  background_url: null as string | null,
  preview_url: null as string | null,
  is_premium: false,
  required_vip_tier_id: null as number | null,
  coin_price: 0,
  is_active: true,
})

const themeBackgroundUpload = ref<InstanceType<typeof ImageUpload> | null>(null)
const themePreviewUpload = ref<InstanceType<typeof ImageUpload> | null>(null)

const templateForm = reactive({
  id: null as number | null,
  name: '',
  total_seats: 8,
  vip_positions: [] as number[],
  is_active: true,
})

/** Shrinking the seat count must not leave a selected position past the new total. */
watch(
  () => templateForm.total_seats,
  (total) => {
    templateForm.vip_positions = templateForm.vip_positions.filter((p) => p <= total)
  },
)

const templatePositions = computed(() =>
  Array.from({ length: templateForm.total_seats }, (_, i) => i + 1),
)

function toggleTemplatePosition(position: number) {
  templateForm.vip_positions = templateForm.vip_positions.includes(position)
    ? templateForm.vip_positions.filter((p) => p !== position)
    : [...templateForm.vip_positions, position].sort((a, b) => a - b)
}

onMounted(async () => {
  await Promise.all([load(), loadVipTiers()])
  loading.value = false
})

async function loadVipTiers() {
  try {
    const { data } = await api.get<VipTiersResult>('/admin/vip-tiers')
    vipTiers.value = data.tiers
  } catch {
    /* the tier picker just falls back to no options — theme create/edit still works */
  }
}

function vipTierLabel(tierId: number): string {
  const tier = vipTiers.value.find((t) => t.id === tierId)
  return tier ? `VIP ${tier.level}` : `VIP #${tierId}`
}

async function load() {
  try {
    const [c, t, s] = await Promise.all([
      api.get<RoomCategoryRow[]>('/admin/room-categories', { include_inactive: true }),
      api.get<RoomThemeRow[]>('/admin/room-themes', { include_inactive: true }),
      api.get<RoomSeatTemplateRow[]>('/admin/room-seat-templates', { include_inactive: true }),
    ])
    categories.value = c.data
    themes.value = t.data
    seatTemplates.value = s.data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function newCategory() {
  Object.assign(categoryForm, { id: null, key: '', name_en: '', name_hi: '', sort_order: 100, is_active: true })
  errors.value = {}
  categoryDialog.value = true
}

function editCategory(row: RoomCategoryRow) {
  Object.assign(categoryForm, {
    id: row.id,
    key: row.key,
    name_en: row.name_en,
    name_hi: row.name_hi ?? '',
    sort_order: row.sort_order,
    is_active: row.is_active,
  })
  errors.value = {}
  categoryDialog.value = true
}

async function saveCategory() {
  saving.value = true
  errors.value = {}

  const body = {
    name_en: categoryForm.name_en,
    name_hi: categoryForm.name_hi || null,
    sort_order: categoryForm.sort_order,
    is_active: categoryForm.is_active,
  }

  try {
    if (categoryForm.id === null) {
      await api.post('/admin/room-categories', { ...body, key: categoryForm.key })
      ElMessage.success('Category created')
    } else {
      await api.patch(`/admin/room-categories/${categoryForm.id}`, body)
      ElMessage.success('Category updated')
    }
    categoryDialog.value = false
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

async function removeCategory(row: RoomCategoryRow) {
  try {
    await ElMessageBox.confirm(`Delete “${row.name_en}”?`, 'Delete category', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await api.del(`/admin/room-categories/${row.id}`)
    ElMessage.success('Category deleted')
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      // The API refuses while rooms use it and says how many — pass that on rather than
      // a bare failure, and point at the alternative.
      ElMessage.error(e.message)
    }
  }
}

function newTheme() {
  Object.assign(themeForm, {
    id: null,
    name: '',
    background_url: null,
    preview_url: null,
    is_premium: false,
    required_vip_tier_id: null,
    coin_price: 0,
    is_active: true,
  })
  errors.value = {}
  themeDialog.value = true
}

function editTheme(row: RoomThemeRow) {
  Object.assign(themeForm, {
    id: row.id,
    name: row.name,
    background_url: row.background_url,
    preview_url: row.preview_url,
    is_premium: row.is_premium,
    required_vip_tier_id: row.required_vip_tier_id,
    coin_price: row.coin_price,
    is_active: row.is_active,
  })
  errors.value = {}
  themeDialog.value = true
}

async function saveTheme() {
  saving.value = true
  errors.value = {}

  const body = {
    name: themeForm.name,
    background_url: themeForm.background_url,
    preview_url: themeForm.preview_url,
    is_premium: themeForm.is_premium,
    required_vip_tier_id: themeForm.is_premium ? themeForm.required_vip_tier_id : null,
    coin_price: themeForm.coin_price,
    is_active: themeForm.is_active,
  }

  try {
    if (themeForm.id === null) {
      const { data } = await api.post<{ id: number }>('/admin/room-themes', body)

      if (themeBackgroundUpload.value?.hasPendingFile) await themeBackgroundUpload.value.uploadNow(data.id)
      if (themePreviewUpload.value?.hasPendingFile) await themePreviewUpload.value.uploadNow(data.id)

      ElMessage.success('Theme created')
    } else {
      await api.patch(`/admin/room-themes/${themeForm.id}`, body)
      ElMessage.success('Theme updated')
    }
    themeDialog.value = false
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

function newTemplate() {
  Object.assign(templateForm, { id: null, name: '', total_seats: 8, vip_positions: [], is_active: true })
  errors.value = {}
  templateDialog.value = true
}

function editTemplate(row: RoomSeatTemplateRow) {
  Object.assign(templateForm, {
    id: row.id,
    name: row.name,
    total_seats: row.total_seats,
    vip_positions: [...row.vip_positions],
    is_active: row.is_active,
  })
  errors.value = {}
  templateDialog.value = true
}

async function saveTemplate() {
  saving.value = true
  errors.value = {}

  const body = {
    name: templateForm.name,
    total_seats: templateForm.total_seats,
    vip_positions: templateForm.vip_positions,
    is_active: templateForm.is_active,
  }

  try {
    if (templateForm.id === null) {
      await api.post('/admin/room-seat-templates', body)
      ElMessage.success('Seat template created')
    } else {
      await api.patch(`/admin/room-seat-templates/${templateForm.id}`, body)
      ElMessage.success('Seat template updated')
    }
    templateDialog.value = false
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

async function removeTemplate(row: RoomSeatTemplateRow) {
  try {
    await ElMessageBox.confirm(`Delete “${row.name}”?`, 'Delete seat template', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await api.del(`/admin/room-seat-templates/${row.id}`)
    ElMessage.success('Seat template deleted')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}
</script>

<template>
  <PageHead
    eyebrow="Platform"
    title="Room catalogue"
    lede="The categories and themes the app offers. A category that does not exist here cannot be chosen in the app."
  >
    <template #actions>
      <el-button
        v-permission="'rooms.theme_manage'"
        type="primary"
        size="small"
        @click="tab === 'categories' ? newCategory() : tab === 'themes' ? newTheme() : newTemplate()"
      >
        Add {{ tab === 'categories' ? 'category' : tab === 'themes' ? 'theme' : 'seat template' }}
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs :model-value="tab" @update:model-value="tab = $event as 'categories' | 'themes' | 'seats'">
      <el-tab-pane :label="`Categories (${categories.length})`" name="categories">
        <el-table :data="categories" style="width: 100%">
          <el-table-column label="Name" min-width="200">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <div class="font-medium">{{ row.name_en }}</div>
              <div class="text-[13px] text-[var(--color-legend)]">{{ row.name_hi ?? '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Key" width="140">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <span class="key">{{ row.key }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Order" width="90" align="right">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <span class="key text-[var(--color-legend)]">{{ row.sort_order }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Rooms" width="90" align="right">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <span class="key text-[var(--color-legend)]">{{ row.room_count }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Status" width="110">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? 'active' : 'hidden' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="" width="160" align="right">
            <template #default="{ row }: { row: RoomCategoryRow }">
              <el-button v-permission.disable="'rooms.theme_manage'" size="small" @click="editCategory(row)">
                Edit
              </el-button>
              <el-button
                v-permission.disable="'rooms.theme_manage'"
                size="small"
                type="danger"
                plain
                :disabled="row.room_count > 0"
                :title="row.room_count > 0 ? 'Rooms still use this — deactivate it instead' : ''"
                @click="removeCategory(row)"
              >
                Delete
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`Themes (${themes.length})`" name="themes">
        <el-table :data="themes" style="width: 100%">
          <el-table-column label="Name" min-width="180">
            <template #default="{ row }: { row: RoomThemeRow }">
              <div class="font-medium">{{ row.name }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Access" width="170">
            <template #default="{ row }: { row: RoomThemeRow }">
              <el-tag v-if="!row.is_premium" size="small" type="info">free</el-tag>
              <template v-else>
                <el-tag type="warning" size="small">premium</el-tag>
                <span v-if="row.required_vip_tier_id" class="key ml-1 text-[var(--color-legend)]">
                  {{ vipTierLabel(row.required_vip_tier_id) }}+
                </span>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="Price" width="120" align="right">
            <template #default="{ row }: { row: RoomThemeRow }">
              <span class="key">{{ row.coin_price ? row.coin_price.toLocaleString() : '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Rooms" width="90" align="right">
            <template #default="{ row }: { row: RoomThemeRow }">
              <span class="key text-[var(--color-legend)]">{{ row.room_count }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Status" width="110">
            <template #default="{ row }: { row: RoomThemeRow }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? 'active' : 'hidden' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="" width="100" align="right">
            <template #default="{ row }: { row: RoomThemeRow }">
              <el-button v-permission.disable="'rooms.theme_manage'" size="small" @click="editTheme(row)">
                Edit
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <p class="eyebrow mt-3 leading-relaxed">
          VIP gating is stored here and enforced by the app. Tier definitions arrive with the
          VIP module, so the tier number is currently free text rather than a picker.
        </p>
      </el-tab-pane>

      <el-tab-pane :label="`Seat templates (${seatTemplates.length})`" name="seats">
        <el-table :data="seatTemplates" style="width: 100%">
          <el-table-column label="Name" min-width="200">
            <template #default="{ row }: { row: RoomSeatTemplateRow }">
              <div class="font-medium">{{ row.name }}</div>
            </template>
          </el-table-column>
          <el-table-column label="Seats" width="90" align="right">
            <template #default="{ row }: { row: RoomSeatTemplateRow }">
              <span class="key">{{ row.total_seats }}</span>
            </template>
          </el-table-column>
          <el-table-column label="VIP positions" min-width="180">
            <template #default="{ row }: { row: RoomSeatTemplateRow }">
              <span v-if="row.vip_positions.length === 0" class="text-[13px] text-[var(--color-legend)]">
                none
              </span>
              <div v-else class="flex flex-wrap gap-1">
                <el-tag v-for="p in row.vip_positions" :key="p" type="warning" size="small">{{ p }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="Status" width="110">
            <template #default="{ row }: { row: RoomSeatTemplateRow }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? 'active' : 'hidden' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="" width="160" align="right">
            <template #default="{ row }: { row: RoomSeatTemplateRow }">
              <el-button v-permission.disable="'rooms.theme_manage'" size="small" @click="editTemplate(row)">
                Edit
              </el-button>
              <el-button
                v-permission.disable="'rooms.theme_manage'"
                size="small"
                type="danger"
                plain
                @click="removeTemplate(row)"
              >
                Delete
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <p class="eyebrow mt-3 leading-relaxed">
          reusable layouts a future room-creation flow can offer instead of a free-typed
          number · a room's own seat count is unaffected by this catalogue either way
        </p>
      </el-tab-pane>
    </el-tabs>
  </div>

  <!-- Category -->
  <el-dialog v-model="categoryDialog" :title="categoryForm.id ? 'Edit category' : 'Add category'" width="420">
    <div class="space-y-3">
      <div v-if="categoryForm.id === null">
        <label class="eyebrow mb-1 block" for="cat-key">Key</label>
        <el-input id="cat-key" v-model="categoryForm.key" placeholder="poetry" />
        <p class="eyebrow mt-1">lowercase, no spaces · permanent once created</p>
        <p v-if="errors.key" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.key }}</p>
      </div>
      <div>
        <label class="eyebrow mb-1 block" for="cat-en">Name (English)</label>
        <el-input id="cat-en" v-model="categoryForm.name_en" @input="categoryHindi.onEnglishInput" />
        <p v-if="errors.name_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name_en }}</p>
      </div>
      <div>
        <label class="eyebrow mb-1 block" for="cat-hi">Name (Hindi)</label>
        <el-input id="cat-hi" v-model="categoryForm.name_hi" placeholder="कविता" />
      </div>
      <div>
        <label class="eyebrow mb-1 block">Sort order</label>
        <el-input-number v-model="categoryForm.sort_order" :min="0" :max="999" :step="10" />
      </div>
      <el-checkbox v-model="categoryForm.is_active" size="small">
        Offer this in the app
      </el-checkbox>
    </div>

    <template #footer>
      <el-button @click="categoryDialog = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!categoryForm.name_en || (categoryForm.id === null && !categoryForm.key)"
        @click="saveCategory"
      >
        Save
      </el-button>
    </template>
  </el-dialog>

  <!-- Theme -->
  <el-dialog v-model="themeDialog" :title="themeForm.id ? 'Edit theme' : 'Add theme'" width="420">
    <div class="space-y-3">
      <div>
        <label class="eyebrow mb-1 block" for="theme-name">Name</label>
        <el-input id="theme-name" v-model="themeForm.name" />
        <p v-if="errors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name }}</p>
      </div>

      <ImageUpload
        ref="themeBackgroundUpload"
        v-model="themeForm.background_url"
        upload-url="/admin/room-themes/background"
        label="Background image"
        :record-id="themeForm.id"
        @saved="load"
      />

      <ImageUpload
        ref="themePreviewUpload"
        v-model="themeForm.preview_url"
        upload-url="/admin/room-themes/preview"
        label="Preview image"
        :record-id="themeForm.id"
        @saved="load"
      />

      <el-checkbox v-model="themeForm.is_premium" size="small">Premium theme</el-checkbox>

      <template v-if="themeForm.is_premium">
        <div>
          <label class="eyebrow mb-1 block">Minimum VIP tier</label>
          <el-select
            v-model="themeForm.required_vip_tier_id"
            clearable
            placeholder="No tier requirement"
            class="w-full"
          >
            <el-option
              v-for="t in vipTiers"
              :key="t.id"
              :label="`VIP ${t.level} — ${t.name_en}`"
              :value="t.id"
            />
          </el-select>
          <p class="eyebrow mt-1">leave unset to sell it without a tier requirement</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Price in coins</label>
          <el-input-number v-model="themeForm.coin_price" :min="0" :step="500" />
        </div>
      </template>

      <el-checkbox v-model="themeForm.is_active" size="small">Offer this in the app</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="themeDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" :disabled="!themeForm.name" @click="saveTheme">
        Save
      </el-button>
    </template>
  </el-dialog>

  <!-- Seat template -->
  <el-dialog v-model="templateDialog" :title="templateForm.id ? 'Edit seat template' : 'Add seat template'" width="460">
    <div class="space-y-3">
      <div>
        <label class="eyebrow mb-1 block" for="tpl-name">Name</label>
        <el-input id="tpl-name" v-model="templateForm.name" placeholder="12 seats — 2 VIP" />
        <p v-if="errors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name }}</p>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Total seats</label>
        <el-input-number v-model="templateForm.total_seats" :min="2" :max="50" />
        <p v-if="errors.total_seats" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.total_seats }}</p>
      </div>

      <div>
        <div class="eyebrow mb-2">VIP positions — click to toggle</div>
        <div class="grid grid-cols-8 gap-1.5">
          <button
            v-for="position in templatePositions"
            :key="position"
            type="button"
            class="flex h-7 items-center justify-center border text-[12px] transition-colors"
            :class="
              templateForm.vip_positions.includes(position)
                ? 'border-[var(--color-signal)] bg-[var(--color-signal)] text-[var(--color-ink)]'
                : 'border-[var(--color-edge-bright)] hover:border-[var(--color-legend)]'
            "
            style="border-radius: 3px"
            @click="toggleTemplatePosition(position)"
          >
            {{ position }}
          </button>
        </div>
        <p class="eyebrow mt-1">{{ templateForm.vip_positions.length }} of {{ templateForm.total_seats }} marked VIP</p>
      </div>

      <el-checkbox v-model="templateForm.is_active" size="small">Offer this template</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="templateDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" :disabled="!templateForm.name" @click="saveTemplate">
        Save
      </el-button>
    </template>
  </el-dialog>
</template>
