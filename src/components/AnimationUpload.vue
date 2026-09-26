<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, ref } from 'vue'

import AnimationPreview from '@/components/AnimationPreview.vue'
import { ApiError, api } from '@/lib/api'
import type { AnimationType, AnimationUploadResult } from '@/types/api'

/**
 * The animation field on a store item — URL input, Upload button and a live preview,
 * for SVGA, Lottie (.json) or MP4.
 *
 * Follows {@see ImageUpload}'s split on `recordId`, because the backend files an upload
 * under its record (`guftagu/storeItem/{id}/animation_….svga`):
 *
 *  - **Editing** (`recordId` set): uploads on pick and the backend saves it onto the item.
 *  - **Creating** (`recordId` null): the file is held and previewed locally; the parent
 *    calls `uploadNow(id)` right after the create call returns the new id.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    /** e.g. `/admin/store-items/animation` */
    uploadUrl: string
    recordId?: number | null
    label?: string
  }>(),
  { label: 'Animation', recordId: null },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** The file's animation type, so the parent can fill its own type field. */
  type: [type: AnimationType]
  saved: []
}>()

const EXTENSION_TYPES: Record<string, AnimationType> = { svga: 'svga', json: 'lottie', mp4: 'mp4' }

/** Mirrors StoreItemController::MAX_ANIMATION_KB, so an oversized file is refused on pick, not after Save. */
const MAX_MB = 50

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const pendingFile = ref<File | null>(null)
const pendingUrl = ref<string | null>(null)
const pendingType = ref<AnimationType | null>(null)
const hasPendingFile = computed(() => pendingFile.value !== null)

const previewSrc = computed(() => pendingUrl.value ?? props.modelValue)
/** Opens the standalone player page — a raw `.svga` URL only downloads in a browser. */
const previewPage = computed(() =>
  props.modelValue ? `/preview?src=${encodeURIComponent(props.modelValue)}` : null,
)

function revokePending() {
  if (pendingUrl.value) URL.revokeObjectURL(pendingUrl.value)
  pendingUrl.value = null
  pendingFile.value = null
  pendingType.value = null
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return

  const type = EXTENSION_TYPES[file.name.split('.').pop()?.toLowerCase() ?? '']
  if (!type) {
    ElMessage.error('Upload an SVGA, Lottie (.json) or MP4 file.')
    return
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    ElMessage.error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`)
    return
  }
  emit('type', type)

  if (props.recordId !== null) {
    await doUpload(file, props.recordId)
    return
  }

  revokePending()
  pendingFile.value = file
  pendingUrl.value = URL.createObjectURL(file)
  pendingType.value = type
}

async function doUpload(file: File, recordId: number): Promise<string | null> {
  uploading.value = true
  const body = new FormData()
  body.append('file', file)
  body.append('id', String(recordId))

  try {
    // A big SVGA goes browser → API → Vultr; the client's default 20 s timeout aborts it
    // mid-upload and the request shows up as "(canceled)".
    const { data } = await api.post<AnimationUploadResult>(props.uploadUrl, body, { timeout: 300_000 })
    emit('update:modelValue', data.url)
    ElMessage.success('Uploaded and saved')
    emit('saved')
    return data.url
  } catch (e) {
    // A 422's real reason ("larger than 50 MB") is in the field error, not the envelope message.
    if (e instanceof ApiError) ElMessage.error(e.fieldErrors.file ?? e.message)
    return null
  } finally {
    uploading.value = false
  }
}

/** Called by the parent right after it creates the record, now that an id exists. */
async function uploadNow(recordId: number): Promise<string | null> {
  if (!pendingFile.value) return null

  // Cleared either way: on failure the item already exists, so a retry is a fresh pick
  // that uploads straight onto it — a stale "saves once you create this" would mislead.
  const url = await doUpload(pendingFile.value, recordId)
  revokePending()
  return url
}

function onUrlInput(value: string) {
  revokePending()
  emit('update:modelValue', value)
}

onBeforeUnmount(revokePending)

defineExpose({ uploadNow, hasPendingFile })
</script>

<template>
  <div>
    <label class="eyebrow mb-1 block">{{ label }}</label>
    <div class="flex gap-2">
      <el-input
        :model-value="modelValue"
        placeholder="https://… or upload a file"
        clearable
        @update:model-value="onUrlInput"
      />
      <el-button :loading="uploading" @click="input?.click()">Upload</el-button>
    </div>

    <p v-if="hasPendingFile" class="eyebrow mt-1 text-[var(--color-signal)]">
      picked {{ pendingFile?.name }} · saves once you create this
    </p>
    <p v-else class="eyebrow mt-1">SVGA, Lottie (.json) or MP4 · up to {{ MAX_MB }} MB</p>

    <div v-if="previewSrc" class="mt-2 flex items-end gap-3">
      <AnimationPreview :key="previewSrc" :src="previewSrc" :type="pendingType" :size="140" />
      <a
        v-if="previewPage && !hasPendingFile"
        :href="previewPage"
        target="_blank"
        rel="noopener"
        class="eyebrow text-[var(--color-signal)] underline"
      >
        open preview in new tab
      </a>
    </div>

    <input
      ref="input"
      type="file"
      accept=".svga,.json,.mp4"
      class="hidden"
      @change="onFileChange"
    />
  </div>
</template>
