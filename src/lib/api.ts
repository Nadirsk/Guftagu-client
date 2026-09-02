import axios, { AxiosError, type AxiosInstance } from 'axios'

import type { Envelope, ErrorCode, ErrorEnvelope, Meta } from '@/types/api'

const TOKEN_KEY = 'guftagu.admin.token'

/**
 * A failure that already carries the backend's own error code, so callers can branch on
 * `MFA_REQUIRED` or `PERMISSION_ESCALATION_DENIED` instead of pattern-matching prose.
 */
export class ApiError extends Error {
  // Declared as real fields rather than constructor parameter properties: the build runs
  // with `erasableSyntaxOnly`, which rejects any TS syntax that emits runtime code.
  readonly code: ErrorCode
  readonly details: Record<string, unknown> | null
  readonly status: number
  readonly requestId: string | null

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> | null = null,
    status = 0,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
    this.requestId = requestId
  }

  /** Field errors from a 422, shaped for Element Plus form display. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !this.details) return {}

    return Object.fromEntries(
      Object.entries(this.details).map(([field, messages]) => [
        field,
        Array.isArray(messages) ? String(messages[0]) : String(messages),
      ]),
    )
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* private mode — the session simply won't survive a reload */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* nothing to do */
    }
  },
}

export const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: { Accept: 'application/json' },
  timeout: 20_000,
})

http.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * Called when the API says the session is over. Set by the auth store — kept as a hook
 * rather than importing the store here, because the store imports this module.
 */
let onSessionLost: ((reason: ErrorCode, message: string) => void) | null = null

export function handleSessionLoss(fn: (reason: ErrorCode, message: string) => void) {
  onSessionLost = fn
}

/** Endpoints where a 401 is the answer, not a dead session. */
function isAuthAttempt(url: string | undefined): boolean {
  if (!url) return false
  return url.includes('/auth/login') || url.includes('/auth/mfa/verify')
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorEnvelope>) => {
    // No response at all. The browser talks to the dev server, which proxies to the API —
    // so this means the *origin* is unreachable, not that the API is down. Saying
    // "check the API" here sends people to the wrong process.
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return Promise.reject(new ApiError('SERVER_ERROR', 'The request timed out.'))
      }

      return Promise.reject(
        new ApiError(
          'SERVER_ERROR',
          import.meta.env.DEV
            ? 'Lost the connection to the dev server. Check that `npm run dev` is still running, then reload.'
            : 'Could not reach the server. Check your connection and try again.',
        ),
      )
    }

    const { status, data } = error.response

    // The dev-server proxy answers with a gateway error when it is up but the API behind
    // it is not — that is the case where naming port 8001 is actually correct.
    if ((status === 502 || status === 504) && !data?.error) {
      return Promise.reject(
        new ApiError(
          'SERVER_ERROR',
          'The API is not responding. Check that it is running on port 8001.',
          null,
          status,
        ),
      )
    }
    const code = (data?.error?.code ?? 'SERVER_ERROR') as ErrorCode
    const message = data?.message ?? 'Something went wrong'
    const details = (data?.error?.details ?? null) as Record<string, unknown> | null
    const requestId = (data?.meta as Meta | undefined)?.request_id ?? null

    // An expired or rejected token ends the session — except on the login endpoints,
    // where a 401 just means the credentials were wrong.
    const sessionEnded =
      (status === 401 && !isAuthAttempt(error.config?.url)) ||
      (status === 403 && code === 'FORBIDDEN' && Boolean(tokenStore.get()))

    if (sessionEnded) {
      onSessionLost?.(code, message)
    }

    return Promise.reject(new ApiError(code, message, details, status, requestId))
  },
)

/** Unwraps the envelope so callers work with `data`, and keeps `meta` reachable. */
export async function request<T>(
  config: Parameters<AxiosInstance['request']>[0],
): Promise<{ data: T; meta: Meta; message: string }> {
  const response = await http.request<Envelope<T>>(config)
  return {
    data: response.data.data,
    meta: response.data.meta,
    message: response.data.message,
  }
}

type ExtraConfig = Omit<Parameters<AxiosInstance['request']>[0], 'method' | 'url' | 'data' | 'params'>

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>, config?: ExtraConfig) =>
    request<T>({ ...config, method: 'get', url, params }),
  post: <T>(url: string, data?: unknown, config?: ExtraConfig) =>
    request<T>({ ...config, method: 'post', url, data }),
  patch: <T>(url: string, data?: unknown, config?: ExtraConfig) =>
    request<T>({ ...config, method: 'patch', url, data }),
  del: <T>(url: string, data?: unknown, config?: ExtraConfig) =>
    request<T>({ ...config, method: 'delete', url, data }),
}
