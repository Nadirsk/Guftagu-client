<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import PhonePreview from '@/components/PhonePreview.vue'
import { ApiError, api } from '@/lib/api'
import type {
  BlockType,
  EventBlock,
  EventRow,
  EventTierRow,
  RewardCatalogItemRow,
  RewardHandlerKey,
} from '@/types/api'

/**
 * The Event Builder — the admin side of `recharge_activity` and `weekly_star` (and any
 * future campaign event, since nothing here is specific to those two). Every screen is
 * composed as an ordered array of block *instances* (`event.layout`): pick a block,
 * order it, configure it, style it — the phone panel on the right renders that exact
 * array live. Rewards are lines from the shared reward catalog, so a brand new kind of
 * reward is a catalog row, not a code change.
 */
const route = useRoute()
const eventId = Number(route.params.id)

const BLOCK_PALETTE: Array<{ type: BlockType; label: string }> = [
  { type: 'banner', label: 'Banner' },
  { type: 'countdown', label: 'Countdown' },
  { type: 'my_progress_card', label: 'My progress card' },
  { type: 'tier_grid', label: 'Tier cards' },
  { type: 'tabs', label: 'Tabs' },
  { type: 'leaderboard_list', label: 'Leaderboard list' },
  { type: 'reward_bundle_card', label: 'Reward bundle cards' },
  { type: 'rules_button', label: 'Rules button' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'spacer', label: 'Spacer' },
]

const HANDLER_LABELS: Record<RewardHandlerKey, string> = {
  coins: 'Coins', diamonds: 'Diamonds', vip: 'VIP', frame: 'Frame',
  chat_bubble: 'Chat bubble', entry_effect: 'Entry effect', badge: 'Badge / Medal',
  manual: 'Manual (support fulfils it)',
}
const NEEDS_REF: RewardHandlerKey[] = ['vip', 'frame', 'chat_bubble', 'entry_effect', 'badge']
const NEEDS_VALUE: RewardHandlerKey[] = ['coins', 'diamonds']
const NEEDS_DURATION: RewardHandlerKey[] = ['vip', 'frame', 'chat_bubble', 'entry_effect', 'badge']

const event = ref<EventRow | null>(null)
const tiers = ref<EventTierRow[]>([])
const loading = ref(true)
const savingBasics = ref(false)

const basics = reactive({
  title_en: '',
  banner_url: '',
  starts_at: '',
  ends_at: '',
  is_featured: false,
  blocks: [] as EventBlock[],
})

const catalog = ref<RewardCatalogItemRow[]>([])
const storeItems = ref<Array<{ id: number; type: string; name: string }>>([])
const vipTiers = ref<Array<{ id: number; level: number; name_en: string }>>([])
const badges = ref<Array<{ id: number; name_en: string }>>([])

const tierDialog = ref(false)
const tierForm = reactive({
  tier_type: 'threshold' as 'threshold' | 'rank_range',
  period: '' as '' | 'daily' | 'weekly' | 'monthly',
  threshold_value: 300000,
  rank_from: 1,
  rank_to: 1,
  label: '',
  sort_order: 0,
})

const rewardDialog = ref(false)
const rewardTierId = ref<number | null>(null)
const rewardForm = reactive({
  reward_catalog_id: null as number | null,
  reward_value: null as number | null,
  duration_days: null as number | null,
  label: '',
})

const blockDialog = ref(false)
const editingBlock = ref<EventBlock | null>(null)

const catalogDialog = ref(false)
const catalogForm = reactive({
  id: null as number | null,
  name: '',
  handler_key: 'manual' as RewardHandlerKey,
  handler_ref_id: null as number | null,
  icon_url: '',
  description: '',
})

const isCampaign = computed(() => event.value?.is_campaign ?? false)
const isThresholdType = computed(() => event.value?.type === 'recharge_activity')
const isCustomType = computed(() => event.value?.type === 'custom')

const catalogRefOptions = computed(() => {
  if (catalogForm.handler_key === 'frame') return storeItems.value.filter((i) => i.type === 'frame').map((i) => ({ value: i.id, label: i.name }))
  if (catalogForm.handler_key === 'chat_bubble') return storeItems.value.filter((i) => i.type === 'bubble').map((i) => ({ value: i.id, label: i.name }))
  if (catalogForm.handler_key === 'entry_effect') return storeItems.value.filter((i) => i.type === 'entrance_effect').map((i) => ({ value: i.id, label: i.name }))
  if (catalogForm.handler_key === 'vip') return vipTiers.value.map((v) => ({ value: v.id, label: `VIP ${v.level} — ${v.name_en}` }))
  if (catalogForm.handler_key === 'badge') return badges.value.map((b) => ({ value: b.id, label: b.name_en }))
  return []
})

const activeCatalogItem = computed(() => catalog.value.find((c) => c.id === rewardForm.reward_catalog_id) ?? null)

onMounted(async () => {
  await Promise.all([load(), loadCatalog(), loadRefCatalogues()])
  loading.value = false
})

async function load() {
  try {
    const { data } = await api.get<{ event: EventRow }>(`/admin/events/${eventId}`)
    event.value = data.event
    Object.assign(basics, {
      title_en: data.event.title_en,
      banner_url: data.event.banner_url ?? '',
      starts_at: data.event.starts_at.slice(0, 19),
      ends_at: data.event.ends_at.slice(0, 19),
      is_featured: data.event.is_featured,
      blocks: data.event.layout.length ? data.event.layout : defaultBlocksFor(data.event.type),
    })

    const { data: tierRows } = await api.get<EventTierRow[]>(`/admin/events/${eventId}/tiers`)
    tiers.value = tierRows
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadCatalog() {
  try {
    const { data } = await api.get<{ items: RewardCatalogItemRow[] }>('/admin/reward-catalog')
    catalog.value = data.items
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function loadRefCatalogues() {
  try {
    const [items, vips, cosmetics] = await Promise.all([
      api.get<{ items: Array<{ id: number; type: string; name: string }> }>('/admin/store-items'),
      api.get<{ tiers: Array<{ id: number; level: number; name_en: string }> }>('/admin/vip-tiers'),
      api.get<{ badges: Array<{ id: number; name_en: string }> }>('/admin/cosmetics'),
    ])
    storeItems.value = items.data.items
    vipTiers.value = vips.data.tiers
    badges.value = cosmetics.data.badges
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function newBlockId(): string {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultConfigFor(type: BlockType): Record<string, unknown> {
  switch (type) {
    case 'countdown': return { target: 'cycle_end' }
    case 'my_progress_card': return { label_template: 'My {period} Recharge' }
    case 'tabs': return { labels: ['Tab A', 'Tab B'] }
    case 'leaderboard_list': return { visible_in_tab: null, max_rows: 10 }
    case 'reward_bundle_card': return { visible_in_tab: null }
    case 'rules_button': return { label: 'Rules' }
    case 'text': return { content: '', align: 'center' }
    case 'image': return { url: '', height: 120 }
    case 'spacer': return { height: 16 }
    default: return {}
  }
}

function defaultBlocksFor(type: string): EventBlock[] {
  const make = (t: BlockType, config: Record<string, unknown> = {}): EventBlock => ({
    id: newBlockId(), type: t, config: { ...defaultConfigFor(t), ...config }, style: {},
  })

  if (type === 'weekly_star') {
    return [
      make('banner'), make('countdown'), make('tabs', { labels: ['Ranking', 'Reward'] }),
      make('leaderboard_list', { visible_in_tab: 'a' }), make('reward_bundle_card', { visible_in_tab: 'b' }),
      make('rules_button'),
    ]
  }

  if (type === 'recharge_activity') {
    return [
      make('banner'), make('countdown'), make('my_progress_card'),
      make('tabs', { labels: ['Daily', 'Monthly'] }), make('tier_grid'), make('rules_button'),
    ]
  }

  // custom — a reasonable starting point either kind of tier renders sensibly from;
  // every block here can be freely removed/reordered/added-to below.
  return [make('banner'), make('countdown'), make('tier_grid'), make('reward_bundle_card'), make('rules_button')]
}

function addBlock(type: BlockType) {
  basics.blocks.push({ id: newBlockId(), type, config: defaultConfigFor(type), style: {} })
}

function moveBlock(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= basics.blocks.length) return
  const [block] = basics.blocks.splice(index, 1)
  basics.blocks.splice(target, 0, block)
}

function removeBlock(index: number) {
  basics.blocks.splice(index, 1)
}

function editBlock(block: EventBlock) {
  editingBlock.value = JSON.parse(JSON.stringify(block))
  blockDialog.value = true
}

function saveBlockEdit() {
  if (!editingBlock.value) return
  const index = basics.blocks.findIndex((b) => b.id === editingBlock.value!.id)
  if (index !== -1) basics.blocks[index] = editingBlock.value
  blockDialog.value = false
}

async function saveBasics() {
  savingBasics.value = true
  try {
    await api.patch(`/admin/events/${eventId}`, {
      title_en: basics.title_en,
      banner_url: basics.banner_url || null,
      starts_at: basics.starts_at,
      ends_at: basics.ends_at,
      is_featured: basics.is_featured,
      layout: basics.blocks,
    })
    ElMessage.success('Saved')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    savingBasics.value = false
  }
}

function openTierDialog() {
  Object.assign(tierForm, {
    tier_type: isCustomType.value ? tierForm.tier_type : (isThresholdType.value ? 'threshold' : 'rank_range'),
    period: '',
    threshold_value: 300000,
    rank_from: (tiers.value.at(-1)?.rank_to ?? 0) + 1,
    rank_to: (tiers.value.at(-1)?.rank_to ?? 0) + 1,
    label: '',
    sort_order: tiers.value.length + 1,
  })
  tierDialog.value = true
}

async function addTier() {
  const body: Record<string, unknown> = {
    tier_type: tierForm.tier_type,
    label: tierForm.label,
    sort_order: tierForm.sort_order,
    period: tierForm.period || null,
  }
  if (tierForm.tier_type === 'threshold') body.threshold_value = tierForm.threshold_value
  else {
    body.rank_from = tierForm.rank_from
    body.rank_to = tierForm.rank_to
  }

  try {
    await api.post(`/admin/events/${eventId}/tiers`, body)
    ElMessage.success('Tier added')
    tierDialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function removeTier(tier: EventTierRow) {
  try {
    await ElMessageBox.confirm(`Remove tier "${tier.label}"? Its reward bundle goes with it.`, 'Remove tier', {
      confirmButtonText: 'Remove', cancelButtonText: 'Cancel', type: 'warning',
    })
  } catch {
    return
  }

  try {
    await api.del(`/admin/events/${eventId}/tiers/${tier.id}`)
    ElMessage.success('Tier removed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function openRewardDialog(tierId: number) {
  rewardTierId.value = tierId
  Object.assign(rewardForm, { reward_catalog_id: null, reward_value: null, duration_days: null, label: '' })
  rewardDialog.value = true
}

async function addTierReward() {
  if (rewardTierId.value === null) return

  try {
    await api.post(`/admin/events/${eventId}/tiers/${rewardTierId.value}/rewards`, { ...rewardForm })
    ElMessage.success('Reward line added')
    rewardDialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function removeTierReward(tierId: number, rewardId: number) {
  try {
    await api.del(`/admin/events/${eventId}/tiers/${tierId}/rewards/${rewardId}`)
    ElMessage.success('Reward line removed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function openCatalogDialog(item: RewardCatalogItemRow | null = null) {
  Object.assign(catalogForm, item
    ? { id: item.id, name: item.name, handler_key: item.handler_key, handler_ref_id: item.handler_ref_id, icon_url: item.icon_url ?? '', description: item.description ?? '' }
    : { id: null, name: '', handler_key: 'manual', handler_ref_id: null, icon_url: '', description: '' })
  catalogDialog.value = true
}

async function saveCatalogItem() {
  const body = {
    name: catalogForm.name,
    handler_key: catalogForm.handler_key,
    handler_ref_id: NEEDS_REF.includes(catalogForm.handler_key) ? catalogForm.handler_ref_id : null,
    icon_url: catalogForm.icon_url || null,
    description: catalogForm.description || null,
  }

  try {
    if (catalogForm.id) await api.patch(`/admin/reward-catalog/${catalogForm.id}`, body)
    else await api.post('/admin/reward-catalog', body)
    ElMessage.success('Saved')
    catalogDialog.value = false
    await loadCatalog()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.fieldErrors.handler_ref_id ?? e.message)
  }
}

async function deleteCatalogItem(item: RewardCatalogItemRow) {
  try {
    const { message } = await api.del(`/admin/reward-catalog/${item.id}`)
    ElMessage.success(message)
    await loadCatalog()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function tierLabel(tier: EventTierRow): string {
  return tier.tier_type === 'threshold'
    ? `${tier.label} (${tier.threshold_value?.toLocaleString()} coins)`
    : `${tier.label} (#${tier.rank_from}${tier.rank_to !== tier.rank_from ? `–${tier.rank_to}` : ''})`
}

function rewardLabel(r: EventTierRow['rewards'][number]): string {
  const bits: string[] = []
  if (r.reward_value) bits.push(r.reward_value.toLocaleString())
  bits.push(r.label ?? r.catalog?.handler_ref_label ?? r.catalog?.name ?? 'Reward')
  if (r.duration_days) bits.push(`${r.duration_days}D`)
  return bits.join(' · ')
}

function blockLabel(type: BlockType): string {
  return BLOCK_PALETTE.find((b) => b.type === type)?.label ?? type
}
</script>

<template>
  <PageHead
    eyebrow="Engagement · Event Builder"
    :title="event?.title_en ?? `Event #${eventId}`"
    :lede="event ? `${event.type.replace('_', ' ')} · every block below is what the app renders from this event's config` : ''"
  >
    <template #actions>
      <el-button size="small" @click="openCatalogDialog()">Reward catalog</el-button>
      <RouterLink to="/events"><el-button size="small">Back</el-button></RouterLink>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <EmptyState v-if="!loading && !isCampaign" title="Not a campaign event" body="The builder only applies to Recharge Activity and Weekly Star events." />

    <div v-else-if="event" class="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div class="space-y-4">
        <!-- Basics -->
        <section class="panel p-4">
          <div class="eyebrow mb-3">Screen basics</div>
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="eyebrow mb-1 block">Title</label>
              <el-input v-model="basics.title_en" />
            </div>
            <div class="col-span-2">
              <label class="eyebrow mb-1 block">Banner image URL</label>
              <el-input v-model="basics.banner_url" placeholder="https://…" />
            </div>
            <div>
              <label class="eyebrow mb-1 block">Starts</label>
              <el-date-picker v-model="basics.starts_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" class="w-full" />
            </div>
            <div>
              <label class="eyebrow mb-1 block">Ends</label>
              <el-date-picker v-model="basics.ends_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" class="w-full" />
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between border-t border-[var(--color-edge)] pt-3">
            <el-checkbox v-model="basics.is_featured">Featured</el-checkbox>
            <el-button type="primary" size="small" :loading="savingBasics" @click="saveBasics">Save</el-button>
          </div>
        </section>

        <!-- Block builder -->
        <section class="panel">
          <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">Screen blocks, in order</div>
            <el-dropdown trigger="click" @command="addBlock">
              <el-button size="small" text>+ Add block</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="b in BLOCK_PALETTE" :key="b.type" :command="b.type">{{ b.label }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <p v-if="!basics.blocks.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
            No blocks — the app screen would render blank. Add one above.
          </p>

          <ul v-else class="divide-y divide-[var(--color-edge)]">
            <li v-for="(block, index) in basics.blocks" :key="block.id" class="flex items-center justify-between gap-2 px-4 py-2">
              <div class="flex items-center gap-2">
                <span
                  v-if="block.style.bg_color"
                  class="h-3 w-3 rounded-full border border-[var(--color-edge)]"
                  :style="{ backgroundColor: block.style.bg_color }"
                />
                <span class="key">{{ blockLabel(block.type) }}</span>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" class="eyebrow px-1 text-[var(--color-legend)] hover:text-[var(--color-signal)]" @click="moveBlock(index, -1)">↑</button>
                <button type="button" class="eyebrow px-1 text-[var(--color-legend)] hover:text-[var(--color-signal)]" @click="moveBlock(index, 1)">↓</button>
                <el-button size="small" text @click="editBlock(block)">Edit</el-button>
                <button type="button" class="eyebrow px-1 text-[var(--color-legend)] hover:text-[var(--color-cut)]" @click="removeBlock(index)">remove</button>
              </div>
            </li>
          </ul>

          <p class="eyebrow px-4 py-2">reordering/adding/removing takes effect in the preview instantly — click Save above to publish it to the app</p>
        </section>

        <!-- Tiers -->
        <section class="panel">
          <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">{{ isCustomType ? 'Tiers' : (isThresholdType ? 'Thresholds' : 'Rank bands') }}</div>
            <el-button v-permission="'events.manage'" size="small" text @click="openTierDialog">Add tier</el-button>
          </div>

          <p v-if="!tiers.length" class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]">
            No tiers yet.
            {{
              isCustomType
                ? 'A threshold is user-claimed on clearing it; a rank band is admin-distributed once its period closes.'
                : isThresholdType
                  ? 'A user unlocks one by clearing its recharge threshold.'
                  : 'A rank band pays out once its period closes.'
            }}
          </p>

          <ul v-else class="divide-y divide-[var(--color-edge)]">
            <li v-for="tier in tiers" :key="tier.id" class="px-4 py-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="key font-semibold">{{ tierLabel(tier) }}</span>
                <div class="flex items-center gap-2">
                  <el-button v-permission="'events.reward_manage'" size="small" text @click="openRewardDialog(tier.id)">+ reward</el-button>
                  <button
                    v-permission="'events.manage'"
                    type="button"
                    class="eyebrow text-[var(--color-legend)] hover:text-[var(--color-cut)]"
                    @click="removeTier(tier)"
                  >
                    remove
                  </button>
                </div>
              </div>

              <ul v-if="tier.rewards.length" class="mt-2 flex flex-wrap gap-1.5">
                <li v-for="r in tier.rewards" :key="r.id" class="group flex items-center gap-1.5 rounded-full bg-[var(--color-well)] px-2.5 py-1 text-[12px]">
                  <span :class="{ 'text-[var(--color-legend-dim)] line-through decoration-1': !r.grantable }">{{ rewardLabel(r) }}</span>
                  <button
                    type="button"
                    class="text-[var(--color-legend)] opacity-0 group-hover:opacity-100"
                    @click="removeTierReward(tier.id, r.id)"
                  >
                    ×
                  </button>
                </li>
              </ul>
              <p v-else class="eyebrow mt-1">no reward lines yet</p>
            </li>
          </ul>
        </section>
      </div>

      <!-- Live mobile preview -->
      <aside class="xl:sticky xl:top-4 xl:self-start">
        <PhonePreview :event="event" :blocks="basics.blocks" :title="basics.title_en" :banner-url="basics.banner_url" :tiers="tiers" />
      </aside>
    </div>
  </div>

  <!-- Tier dialog -->
  <el-dialog v-model="tierDialog" :title="isCustomType ? 'Add a tier' : (isThresholdType ? 'Add a threshold' : 'Add a rank band')" width="420">
    <div class="space-y-3">
      <div v-if="isCustomType">
        <label class="eyebrow mb-1 block">Tier type</label>
        <el-radio-group v-model="tierForm.tier_type" size="small">
          <el-radio-button value="threshold">Threshold (progress bar)</el-radio-button>
          <el-radio-button value="rank_range">Rank band (leaderboard)</el-radio-button>
        </el-radio-group>
      </div>

      <template v-if="tierForm.tier_type === 'threshold'">
        <div>
          <label class="eyebrow mb-1 block">Threshold ({{ isCustomType ? 'metric score' : 'coins recharged' }})</label>
          <el-input-number v-model="tierForm.threshold_value" :min="1" :step="50000" class="w-full" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Window override</label>
          <el-select v-model="tierForm.period" class="w-full" clearable placeholder="Use the event's own window">
            <el-option label="Daily" value="daily" />
            <el-option label="Weekly" value="weekly" />
            <el-option label="Monthly" value="monthly" />
          </el-select>
        </div>
      </template>
      <template v-else>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">From rank</label>
            <el-input-number v-model="tierForm.rank_from" :min="1" class="w-full" />
          </div>
          <div>
            <label class="eyebrow mb-1 block">To rank</label>
            <el-input-number v-model="tierForm.rank_to" :min="1" class="w-full" />
          </div>
        </div>
      </template>

      <div>
        <label class="eyebrow mb-1 block">Label</label>
        <el-input v-model="tierForm.label" :placeholder="tierForm.tier_type === 'threshold' ? '300K' : 'Top 1'" />
      </div>
    </div>

    <template #footer>
      <el-button @click="tierDialog = false">Cancel</el-button>
      <el-button type="primary" :disabled="!tierForm.label" @click="addTier">Add</el-button>
    </template>
  </el-dialog>

  <!-- Reward line dialog -->
  <el-dialog v-model="rewardDialog" title="Add a reward line" width="440">
    <div class="space-y-3">
      <div>
        <div class="mb-1 flex items-baseline justify-between">
          <label class="eyebrow block">Catalog item</label>
          <button type="button" class="eyebrow text-[var(--color-signal)]" @click="openCatalogDialog()">+ new catalog item</button>
        </div>
        <el-select v-model="rewardForm.reward_catalog_id" class="w-full" filterable placeholder="Pick a reward">
          <el-option
            v-for="c in catalog"
            :key="c.id"
            :label="`${c.name}${c.handler_ref_label ? ` — ${c.handler_ref_label}` : ''} (${HANDLER_LABELS[c.handler_key]})`"
            :value="c.id"
          />
        </el-select>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div v-if="activeCatalogItem && NEEDS_VALUE.includes(activeCatalogItem.handler_key)">
          <label class="eyebrow mb-1 block">Amount</label>
          <el-input-number v-model="rewardForm.reward_value" :min="1" :step="500" class="w-full" />
        </div>
        <div v-if="activeCatalogItem && NEEDS_DURATION.includes(activeCatalogItem.handler_key)">
          <label class="eyebrow mb-1 block">Duration (days)</label>
          <el-input-number v-model="rewardForm.duration_days" :min="1" class="w-full" />
        </div>
      </div>

      <div v-if="activeCatalogItem?.handler_key === 'manual'">
        <label class="eyebrow mb-1 block">Display label</label>
        <el-input v-model="rewardForm.label" placeholder="e.g. Signed Merch Box" />
        <p class="eyebrow mt-1">manual reward — shows in the app and gets claimed, but records the claim for support to fulfil rather than granting it automatically</p>
      </div>
    </div>

    <template #footer>
      <el-button @click="rewardDialog = false">Cancel</el-button>
      <el-button type="primary" :disabled="!rewardForm.reward_catalog_id" @click="addTierReward">Add</el-button>
    </template>
  </el-dialog>

  <!-- Block edit dialog: config + style -->
  <el-dialog v-model="blockDialog" :title="editingBlock ? `Edit ${blockLabel(editingBlock.type)}` : 'Edit block'" width="460">
    <div v-if="editingBlock" class="space-y-4">
      <div>
        <div class="eyebrow mb-2">Content</div>
        <div class="space-y-3">
          <template v-if="editingBlock.type === 'countdown'">
            <label class="eyebrow mb-1 block">Counts down to</label>
            <el-select v-model="editingBlock.config.target" class="w-full">
              <el-option label="End of the current cycle" value="cycle_end" />
              <el-option label="The event's own end date" value="event_end" />
            </el-select>
          </template>

          <template v-else-if="editingBlock.type === 'my_progress_card'">
            <label class="eyebrow mb-1 block">Label ({period} is substituted)</label>
            <el-input v-model="editingBlock.config.label_template" />
          </template>

          <template v-else-if="editingBlock.type === 'tabs'">
            <label class="eyebrow mb-1 block">Tab labels</label>
            <div class="grid grid-cols-2 gap-2">
              <el-input v-model="(editingBlock.config.labels as string[])[0]" placeholder="Tab A" />
              <el-input v-model="(editingBlock.config.labels as string[])[1]" placeholder="Tab B" />
            </div>
          </template>

          <template v-else-if="editingBlock.type === 'leaderboard_list' || editingBlock.type === 'reward_bundle_card'">
            <label class="eyebrow mb-1 block">Only show under tab</label>
            <el-select v-model="editingBlock.config.visible_in_tab" class="w-full" clearable placeholder="Always visible">
              <el-option label="Tab A" value="a" />
              <el-option label="Tab B" value="b" />
            </el-select>
          </template>

          <template v-else-if="editingBlock.type === 'rules_button'">
            <label class="eyebrow mb-1 block">Button label</label>
            <el-input v-model="editingBlock.config.label" />
          </template>

          <template v-else-if="editingBlock.type === 'text'">
            <label class="eyebrow mb-1 block">Content</label>
            <el-input v-model="editingBlock.config.content" type="textarea" :rows="2" />
            <label class="eyebrow mt-2 mb-1 block">Align</label>
            <el-radio-group v-model="editingBlock.config.align" size="small">
              <el-radio-button value="left">Left</el-radio-button>
              <el-radio-button value="center">Center</el-radio-button>
              <el-radio-button value="right">Right</el-radio-button>
            </el-radio-group>
          </template>

          <template v-else-if="editingBlock.type === 'image'">
            <label class="eyebrow mb-1 block">Image URL</label>
            <el-input v-model="editingBlock.config.url" placeholder="https://…" />
            <label class="eyebrow mt-2 mb-1 block">Height (px)</label>
            <el-input-number v-model="editingBlock.config.height" :min="20" class="w-full" />
          </template>

          <template v-else-if="editingBlock.type === 'spacer'">
            <label class="eyebrow mb-1 block">Height (px)</label>
            <el-input-number v-model="editingBlock.config.height" :min="4" class="w-full" />
          </template>

          <p v-else class="eyebrow">this block has no extra content settings — only style, below</p>
        </div>
      </div>

      <div class="border-t border-[var(--color-edge)] pt-3">
        <div class="eyebrow mb-2">Style</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">Background colour</label>
            <el-color-picker v-model="editingBlock.style.bg_color" show-alpha />
          </div>
          <div>
            <label class="eyebrow mb-1 block">Text colour</label>
            <el-color-picker v-model="editingBlock.style.text_color" show-alpha />
          </div>
          <div class="col-span-2">
            <label class="eyebrow mb-1 block">Background image URL</label>
            <el-input v-model="editingBlock.style.bg_image_url" placeholder="https://…" clearable />
          </div>
          <div>
            <label class="eyebrow mb-1 block">Padding (px)</label>
            <el-input-number v-model="editingBlock.style.padding" :min="0" class="w-full" />
          </div>
          <div>
            <label class="eyebrow mb-1 block">Corner radius (px)</label>
            <el-input-number v-model="editingBlock.style.corner_radius" :min="0" class="w-full" />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="blockDialog = false">Cancel</el-button>
      <el-button type="primary" @click="saveBlockEdit">Apply</el-button>
    </template>
  </el-dialog>

  <!-- Reward catalog management -->
  <el-dialog v-model="catalogDialog" title="Reward catalog" width="640">
    <div class="grid gap-4 md:grid-cols-[1fr_260px]">
      <div class="max-h-96 overflow-y-auto">
        <table class="w-full text-[12px]">
          <thead>
            <tr class="eyebrow text-left">
              <th class="pb-1">Name</th>
              <th class="pb-1">Handler</th>
              <th class="pb-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--color-edge)]">
            <tr v-for="c in catalog" :key="c.id">
              <td class="py-1.5">
                {{ c.name }}
                <div v-if="c.handler_ref_label" class="text-[11px] text-[var(--color-legend)]">{{ c.handler_ref_label }}</div>
              </td>
              <td class="py-1.5">{{ HANDLER_LABELS[c.handler_key] }}</td>
              <td class="py-1.5 text-right">
                <el-button size="small" text @click="openCatalogDialog(c)">Edit</el-button>
                <button type="button" class="eyebrow text-[var(--color-legend)] hover:text-[var(--color-cut)]" @click="deleteCatalogItem(c)">remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="space-y-3 border-l border-[var(--color-edge)] pl-4">
        <div class="eyebrow">{{ catalogForm.id ? 'Edit reward' : 'New reward' }}</div>
        <div>
          <label class="eyebrow mb-1 block">Name</label>
          <el-input v-model="catalogForm.name" placeholder="e.g. Signed Merch Box" />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Handler</label>
          <el-select v-model="catalogForm.handler_key" class="w-full">
            <el-option v-for="(label, key) in HANDLER_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </div>
        <div v-if="NEEDS_REF.includes(catalogForm.handler_key)">
          <label class="eyebrow mb-1 block">Which one</label>
          <el-select v-model="catalogForm.handler_ref_id" class="w-full" filterable placeholder="Select from the catalogue">
            <el-option v-for="o in catalogRefOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </div>
        <p v-else class="eyebrow leading-relaxed">
          no code needed for this handler — a manual reward just records the claim for support to fulfil
        </p>
        <el-button type="primary" size="small" class="w-full" :disabled="!catalogForm.name" @click="saveCatalogItem">
          {{ catalogForm.id ? 'Save' : 'Add to catalog' }}
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>
