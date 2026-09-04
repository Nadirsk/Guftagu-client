<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref, toRef } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import ImageUpload from '@/components/ImageUpload.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useHindiAutofill } from '@/lib/translate'
import type { GiftCategoryRow, GiftRow, GiftTier, VipTiersResult } from '@/types/api'

/** GFT-063 — the gift manager. */
const gifts = ref<GiftRow[]>([])
const categories = ref<GiftCategoryRow[]>([])
const vipTiers = ref<VipTiersResult['tiers']>([])
const loading = ref(true)
const total = ref(0)

const filters = reactive({
  q: '',
  category: '' as '' | number,
  tier: '' as '' | GiftTier,
  state: '' as '' | 'available' | 'sold_out' | 'scheduled' | 'inactive',
})

const dialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const thumbnailUpload = ref<InstanceType<typeof ImageUpload> | null>(null)
const iconUpload = ref<InstanceType<typeof ImageUpload> | null>(null)

const form = reactive({
  id: null as number | null,
  code: '',
  name_en: '',
  name_hi: '',
  category_id: null as number | null,
  tier: 'basic' as GiftTier,
  coin_price: 100,
  diamond_value: 50,
  thumbnail_url: null as string | null,
  is_fullscreen: false,
  is_combo_enabled: true,
  required_vip_tier_id: null as number | null,
  is_limited: false,
  stock: 0,
  available_from: '' as string,
  available_to: '' as string,
  is_active: true,
})
const giftHindi = useHindiAutofill(toRef(form, 'name_hi'))

// -------------------------------------------------------------- categories
const categoryDialog = ref(false)
const savingCategory = ref<number | 'new' | null>(null)
const categoryErrors = ref<Record<string, string>>({})
const categoryForm = reactive({
  id: null as number | null,
  key: '',
  name_en: '',
  name_hi: '',
  icon_url: null as string | null,
  sort_order: 0,
  is_active: true,
})
const giftCategoryHindi = useHindiAutofill(toRef(categoryForm, 'name_hi'))

function openCategories() {
  categoryDialog.value = true
}

function newCategory() {
  Object.assign(categoryForm, {
    id: null, key: '', name_en: '', name_hi: '', icon_url: null, sort_order: 0, is_active: true,
  })
  categoryErrors.value = {}
}

function editCategory(category: GiftCategoryRow) {
  Object.assign(categoryForm, {
    id: category.id,
    key: category.key,
    name_en: category.name_en,
    name_hi: category.name_hi ?? '',
    icon_url: category.icon_url,
    sort_order: category.sort_order,
    is_active: category.is_active,
  })
  categoryErrors.value = {}
}

async function saveCategory() {
  savingCategory.value = categoryForm.id ?? 'new'
  categoryErrors.value = {}

  const body = {
    name_en: categoryForm.name_en,
    name_hi: categoryForm.name_hi || null,
    icon_url: categoryForm.icon_url,
    sort_order: categoryForm.sort_order,
    is_active: categoryForm.is_active,
  }

  try {
    if (categoryForm.id === null) {
      const { data } = await api.post<{ id: number }>('/admin/gift-categories', { ...body, key: categoryForm.key })

      if (iconUpload.value?.hasPendingFile) {
        await iconUpload.value.uploadNow(data.id)
      }

      ElMessage.success('Category created')
    } else {
      await api.patch(`/admin/gift-categories/${categoryForm.id}`, body)
      ElMessage.success('Category updated')
    }
    await loadRefs()
    newCategory()
  } catch (e) {
    if (e instanceof ApiError) {
      categoryErrors.value = e.fieldErrors
      if (!Object.keys(categoryErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    savingCategory.value = null
  }
}

const TIERS: GiftTier[] = ['basic', 'premium', 'luxury', 'legendary']

onMounted(async () => {
  await Promise.all([load(), loadRefs()])
  loading.value = false
})

async function loadRefs() {
  try {
    const [c, v] = await Promise.all([
      api.get<GiftCategoryRow[]>('/admin/gift-categories', { include_inactive: true }),
      api.get<VipTiersResult>('/admin/vip-tiers').catch(() => null),
    ])
    categories.value = c.data
    vipTiers.value = v?.data.tiers ?? []
  } catch {
    /* filters degrade to empty rather than blocking the page */
  }
}

async function load() {
  try {
    const { data, meta } = await api.get<GiftRow[]>('/admin/gifts', {
      q: filters.q || undefined,
      category: filters.category || undefined,
      tier: filters.tier || undefined,
      state: filters.state || undefined,
      per_page: 60,
    })
    gifts.value = data
    total.value = meta.total ?? data.length
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function create() {
  Object.assign(form, {
    id: null, code: '', name_en: '', name_hi: '', category_id: null, tier: 'basic',
    coin_price: 100, diamond_value: 50, thumbnail_url: null, is_fullscreen: false, is_combo_enabled: true,
    required_vip_tier_id: null, is_limited: false, stock: 0,
    available_from: '', available_to: '', is_active: true,
  })
  errors.value = {}
  dialog.value = true
}

function edit(gift: GiftRow) {
  Object.assign(form, {
    id: gift.id,
    code: gift.code,
    name_en: gift.name_en,
    name_hi: gift.name_hi ?? '',
    category_id: gift.category?.id ?? null,
    tier: gift.tier,
    coin_price: gift.coin_price,
    diamond_value: gift.diamond_value,
    thumbnail_url: gift.thumbnail_url,
    is_fullscreen: gift.is_fullscreen,
    is_combo_enabled: gift.max_combo > 1,
    required_vip_tier_id: gift.vip_tier?.id ?? null,
    is_limited: gift.is_limited,
    stock: gift.stock ?? 0,
    available_from: gift.available_from ?? '',
    available_to: gift.available_to ?? '',
    is_active: gift.is_active,
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}

  const body: Record<string, unknown> = {
    name_en: form.name_en,
    name_hi: form.name_hi || null,
    category_id: form.category_id,
    tier: form.tier,
    coin_price: form.coin_price,
    diamond_value: form.diamond_value,
    thumbnail_url: form.thumbnail_url,
    is_fullscreen: form.is_fullscreen,
    is_combo_enabled: form.is_combo_enabled,
    required_vip_tier_id: form.required_vip_tier_id,
    is_limited: form.is_limited,
    available_from: form.available_from || null,
    available_to: form.available_to || null,
    is_active: form.is_active,
  }

  // Only send stock for a limited drop — the API nulls it otherwise, and sending a number
  // alongside is_limited:false is a contradiction.
  if (form.is_limited) body.stock = form.stock

  try {
    if (form.id === null) {
      // The gift has to exist before a thumbnail can be uploaded onto it — the
      // upload endpoint requires an id, the same way mehfil's and Trumac's do.
      const { data } = await api.post<GiftRow>('/admin/gifts', { ...body, code: form.code })

      if (thumbnailUpload.value?.hasPendingFile) {
        await thumbnailUpload.value.uploadNow(data.id)
      }

      ElMessage.success('Gift created — it is in the app catalogue now')
    } else {
      await api.patch(`/admin/gifts/${form.id}`, body)
      ElMessage.success('Gift updated')
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

async function restock(gift: GiftRow) {
  let value: string
  try {
    const result = await ElMessageBox.prompt(
      `How many of “${gift.name_en}” should exist? Set 0 to take it off sale.`,
      'Set stock',
      { confirmButtonText: 'Save', cancelButtonText: 'Cancel', inputValue: String(gift.stock ?? 0) },
    )
    value = result.value
  } catch {
    return
  }

  try {
    await api.post(`/admin/gifts/${gift.id}/restock`, { stock: Number(value) })
    ElMessage.success('Stock updated')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function deactivate(gift: GiftRow) {
  try {
    await ElMessageBox.confirm(
      'The gift leaves the app catalogue. It is not deleted — past sends still reference it.',
      `Deactivate “${gift.name_en}”?`,
      { confirmButtonText: 'Deactivate', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    const { message } = await api.del(`/admin/gifts/${gift.id}`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

// 'premium' deliberately has no entry — Element Plus's ElTag only accepts
// primary/success/info/warning/danger, not '', so the plain (typeless) look for it
// comes from omitting the prop entirely rather than passing an invalid empty string.
const tierTone: Partial<Record<GiftTier, 'success' | 'warning' | 'danger' | 'info'>> = {
  basic: 'info',
  luxury: 'warning',
  legendary: 'danger',
}

/** Says which of the three reasons applies, rather than a bare "unavailable". */
function stateLabel(gift: GiftRow): { text: string; tone: 'success' | 'info' | 'warning' | 'danger' } {
  if (!gift.is_active) return { text: 'inactive', tone: 'info' }
  if (gift.state.sold_out) return { text: 'sold out', tone: 'danger' }
  if (!gift.state.in_window) {
    const upcoming = gift.available_from && new Date(gift.available_from) > new Date()
    return { text: upcoming ? 'scheduled' : 'window ended', tone: 'warning' }
  }
  return { text: 'on sale', tone: 'success' }
}

function money(value: number): string {
  return value.toLocaleString()
}

/** The platform's cut on a send, which is what the coin/diamond spread means. */
const margin = computed(() => (gift: GiftRow) =>
  gift.coin_price > 0 ? Math.round((1 - gift.diamond_value / gift.coin_price) * 100) : 0,
)
</script>

<template>
  <PageHead
    eyebrow="Store"
    title="Gifts"
    :lede="`${total} gifts. Saving one updates the app catalogue immediately rather than waiting out the cache.`"
  >
    <template #actions>
      <el-button v-permission="'gifts.category_manage'" size="small" @click="openCategories">
        Manage categories
      </el-button>
      <el-button v-permission="'gifts.manage'" type="primary" size="small" @click="create">
        Add gift
      </el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-input v-model="filters.q" placeholder="Name or code" clearable class="w-full sm:w-56" @change="load" />
      <el-select v-model="filters.category" placeholder="Any category" clearable class="w-40" @change="load">
        <el-option v-for="c in categories" :key="c.id" :label="c.name_en" :value="c.id" />
      </el-select>
      <el-select v-model="filters.tier" placeholder="Any tier" clearable class="w-36" @change="load">
        <el-option v-for="t in TIERS" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select v-model="filters.state" placeholder="Any state" clearable class="w-40" @change="load">
        <el-option label="On sale" value="available" />
        <el-option label="Sold out" value="sold_out" />
        <el-option label="Scheduled" value="scheduled" />
        <el-option label="Inactive" value="inactive" />
      </el-select>
    </div>

    <div v-loading="loading">
      <EmptyState
        v-if="!loading && gifts.length === 0"
        title="No gifts match that"
        body="Clear the filters, or add the first gift for this category."
      />

      <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article v-for="gift in gifts" :key="gift.id" class="panel flex flex-col">
          <div class="flex-1 px-4 pt-3 pb-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2.5">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
                  style="border-radius: 4px"
                >
                  <img v-if="gift.thumbnail_url" :src="gift.thumbnail_url" alt="" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0">
                  <div class="truncate text-[14px] font-semibold">{{ gift.name_en }}</div>
                  <div class="key mt-0.5 text-[var(--color-legend)]">{{ gift.code }}</div>
                </div>
              </div>
              <el-tag :type="stateLabel(gift).tone" size="small">{{ stateLabel(gift).text }}</el-tag>
            </div>

            <div class="mt-3 flex items-end gap-5">
              <div>
                <div class="eyebrow">Costs</div>
                <div class="key text-[16px] leading-none">{{ money(gift.coin_price) }}</div>
                <div class="eyebrow mt-0.5">coins</div>
              </div>
              <div>
                <div class="eyebrow">Earns</div>
                <div class="key text-[16px] leading-none">{{ money(gift.diamond_value) }}</div>
                <div class="eyebrow mt-0.5">diamonds</div>
              </div>
              <div class="ml-auto text-right">
                <div class="eyebrow">Margin</div>
                <div class="key text-[16px] leading-none">{{ margin(gift) }}%</div>
              </div>
            </div>

            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <el-tag :type="tierTone[gift.tier] ?? undefined" size="small">{{ gift.tier }}</el-tag>
              <el-tag v-if="gift.category" size="small" type="info">{{ gift.category.name }}</el-tag>
              <el-tag v-if="gift.vip_tier" type="warning" size="small">VIP {{ gift.vip_tier.level }}+</el-tag>
              <el-tag v-if="gift.is_fullscreen" size="small" type="info">fullscreen</el-tag>
              <el-tag v-if="gift.is_limited" size="small" :type="gift.state.sold_out ? 'danger' : 'warning'">
                {{ gift.stock ?? 0 }} left
              </el-tag>
            </div>

            <p v-if="!gift.animation_url" class="eyebrow mt-2">
              no animation yet · artwork is a client input (CI-06)
            </p>
          </div>

          <div class="flex gap-2 border-t border-[var(--color-edge)] px-4 py-2">
            <el-button v-permission="'gifts.manage'" size="small" @click="edit(gift)">Edit</el-button>
            <el-button
              v-if="gift.is_limited"
              v-permission="'gifts.drop_manage'"
              size="small"
              @click="restock(gift)"
            >
              Stock
            </el-button>
            <el-button
              v-if="gift.is_active"
              v-permission="'gifts.manage'"
              class="ml-auto"
              size="small"
              type="danger"
              plain
              @click="deactivate(gift)"
            >
              Deactivate
            </el-button>
          </div>
        </article>
      </div>
    </div>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? 'Edit gift' : 'Add gift'" width="520">
    <div class="space-y-3">
      <div v-if="form.id === null">
        <label class="eyebrow mb-1 block" for="g-code">Code</label>
        <el-input id="g-code" v-model="form.code" placeholder="sports_car" />
        <p class="eyebrow mt-1">lowercase and underscores · permanent once created</p>
        <p v-if="errors.code" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.code }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block" for="g-en">Name (English)</label>
          <el-input id="g-en" v-model="form.name_en" @input="giftHindi.onEnglishInput" />
          <p v-if="errors.name_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name_en }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block" for="g-hi">Name (Hindi)</label>
          <el-input id="g-hi" v-model="form.name_hi" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Category</label>
          <el-select v-model="form.category_id" clearable class="w-full">
            <el-option v-for="c in categories" :key="c.id" :label="c.name_en" :value="c.id" />
          </el-select>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Tier</label>
          <el-select v-model="form.tier" class="w-full">
            <el-option v-for="t in TIERS" :key="t" :label="t" :value="t" />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Costs (coins)</label>
          <el-input-number v-model="form.coin_price" :min="1" :step="100" :precision="0" class="w-full" />
          <p v-if="errors.coin_price" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.coin_price }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Earns (diamonds)</label>
          <el-input-number v-model="form.diamond_value" :min="0" :step="50" :precision="0" class="w-full" />
        </div>
      </div>

      <p class="eyebrow">
        whole numbers only · the gap between the two is the platform's margin
      </p>

      <ImageUpload
        ref="thumbnailUpload"
        v-model="form.thumbnail_url"
        upload-url="/admin/gifts/thumbnail"
        label="Thumbnail"
        :record-id="form.id"
        @saved="load"
      />

      <div class="grid grid-cols-2 gap-3 border-t border-[var(--color-edge)] pt-3">
        <el-checkbox v-model="form.is_fullscreen" size="small">Fullscreen animation</el-checkbox>
        <el-checkbox v-model="form.is_combo_enabled" size="small">Allow combos</el-checkbox>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Minimum VIP tier</label>
        <el-select v-model="form.required_vip_tier_id" clearable placeholder="Anyone can send it" class="w-full">
          <el-option
            v-for="t in vipTiers"
            :key="t.id"
            :label="`VIP ${t.level} — ${t.name_en}`"
            :value="t.id"
          />
        </el-select>
      </div>

      <div class="border-t border-[var(--color-edge)] pt-3">
        <el-checkbox v-model="form.is_limited" size="small">Limited drop</el-checkbox>

        <div v-if="form.is_limited" class="mt-3 space-y-3">
          <div>
            <label class="eyebrow mb-1 block">How many exist</label>
            <el-input-number v-model="form.stock" :min="0" :step="100" :precision="0" />
            <p class="eyebrow mt-1">
              sends stop the moment this hits zero — it cannot oversell
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="eyebrow mb-1 block">On sale from</label>
              <el-date-picker
                v-model="form.available_from"
                type="datetime"
                placeholder="Immediately"
                value-format="YYYY-MM-DDTHH:mm:ss"
                class="w-full"
              />
            </div>
            <div>
              <label class="eyebrow mb-1 block">until</label>
              <el-date-picker
                v-model="form.available_to"
                type="datetime"
                placeholder="No end"
                value-format="YYYY-MM-DDTHH:mm:ss"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <el-checkbox v-model="form.is_active" size="small">Offer this in the app</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.name_en || (form.id === null && !form.code)"
        @click="save"
      >
        Save
      </el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="categoryDialog" title="Gift categories" width="620" @close="newCategory">
    <div class="grid gap-4 md:grid-cols-[1fr_220px]">
      <div class="panel max-h-[420px] overflow-y-auto">
        <div v-if="categories.length === 0" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
          No categories yet.
        </div>
        <ul v-else class="divide-y divide-[var(--color-edge)]">
          <li
            v-for="category in categories"
            :key="category.id"
            class="flex items-center gap-3 px-3 py-2.5"
            :class="category.is_active ? '' : 'opacity-50'"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
              style="border-radius: 4px"
            >
              <img v-if="category.icon_url" :src="category.icon_url" alt="" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-medium">{{ category.name_en }}</div>
              <div class="key text-[var(--color-legend)]">{{ category.key }} · {{ category.gift_count }} gifts</div>
            </div>
            <el-button size="small" @click="editCategory(category)">Edit</el-button>
          </li>
        </ul>
      </div>

      <div class="space-y-3">
        <div class="eyebrow">{{ categoryForm.id ? 'Edit category' : 'New category' }}</div>

        <div v-if="categoryForm.id === null">
          <label class="eyebrow mb-1 block" for="c-key">Key</label>
          <el-input id="c-key" v-model="categoryForm.key" placeholder="seasonal" />
          <p class="eyebrow mt-1">lowercase and underscores · permanent</p>
          <p v-if="categoryErrors.key" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ categoryErrors.key }}</p>
        </div>

        <div>
          <label class="eyebrow mb-1 block" for="c-en">Name (English)</label>
          <el-input id="c-en" v-model="categoryForm.name_en" @input="giftCategoryHindi.onEnglishInput" />
          <p v-if="categoryErrors.name_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ categoryErrors.name_en }}</p>
        </div>

        <div>
          <label class="eyebrow mb-1 block" for="c-hi">Name (Hindi)</label>
          <el-input id="c-hi" v-model="categoryForm.name_hi" />
        </div>

        <ImageUpload
          ref="iconUpload"
          v-model="categoryForm.icon_url"
          upload-url="/admin/gift-categories/icon"
          label="Icon"
          :record-id="categoryForm.id"
          @saved="loadRefs"
        />

        <div>
          <label class="eyebrow mb-1 block">Sort order</label>
          <el-input-number v-model="categoryForm.sort_order" :min="0" class="w-full" />
        </div>

        <el-checkbox v-model="categoryForm.is_active" size="small">Offer this category</el-checkbox>

        <div class="flex gap-2 pt-1">
          <el-button
            type="primary"
            size="small"
            :loading="savingCategory !== null"
            :disabled="!categoryForm.name_en || (categoryForm.id === null && !categoryForm.key)"
            @click="saveCategory"
          >
            Save
          </el-button>
          <el-button v-if="categoryForm.id !== null" size="small" @click="newCategory">New</el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="categoryDialog = false">Close</el-button>
    </template>
  </el-dialog>
</template>
