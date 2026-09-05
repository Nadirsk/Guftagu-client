import { ref } from 'vue'

const STORAGE_KEY = 'guftagu-theme'

type Theme = 'light' | 'dark'

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStored(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

// Module-level so every component sharing this composable reads/writes the same lamp.
const isDark = ref((readStored() ?? (systemPrefersDark() ? 'dark' : 'light')) === 'dark')

function apply() {
  document.documentElement.classList.toggle('dark', isDark.value)
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', isDark.value ? 'dark' : 'light')
  localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light')
}

// Applied once at module load (main.ts imports this before mount) so the console never
// paints one theme and then flips to the other.
apply()

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value
    apply()
  }

  return { isDark, toggleTheme }
}
