<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { AudiencePreview, BroadcastRow, BroadcastSendResult, CampaignOutcome } from '@/types/api'

/** GFT-111 — the campaign composer: audience, preview, schedule, stats (A.10a). */
const rows = ref<BroadcastRow[]>([])
const preview = ref<AudiencePreview | null>(null)
const outcome = ref<CampaignOutcome | null>(null)
const outcomeDialog = ref(false)

const loading = ref(true)
const busy = ref(false)
const previewing = ref(false)
const composer = ref(false)
const editing = ref<BroadcastRow | null>(null)

const form = ref({
  title: '',
  body: '',
  deep_link: '',
  audience: 'all' as 'all' | 'segment' | 'user_list',
  channels: ['in_app'] as string[],
  scheduled_at: '',
  filter: {
    status: '',
    country: '',
    language: '',
    recharged_within_days: null as number | null,
    active_within_days: null as number | null,
    min_coins_spent: null as number | null,
  },
})

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'info' | 'danger' | ''> = {
  sent: 'success',
  scheduled: 'warning',
  sending: '',
  draft: 'info',
  cancelled: 'info',
  failed: 'danger',
}

onMounted(async () => {
  await load()
  loading.value = false
})

// Re-size the audience whenever the targeting changes — the count is the whole point of
// the composer, and a stale one is worse than none.
watch(() => [form.value.audience, form.value.filter, form.value.channels], sizeAudience, { deep: true })

async function load() {
  try {
    const { data } = await api.get<BroadcastRow[]>('/admin/broadcasts', { per_page: 50 })
    rows.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

/** Strip the empty fields — the backend refuses unrecognised keys, not empty ones. */
function activeFilter(): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(form.value.filter)) {
    if (value !== '' && value !== null) out[key] = value
  }

  return out
}

async function sizeAudience() {
  if (!composer.value) return

  previewing.value = true
  try {
    const { data } = await api.post<AudiencePreview>('/admin/broadcasts/preview', {
      audience: form.value.audience,
      audience_filter: form.value.audience === 'segment' ? activeFilter() : {},
      channels: form.value.channels,
    })
    preview.value = data
  } catch (e) {
    preview.value = null
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    previewing.value = false
  }
}

function compose() {
  editing.value = null
  form.value = {
    title: '', body: '', deep_link: '', audience: 'all', channels: ['in_app'], scheduled_at: '',
    filter: {
      status: '', country: '', language: '',
      recharged_within_days: null, active_within_days: null, min_coins_spent: null,
    },
  }
  preview.value = null
  composer.value = true
  sizeAudience()
}

function edit(row: BroadcastRow) {
  editing.value = row
  form.value = {
    title: row.title,
    body: row.body,
    deep_link: row.deep_link ?? '',
    audience: row.audience,
    channels: [...row.channels],
    scheduled_at: row.scheduled_at?.slice(0, 16) ?? '',
    filter: {
      status: '', country: '', language: '',
      recharged_within_days: null, active_within_days: null, min_coins_spent: null,
    },
  }
  composer.value = true
  sizeAudience()
}

async function save() {
  const body = {
    title: form.value.title,
    body: form.value.body,
    deep_link: form.value.deep_link || null,
    audience: form.value.audience,
    audience_filter: form.value.audience === 'segment' ? activeFilter() : {},
    channels: form.value.channels,
    scheduled_at: form.value.scheduled_at || null,
  }

  busy.value = true
  try {
    if (editing.value) {
      await api.patch(`/admin/broadcasts/${editing.value.id}`, body)
    } else {
      await api.post('/admin/broadcasts', body)
    }
    ElMessage.success('Saved')
    composer.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function send(row: BroadcastRow) {
  try {
    await ElMessageBox.confirm(
      'This cannot be recalled. Check the audience before confirming.',
      `Send "${row.title}"?`,
      { confirmButtonText: 'Send', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  busy.value = true
  try {
    const { data } = await api.post<BroadcastSendResult>(`/admin/broadcasts/${row.id}/send`)

    ElMessage.success(`${data.in_app_created.toLocaleString()} in-app messages written`)

    // The push leg genuinely did not happen. Say so rather than letting a green toast
    // imply it did.
    if (data.note) ElMessage.warning(data.note)

    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** B.5b — what happened after the send. */
async function showOutcome(row: BroadcastRow) {
  outcome.value = null
  outcomeDialog.value = true

  try {
    const { data } = await api.get<CampaignOutcome>(`/admin/broadcasts/${row.id}/outcome`)
    outcome.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function cancel(row: BroadcastRow) {
  busy.value = true
  try {
    await api.post(`/admin/broadcasts/${row.id}/cancel`)
    ElMessage.success('Cancelled')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Content"
    title="Campaigns"
    lede="Compose, size the audience, and send. The count you see before sending is the query that actually runs."
  >
    <template #actions>
      <el-button v-permission="'cms.announcement_manage'" size="small" type="primary" @click="compose">
        New campaign
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div class="panel">
      <EmptyState
        v-if="rows.length === 0"
        title="No campaigns yet"
        body="A campaign writes an in-app message to everyone in its audience, and will push to them once the mobile app registers tokens."
      />

      <el-table v-else :data="rows" style="width: 100%">
        <el-table-column label="Campaign" min-width="240">
          <template #default="{ row }">
            <div class="font-medium">{{ row.title }}</div>
            <div class="eyebrow truncate">{{ row.body }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Audience" width="140">
          <template #default="{ row }">
            <span class="key">{{ row.audience }}</span>
            <div v-if="row.audience_count !== null" class="eyebrow">
              {{ row.audience_count.toLocaleString() }} people
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Channels" width="120">
          <template #default="{ row }">
            <span class="key">{{ row.channels.join(', ') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Sent" width="100" align="right">
          <template #default="{ row }"><span class="key">{{ row.sent_count.toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="Delivered" width="110" align="right">
          <template #default="{ row }">
            <!-- A dash, not 0% — nothing has reported back, which is not the same as
                 nothing having arrived. -->
            <span class="key text-[var(--color-legend)]">
              {{ row.delivery_rate === null ? '—' : `${(row.delivery_rate * 100).toFixed(0)}%` }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="180" align="right">
          <template #default="{ row }">
            <el-button v-if="row.is_editable" size="small" text @click="edit(row)">Edit</el-button>
            <el-button
              v-if="row.is_editable"
              v-permission="'cms.campaign_send'"
              size="small"
              text
              :loading="busy"
              @click="send(row)"
            >
              Send
            </el-button>
            <el-button v-if="row.is_editable" size="small" text :loading="busy" @click="cancel(row)">
              Cancel
            </el-button>
            <el-button v-if="row.status === 'sent'" size="small" text @click="showOutcome(row)">
              Outcome
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
        in-app messages are written for real; push delivery waits on the mobile app registering
        tokens, so delivered and opened stay empty until then
      </p>
    </div>
  </div>

  <el-dialog v-model="outcomeDialog" title="Campaign outcome" width="460px">
    <div v-if="outcome && outcome.sent" class="space-y-3">
      <div class="grid grid-cols-3 gap-3">
        <div>
          <div class="eyebrow">reached</div>
          <div class="stat-figure text-[20px]">{{ outcome.reach?.toLocaleString() }}</div>
        </div>
        <div>
          <div class="eyebrow">opened</div>
          <!-- Null, not 0% — nothing has reported back. -->
          <div class="stat-figure text-[20px] text-[var(--color-legend)]">
            {{ outcome.open_rate === null ? '—' : `${((outcome.open_rate ?? 0) * 100).toFixed(0)}%` }}
          </div>
        </div>
        <div>
          <div class="eyebrow">recharged</div>
          <div class="stat-figure text-[20px] text-[var(--color-signal)]">
            {{ outcome.recharging_users?.toLocaleString() }}
          </div>
        </div>
      </div>

      <dl class="grid grid-cols-2 gap-2 text-[13px]">
        <div>
          <dt class="eyebrow">recharges</dt>
          <dd class="key">{{ outcome.recharges?.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="eyebrow">coins bought</dt>
          <dd class="key">{{ outcome.coins_purchased?.toLocaleString() }}</dd>
        </div>
      </dl>

      <p class="panel border-l-2 border-l-[var(--color-signal)] px-3 py-2 text-[13px]">
        {{ outcome.note }}
      </p>
    </div>

    <p v-else-if="outcome" class="text-[13px] text-[var(--color-legend)]">{{ outcome.note }}</p>
  </el-dialog>

  <!-- Composer -->
  <el-drawer v-model="composer" size="560px" :title="editing ? 'Edit campaign' : 'New campaign'">
    <div class="space-y-4">
      <el-form label-position="top">
        <el-form-item label="Title"><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item label="Message">
          <el-input v-model="form.body" type="textarea" :rows="3" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item label="Opens (deep link)">
          <el-input v-model="form.deep_link" placeholder="guftagu://rooms/123" />
        </el-form-item>

        <el-form-item label="Channels">
          <el-checkbox-group v-model="form.channels">
            <el-checkbox value="in_app" label="In-app inbox" />
            <el-checkbox value="push" label="Push" />
          </el-checkbox-group>
          <p v-if="form.channels.includes('push')" class="eyebrow mt-1 leading-relaxed">
            push is recorded but not dispatched — FCM lands with the mobile app
          </p>
        </el-form-item>

        <el-form-item label="Who gets it">
          <el-radio-group v-model="form.audience">
            <el-radio-button value="all">Everyone</el-radio-button>
            <el-radio-button value="segment">A segment</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.audience === 'segment'">
          <el-form-item label="Recharged in the last N days">
            <el-input-number v-model="form.filter.recharged_within_days" :min="1" :max="365" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Active in the last N days">
            <el-input-number v-model="form.filter.active_within_days" :min="1" :max="365" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Spent at least (coins)">
            <el-input-number v-model="form.filter.min_coins_spent" :min="0" :step="500" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Country"><el-input v-model="form.filter.country" placeholder="India" /></el-form-item>
          <el-form-item label="Language">
            <el-select v-model="form.filter.language" clearable placeholder="Any" style="width: 100%">
              <el-option label="English" value="en" />
              <el-option label="Hindi" value="hi" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item label="Send at">
          <el-input v-model="form.scheduled_at" type="datetime-local" />
          <p class="eyebrow mt-1">leave blank to keep it as a draft</p>
        </el-form-item>
      </el-form>

      <!-- The count A.10a asks for, before anything is sent. -->
      <section v-loading="previewing" class="panel px-4 py-3">
        <div class="eyebrow mb-2">Audience</div>

        <div v-if="preview" class="space-y-2">
          <div class="flex items-baseline gap-4">
            <div>
              <div class="stat-figure text-[22px]">{{ preview.matched.toLocaleString() }}</div>
              <div class="eyebrow">match</div>
            </div>
            <div>
              <div class="stat-figure text-[22px] text-[var(--color-signal)]">
                {{ preview.reachable_push.toLocaleString() }}
              </div>
              <div class="eyebrow">reachable by push</div>
            </div>
          </div>

          <p v-if="preview.note" class="text-[13px] text-[var(--color-legend)]">{{ preview.note }}</p>

          <div v-if="preview.sample.length" class="pt-1">
            <div class="eyebrow">for example</div>
            <p class="key">
              {{ preview.sample.map((s) => s.display_name ?? s.guftagu_id).join(', ') }}
            </p>
          </div>
        </div>

        <p v-else class="text-[13px] text-[var(--color-legend)]">
          Adjust the targeting to size the audience.
        </p>
      </section>

      <div class="flex gap-2">
        <el-button @click="composer = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="save">Save</el-button>
      </div>
    </div>
  </el-drawer>
</template>
