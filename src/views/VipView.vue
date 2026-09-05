<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref, toRef } from 'vue'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import { useHindiAutofill } from '@/lib/translate'
import type { CosmeticsResult, VipTierRow, VipTiersResult } from '@/types/api'

/** GFT-064 (tier editor with a privileges matrix) and GFT-065 (cosmetics). */
const tiers = ref<VipTierRow[]>([])
const privileges = ref<VipTiersResult['privilege_catalogue']>([])
const cosmetics = ref<CosmeticsResult | null>(null)

const loading = ref(true)
const tab = ref<'tiers' | 'cosmetics'>('tiers')
const saving = ref<number | 'new' | null>(null)

const dialog = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  id: null as number | null,
  level: 1,
  name_en: '',
  name_hi: '',
  monthly_rupees: 0,
  quarterly_rupees: 0,
  yearly_rupees: 0,
  coin_price: 0,
  privileges: [] as string[],
  is_active: true,
})
const tierHindi = useHindiAutofill(toRef(form, 'name_hi'))

onMounted(async () => {
  await Promise.all([loadTiers(), loadCosmetics()])
  loading.value = false
})

async function loadTiers() {
  try {
    const { data } = await api.get<VipTiersResult>('/admin/vip-tiers', { include_inactive: true })
    tiers.value = data.tiers
    privileges.value = data.privilege_catalogue
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadCosmetics() {
  try {
    const { data } = await api.get<CosmeticsResult>('/admin/cosmetics')
    cosmetics.value = data
  } catch {
    /* cosmetics tab simply stays empty */
  }
}

function create() {
  const nextLevel = tiers.value.length ? Math.max(...tiers.value.map((t) => t.level)) + 1 : 1
  Object.assign(form, {
    id: null, level: nextLevel, name_en: '', name_hi: '',
    monthly_rupees: 0, quarterly_rupees: 0, yearly_rupees: 0, coin_price: 0,
    privileges: [], is_active: true,
  })
  errors.value = {}
  dialog.value = true
}

function edit(tier: VipTierRow) {
  Object.assign(form, {
    id: tier.id,
    level: tier.level,
    name_en: tier.name_en,
    name_hi: tier.name_hi ?? '',
    // Paise are the stored truth; the form works in rupees and converts on save.
    monthly_rupees: tier.monthly_price_paise / 100,
    quarterly_rupees: tier.quarterly_price_paise / 100,
    yearly_rupees: tier.yearly_price_paise / 100,
    coin_price: tier.coin_price,
    privileges: [...tier.privileges],
    is_active: tier.is_active,
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = form.id ?? 'new'
  errors.value = {}

  const body = {
    name_en: form.name_en,
    name_hi: form.name_hi || null,
    // Rounded, because a fraction of a paisa is not money and the API rejects it.
    monthly_price_paise: Math.round(form.monthly_rupees * 100),
    quarterly_price_paise: Math.round(form.quarterly_rupees * 100),
    yearly_price_paise: Math.round(form.yearly_rupees * 100),
    coin_price: form.coin_price,
    privileges: form.privileges,
    is_active: form.is_active,
  }

  try {
    if (form.id === null) {
      await api.post('/admin/vip-tiers', { ...body, level: form.level })
      ElMessage.success('Tier created')
    } else {
      await api.patch(`/admin/vip-tiers/${form.id}`, body)
      ElMessage.success('Tier updated')
    }
    dialog.value = false
    await loadTiers()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = null
  }
}

/** Toggling a privilege straight from the matrix, without opening the dialog. */
async function togglePrivilege(tier: VipTierRow, key: string) {
  const next = tier.privileges.includes(key)
    ? tier.privileges.filter((p) => p !== key)
    : [...tier.privileges, key]

  saving.value = tier.id
  try {
    await api.patch(`/admin/vip-tiers/${tier.id}`, { privileges: next })
    tier.privileges = next
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    saving.value = null
  }
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}
</script>

<template>
  <PageHead
    eyebrow="Store"
    title="VIP &amp; cosmetics"
    lede="Tiers, what each one unlocks, and the frames, badges and entrance effects they gate."
  >
    <template #actions>
      <el-button v-permission="'vip.manage'" type="primary" size="small" @click="create">
        Add tier
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <p class="panel mb-4 border-l-2 border-l-[var(--color-signal)] px-3 py-2 text-[12px]">
      Prices here are placeholders. Real tier pricing is a client input the SoW does not contain
      (CI-02) — they live in the database precisely so no code changes when the real numbers land.
    </p>

    <el-tabs :model-value="tab" @update:model-value="tab = $event as 'tiers' | 'cosmetics'">
      <el-tab-pane :label="`Tiers (${tiers.length})`" name="tiers">
        <!-- The privileges matrix: tiers down, privileges across. -->
        <div class="panel overflow-x-auto">
          <table class="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr class="border-b border-[var(--color-edge)]">
                <th class="eyebrow px-3 py-2 text-left">Tier</th>
                <th class="eyebrow px-3 py-2 text-right">Monthly</th>
                <th
                  v-for="privilege in privileges"
                  :key="privilege.key"
                  class="eyebrow px-2 py-2 text-center"
                  :title="privilege.label"
                >
                  <span class="block max-w-[64px] leading-tight">{{ privilege.label }}</span>
                </th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="tier in tiers"
                :key="tier.id"
                class="border-b border-[var(--color-edge)]"
                :class="tier.is_active ? '' : 'opacity-50'"
              >
                <td class="px-3 py-2">
                  <div class="font-medium">{{ tier.name_en }}</div>
                  <div class="key text-[var(--color-legend)]">level {{ tier.level }}</div>
                </td>
                <td class="key px-3 py-2 text-right">{{ rupees(tier.monthly_price_paise) }}</td>

                <td
                  v-for="privilege in privileges"
                  :key="privilege.key"
                  class="px-2 py-2 text-center"
                >
                  <button
                    v-permission.disable="'vip.manage'"
                    type="button"
                    class="inline-flex h-5 w-5 items-center justify-center border transition-colors"
                    :class="
                      tier.privileges.includes(privilege.key)
                        ? 'border-[var(--color-signal)] bg-[var(--color-signal)]'
                        : 'border-[var(--color-edge-bright)] hover:border-[var(--color-legend)]'
                    "
                    style="border-radius: 2px"
                    :disabled="saving === tier.id"
                    :aria-pressed="tier.privileges.includes(privilege.key)"
                    :aria-label="`${privilege.label} for ${tier.name_en}`"
                    @click="togglePrivilege(tier, privilege.key)"
                  >
                    <svg
                      v-if="tier.privileges.includes(privilege.key)"
                      viewBox="0 0 10 10"
                      class="h-3 w-3"
                      fill="none"
                      stroke="var(--color-ink)"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </td>

                <td class="px-3 py-2 text-right">
                  <el-button v-permission.disable="'vip.manage'" size="small" @click="edit(tier)">
                    Edit
                  </el-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="eyebrow mt-3">
          click a cell to grant or remove a privilege · the list comes from the API, so it always
          matches what the app understands
        </p>
      </el-tab-pane>

      <el-tab-pane label="Badges" name="cosmetics">
        <p class="eyebrow mb-3 leading-relaxed">
          Frames, bubbles, entry banners and entrance effects moved to
          <RouterLink to="/store" class="underline">Store</RouterLink> — they are purchasable
          catalogue items now. Badges stay here: the app awards them automatically, they are
          never bought.
        </p>
        <div class="panel">
          <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Badges ({{ cosmetics?.badges.length ?? 0 }})</div>
          </div>
          <ul v-if="cosmetics?.badges.length" class="divide-y divide-[var(--color-edge)]">
            <li v-for="badge in cosmetics.badges" :key="badge.id" class="px-4 py-2.5">
              <div class="text-[13px]">{{ badge.name_en }}</div>
              <div class="key text-[var(--color-legend)]">{{ badge.key }}</div>
            </li>
          </ul>
          <p v-else class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
            No badges defined.
          </p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? 'Edit VIP tier' : 'Add VIP tier'" width="460">
    <div class="space-y-3">
      <div v-if="form.id === null">
        <label class="eyebrow mb-1 block">Level</label>
        <el-input-number v-model="form.level" :min="1" :max="20" />
        <p class="eyebrow mt-1">unique · higher means more privileges</p>
        <p v-if="errors.level" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.level }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block" for="v-en">Name (English)</label>
          <el-input id="v-en" v-model="form.name_en" @input="tierHindi.onEnglishInput" />
          <p v-if="errors.name_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.name_en }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block" for="v-hi">Name (Hindi)</label>
          <el-input id="v-hi" v-model="form.name_hi" />
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 border-t border-[var(--color-edge)] pt-3">
        <div>
          <label class="eyebrow mb-1 block">Monthly ₹</label>
          <el-input-number v-model="form.monthly_rupees" :min="0" :step="100" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Quarterly ₹</label>
          <el-input-number v-model="form.quarterly_rupees" :min="0" :step="100" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Yearly ₹</label>
          <el-input-number v-model="form.yearly_rupees" :min="0" :step="500" class="w-full" />
        </div>
      </div>
      <p class="eyebrow">stored as paise, so ₹999 is exact — never a rounded float</p>

      <div class="border-t border-[var(--color-edge)] pt-3">
        <div class="eyebrow mb-2">Privileges</div>
        <el-checkbox-group v-model="form.privileges">
          <div class="grid grid-cols-2 gap-x-4 gap-y-1">
            <el-checkbox
              v-for="privilege in privileges"
              :key="privilege.key"
              :value="privilege.key"
              size="small"
            >
              {{ privilege.label }}
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>

      <el-checkbox v-model="form.is_active" size="small">Offer this tier in the app</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="saving !== null" :disabled="!form.name_en" @click="save">
        Save
      </el-button>
    </template>
  </el-dialog>
</template>
