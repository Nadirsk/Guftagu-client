<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex min-h-full flex-col items-center justify-center px-6 text-center">
    <div class="eyebrow">Off air</div>
    <h1 class="mt-2 text-[22px] font-semibold tracking-tight">No screen at this address</h1>
    <p class="mt-2 max-w-md text-[13px] text-[var(--color-legend)]">
      That route does not exist in this build. Most of the console arrives with later modules —
      the sidebar marks those as unavailable.
    </p>
    <RouterLink to="/" class="mt-5">
      <el-button type="primary">Back to the console</el-button>
    </RouterLink>
  </div>
</template>
