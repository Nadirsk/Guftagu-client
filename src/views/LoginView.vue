<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { LastOtp } from '@/types/api'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const step = ref<'password' | 'code'>('password')
const email = ref('')
const password = ref('')
const rememberDevice = ref(false)
const otp = ref('')

const challengeId = ref<string | null>(null)
const sentTo = ref<string | null>(null)

const busy = ref(false)
const error = ref('')
const lockedUntil = ref<string | null>(null)

const isLocal = import.meta.env.DEV

/** Says something true about how the last session ended, instead of a blank form. */
const endedNotice = computed(() => {
  switch (auth.endedReason) {
    case 'idle':
      return 'Your session ended after a period of inactivity.'
    case 'suspended':
      return 'This account has been suspended. Talk to a Super Admin.'
    case 'expired':
      return 'Your session is no longer valid. Sign in again.'
    default:
      return ''
  }
})

onMounted(() => {
  if (auth.endedReason === 'signed_out') auth.endedReason = null
})

async function submitPassword() {
  if (!email.value || !password.value) return

  busy.value = true
  error.value = ''
  lockedUntil.value = null

  try {
    const result = await auth.login({
      email: email.value,
      password: password.value,
      remember_device: rememberDevice.value,
    })

    if (result.mfa_required) {
      challengeId.value = result.challenge_id ?? null
      sentTo.value = result.sent_to ?? null
      step.value = 'code'
      password.value = ''

      // Local runs with a fixed OTP, so filling it in is a courtesy rather than a
      // shortcut past anything — the code is still verified by the server exactly as
      // a mailed one is. Never happens in a build that is not `vite dev`.
      if (isLocal) void prefillOtp()

      return
    }

    void finish()
  } catch (e) {
    handle(e)
  } finally {
    busy.value = false
  }
}

async function submitCode() {
  if (!challengeId.value || otp.value.length !== 6) return

  busy.value = true
  error.value = ''

  try {
    await auth.verifyMfa(challengeId.value, otp.value)
    void finish()
  } catch (e) {
    handle(e)
    otp.value = ''

    // A burnt or expired challenge cannot be retried — send them back to the password step
    // rather than leaving them typing into a dead field.
    if (e instanceof ApiError && ['BAD_REQUEST', 'NOT_FOUND', 'RATE_LIMITED'].includes(e.code)) {
      step.value = 'password'
      challengeId.value = null
    }
  } finally {
    busy.value = false
  }
}

function finish() {
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  void router.replace(next)
}

function handle(e: unknown) {
  if (!(e instanceof ApiError)) {
    error.value = 'Something went wrong. Try again.'
    return
  }

  error.value = e.message

  if (e.code === 'ACCOUNT_LOCKED') {
    const until = e.details?.locked_until
    if (typeof until === 'string') {
      const when = new Date(until)
      lockedUntil.value = Number.isNaN(when.getTime())
        ? null
        : when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
  }

  if (e.code === 'VALIDATION_ERROR') {
    const first = Object.values(e.fieldErrors)[0]
    if (first) error.value = first
  }
}

/** Quietly fills the code in local. Failure is not worth a toast — just type it. */
async function prefillOtp() {
  try {
    const { data } = await api.get<LastOtp>('/admin/dev/last-otp')
    if (data.otp && !otp.value) otp.value = data.otp
  } catch {
    /* helper unavailable — the field simply stays empty */
  }
}

async function fillFromLog() {
  try {
    const { data } = await api.get<LastOtp>('/admin/dev/last-otp')
    if (data.otp) {
      otp.value = data.otp
      if (data.challenge_id) challengeId.value = data.challenge_id
    } else {
      ElMessage.warning('No code in the mail log yet.')
    }
  } catch {
    ElMessage.warning('The local OTP helper is not available.')
  }
}

function backToPassword() {
  step.value = 'password'
  challengeId.value = null
  otp.value = ''
  error.value = ''
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-4 py-10">
    <div class="w-full max-w-[380px]">
      <div class="mb-7 flex items-center gap-2.5">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-signal)] font-(--font-display) text-[16px] font-semibold text-[var(--color-ink)]"
          aria-hidden="true"
        >
          G
        </span>
        <div>
          <div class="text-[15px] leading-tight font-semibold tracking-tight">Guftagu</div>
          <div class="eyebrow leading-tight">Operations console</div>
        </div>
      </div>

      <div class="panel p-5">
        <h1 class="text-[17px] font-semibold tracking-tight">
          {{ step === 'password' ? 'Sign in' : 'Enter your code' }}
        </h1>
        <p class="mt-1 text-[13px] text-[var(--color-legend)]">
          <template v-if="step === 'password'">
            Panel accounts are created by an administrator. There is no sign-up.
          </template>
          <template v-else>
            We emailed a 6-digit code to <span class="key">{{ sentTo }}</span
            >. It expires in 10 minutes.
          </template>
        </p>

        <div
          v-if="endedNotice && step === 'password'"
          class="mt-4 border-l-2 border-l-[var(--color-signal)] bg-[var(--color-raised)] px-3 py-2 text-[12px] text-[var(--color-legend)]"
        >
          {{ endedNotice }}
        </div>

        <!-- Password step -->
        <form v-if="step === 'password'" class="mt-5 space-y-3" @submit.prevent="submitPassword">
          <div>
            <label class="eyebrow mb-1 block" for="email">Email</label>
            <el-input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="you@guftagu.local"
              size="large"
            />
          </div>

          <div>
            <label class="eyebrow mb-1 block" for="password">Password</label>
            <el-input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              show-password
              size="large"
            />
          </div>

          <el-checkbox v-model="rememberDevice" label="Remember this device" size="small" />

          <p v-if="error" class="text-[12px] text-[var(--color-cut)]">
            {{ error }}
            <template v-if="lockedUntil"> Try again after {{ lockedUntil }}.</template>
          </p>

          <el-button
            type="primary"
            size="large"
            class="w-full"
            native-type="submit"
            :loading="busy"
            :disabled="!email || !password"
          >
            Continue
          </el-button>
        </form>

        <!-- MFA step -->
        <form v-else class="mt-5 space-y-3" @submit.prevent="submitCode">
          <div>
            <label class="eyebrow mb-1 block" for="otp">6-digit code</label>
            <el-input
              id="otp"
              v-model="otp"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              size="large"
              class="[&_input]:font-mono [&_input]:tracking-[0.4em]"
            />
          </div>

          <p v-if="error" class="text-[12px] text-[var(--color-cut)]">{{ error }}</p>

          <el-button
            type="primary"
            size="large"
            class="w-full"
            native-type="submit"
            :loading="busy"
            :disabled="otp.length !== 6"
          >
            Verify and sign in
          </el-button>

          <div class="flex items-center justify-between pt-1">
            <button
              type="button"
              class="text-[12px] text-[var(--color-legend)] hover:text-[var(--color-paper)]"
              @click="backToPassword"
            >
              Use a different account
            </button>

            <button
              v-if="isLocal"
              type="button"
              class="eyebrow text-[var(--color-route)] hover:underline"
              @click="fillFromLog"
            >
              local: re-read code
            </button>
          </div>
        </form>
      </div>

      <p class="eyebrow mt-4 text-center">
        Guftagu V1.0 · admin panel
      </p>
    </div>
  </div>
</template>
