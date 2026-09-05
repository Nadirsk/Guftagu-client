<script setup lang="ts">
import { computed } from 'vue'

import StateLamp from '@/components/StateLamp.vue'
import { ORIGIN_LABEL, isDenied } from '@/lib/permissions'
import type { EffectivePermissionRow, GrantScope, PermissionItem, RiskLevel } from '@/types/api'

/**
 * One channel on the desk. Two jobs, one component, so a permission looks identical
 * wherever it appears:
 *
 *  - readonly  → the effective-permission viewer (GFT-126), showing state and origin
 *  - selectable → the grant UI (GFT-124), where it becomes a checkbox
 */
const props = withDefaults(
  defineProps<{
    permission: PermissionItem
    row?: EffectivePermissionRow | null
    selectable?: boolean
    modelValue?: boolean
    disabled?: boolean
    disabledReason?: string
  }>(),
  { row: null, selectable: false, modelValue: false, disabled: false, disabledReason: '' },
)

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const denied = computed(() => (props.row ? isDenied(props.row.origin) : false))

const lamp = computed(() => {
  if (!props.row) return 'off' as const
  if (denied.value) return 'denied' as const
  if (props.row.origin === 'super_admin') return 'all' as const
  if (props.row.origin === 'role') return 'role' as const
  return 'direct' as const
})

const originTag = computed(() => (props.row ? ORIGIN_LABEL[props.row.origin] : null))

const isHighRisk = computed(() => props.permission.risk_level === ('high' as RiskLevel))

/** Reads a scope back as the shift-and-category phrase an operator would say out loud. */
const scopeSummary = computed(() => {
  const scope: GrantScope | null | undefined = props.row?.scope
  if (!scope) return null

  const parts: string[] = []
  if (scope.room_categories?.length) {
    parts.push(`categories ${scope.room_categories.join(', ')}`)
  }
  if (scope.agencies?.length) {
    parts.push(`agencies ${scope.agencies.join(', ')}`)
  }
  if (scope.shift?.from && scope.shift?.to) {
    parts.push(`${scope.shift.from}–${scope.shift.to}`)
  }
  return parts.length ? parts.join(' · ') : null
})

const expiry = computed(() => {
  if (!props.row?.expires_at) return null
  const when = new Date(props.row.expires_at)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
})

function toggle() {
  if (!props.selectable || props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <component
    :is="selectable ? 'button' : 'div'"
    :type="selectable ? 'button' : undefined"
    :disabled="selectable && disabled"
    :aria-pressed="selectable ? modelValue : undefined"
    :title="disabled ? disabledReason : undefined"
    class="group relative flex w-full items-start gap-2.5 border px-2.5 py-2 text-left transition-colors"
    :class="[
      selectable && !disabled ? 'cursor-pointer hover:border-[var(--color-edge-bright)]' : '',
      selectable && disabled ? 'cursor-not-allowed opacity-45' : '',
      modelValue && selectable
        ? 'border-[var(--color-signal)] bg-[color-mix(in_srgb,var(--color-signal)_10%,transparent)]'
        : 'border-[var(--color-edge)] bg-[var(--color-panel)]',
      denied ? 'border-l-2 border-l-[var(--color-cut)]' : '',
    ]"
    style="border-radius: 3px"
    @click="toggle"
  >
    <!-- A hatched guard over the switch, the way a desk covers a high-consequence control. -->
    <span
      v-if="isHighRisk"
      class="safety-hatch pointer-events-none absolute inset-y-0 right-0 w-8"
      aria-hidden="true"
      style="border-radius: 0 2px 2px 0"
    />

    <span class="mt-1 flex items-center">
      <span
        v-if="selectable"
        class="flex h-3.5 w-3.5 items-center justify-center border"
        :class="
          modelValue
            ? 'border-[var(--color-signal)] bg-[var(--color-signal)]'
            : 'border-[var(--color-edge-bright)]'
        "
        style="border-radius: 2px"
      >
        <svg
          v-if="modelValue"
          viewBox="0 0 10 10"
          class="h-2.5 w-2.5"
          fill="none"
          stroke="var(--color-ink)"
          stroke-width="2"
        >
          <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <StateLamp v-else :state="lamp" />
    </span>

    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          class="key truncate"
          :class="denied ? 'text-[var(--color-legend)] line-through' : 'text-[var(--color-paper)]'"
        >
          {{ permission.key }}
        </span>

        <span
          v-if="originTag"
          class="eyebrow shrink-0"
          :class="denied ? 'text-[var(--color-cut)]' : 'text-[var(--color-signal)]'"
        >
          {{ originTag }}
        </span>

        <span v-if="isHighRisk" class="eyebrow shrink-0 text-[var(--color-cut)]">high risk</span>
      </span>

      <span class="mt-0.5 block truncate text-[12px] text-[var(--color-legend)]">
        {{ permission.name }}
      </span>

      <span
        v-if="scopeSummary || expiry"
        class="eyebrow mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--color-route)]"
      >
        <span v-if="scopeSummary">scoped · {{ scopeSummary }}</span>
        <span v-if="expiry">expires {{ expiry }}</span>
      </span>
    </span>
  </component>
</template>
