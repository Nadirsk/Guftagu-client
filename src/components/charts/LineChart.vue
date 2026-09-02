<script setup lang="ts">
import { computed, ref } from 'vue'

import { INK } from './palette'

/**
 * A single-series line over time. One series, so no legend — the title names it.
 *
 * Hand-rolled SVG rather than a chart library: two charts do not justify ~1 MB of ECharts,
 * and the mark specs (2px stroke, >=8px hit targets, recessive grid, crosshair) are easier
 * to hold exactly this way. Revisit when M6 brings the full analytics set.
 */
const props = withDefaults(
  defineProps<{
    points: Array<{ label: string; value: number }>
    color: string
    height?: number
    valueLabel?: string
  }>(),
  { height: 180, valueLabel: '' },
)

const width = 720
const pad = { top: 14, right: 14, bottom: 24, left: 44 }

const hover = ref<number | null>(null)

const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)))

const plot = computed(() => ({
  w: width - pad.left - pad.right,
  h: props.height - pad.top - pad.bottom,
}))

function x(index: number): number {
  const count = props.points.length
  if (count <= 1) return pad.left + plot.value.w / 2
  return pad.left + (index / (count - 1)) * plot.value.w
}

function y(value: number): number {
  return pad.top + plot.value.h - (value / max.value) * plot.value.h
}

const path = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
)

/** Four gridlines is enough to read a value against; more is noise. */
const ticks = computed(() => {
  const step = max.value / 3
  return [0, 1, 2, 3].map((i) => ({ value: Math.round(step * i), y: y(step * i) }))
})

/** Only ever ~6 x-labels, whatever the range, so they cannot collide. */
const xLabels = computed(() => {
  const count = props.points.length
  if (count === 0) return []
  const stride = Math.max(1, Math.ceil(count / 6))
  return props.points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.i % stride === 0 || p.i === count - 1)
})

const active = computed(() => (hover.value === null ? null : props.points[hover.value]))

function onMove(event: MouseEvent) {
  const target = event.currentTarget as SVGSVGElement
  const rect = target.getBoundingClientRect()
  const relative = ((event.clientX - rect.left) / rect.width) * width
  const count = props.points.length

  if (count === 0) return

  const ratio = (relative - pad.left) / plot.value.w
  hover.value = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
}

function short(label: string): string {
  const date = new Date(label)
  return Number.isNaN(date.getTime())
    ? label
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="relative">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="w-full"
      :style="{ height: `${height}px` }"
      role="img"
      :aria-label="`${valueLabel} over time`"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <!-- Recessive grid: present enough to read against, quiet enough to ignore. -->
      <g :stroke="INK.grid" stroke-width="1" opacity="0.5">
        <line v-for="t in ticks" :key="t.y" :x1="pad.left" :x2="width - pad.right" :y1="t.y" :y2="t.y" />
      </g>

      <g :fill="INK.muted" font-size="10" font-family="var(--font-mono)">
        <text v-for="t in ticks" :key="`v${t.y}`" :x="pad.left - 8" :y="t.y + 3" text-anchor="end">
          {{ t.value.toLocaleString() }}
        </text>
        <text
          v-for="l in xLabels"
          :key="`x${l.i}`"
          :x="x(l.i)"
          :y="height - 8"
          text-anchor="middle"
        >
          {{ short(l.label) }}
        </text>
      </g>

      <!-- 2px stroke, per the mark spec. -->
      <path :d="path" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Crosshair -->
      <g v-if="hover !== null && points[hover]">
        <line
          :x1="x(hover)"
          :x2="x(hover)"
          :y1="pad.top"
          :y2="pad.top + plot.h"
          :stroke="INK.secondary"
          stroke-width="1"
          stroke-dasharray="3 3"
        />
        <!-- 2px surface ring so the marker reads against the line beneath it. -->
        <circle
          :cx="x(hover)"
          :cy="y(points[hover].value)"
          r="4.5"
          :fill="color"
          :stroke="INK.surface"
          stroke-width="2"
        />
      </g>
    </svg>

    <div
      v-if="active"
      class="pointer-events-none absolute top-2 right-2 border border-[var(--color-edge)] bg-[var(--color-recess)] px-2.5 py-1.5"
      style="border-radius: 3px"
    >
      <div class="eyebrow">{{ short(active.label) }}</div>
      <div class="key text-[13px]">
        {{ active.value.toLocaleString() }}
        <span class="text-[var(--color-legend)]">{{ valueLabel }}</span>
      </div>
    </div>
  </div>
</template>
