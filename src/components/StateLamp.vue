<script setup lang="ts">
import { computed } from 'vue'

/**
 * A small status dot: filled and blue for granted, ringed and dim for role-inherited,
 * red for denied, hollow for not held.
 *
 * Colour never carries the meaning alone — every use pairs this with a text origin tag,
 * so the state survives being read by someone who cannot separate blue from red.
 */
const props = withDefaults(
  defineProps<{
    state: 'off' | 'role' | 'direct' | 'denied' | 'all'
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)

const tone = computed(() => {
  switch (props.state) {
    case 'direct':
    case 'all':
      return { bg: 'var(--color-signal)', ring: 'transparent' }
    case 'role':
      // Lit, but from the mix rather than pushed up by hand — dimmer on purpose.
      return { bg: 'var(--color-signal-dim)', ring: 'var(--color-signal)' }
    case 'denied':
      return { bg: 'var(--color-cut)', ring: 'transparent' }
    default:
      return { bg: 'transparent', ring: 'var(--color-edge-bright)' }
  }
})

const label = computed(
  () =>
    ({
      off: 'Not held',
      role: 'Held via role baseline',
      direct: 'Granted directly',
      denied: 'Explicitly denied',
      all: 'Unrestricted',
    })[props.state],
)
</script>

<template>
  <span
    class="inline-block shrink-0 rounded-full border"
    :class="size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'"
    :style="{
      background: tone.bg,
      borderColor: tone.ring,
    }"
    role="img"
    :aria-label="label"
    :title="label"
  />
</template>
