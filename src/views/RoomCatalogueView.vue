<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { RoomCategoryRow, RoomThemeRow } from '@/types/api'

/** GFT-045 — categories and themes. The catalogue the app reads from. */
const categories = ref<RoomCategoryRow[]>([])
const themes = ref<RoomThemeRow[]>([])
const loading = ref(true)
const tab = ref<'categories' | 'themes'>('categories')

const categoryDialog = ref(false)
const themeDialog = ref(false)
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

const themeForm = reactive({
  id: null as number | null,
  name: '',
  is_premium: false,
  required_vip_tier_id: null as number | null,
  coin_price: 0,
  is_active: true,
})

onMounted(async () => {
  await load()
  loading.value = false
})

async function load() {
  try {
    const [c, t] = await Promise.all([
      api.get<RoomCategoryRow[]>('/admin/room-categories', { include_inactive: true }),
      api.get<RoomThemeRow[]>('/admin/room-themes', { include_inactive: true }),
    ])
    categories.value = c.data
    themes.value = t.data
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
  Object.assign(themeForm, { id: null, name: '', is_premium: false, required_vip_tier_id: null, coin_price: 0, is_active: true })
  errors.value = {}
  themeDialog.value = true
}

function editTheme(row: RoomThemeRow) {
  Object.assign(themeForm, {
    id: row.id,
    name: row.name,
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
    is_premium: themeForm.is_premium,
    required_vip_tier_id: themeForm.is_premium ? themeForm.required_vip_tier_id : null,
    coin_price: themeForm.coin_price,
    is_active: themeForm.is_active,
  }

  try {
    if (themeForm.id === null) {
      await api.post('/admin/room-themes', body)
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
        @click="tab === 'categories' ? newCategory() : newTheme()"
      >
        Add {{ tab === 'categories' ? 'category' : 'theme' }}
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs :model-value="tab" @update:model-value="tab = $event as 'categories' | 'themes'">
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
                  VIP {{ row.required_vip_tier_id }}+
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
        <el-input id="cat-en" v-model="categoryForm.name_en" />
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
      <el-checkbox v-model="themeForm.is_premium" size="small">Premium theme</el-checkbox>

      <template v-if="themeForm.is_premium">
        <div>
          <label class="eyebrow mb-1 block">Minimum VIP tier</label>
          <el-input-number v-model="themeForm.required_vip_tier_id" :min="1" :max="10" />
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
</template>
