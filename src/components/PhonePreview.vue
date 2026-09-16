<script setup lang="ts">
import { computed, reactive } from 'vue'

import type { EventBlock, EventRow, EventTierRow } from '@/types/api'

/**
 * A phone-shaped, live preview of exactly the block array + tier bundles currently in
 * the builder's form — not two fixed templates. Every block type it can encounter is
 * rendered generically from `block.config`/`block.style`, so a screen built from an
 * arbitrary arrangement of blocks looks right without this component knowing anything
 * about "Recharge Activity" or "Weekly Star" specifically.
 *
 * This is a preview, not the app's actual renderer: countdown numbers and the
 * leaderboard are illustrative placeholders (no real user session exists in the admin
 * panel), but the blocks shown, their order, their style and every tier/reward line are
 * the real configured data.
 */
const props = defineProps<{
  event: EventRow
  blocks: EventBlock[]
  title: string
  bannerUrl: string
  tiers: EventTierRow[]
}>()

/** Which tab (a/b) is active per `tabs` block, keyed by block id — several tabs blocks can coexist. */
const activeTabs = reactive<Record<string, 'a' | 'b'>>({})

function tabOf(blockId: string): 'a' | 'b' {
  return activeTabs[blockId] ?? 'a'
}

/**
 * Each block's visibility: a `leaderboard_list`/`reward_bundle_card` with
 * `config.visible_in_tab` set is only shown while the nearest preceding `tabs` block is
 * on that tab — blocks are a flat, ordered list, so "nearest preceding" is what makes a
 * tabs block control the ones after it without any explicit nesting.
 */
const visibleBlocks = computed(() => {
  let controllingTabsId: string | null = null

  return props.blocks.map((block) => {
    if (block.type === 'tabs') controllingTabsId = block.id

    const wantsTab = block.config.visible_in_tab as 'a' | 'b' | null | undefined
    const visible = !wantsTab || controllingTabsId === null || tabOf(controllingTabsId) === wantsTab

    return { block, visible }
  })
})

const countdown = computed(() => {
  const ms = Math.max(0, new Date(props.event.ends_at).getTime() - Date.now())
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1_000),
  }
})

function blockStyle(block: EventBlock): Record<string, string> {
  const s = block.style
  const style: Record<string, string> = {}
  if (s.bg_color) style.backgroundColor = s.bg_color
  if (s.bg_image_url) {
    style.backgroundImage = `url(${s.bg_image_url})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  if (s.text_color) style.color = s.text_color
  if (s.padding !== null && s.padding !== undefined) style.padding = `${s.padding}px`
  if (s.corner_radius !== null && s.corner_radius !== undefined) style.borderRadius = `${s.corner_radius}px`
  return style
}

function textAlignStyle(block: EventBlock): Record<string, string> {
  return { textAlign: (block.config.align as string) ?? 'center' }
}

function bundleLine(r: EventTierRow['rewards'][number]): string {
  const parts: string[] = []
  if (r.reward_value) parts.push(r.reward_value.toLocaleString())
  parts.push(r.label ?? r.catalog?.handler_ref_label ?? r.catalog?.name ?? 'Reward')
  if (r.duration_days) parts.push(`${r.duration_days}D`)
  return parts.join(' ')
}

const DUMMY_ROWS = [4, 5, 6, 7, 8, 9, 10].map((rank) => ({ rank, name: 'Player Name', score: '154.2K' }))
</script>

<template>
  <div class="mx-auto w-[300px] overflow-hidden rounded-[2.2rem] border-[6px] border-neutral-900 bg-black shadow-xl">
    <div class="h-5 w-full bg-black" />
    <div class="max-h-[640px] overflow-y-auto bg-neutral-950 text-white" style="scrollbar-width: thin">
      <template v-for="{ block, visible } in visibleBlocks" :key="block.id">
        <div v-if="visible" :style="blockStyle(block)">
          <!-- banner -->
          <div v-if="block.type === 'banner'" class="relative flex h-40 flex-col items-center justify-center bg-gradient-to-b from-[#4a1a3a] to-[#1a0f2e] px-4 text-center">
            <div class="rounded bg-black/30 px-3 py-1 text-[15px] font-bold tracking-wide text-amber-300">
              {{ title || event.title_en }}
            </div>
          </div>

          <!-- countdown -->
          <div v-else-if="block.type === 'countdown'" class="flex justify-center gap-1.5 bg-gradient-to-r from-rose-200/10 to-amber-200/10 px-3 py-2.5">
            <div v-for="(n, label) in countdown" :key="label" class="flex-1 rounded bg-white/95 py-1 text-center text-neutral-900">
              <div class="text-[13px] font-bold">{{ n }}</div>
              <div class="text-[8px] capitalize text-neutral-500">{{ label }}</div>
            </div>
          </div>

          <!-- my_progress_card -->
          <div v-else-if="block.type === 'my_progress_card'" class="mx-3 my-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-center">
            <div class="text-[10px] text-white/60">
              {{ String(block.config.label_template ?? 'My {period} Recharge').replace('{period}', event.period ?? '') }}
            </div>
            <div class="mt-1 text-[20px] font-bold text-amber-300">🪙 —</div>
            <div class="text-[9px] text-white/40">live for the signed-in user in the app</div>
          </div>

          <!-- tabs -->
          <div v-else-if="block.type === 'tabs'" class="flex justify-center gap-2 px-3 py-2">
            <button
              v-for="(label, i) in (block.config.labels as string[] ?? ['Tab A', 'Tab B'])"
              :key="i"
              type="button"
              class="rounded-full px-3 py-1 text-[10px]"
              :class="tabOf(block.id) === (i === 0 ? 'a' : 'b') ? 'bg-amber-400 text-neutral-900' : 'bg-white/10 text-white/60'"
              @click="activeTabs[block.id] = i === 0 ? 'a' : 'b'"
            >
              {{ label }}
            </button>
          </div>

          <!-- tier_grid -->
          <div v-else-if="block.type === 'tier_grid'" class="space-y-2 px-3 py-2">
            <div v-for="tier in tiers" :key="tier.id" class="rounded-lg border border-amber-300/30 bg-gradient-to-b from-[#3a1420] to-[#1a0a10] p-2.5">
              <div class="mb-1.5 text-center text-[11px] font-bold text-amber-200">{{ tier.label }}</div>
              <div class="flex flex-wrap justify-center gap-1">
                <span v-for="r in tier.rewards" :key="r.id" class="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-white/80">
                  {{ bundleLine(r) }}
                </span>
              </div>
              <div class="mx-auto mt-2 w-24 rounded-full bg-white/20 py-1 text-center text-[9px] text-white/70">Receive</div>
            </div>
            <p v-if="!tiers.length" class="py-3 text-center text-[10px] text-white/40">no tiers configured yet</p>
          </div>

          <!-- leaderboard_list -->
          <div v-else-if="block.type === 'leaderboard_list'" class="space-y-1 px-3 py-2">
            <div class="flex justify-around">
              <div v-for="tier in tiers.slice(0, 3)" :key="tier.id" class="text-center">
                <div class="mx-auto h-9 w-9 rounded-full border-2 border-amber-300 bg-white/10" />
                <div class="mt-0.5 text-[8px] font-bold text-amber-200">{{ tier.label }}</div>
              </div>
            </div>
            <div v-for="row in DUMMY_ROWS" :key="row.rank" class="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-[9px]">
              <span class="w-3 text-white/50">{{ row.rank }}</span>
              <span class="h-4 w-4 rounded-full bg-white/20" />
              <span class="flex-1 text-white/80">{{ row.name }}</span>
              <span class="text-amber-200">{{ row.score }}</span>
            </div>
          </div>

          <!-- reward_bundle_card -->
          <div v-else-if="block.type === 'reward_bundle_card'" class="space-y-2 px-3 py-2">
            <div v-for="tier in tiers" :key="tier.id" class="rounded-lg border border-indigo-300/30 bg-gradient-to-b from-[#1e1a3a] to-[#0e0a1a] p-2.5">
              <div class="mb-1.5 text-center text-[11px] font-bold text-indigo-200">{{ tier.label }}</div>
              <div class="flex flex-wrap justify-center gap-1">
                <span v-for="r in tier.rewards" :key="r.id" class="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-white/80">
                  {{ bundleLine(r) }}
                </span>
              </div>
            </div>
          </div>

          <!-- rules_button -->
          <div v-else-if="block.type === 'rules_button'" class="flex justify-center py-2">
            <span class="rounded-full border border-white/30 px-3 py-1 text-[9px]">{{ block.config.label ?? 'Rules' }}</span>
          </div>

          <!-- text -->
          <p
            v-else-if="block.type === 'text'"
            class="px-3 py-2 text-[11px]"
            :style="textAlignStyle(block)"
          >
            {{ block.config.content || '(empty text block)' }}
          </p>

          <!-- image -->
          <img
            v-else-if="block.type === 'image' && block.config.url"
            :src="block.config.url as string"
            :style="{ height: `${block.config.height ?? 120}px`, width: '100%', objectFit: 'cover' }"
            alt=""
          />
          <div v-else-if="block.type === 'image'" class="flex h-20 items-center justify-center text-[10px] text-white/40">no image URL set</div>

          <!-- spacer -->
          <div v-else-if="block.type === 'spacer'" :style="{ height: `${block.config.height ?? 16}px` }" />
        </div>
      </template>

      <p v-if="!blocks.length" class="px-4 py-10 text-center text-[11px] text-white/40">
        No blocks added — the app screen would be blank.
      </p>
    </div>
  </div>
  <p class="mt-2 text-center text-[11px] text-[var(--color-legend)]">
    Preview — countdown and the leaderboard rows are illustrative; blocks, order, style and reward bundles are the real configured data.
  </p>
</template>
