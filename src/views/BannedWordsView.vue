<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { BannedWordRow, FilterTestResult } from '@/types/api'

/** GFT-052 — the banned-word manager and the try-a-phrase box (A.5a). */
const rows = ref<BannedWordRow[]>([])
const loading = ref(true)
const busy = ref(false)

const filters = ref({ q: '', severity: '' })

const SCOPES = ['room_name', 'chat', 'bio', 'dm']
const SEVERITIES = [
  { value: 'block', label: 'Block', note: 'The content is refused outright.' },
  { value: 'replace', label: 'Replace', note: 'Delivered with the term swapped, and flagged.' },
  { value: 'flag', label: 'Flag', note: 'Delivered untouched, and flagged for review.' },
]

const dialog = ref(false)
const editing = ref<BannedWordRow | null>(null)
const form = ref({
  word: '',
  language: 'en',
  severity: 'block',
  replacement: '',
  scope: [] as string[],
  is_regex: false,
  is_active: true,
})

const importDialog = ref(false)
const importText = ref('')
const importSeverity = ref('block')

const probe = ref('')
const probeScope = ref('chat')
const probeResult = ref<FilterTestResult | null>(null)

onMounted(load)
watch(filters, load, { deep: true })

async function load() {
  loading.value = true
  try {
    const { data } = await api.get<BannedWordRow[]>('/admin/moderation/banned-words', {
      q: filters.value.q || undefined,
      severity: filters.value.severity || undefined,
      per_page: 200,
    })
    rows.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function create() {
  editing.value = null
  form.value = { word: '', language: 'en', severity: 'block', replacement: '', scope: [], is_regex: false, is_active: true }
  dialog.value = true
}

function edit(row: BannedWordRow) {
  editing.value = row
  form.value = {
    word: row.word,
    language: row.language,
    severity: row.severity,
    replacement: row.replacement ?? '',
    scope: [...row.scope],
    is_regex: row.is_regex,
    is_active: row.is_active,
  }
  dialog.value = true
}

async function save() {
  busy.value = true
  const body = {
    ...form.value,
    replacement: form.value.severity === 'replace' ? form.value.replacement || '***' : null,
  }

  try {
    if (editing.value) {
      await api.patch(`/admin/moderation/banned-words/${editing.value.id}`, body)
    } else {
      await api.post('/admin/moderation/banned-words', body)
    }
    ElMessage.success('Saved — the rule is live immediately')
    dialog.value = false
    await load()
    if (probe.value) await runProbe()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function remove(row: BannedWordRow) {
  try {
    await ElMessageBox.confirm(
      `"${row.word}" stops being filtered everywhere, at once.`,
      'Remove this rule?',
      { confirmButtonText: 'Remove', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await api.del(`/admin/moderation/banned-words/${row.id}`)
    ElMessage.success('Removed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function runImport() {
  const words = importText.value
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean)

  if (words.length === 0) return

  busy.value = true
  try {
    const { data } = await api.post<{ added: number; skipped: string[] }>(
      '/admin/moderation/banned-words/import',
      { words, severity: importSeverity.value },
    )
    ElMessage.success(
      data.skipped.length
        ? `${data.added} added, ${data.skipped.length} already on the list`
        : `${data.added} added`,
    )
    importDialog.value = false
    importText.value = ''
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** Runs the same filter the platform runs, so this is what would really happen. */
async function runProbe() {
  if (!probe.value.trim()) {
    probeResult.value = null
    return
  }

  try {
    const { data } = await api.post<FilterTestResult>('/admin/moderation/filter-test', {
      text: probe.value,
      scope: probeScope.value,
    })
    probeResult.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

const SEVERITY_TYPE: Record<string, 'danger' | 'warning' | 'info'> = {
  block: 'danger',
  replace: 'warning',
  flag: 'info',
}
</script>

<template>
  <PageHead
    eyebrow="Safety"
    title="Content filter"
    lede="What the platform refuses, cleans up, or quietly flags — on every chat message, room name, bio and DM."
  >
    <template #actions>
      <el-button v-permission="'moderation.bannedwords_manage'" size="small" @click="importDialog = true">
        Bulk import
      </el-button>
      <el-button v-permission="'moderation.bannedwords_manage'" size="small" type="primary" @click="create">
        Add rule
      </el-button>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div v-loading="loading" class="panel">
        <div class="flex flex-wrap items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
          <el-input v-model="filters.q" placeholder="Search words" size="small" clearable style="width: 200px" />
          <el-select v-model="filters.severity" placeholder="Any severity" size="small" clearable style="width: 150px">
            <el-option v-for="s in SEVERITIES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <span class="eyebrow ml-auto">{{ rows.length }} rules</span>
        </div>

        <EmptyState
          v-if="!loading && rows.length === 0"
          title="No rules yet"
          body="Nothing is being filtered. Add a rule, or paste a list with bulk import."
        />

        <el-table v-else :data="rows" style="width: 100%">
          <el-table-column label="Term" min-width="200">
            <template #default="{ row }">
              <span class="key" :class="row.is_active ? '' : 'opacity-50 line-through'">{{ row.word }}</span>
              <el-tag v-if="row.is_regex" size="small" type="info" class="ml-2">regex</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Severity" width="110">
            <template #default="{ row }">
              <el-tag :type="SEVERITY_TYPE[row.severity]" size="small">{{ row.severity }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Where" min-width="160">
            <template #default="{ row }">
              <span v-if="row.applies_everywhere" class="text-[var(--color-legend)]">everywhere</span>
              <span v-else class="key">{{ row.scope.join(', ') }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Lang" width="70">
            <template #default="{ row }"><span class="key">{{ row.language }}</span></template>
          </el-table-column>
          <el-table-column width="130" align="right">
            <template #default="{ row }">
              <el-button v-permission="'moderation.bannedwords_manage'" size="small" text @click="edit(row)">
                Edit
              </el-button>
              <el-button v-permission="'moderation.bannedwords_manage'" size="small" text @click="remove(row)">
                Remove
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Try a phrase -->
      <aside class="panel h-fit">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Try a phrase</div></div>
        <div class="space-y-2 px-4 py-3">
          <el-input
            v-model="probe"
            type="textarea"
            :rows="3"
            placeholder="Paste something a user might send."
            @blur="runProbe"
          />
          <el-select v-model="probeScope" size="small" style="width: 100%" @change="runProbe">
            <el-option v-for="s in SCOPES" :key="s" :label="s" :value="s" />
          </el-select>
          <el-button size="small" style="width: 100%" @click="runProbe">Check</el-button>

          <div v-if="probeResult" class="space-y-2 pt-1">
            <el-tag v-if="probeResult.severity" :type="SEVERITY_TYPE[probeResult.severity]" size="small">
              {{ probeResult.severity }}
            </el-tag>
            <el-tag v-else size="small" type="success">passes</el-tag>

            <p class="text-[13px]">{{ probeResult.outcome }}</p>

            <div v-if="probeResult.severity === 'replace'">
              <div class="eyebrow">delivered as</div>
              <p class="key">{{ probeResult.filtered }}</p>
            </div>

            <div v-if="probeResult.matches.length">
              <div class="eyebrow">matched</div>
              <p class="key">{{ probeResult.matches.map((m) => m.word).join(', ') }}</p>
            </div>
          </div>
        </div>
        <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
          runs the same filter the platform runs — and never writes a flag, so testing cannot
          pollute the review queue
        </p>
      </aside>
    </div>
  </div>

  <el-dialog v-model="dialog" :title="editing ? 'Edit rule' : 'Add rule'" width="480px">
    <el-form label-position="top">
      <el-form-item label="Term">
        <el-input v-model="form.word" placeholder="free coins" />
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.is_regex" label="This is a regular expression" />
        <p class="eyebrow leading-relaxed">
          plain terms match on a boundary, so "ass" will not fire inside "classic"
        </p>
      </el-form-item>

      <el-form-item label="Severity">
        <el-radio-group v-model="form.severity">
          <el-radio-button v-for="s in SEVERITIES" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
        </el-radio-group>
        <p class="eyebrow mt-1 leading-relaxed">
          {{ SEVERITIES.find((s) => s.value === form.severity)?.note }}
        </p>
      </el-form-item>

      <el-form-item v-if="form.severity === 'replace'" label="Replace with">
        <el-input v-model="form.replacement" placeholder="***" />
      </el-form-item>

      <el-form-item label="Where it applies">
        <el-select v-model="form.scope" multiple placeholder="Everywhere" style="width: 100%">
          <el-option v-for="s in SCOPES" :key="s" :label="s" :value="s" />
        </el-select>
        <p class="eyebrow mt-1 leading-relaxed">leave empty for every surface</p>
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.is_active" label="Active" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="save">Save</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="importDialog" title="Bulk import" width="480px">
    <el-form label-position="top">
      <el-form-item label="Terms">
        <el-input v-model="importText" type="textarea" :rows="8" placeholder="One per line, or comma-separated." />
      </el-form-item>
      <el-form-item label="Severity for all of them">
        <el-select v-model="importSeverity" style="width: 100%">
          <el-option v-for="s in SEVERITIES" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </el-form-item>
    </el-form>
    <p class="eyebrow leading-relaxed">
      terms already on the list are skipped and named back to you — one duplicate will not
      lose the rest of the paste
    </p>

    <template #footer>
      <el-button @click="importDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="runImport">Import</el-button>
    </template>
  </el-dialog>
</template>
