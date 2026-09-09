<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import NotificationBell from '@/components/NotificationBell.vue'
import SideRail from '@/components/SideRail.vue'
import { useCriticalAlerts } from '@/composables/useCriticalAlerts'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

// C.5a — critical-report alerts, polled every 5 seconds for as long as the panel is open,
// regardless of which screen is on view.
useCriticalAlerts()

const railOpen = ref(false)

/**
 * The API layer clears the session when the server rejects the token — idled out,
 * revoked, or suspended mid-shift. Without this the user would sit on a dead screen
 * watching every request fail, so leave for the login page, which explains what happened.
 */
watch(
  () => auth.endedReason,
  (reason) => {
    if (reason && reason !== 'signed_out') {
      void router.replace({ name: 'login' })
    }
  },
)

const initials = computed(() =>
  (auth.admin?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join(''),
)

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
</script>

<template>
  <div class="flex h-full">
    <SideRail :open="railOpen" @close="railOpen = false" />

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-edge)] bg-[var(--color-panel)] px-4"
      >
        <button
          type="button"
          class="text-[var(--color-legend)] hover:text-[var(--color-paper)] lg:hidden"
          aria-label="Open navigation"
          @click="railOpen = true"
        >
          <svg viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true">
            <rect x="1" y="3" width="14" height="1.5" />
            <rect x="1" y="7.25" width="14" height="1.5" />
            <rect x="1" y="11.5" width="14" height="1.5" />
          </svg>
        </button>

        <div class="flex-1" />

        <!-- Idle window is a live security setting, so it belongs on screen, not buried. -->
        <div class="eyebrow hidden sm:block" :title="'Your session ends after this long idle'">
          idle {{ auth.idleTimeoutMinutes }}m
        </div>

        <!-- C.5a / general — every role's own inbox, no permission key. -->
        <NotificationBell />

        <button
          type="button"
          class="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-legend)] transition-colors hover:text-[var(--color-paper)]"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <svg v-if="isDark" viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path
              d="M8 1.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 1.5Zm0 11a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 12.5ZM2.5 8a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 2.5 8Zm13 0a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75ZM4.34 4.34a.75.75 0 0 1 1.06 0l.71.7a.75.75 0 1 1-1.06 1.07l-.71-.71a.75.75 0 0 1 0-1.06Zm7.85 7.85a.75.75 0 0 1 1.06 0l.71.7a.75.75 0 1 1-1.06 1.06l-.71-.7a.75.75 0 0 1 0-1.06Zm.71-7.85a.75.75 0 0 1 0 1.06l-.71.7a.75.75 0 1 1-1.06-1.06l.71-.7a.75.75 0 0 1 1.06 0Zm-7.85 7.85a.75.75 0 0 1 0 1.06l-.7.7a.75.75 0 0 1-1.06-1.06l.7-.7a.75.75 0 0 1 1.06 0ZM8 4.5A3.5 3.5 0 1 1 4.5 8 3.5 3.5 0 0 1 8 4.5Z"
            />
          </svg>
          <svg v-else viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path
              d="M6.5 1.5a.5.5 0 0 1 .53.62A5.5 5.5 0 0 0 14.38 9.47a.5.5 0 0 1 .78.55A7 7 0 1 1 6.05 2.03a.5.5 0 0 1 .45-.53Z"
            />
          </svg>
        </button>

        <RouterLink
          to="/account"
          class="flex items-center gap-2 rounded-full border border-[var(--color-edge)] py-1 pr-3 pl-1 transition-colors hover:border-[var(--color-edge-bright)]"
        >
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-signal)] text-[11px] font-bold text-[var(--color-ink)]"
            aria-hidden="true"
          >
            {{ initials }}
          </span>
          <span class="hidden text-[13px] sm:block">{{ auth.admin?.name }}</span>
        </RouterLink>

        <button
          type="button"
          class="text-[13px] text-[var(--color-legend)] transition-colors hover:text-[var(--color-cut)]"
          @click="signOut"
        >
          Sign out
        </button>
      </header>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
