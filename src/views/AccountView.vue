<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import PageHead from '@/components/PageHead.vue'
import { ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/** GFT-010 — profile and password, the two things every admin can do for themselves. */
const auth = useAuthStore()
const router = useRouter()

const profile = reactive({
  name: auth.admin?.name ?? '',
  phone: auth.admin?.phone ?? '',
})
const savingProfile = ref(false)
const profileErrors = ref<Record<string, string>>({})

const password = reactive({
  current_password: '',
  password: '',
  password_confirmation: '',
})
const savingPassword = ref(false)
const passwordErrors = ref<Record<string, string>>({})

async function saveProfile() {
  savingProfile.value = true
  profileErrors.value = {}
  try {
    await auth.updateProfile({ name: profile.name, phone: profile.phone || null })
    ElMessage.success('Profile updated')
  } catch (e) {
    if (e instanceof ApiError) {
      profileErrors.value = e.fieldErrors
      if (!Object.keys(profileErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  savingPassword.value = true
  passwordErrors.value = {}
  try {
    await auth.changePassword({ ...password })

    // Every other device is signed out server-side; say so, because it is surprising.
    ElMessage.success('Password changed. Your other devices have been signed out.')
    password.current_password = ''
    password.password = ''
    password.password_confirmation = ''
  } catch (e) {
    if (e instanceof ApiError) {
      passwordErrors.value = e.fieldErrors
      if (!Object.keys(passwordErrors.value).length) ElMessage.error(e.message)
    }
  } finally {
    savingPassword.value = false
  }
}

async function signOutEverywhere() {
  await auth.logout()
  void router.push({ name: 'login' })
}
</script>

<template>
  <PageHead
    eyebrow="Your account"
    :title="auth.admin?.email ?? 'Account'"
    lede="Your own profile, password and session. Changing anyone else's account happens under Panel users."
  />

  <div class="grid gap-5 px-5 py-5 md:px-7 lg:grid-cols-2">
    <!-- Profile -->
    <section class="panel">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Profile</div>
      </div>

      <form class="space-y-4 p-4" @submit.prevent="saveProfile">
        <div>
          <label class="eyebrow mb-1 block" for="name">Name</label>
          <el-input id="name" v-model="profile.name" maxlength="150" />
          <p v-if="profileErrors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">
            {{ profileErrors.name }}
          </p>
        </div>

        <div>
          <label class="eyebrow mb-1 block" for="phone">Phone</label>
          <el-input id="phone" v-model="profile.phone" maxlength="20" placeholder="+91…" />
          <p v-if="profileErrors.phone" class="mt-1 text-[12px] text-[var(--color-cut)]">
            {{ profileErrors.phone }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4 border-t border-[var(--color-edge)] pt-4">
          <div>
            <div class="eyebrow">Role</div>
            <div class="key mt-1">{{ auth.admin?.role?.key ?? '—' }}</div>
          </div>
          <div>
            <div class="eyebrow">Two-factor</div>
            <div class="key mt-1">{{ auth.admin?.mfa_enabled ? 'on' : 'per role policy' }}</div>
          </div>
        </div>

        <el-button type="primary" native-type="submit" :loading="savingProfile">
          Save profile
        </el-button>
      </form>
    </section>

    <!-- Password -->
    <section class="panel">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Password</div>
      </div>

      <form class="space-y-4 p-4" @submit.prevent="savePassword">
        <p class="text-[13px] text-[var(--color-legend)]">
          Changing your password signs out every other device. The one you are on stays signed in.
        </p>

        <div>
          <label class="eyebrow mb-1 block" for="current">Current password</label>
          <el-input
            id="current"
            v-model="password.current_password"
            type="password"
            show-password
            autocomplete="current-password"
          />
          <p v-if="passwordErrors.current_password" class="mt-1 text-[12px] text-[var(--color-cut)]">
            {{ passwordErrors.current_password }}
          </p>
        </div>

        <div>
          <label class="eyebrow mb-1 block" for="new">New password</label>
          <el-input
            id="new"
            v-model="password.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
          <p class="eyebrow mt-1">at least 12 characters</p>
          <p v-if="passwordErrors.password" class="mt-1 text-[12px] text-[var(--color-cut)]">
            {{ passwordErrors.password }}
          </p>
        </div>

        <div>
          <label class="eyebrow mb-1 block" for="confirm">Confirm new password</label>
          <el-input
            id="confirm"
            v-model="password.password_confirmation"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </div>

        <el-button
          type="primary"
          native-type="submit"
          :loading="savingPassword"
          :disabled="!password.current_password || password.password.length < 12"
        >
          Change password
        </el-button>
      </form>
    </section>

    <!-- Session -->
    <section class="panel lg:col-span-2">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Session</div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4 p-4">
        <div class="text-[13px] text-[var(--color-legend)]">
          This session ends after
          <span class="text-[var(--color-paper)]">{{ auth.idleTimeoutMinutes }} minutes</span> of
          inactivity. Last sign-in
          <span class="text-[var(--color-paper)]">
            {{
              auth.admin?.last_login_at
                ? new Date(auth.admin.last_login_at).toLocaleString()
                : 'not recorded'
            }}
          </span>
          .
        </div>

        <el-button @click="signOutEverywhere">Sign out</el-button>
      </div>
    </section>
  </div>
</template>
