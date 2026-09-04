import { api } from '@/lib/api'

/**
 * Debounced English → Hindi draft translation for the bilingual name fields (categories,
 * gifts, levels, VIP tiers). Best-effort only: a failure or empty result is silently
 * ignored, since the Hindi field stays a normal editable input either way.
 */
export function useHindiAutofill(hindiRef: { value: string }) {
  let timer: number | undefined
  let requestId = 0

  function onEnglishInput(english: string) {
    window.clearTimeout(timer)

    // Only offer a draft while the admin has not typed one — never overwrite real work.
    if (hindiRef.value.trim() !== '') return

    const text = english.trim()
    if (!text) return

    const thisRequest = ++requestId
    timer = window.setTimeout(async () => {
      try {
        const { data } = await api.post<{ translated: string | null }>('/admin/translate', { text })

        // Stale response, or the admin started typing their own Hindi name meanwhile.
        if (thisRequest !== requestId || hindiRef.value.trim() !== '') return

        if (data.translated) hindiRef.value = data.translated
      } catch {
        /* best-effort — the admin can always type it themselves */
      }
    }, 500)
  }

  return { onEnglishInput }
}
