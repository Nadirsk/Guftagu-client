<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AnimationPreview from '@/components/AnimationPreview.vue'

/**
 * `/preview?src=<url>` — a page that plays an SVGA/MP4 in the browser. Chrome has no
 * SVGA support, so opening the file's own URL only downloads it; this is the link to
 * share or open instead. Public (no sign-in) since the files themselves are public.
 */
const route = useRoute()
const src = computed(() => (typeof route.query.src === 'string' ? route.query.src : ''))
const fileName = computed(() => src.value.split('?')[0].split('/').pop() ?? '')
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-paper)] p-4">
    <template v-if="src">
      <AnimationPreview :src="src" :size="360" />
      <p class="key max-w-full truncate text-[var(--color-legend)]">{{ fileName }}</p>
      <a :href="src" download class="eyebrow text-[var(--color-signal)] underline">download file</a>
    </template>
    <p v-else class="eyebrow">add ?src=&lt;animation url&gt; to preview a file</p>
  </main>
</template>
