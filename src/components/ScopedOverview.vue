<script setup lang="ts">
import { RouterLink } from 'vue-router'

import PageHead from '@/components/PageHead.vue'
import { money, moneyShort } from '@/lib/money'
import type { ScopedKpis } from '@/types/api'

/**
 * GFT-132 — the Manager dashboard variant (B.1a).
 *
 * A different panel, not a filtered one. The platform tiles — total users, DAU, recharge
 * revenue — are absent because they cannot be attributed to an agency; showing a scoped
 * version of them would mean inventing one. What is here is everything the scope genuinely
 * covers: hosts, what they earned, their targets, and what the agencies are owed.
 */
defineProps<{ data: ScopedKpis }>()
</script>

<template>
  <PageHead
    eyebrow="Console"
    title="Overview"
    :lede="`Your agencies: ${data.scope.agencies.map((a) => a.name).join(', ') || 'none assigned'}.`"
  />

  <div class="px-5 py-5 md:px-7">
    <!-- Said once, up front: this is a boundary, not an outage. -->
    <p class="panel mb-4 border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]">
      {{ data.note }}
    </p>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">hosts</div>
        <div class="stat-figure text-[20px]">{{ data.hosts.total }}</div>
        <div class="eyebrow">{{ data.hosts.under_contract }} under contract</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">earning</div>
        <div class="stat-figure text-[20px]">{{ data.earnings.earning_hosts }}</div>
        <div class="eyebrow">this period</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">diamonds</div>
        <div class="stat-figure text-[20px]">{{ data.earnings.diamonds.toLocaleString() }}</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">agency cut</div>
        <div class="stat-figure text-[20px] text-[var(--color-signal)]">
          {{ moneyShort(data.earnings.agency_cut_paise) }}
        </div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">paid to hosts</div>
        <div class="stat-figure text-[20px]">{{ moneyShort(data.earnings.host_cut_paise) }}</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">live rooms</div>
        <div class="stat-figure text-[20px]">{{ data.rooms.live }}</div>
        <div class="eyebrow">of {{ data.rooms.total }}</div>
      </div>
    </div>

    <p
      v-if="data.earnings.unpriced"
      class="panel mt-3 border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]"
    >
      Diamonds were earned in this period but no conversion rate covers it, so every rupee
      figure above reads zero. That is a missing rate, not a quiet month.
    </p>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <section class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Targets</div></div>
        <dl class="grid grid-cols-3 gap-2 px-4 py-3 text-[13px]">
          <div><dt class="eyebrow">running</dt><dd class="key text-[18px]">{{ data.targets.running }}</dd></div>
          <div><dt class="eyebrow">achieved</dt><dd class="key text-[18px] text-[var(--color-ok)]">{{ data.targets.achieved }}</dd></div>
          <div><dt class="eyebrow">missed</dt><dd class="key text-[18px]">{{ data.targets.missed }}</dd></div>
        </dl>
        <RouterLink to="/hosts" class="eyebrow block border-t border-[var(--color-edge)] px-4 py-2 hover:text-[var(--color-signal)]">
          open hosts →
        </RouterLink>
      </section>

      <section class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Settlements</div></div>
        <dl class="grid grid-cols-2 gap-3 px-4 py-3 text-[13px]">
          <div>
            <dt class="eyebrow">outstanding</dt>
            <dd class="key text-[18px] text-[var(--color-signal)]">{{ money(data.settlements.outstanding_paise) }}</dd>
          </div>
          <div><dt class="eyebrow">paid</dt><dd class="key text-[18px]">{{ money(data.settlements.paid_paise) }}</dd></div>
          <div><dt class="eyebrow">raised</dt><dd class="key">{{ data.settlements.raised }}</dd></div>
          <div><dt class="eyebrow">awaiting approval</dt><dd class="key">{{ data.settlements.approved }}</dd></div>
        </dl>
        <RouterLink to="/settlements" class="eyebrow block border-t border-[var(--color-edge)] px-4 py-2 hover:text-[var(--color-signal)]">
          open settlements →
        </RouterLink>
      </section>
    </div>

    <p class="eyebrow mt-3 leading-relaxed">
      {{ data.rooms.note }}
    </p>
  </div>
</template>
