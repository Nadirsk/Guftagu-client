<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ref, watch } from 'vue'

import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { LastOtp } from '@/types/api'

/**
 * GFT-122 — granting a high-risk permission needs a fresh OTP. Opened by the grant flow
 * when the API answers `MFA_REQUIRED`, so the operator confirms and retries in place
 * rather than losing the selection they just made.
 */
const props = defineProps<{ modelValue: boolean; highRisk: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; confirmed: [] }>()

const auth = useAuthStore()

const sending = ref(false)
const verifying = ref(false)
const challengeId = ref<string | null>(null)
const sentTo = ref<string | null>(null)
const otp = ref('')
const error = ref('')

const isLocal = import.meta.env.DEV

watch(
  () => props.modelValue,
  (open) => {
    if (open) void start()
    else reset()
  },
)

function reset() {
  challengeId.value = null
  sentTo.value = null
  otp.value = ''
  error.value = ''
}

async function start() {
  sending.value = true
  error.value = ''
  try {
    const result = await auth.requestReauth()
    challengeId.value = result.challenge_id ?? null
    sentTo.value = result.sent_to ?? null

    // Same courtesy as the login screen: local uses a fixed code, so fill it in.
    if (isLocal && result.challenge_id) void fillFromLog(true)

    if (!result.challenge_id) {
      // Re-auth is switched off platform-wide; nothing to confirm.
      emit('confirmed')
      emit('update:modelValue', false)
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not send a code.'
  } finally {
    sending.value = false
  }
}

/**
 * Local convenience: the API exposes the code from the mail log when APP_ENV=local.
 * `quiet` is used for the automatic fill, where a failure should not raise a toast.
 */
async function fillFromLog(quiet = false) {
  try {
    const { data } = await api.get<LastOtp>('/admin/dev/last-otp')
    if (data.otp && data.purpose === 'reauth') {
      otp.value = data.otp
    } else if (!quiet) {
      ElMessage.warning('No re-auth code in the mail log yet.')
    }
  } catch {
    if (!quiet) ElMessage.warning('The local OTP helper is not available.')
  }
}

async function confirm() {
  if (!challengeId.value || otp.value.length !== 6) return

  verifying.value = true
  error.value = ''
  try {
    await auth.verifyReauth(challengeId.value, otp.value)
    ElMessage.success('Confirmed')
    emit('confirmed')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'That code was not accepted.'
    otp.value = ''
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="Confirm it's you"
    width="420"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="text-[13px] text-[var(--color-legend)]">
      This grant includes a high-risk permission, so it needs a fresh code.
    </p>

    <ul class="mt-3 space-y-1">
      <li v-for="key in highRisk" :key="key" class="key text-[var(--color-cut)]">{{ key }}</li>
    </ul>

    <p v-if="sentTo" class="mt-4 text-[13px]">
      We emailed a code to <span class="key">{{ sentTo }}</span>
    </p>

    <el-input
      v-model="otp"
      class="mt-3"
      maxlength="6"
      placeholder="6-digit code"
      :disabled="sending || !challengeId"
      @keyup.enter="confirm"
    />

    <p v-if="error" class="mt-2 text-[12px] text-[var(--color-cut)]">{{ error }}</p>

    <button
      v-if="isLocal"
      type="button"
      class="eyebrow mt-3 text-[var(--color-route)] hover:underline"
      @click="fillFromLog()"
    >
      local: re-read code
    </button>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button
        type="primary"
        :loading="verifying"
        :disabled="otp.length !== 6 || !challengeId"
        @click="confirm"
      >
        Confirm
      </el-button>
    </template>
  </el-dialog>
</template>
