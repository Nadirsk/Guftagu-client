<script setup lang="ts">
import { computed } from 'vue'

/**
 * A rack of channel strips for one permission module, with a held/total counter on the
 * engraved label. Collapsible, because 18 modules open at once is unreadable.
 */
const props = withDefaults(
  defineProps<{
    module: string
    held?: number
    total: number
    open?: boolean
    /** Shown instead of the counter when the rack is a selection surface. */
    selectedCount?: number | null
  }>(),
  { held: 0, open: true, selectedCount: null },
)

const emit = defineEmits<{ 'update:open': [boolean] }>()

const ratio = computed(() => (props.total === 0 ? 0 : props.held / props.total))
</script>

<template>
  <section class="panel">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-raised)]"
      :aria-expanded="open"
      @click="emit('update:open', !open)"
    >
      <svg
        viewBox="0 0 10 10"
        class="h-2.5 w-2.5 shrink-0 text-[var(--color-legend)] transition-transform"
        :class="open ? 'rotate-90' : ''"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M3 1.5 7 5 3 8.5z" />
      </svg>

      <span class="eyebrow flex-1 text-[var(--color-paper)]">{{ module }}</span>

      <!-- A fill bar, not a pie or a donut: it reads as a fader position at a glance. -->
      <span
        v-if="selectedCount === null"
        class="hidden h-1 w-16 overflow-hidden bg-[var(--color-recess)] sm:block"
        aria-hidden="true"
      >
        <span
          class="block h-full bg-[var(--color-signal)] transition-[width]"
          :style="{ width: `${Math.round(ratio * 100)}%` }"
        />
      </span>

      <span class="key shrink-0 text-[var(--color-legend)]">
        <template v-if="selectedCount !== null">
          {{ selectedCount }} selected
        </template>
        <template v-else>{{ held }}/{{ total }}</template>
      </span>
    </button>

    <div v-if="open" class="grid gap-1.5 border-t border-[var(--color-edge)] p-2 md:grid-cols-2">
      <slot />
    </div>
  </section>
</template>
