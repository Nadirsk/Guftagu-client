import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api, handleSessionLoss, tokenStore } from '@/lib/api'
import type {
  AdminProfile,
  ErrorCode,
  LoginResult,
  MeResult,
  RoleKey,
  SessionResult,
} from '@/types/api'

/** Why a session ended, so the login screen can say something true about it. */
export type EndedReason = 'idle' | 'expired' | 'suspended' | 'signed_out' | null

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(tokenStore.get())
  const admin = ref<AdminProfile | null>(null)
  const permissions = ref<string[]>([])
  const idleTimeoutMinutes = ref(60)
  const reauthSatisfied = ref(false)

  /** True once we've tried to resolve the stored token, so the router can stop waiting. */
  const ready = ref(false)
  const endedReason = ref<EndedReason>(null)

  const isAuthenticated = computed(() => Boolean(token.value && admin.value))
  const roleKey = computed<RoleKey | null>(() => admin.value?.role?.key ?? null)
  const isSuperAdmin = computed(() => roleKey.value === 'super_admin')

  /**
   * The permission check the whole UI runs on. A Super Admin still resolves through the
   * list rather than short-circuiting here: the server sends all 79 keys, so trusting the
   * list keeps one source of truth and makes a broken /auth/me obvious instead of silently
   * granting everything.
   */
  function can(key: string | string[] | undefined): boolean {
    if (!key) return true
    const keys = Array.isArray(key) ? key : [key]
    return keys.every((k) => permissions.value.includes(k))
  }

  function canAny(keys: string[]): boolean {
    return keys.some((k) => permissions.value.includes(k))
  }

  // ------------------------------------------------------------------ idle

  let lastActivity = Date.now()
  let idleTimer: number | null = null

  function markActivity() {
    lastActivity = Date.now()
  }

  function startIdleWatch() {
    stopIdleWatch()

    // The server is the real enforcement point (it returns 401 TOKEN_EXPIRED and deletes
    // the token). This only spares the user from discovering that mid-form.
    idleTimer = window.setInterval(() => {
      if (!isAuthenticated.value || idleTimeoutMinutes.value <= 0) return

      const idleMs = Date.now() - lastActivity
      if (idleMs >= idleTimeoutMinutes.value * 60_000) {
        void endSession('idle')
      }
    }, 15_000)

    for (const event of ['pointerdown', 'keydown', 'wheel', 'visibilitychange'] as const) {
      window.addEventListener(event, markActivity, { passive: true })
    }
  }

  function stopIdleWatch() {
    if (idleTimer !== null) {
      window.clearInterval(idleTimer)
      idleTimer = null
    }
    for (const event of ['pointerdown', 'keydown', 'wheel', 'visibilitychange'] as const) {
      window.removeEventListener(event, markActivity)
    }
  }

  // --------------------------------------------------------------- session

  function adopt(session: SessionResult) {
    token.value = session.token
    tokenStore.set(session.token)
    admin.value = session.admin
    idleTimeoutMinutes.value = session.idle_timeout_minutes
    endedReason.value = null
    markActivity()
    startIdleWatch()
  }

  function clearLocal() {
    token.value = null
    admin.value = null
    permissions.value = []
    reauthSatisfied.value = false
    tokenStore.clear()
    stopIdleWatch()
  }

  async function endSession(reason: Exclude<EndedReason, null>) {
    clearLocal()
    endedReason.value = reason
  }

  /** Password step. Returns the challenge when MFA applies — no token is issued yet. */
  async function login(payload: {
    email: string
    password: string
    remember_device?: boolean
  }): Promise<LoginResult> {
    const { data } = await api.post<LoginResult>('/admin/auth/login', {
      ...payload,
      device_name: deviceName(),
    })

    if (!data.mfa_required && data.token && data.admin) {
      adopt({
        token: data.token,
        expires_at: '',
        idle_timeout_minutes: data.idle_timeout_minutes ?? 60,
        admin: data.admin,
      })
      await fetchMe()
    }

    return data
  }

  async function verifyMfa(challengeId: string, otp: string): Promise<void> {
    const { data } = await api.post<SessionResult>('/admin/auth/mfa/verify', {
      challenge_id: challengeId,
      otp,
      device_name: deviceName(),
    })

    adopt(data)
    await fetchMe()
  }

  /** The panel renders from this — profile, role and the resolved permission set. */
  async function fetchMe(): Promise<void> {
    const { data } = await api.get<MeResult>('/admin/auth/me')
    admin.value = data.admin
    permissions.value = data.permissions
    idleTimeoutMinutes.value = data.session.idle_timeout_minutes
    reauthSatisfied.value = data.session.reauth_satisfied
  }

  /** Resolve a stored token on boot. A dead token is discarded quietly. */
  async function restore(): Promise<void> {
    if (!token.value) {
      ready.value = true
      return
    }

    try {
      await fetchMe()
      markActivity()
      startIdleWatch()
    } catch {
      clearLocal()
    } finally {
      ready.value = true
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/admin/auth/logout')
    } catch {
      // Already gone server-side; clearing locally is still the right outcome.
    }
    clearLocal()
    endedReason.value = 'signed_out'
  }

  // ------------------------------------------------------- self-service

  async function updateProfile(payload: {
    name?: string
    phone?: string | null
  }): Promise<void> {
    const { data } = await api.patch<AdminProfile>('/admin/auth/profile', payload)
    admin.value = data
  }

  async function changePassword(payload: {
    current_password: string
    password: string
    password_confirmation: string
  }): Promise<void> {
    await api.post('/admin/auth/password', payload)
  }

  // ------------------------------------------------ MFA re-entry (GFT-122)

  async function requestReauth(): Promise<{ challenge_id?: string; sent_to?: string }> {
    const { data } = await api.post<{
      reauth_required: boolean
      challenge_id?: string
      sent_to?: string
    }>('/admin/auth/mfa/reauth')
    return data
  }

  async function verifyReauth(challengeId: string, otp: string): Promise<void> {
    await api.post('/admin/auth/mfa/reauth/verify', { challenge_id: challengeId, otp })
    reauthSatisfied.value = true
  }

  // The API layer tells us when the server has ended the session, so a revoked or idled
  // token surfaces as a clean redirect rather than a wall of failed requests.
  handleSessionLoss((code: ErrorCode) => {
    if (!token.value) return
    void endSession(code === 'TOKEN_EXPIRED' ? 'idle' : code === 'FORBIDDEN' ? 'suspended' : 'expired')
  })

  return {
    token,
    admin,
    permissions,
    idleTimeoutMinutes,
    reauthSatisfied,
    ready,
    endedReason,
    isAuthenticated,
    roleKey,
    isSuperAdmin,
    can,
    canAny,
    login,
    verifyMfa,
    fetchMe,
    restore,
    logout,
    updateProfile,
    changePassword,
    requestReauth,
    verifyReauth,
    markActivity,
  }
})

function deviceName(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(' on ')
}

export { ApiError }
