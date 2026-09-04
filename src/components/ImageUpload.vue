<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, ref } from 'vue'

import { ApiError, api } from '@/lib/api'
import type { ImageUploadResult } from '@/types/api'

/**
 * One upload control, reused everywhere an admin attaches an image to a record —
 * gift thumbnails, category icons, level badges.
 *
 * Every one of these upload endpoints requires an existing record id to save onto
 * (mehfil/Trumac's own upload controllers do the same — `id` is `required`, not
 * optional). So the behaviour splits on whether `recordId` is set:
 *
 *  - **Editing** (`recordId` set): uploads immediately on file pick, and the backend
 *    saves the URL onto that record in the same request — one step, nothing else to do.
 *  - **Creating** (`recordId` null): there is no id yet, so the file is only held and
 *    previewed locally. The parent creates the record first, gets its new id back,
 *    then calls `uploadNow(id)` (via a template ref) to actually upload — the same
 *    create-then-upload sequence mehfil's and Trumac's own admin forms use.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null
    /** e.g. `/admin/gifts/thumbnail` */
    uploadUrl: string
    /** The record's id, when editing one that already exists. Omit when creating. */
    recordId?: number | null
    label?: string
  }>(),
  { label: 'Image', recordId: null },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | null]; saved: [] }>()

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const pendingFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const hasPendingFile = computed(() => pendingFile.value !== null)

/** What the preview box actually shows — a picked-but-not-yet-uploaded file wins. */
const displayUrl = computed(() => previewUrl.value ?? props.modelValue)

function pick() {
  input.value?.click()
}

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (props.recordId !== null) {
    await doUpload(file, props.recordId)
    if (input.value) input.value.value = ''
    return
  }

  // No record yet — hold the file and preview it locally. The parent uploads it for
  // real once it has an id, via uploadNow().
  revokePreview()
  pendingFile.value = file
  previewUrl.value = URL.createObjectURL(file)
  if (input.value) input.value.value = ''
}

async function doUpload(file: File, recordId: number): Promise<string | null> {
  uploading.value = true
  const body = new FormData()
  body.append('file', file)
  body.append('id', String(recordId))

  try {
    const { data } = await api.post<ImageUploadResult>(props.uploadUrl, body)
    emit('update:modelValue', data.url)
    ElMessage.success('Uploaded and saved')
    emit('saved')
    return data.url
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
    return null
  } finally {
    uploading.value = false
  }
}

/** Called by the parent right after it creates the record, now that an id exists. */
async function uploadNow(recordId: number): Promise<string | null> {
  if (!pendingFile.value) return null

  const url = await doUpload(pendingFile.value, recordId)
  if (url !== null) {
    pendingFile.value = null
    revokePreview()
  }
  return url
}

function clear() {
  pendingFile.value = null
  revokePreview()
  emit('update:modelValue', null)
}

onBeforeUnmount(revokePreview)

defineExpose({ uploadNow, hasPendingFile })
</script>

<template>
  <div>
    <label class="eyebrow mb-1 block">{{ label }}</label>
    <div class="flex items-center gap-3">
      <div
        class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-edge)] bg-[var(--color-recess)]"
        style="border-radius: 4px"
      >
        <img v-if="displayUrl" :src="displayUrl" alt="" class="h-full w-full object-cover" />
        <svg v-else viewBox="0 0 24 24" class="h-5 w-5 text-[var(--color-legend)]" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
          <path d="M21 15l-5-5-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex gap-2">
          <el-button size="small" :loading="uploading" @click="pick">
            {{ displayUrl ? 'Replace' : 'Upload' }}
          </el-button>
          <el-button v-if="displayUrl" size="small" text @click="clear">Remove</el-button>
        </div>
        <p v-if="hasPendingFile" class="eyebrow text-[var(--color-signal)]">
          picked · saves once you create this
        </p>
        <p v-else class="eyebrow">JPG, PNG, WEBP or GIF · up to 5 MB</p>
      </div>

      <input
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="onFileChange"
      />
    </div>
  </div>
</template>
