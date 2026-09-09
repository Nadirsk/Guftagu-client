<script setup lang="ts">
import {
  Aim,
  ArrowRight,
  Coin,
  DataAnalysis,
  Filter,
  Grid,
  Key,
  Lock,
  Menu,
  Mic,
  Microphone,
  Money,
  Monitor,
  Odometer,
  OfficeBuilding,
  Postcard,
  Present,
  Promotion,
  Service,
  Shop,
  Star,
  Tickets,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  View,
  Wallet,
  WarnTriangleFilled,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { NAV } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

// Every icon a NAV entry can name (see NAV in @/lib/permissions) — imported by name rather
// than `import *` so the sidebar doesn't drag in the whole ~300-icon library.
const ICONS = {
  Aim,
  Coin,
  DataAnalysis,
  Filter,
  Grid,
  Key,
  Lock,
  Menu,
  Mic,
  Microphone,
  Money,
  Monitor,
  Odometer,
  OfficeBuilding,
  Postcard,
  Present,
  Promotion,
  Service,
  Shop,
  Star,
  Tickets,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  View,
  Wallet,
  WarnTriangleFilled,
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

function icon(name: string) {
  return ICONS[name as keyof typeof ICONS]
}

async function signOut() {
  try {
    await ElMessageBox.confirm('Sign out of the console?', 'Sign out', {
      confirmButtonText: 'Sign out',
      cancelButtonText: 'Stay',
      type: 'warning',
    })
  } catch {
    return
  }

  await auth.logout()
  void router.push({ name: 'login' })
}

/**
 * GFT-125 — the sidebar is the permission set made navigable. A Moderator granted only
 * `reports.view` sees the reports section and nothing else; a section with nothing
 * visible in it disappears entirely rather than sitting there empty.
 */
const sections = computed(() =>
  NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (item.anyOf.length === 0 || auth.canAny(item.anyOf)) &&
        (!item.requireRole || auth.roleKey === item.requireRole),
    ),
  })).filter((section) => section.items.length > 0),
)

const OPEN_STORAGE_KEY = 'guftagu-nav-open'

function sectionOf(path: string) {
  return sections.value.find((section) => section.items.some((item) => item.to === path))?.title
}

function readStoredOpen(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

// A group with only one item (Console, IT Admin) is a flat link, not a dropdown — nothing
// to expand. Everything else starts collapsed except whichever group holds the current
// route, then remembers what the admin opened by hand across navigation.
const openSections = ref(
  new Set<string>([...readStoredOpen(), sectionOf(route.path)].filter((v): v is string => !!v)),
)

watch(
  () => route.path,
  (path) => {
    const title = sectionOf(path)
    if (title) openSections.value.add(title)
  },
)

function toggle(title: string) {
  if (openSections.value.has(title)) openSections.value.delete(title)
  else openSections.value.add(title)
  localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify([...openSections.value]))
}
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
    class="fixed inset-y-0 left-0 z-40 flex w-65 flex-col border-r border-[var(--color-edge)] bg-[var(--color-panel)] transition-transform lg:static lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex h-14 items-center gap-2.5 border-b border-[var(--color-edge)] px-4">
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-signal)] font-(--font-display) text-[14px] font-semibold text-[var(--color-ink)]"
        aria-hidden="true"
      >
        G
      </span>
      <div class="min-w-0">
        <div class="truncate text-[15px] leading-tight font-semibold tracking-tight">Guftagu</div>
        <div class="eyebrow leading-tight">Console</div>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-3" aria-label="Sections">
      <div v-for="section in sections" :key="section.title" class="mb-1.5">
        <!-- One item, nothing to fold — render straight as a link (Overview, System logs). -->
        <RouterLink
          v-if="section.items.length === 1 && !section.items[0].pending"
          :to="section.items[0].to"
          class="flex h-11 items-center gap-2 rounded-md px-3 text-[15px] transition-colors"
          :class="
            route.path === section.items[0].to
              ? 'bg-[var(--color-raised)] font-medium text-[var(--color-paper)]'
              : 'text-[var(--color-legend)] hover:bg-[var(--color-raised)] hover:text-[var(--color-paper)]'
          "
          @click="emit('close')"
        >
          <component :is="icon(section.items[0].icon)" class="h-5.5 w-5.5 shrink-0" />
          {{ section.items[0].label }}
        </RouterLink>

        <!-- Several items — a dropdown group, chevron shows fold state. -->
        <template v-else>
          <button
            type="button"
            class="flex h-11 w-full items-center gap-2 rounded-md px-3 text-[15px] text-[var(--color-legend)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-paper)]"
            :aria-expanded="openSections.has(section.title)"
            @click="toggle(section.title)"
          >
            <component :is="icon(section.icon)" class="h-5.5 w-5.5 shrink-0" />
            <span class="flex-1 truncate text-left">{{ section.title }}</span>
            <ArrowRight
              class="h-4 w-4 shrink-0 transition-transform"
              :class="openSections.has(section.title) ? 'rotate-90' : ''"
            />
          </button>

          <ul v-show="openSections.has(section.title)" class="mt-1 space-y-1.5">
            <li v-for="item in section.items" :key="item.to">
              <span
                v-if="item.pending"
                class="flex h-11 cursor-not-allowed items-center justify-between gap-2 pr-3 pl-9 text-[15px] text-[var(--color-legend-dim)]"
                :title="`${item.label} lands with a later module — the backend for it does not exist yet.`"
              >
                {{ item.label }}
                <span class="eyebrow">soon</span>
              </span>

              <RouterLink
                v-else
                :to="item.to"
                class="flex h-11 items-center gap-2 border-l-2 pr-3 pl-8 text-[15px] transition-colors"
                :class="
                  route.path === item.to
                    ? 'border-l-[var(--color-signal)] bg-[var(--color-raised)] font-medium text-[var(--color-paper)]'
                    : 'border-l-transparent text-[var(--color-legend)] hover:bg-[var(--color-raised)] hover:text-[var(--color-paper)]'
                "
                @click="emit('close')"
              >
                <component :is="icon(item.icon)" class="h-3 w-3 shrink-0" />
                {{ item.label }}
              </RouterLink>
            </li>
          </ul>
        </template>
      </div>
    </nav>

    <div class="flex items-center gap-2 border-t border-[var(--color-edge)] px-4 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="eyebrow">Signed in as</div>
        <div class="truncate text-[14px] font-medium">{{ auth.admin?.name }}</div>
        <div class="key truncate text-[var(--color-legend)]">{{ auth.admin?.role?.key }}</div>
      </div>
      <button
        type="button"
        class="shrink-0 text-[13px] text-[var(--color-legend)] transition-colors hover:text-[var(--color-cut)]"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
  </aside>
</template>
