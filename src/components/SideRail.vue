<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { NAV } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

/**
 * GFT-125 — the sidebar is the permission set made navigable. A Moderator granted only
 * `reports.view` sees the reports section and nothing else; a section with nothing
 * visible in it disappears entirely rather than sitting there empty.
 */
const sections = computed(() =>
  NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.anyOf.length === 0 || auth.canAny(item.anyOf)),
  })).filter((section) => section.items.length > 0),
)
</script>

<template>
  <!-- Mobile scrim -->
  <div
    v-if="open"
    class="fixed inset-0 z-30 bg-black/60 lg:hidden"
    aria-hidden="true"
    @click="emit('close')"
  />

  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--color-edge)] bg-[var(--color-panel)] transition-transform lg:static lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex h-14 items-center gap-2.5 border-b border-[var(--color-edge)] px-4">
      <!-- Three rising bars: a level meter. The product is voice; the mark says so. -->
      <svg viewBox="0 0 16 16" class="h-4 w-4 shrink-0" aria-hidden="true">
        <rect x="1" y="9" width="3" height="6" fill="var(--color-signal-dim)" />
        <rect x="6.5" y="5" width="3" height="10" fill="var(--color-signal)" />
        <rect x="12" y="2" width="3" height="13" fill="var(--color-signal-dim)" />
      </svg>
      <div class="min-w-0">
        <div class="truncate text-[13px] leading-tight font-semibold tracking-tight">Guftagu</div>
        <div class="eyebrow leading-tight">Console</div>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Sections">
      <div v-for="section in sections" :key="section.title" class="mb-4">
        <div class="eyebrow px-2 pb-1.5">{{ section.title }}</div>

        <ul class="space-y-0.5">
          <li v-for="item in section.items" :key="item.to">
            <span
              v-if="item.pending"
              class="flex cursor-not-allowed items-center justify-between gap-2 px-2 py-1.5 text-[13px] text-[var(--color-legend-dim)]"
              :title="`${item.label} lands with a later module — the backend for it does not exist yet.`"
            >
              {{ item.label }}
              <span class="eyebrow">soon</span>
            </span>

            <RouterLink
              v-else
              :to="item.to"
              class="flex items-center gap-2 border-l-2 px-2 py-1.5 text-[13px] transition-colors"
              :class="
                route.path === item.to
                  ? 'border-l-[var(--color-signal)] bg-[var(--color-raised)] font-medium text-[var(--color-paper)]'
                  : 'border-l-transparent text-[var(--color-legend)] hover:bg-[var(--color-raised)] hover:text-[var(--color-paper)]'
              "
              @click="emit('close')"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>

    <div class="border-t border-[var(--color-edge)] px-4 py-2.5">
      <div class="eyebrow">Signed in as</div>
      <div class="truncate text-[13px] font-medium">{{ auth.admin?.name }}</div>
      <div class="key truncate text-[var(--color-legend)]">{{ auth.admin?.role?.key }}</div>
    </div>
  </aside>
</template>
