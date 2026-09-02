<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type {
  ModerationLogRow,
  ModerationStatsResult,
  OwnActionsResult,
  RecurringIssues,
  SanctionRegisterRow,
} from '@/types/api'

/** GFT-054 — moderator oversight (A.5c) plus the sanction register (A.5d). */
const stats = ref<ModerationStatsResult | null>(null)
const sanctions = ref<SanctionRegisterRow[]>([])
const logs = ref<ModerationLogRow[]>([])
const recurring = ref<RecurringIssues | null>(null)
const mine = ref<OwnActionsResult | null>(null)

const loading = ref(true)
const days = ref(7)
const activeOnly = ref(false)
const tab = ref('moderators')

onMounted(load)
watch([days, activeOnly], load)

async function load() {
  loading.value = true
  try {
    const [s, k, l] = await Promise.all([
      api.get<ModerationStatsResult>('/admin/moderation/stats', { days: days.value }),
      api.get<SanctionRegisterRow[]>('/admin/moderation/sanctions', {
        active_only: activeOnly.value || undefined,
        per_page: 50,
      }),
      api.get<ModerationLogRow[]>('/admin/moderation/logs', { per_page: 50 }),
    ])
    stats.value = s.data
    sanctions.value = k.data
    logs.value = l.data

    // C.5c and GFT-174. Loaded separately so a missing permission on one does not blank
    // the whole screen.
    await Promise.all([loadRecurring(), loadMine()])
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function loadRecurring() {
  try {
    const { data } = await api.get<RecurringIssues>('/admin/moderation/recurring')
    recurring.value = data
  } catch {
    // Not fatal — the rest of the screen still reads.
  }
}

async function loadMine() {
  try {
    const { data } = await api.get<OwnActionsResult>('/admin/moderation/my-actions')
    mine.value = data
  } catch {
    // Not fatal.
  }
}

function hours(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}m`
  return `${(minutes / 60).toFixed(1)}h`
}
</script>

<template>
  <PageHead
    eyebrow="Safety"
    title="Moderator activity"
    lede="Who decided what, how fast, and how often somebody had to undo it."
  >
    <template #actions>
      <el-select v-model="days" size="small" style="width: 130px">
        <el-option label="Last 7 days" :value="7" />
        <el-option label="Last 30 days" :value="30" />
        <el-option label="Last 90 days" :value="90" />
      </el-select>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs v-model="tab">
      <el-tab-pane label="Moderators" name="moderators">
        <div class="panel">
          <EmptyState
            v-if="stats && stats.moderators.length === 0"
            title="No moderation activity in this window"
            body="Either the queue has been quiet, or nobody has actioned a report yet."
          />

          <el-table v-else-if="stats" :data="stats.moderators" style="width: 100%">
            <el-table-column label="Moderator" min-width="180">
              <template #default="{ row }">
                <RouterLink :to="`/access/admins/${row.admin_user_id}`" class="hover:text-[var(--color-signal)]">
                  {{ row.name }}
                </RouterLink>
              </template>
            </el-table-column>
            <el-table-column label="Actions" width="100" align="right">
              <template #default="{ row }"><span class="key">{{ row.actions }}</span></template>
            </el-table-column>
            <el-table-column label="Dismissed" width="110" align="right">
              <template #default="{ row }"><span class="key">{{ row.dismissed }}</span></template>
            </el-table-column>
            <el-table-column label="Reversed" width="110" align="right">
              <template #default="{ row }"><span class="key">{{ row.reversed }}</span></template>
            </el-table-column>
            <el-table-column label="Reversal rate" width="140" align="right">
              <template #default="{ row }">
                <!-- The number oversight actually exists for. -->
                <span class="key" :class="row.reversal_rate >= 0.2 ? 'text-[var(--color-signal)]' : ''">
                  {{ (row.reversal_rate * 100).toFixed(1) }}%
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Avg response" width="130" align="right">
              <template #default="{ row }"><span class="key">{{ hours(row.avg_response_minutes) }}</span></template>
            </el-table-column>
          </el-table>

          <p v-if="stats" class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            {{ stats.note }}
          </p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Sanctions" name="sanctions">
        <div class="panel">
          <div class="flex items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
            <el-checkbox v-model="activeOnly" size="small" label="Only ones still in force" />
          </div>

          <EmptyState v-if="sanctions.length === 0" title="No sanctions on record" />

          <el-table v-else :data="sanctions" style="width: 100%">
            <el-table-column label="Who" min-width="150">
              <template #default="{ row }">
                <RouterLink
                  v-if="row.user"
                  :to="`/users/${row.user.id}`"
                  class="key hover:text-[var(--color-signal)]"
                >
                  {{ row.user.guftagu_id }}
                </RouterLink>
                <span v-else class="text-[var(--color-legend)]">—</span>
              </template>
            </el-table-column>
            <el-table-column label="Type" width="140">
              <template #default="{ row }"><span class="key">{{ row.type }}</span></template>
            </el-table-column>
            <el-table-column label="Reason" min-width="220">
              <template #default="{ row }"><span class="truncate">{{ row.reason }}</span></template>
            </el-table-column>
            <el-table-column label="Until" width="170">
              <template #default="{ row }">
                <span class="key">{{ row.expires_at ?? 'no end date' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="State" width="130">
              <template #default="{ row }">
                <el-tag v-if="row.in_force" type="danger" size="small">in force</el-tag>
                <el-tag v-else-if="row.revoked_at" size="small" type="info">revoked</el-tag>
                <el-tag v-else size="small" type="success">lapsed</el-tag>
              </template>
            </el-table-column>
          </el-table>

          <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            a lapsed ban stops biting the moment its window passes — the row stays flagged
            active until the reconciling job tidies it, but the account is already usable
          </p>
        </div>
      </el-tab-pane>

      <!-- C.5c -->
      <el-tab-pane name="recurring">
        <template #label>
          Recurring
          <el-badge v-if="recurring?.users.length" :value="recurring.users.length" class="ml-2" />
        </template>

        <div class="panel">
          <EmptyState
            v-if="recurring && recurring.users.length === 0 && recurring.rooms.length === 0"
            title="Nothing recurring"
            body="Nobody has been reported enough times in the window to stand out."
          />

          <template v-else-if="recurring">
            <el-table :data="recurring.users" style="width: 100%">
              <el-table-column label="Who" min-width="180">
                <template #default="{ row }">
                  <RouterLink :to="`/users/${row.id}`" class="hover:text-[var(--color-signal)]">
                    <div>{{ row.display_name ?? row.guftagu_id }}</div>
                    <div class="key text-[var(--color-legend)]">{{ row.guftagu_id }}</div>
                  </RouterLink>
                </template>
              </el-table-column>
              <el-table-column label="Reports" width="110" align="right">
                <template #default="{ row }">
                  <span class="key font-bold text-[var(--color-signal)]">{{ row.reports }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Reporters" width="120" align="right">
                <template #default="{ row }">
                  <!-- Five reports from one person is a feud; five from five is a pattern. -->
                  <span class="key">{{ row.distinct_reporters }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Status" width="120">
                <template #default="{ row }"><span class="key">{{ row.status }}</span></template>
              </el-table-column>
              <el-table-column label="Critical" width="100">
                <template #default="{ row }">
                  <el-tag v-if="row.has_critical" type="danger" size="small">yes</el-tag>
                  <span v-else class="eyebrow">—</span>
                </template>
              </el-table-column>
            </el-table>

            <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
              {{ recurring.note }}
            </p>
          </template>
        </div>
      </el-tab-pane>

      <!-- GFT-174 -->
      <el-tab-pane label="My actions" name="mine">
        <div class="panel">
          <EmptyState
            v-if="mine && mine.actions.length === 0"
            title="You have not actioned anything yet"
          />

          <template v-else-if="mine">
            <el-table :data="mine.actions" style="width: 100%">
              <el-table-column label="When" width="170">
                <template #default="{ row }">
                  <span class="key text-[var(--color-legend)]">
                    {{ row.created_at?.slice(0, 16).replace('T', ' ') }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="Action" width="150">
                <template #default="{ row }">
                  <span class="key" :class="row.reversed ? 'line-through opacity-60' : ''">
                    {{ row.action }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="On" min-width="150">
                <template #default="{ row }">
                  <span class="key text-[var(--color-legend)]">{{ row.target ?? '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Note" min-width="220">
                <template #default="{ row }">{{ row.note }}</template>
              </el-table-column>
              <el-table-column label="Reversed" width="180">
                <template #default="{ row }">
                  <template v-if="row.reversed">
                    <el-tag type="warning" size="small">by {{ row.reversed_by }}</el-tag>
                    <div class="eyebrow mt-1">{{ row.reversal_reason }}</div>
                  </template>
                  <span v-else class="eyebrow">—</span>
                </template>
              </el-table-column>
            </el-table>

            <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
              {{ mine.note }} · {{ mine.reversed }} of {{ mine.actions.length }} reversed
            </p>
          </template>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Log" name="log">
        <div class="panel">
          <EmptyState v-if="logs.length === 0" title="Nothing logged yet" />

          <el-table v-else :data="logs" style="width: 100%">
            <el-table-column label="When" width="180">
              <template #default="{ row }"><span class="key">{{ row.created_at }}</span></template>
            </el-table-column>
            <el-table-column label="By" width="150">
              <template #default="{ row }">
                <!-- `system` means time did it, not a person. -->
                <span :class="row.by === 'system' ? 'text-[var(--color-legend)]' : ''">{{ row.by }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Action" width="160">
              <template #default="{ row }"><span class="key">{{ row.action }}</span></template>
            </el-table-column>
            <el-table-column label="Target" width="150">
              <template #default="{ row }">
                <span class="key text-[var(--color-legend)]">{{ row.target_type }} #{{ row.target_id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Reason" min-width="220">
              <template #default="{ row }">{{ row.reason ?? '—' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
