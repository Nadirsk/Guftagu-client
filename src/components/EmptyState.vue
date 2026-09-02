<script setup lang="ts">
defineProps<{ title: string; body?: string }>()
</script>

<template>
  <!-- An empty screen is an invitation to act, so it always names the next step. -->
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <span class="mb-3 flex gap-1" aria-hidden="true">
      <span class="h-6 w-1 bg-[var(--color-edge)]" />
      <span class="h-3 w-1 self-end bg-[var(--color-edge)]" />
      <span class="h-8 w-1 bg-[var(--color-edge-bright)]" />
      <span class="h-4 w-1 self-end bg-[var(--color-edge)]" />
      <span class="h-6 w-1 bg-[var(--color-edge)]" />
    </span>
    <p class="text-[14px] font-medium">{{ title }}</p>
    <p v-if="body" class="mt-1 max-w-sm text-[13px] text-[var(--color-legend)]">{{ body }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
