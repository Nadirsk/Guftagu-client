<script setup lang="ts">
import { computed, ref } from 'vue'

import { INK } from './palette'

/**
 * Grouped bars for the revenue streams.
 *
 * Three series whose worst CVD pair sits in the 6-8 ΔE band, which is only legal with
 * secondary encoding — so this chart always ships a legend, a 2px surface gap between
 * adjacent bars, and a hover tooltip naming the series. Colour never carries identity
 * on its own here.
 */
const props = withDefaults(
  defineProps<{
    buckets: Array<{ label: string; values: number[] }>
    series: ReadonlyArray<{ key: string; label: string; color: string }>
    height?: number
    unit?: string
  }>(),
  { height: 200, unit: '' },
)

const width = 720
const pad = { top: 14, right: 14, bottom: 26, left: 52 }
const GAP = 2 // the surface gap the mark spec asks for between adjacent fills

const hover = ref<{ bucket: number; series: number } | null>(null)

const max = computed(() =>
  Math.max(1, ...props.buckets.flatMap((b) => b.values)),
)

const plot = computed(() => ({
  w: width - pad.left - pad.right,
  h: props.height - pad.top - pad.bottom,
}))

const groupWidth = computed(() =>
  props.buckets.length === 0 ? 0 : plot.value.w / props.buckets.length,
)

const barWidth = computed(() => {
  const inner = groupWidth.value * 0.72
  return Math.max(2, inner / props.series.length - GAP)
})

function barX(bucket: number, series: number): number {
  const groupStart = pad.left + bucket * groupWidth.value + groupWidth.value * 0.14
  return groupStart + series * (barWidth.value + GAP)
}

function barY(value: number): number {
  return pad.top + plot.value.h - (value / max.value) * plot.value.h
}

function barH(value: number): number {
  return Math.max(0, (value / max.value) * plot.value.h)
}

const ticks = computed(() => {
  const step = max.value / 3
  return [0, 1, 2, 3].map((i) => ({ value: Math.round(step * i), y: barY(step * i) }))
})

const xLabels = computed(() => {
  const count = props.buckets.length
  if (count === 0) return []
  const stride = Math.max(1, Math.ceil(count / 8))
  return props.buckets.map((b, i) => ({ ...b, i })).filter((b) => b.i % stride === 0)
})

/**
 * Direct labels, selectively: only the tallest bar in the whole chart gets a number.
 * A value on every bar is noise, and the tooltip covers the rest.
 */
const peak = computed(() => {
  // Flattened rather than accumulated in a nested loop: TypeScript cannot follow a
  // `let` reassigned inside a closure and narrows it to `never`.
  const all = props.buckets.flatMap((bucket, b) =>
    bucket.values.map((value, s) => ({ bucket: b, series: s, value })),
  )

  const positive = all.filter((entry) => entry.value > 0)

  if (positive.length === 0) return null

  return positive.reduce((best, entry) => (entry.value > best.value ? entry : best))
})

const active = computed(() => {
  if (hover.value === null) return null
  const bucket = props.buckets[hover.value.bucket]
  if (!bucket) return null

  return {
    label: bucket.label,
    series: props.series[hover.value.series],
    value: bucket.values[hover.value.series] ?? 0,
  }
})

function short(label: string): string {
  const date = new Date(label)
  return Number.isNaN(date.getTime())
    ? label
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const empty = computed(() => props.buckets.every((b) => b.values.every((v) => v === 0)))
</script>

<template>
  <div class="relative">
    <!-- Legend is always present for >= 2 series, so identity is never colour-alone. -->
    <div class="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      <span v-for="s in series" :key="s.key" class="flex items-center gap-1.5">
        <span
          class="inline-block h-2.5 w-2.5"
          :style="{ background: s.color, borderRadius: '1px' }"
          aria-hidden="true"
        />
        <span class="eyebrow text-[var(--color-legend)]">{{ s.label }}</span>
      </span>
    </div>

    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="w-full"
      :style="{ height: `${height}px` }"
      role="img"
      aria-label="Revenue by stream"
      @mouseleave="hover = null"
    >
      <g :stroke="INK.grid" stroke-width="1" opacity="0.5">
        <line v-for="t in ticks" :key="t.y" :x1="pad.left" :x2="width - pad.right" :y1="t.y" :y2="t.y" />
      </g>

      <g :fill="INK.muted" font-size="10" font-family="var(--font-mono)">
        <text v-for="t in ticks" :key="`v${t.y}`" :x="pad.left - 8" :y="t.y + 3" text-anchor="end">
          {{ t.value.toLocaleString() }}
        </text>
        <text v-for="l in xLabels" :key="`x${l.i}`" :x="pad.left + l.i * groupWidth + groupWidth / 2" :y="height - 8" text-anchor="middle">
          {{ short(l.label) }}
        </text>
      </g>

      <g v-for="(bucket, b) in buckets" :key="b">
        <template v-for="(value, s) in bucket.values" :key="s">
          <!-- Hit target spans the full column height, so a 1px bar is still hoverable. -->
          <rect
            :x="barX(b, s)"
            :y="pad.top"
            :width="barWidth"
            :height="plot.h"
            fill="transparent"
            @mouseenter="hover = { bucket: b, series: s }"
          />
          <rect
            :x="barX(b, s)"
            :y="barY(value)"
            :width="barWidth"
            :height="barH(value)"
            :fill="series[s].color"
            rx="2"
            :opacity="hover === null || (hover.bucket === b && hover.series === s) ? 1 : 0.45"
            class="pointer-events-none"
          />
        </template>
      </g>

      <!-- One direct label, on the peak. -->
      <text
        v-if="peak && !empty"
        :x="barX(peak.bucket, peak.series) + barWidth / 2"
        :y="barY(peak.value) - 5"
        text-anchor="middle"
        font-size="10"
        font-family="var(--font-mono)"
        :fill="INK.secondary"
      >
        {{ peak.value.toLocaleString() }}
      </text>
    </svg>

    <div
      v-if="active"
      class="pointer-events-none absolute top-8 right-2 border border-[var(--color-edge)] bg-[var(--color-recess)] px-2.5 py-1.5"
      style="border-radius: 3px"
    >
      <div class="eyebrow">{{ short(active.label) }}</div>
      <div class="flex items-center gap-1.5">
        <span
          class="inline-block h-2 w-2"
          :style="{ background: active.series.color, borderRadius: '1px' }"
          aria-hidden="true"
        />
        <span class="key text-[13px]">
          {{ active.series.label }} · {{ active.value.toLocaleString() }} {{ unit }}
        </span>
      </div>
    </div>
  </div>
</template>
