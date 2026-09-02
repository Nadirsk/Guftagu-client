<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; lede?: string }>()
</script>

<template>
  <header class="border-b border-[var(--color-edge)] px-5 py-4 md:px-7 md:py-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div v-if="eyebrow" class="eyebrow mb-1">{{ eyebrow }}</div>
        <h1 class="text-[19px] leading-tight font-semibold tracking-tight md:text-[22px]">
          {{ title }}
        </h1>
        <p v-if="lede" class="mt-1 max-w-2xl text-[13px] text-[var(--color-legend)]">
          {{ lede }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </header>
</template>
