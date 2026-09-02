<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import WalletAdjustDialog from '@/components/WalletAdjustDialog.vue'
import { ApiError, api } from '@/lib/api'
import type { Currency, LedgerIntegrity, LedgerRow, UserDetail } from '@/types/api'

/** GFT-032 (detail tabs) and GFT-033 (KYC review). */
const route = useRoute()
const userId = Number(route.params.id)

const detail = ref<UserDetail | null>(null)
const loading = ref(true)
const tab = ref<'overview' | 'wallet' | 'kyc' | 'history'>('overview')

// PII stays hidden until asked for, because asking is what gets recorded.
const revealed = ref<{ phone: string; email: string | null } | null>(null)
const revealing = ref(false)

const ledger = ref<LedgerRow[]>([])
const ledgerCurrency = ref<Currency>('coin')
const ledgerLoading = ref(false)
const integrity = ref<LedgerIntegrity | null>(null)

const adjustOpen = ref(false)
const adjustDirection = ref<'credit' | 'debit'>('credit')

const user = computed(() => detail.value?.user ?? null)
const wallet = computed(() => detail.value?.wallet ?? null)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get<UserDetail>(`/admin/users/${userId}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function onTab(next: string | number) {
  tab.value = next as typeof tab.value
  if (tab.value === 'wallet' && ledger.value.length === 0) void loadLedger()
}

async function loadLedger() {
  ledgerLoading.value = true
  try {
    const { data } = await api.get<LedgerRow[]>(`/admin/users/${userId}/transactions`, {
      currency: ledgerCurrency.value,
      per_page: 50,
    })
    ledger.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  } finally {
    ledgerLoading.value = false
  }
}

async function checkIntegrity() {
  try {
    const { data } = await api.get<LedgerIntegrity>(`/admin/users/${userId}/wallet/integrity`, {
      currency: ledgerCurrency.value,
    })
    integrity.value = data
    data.ok
      ? ElMessage.success('Ledger and wallet agree')
      : ElMessage.error('This ledger does not reconcile')
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** A.3a — the reveal is deliberate, and the confirmation says why. */
async function reveal() {
  try {
    await ElMessageBox.confirm(
      'Revealing this records who you are, whose details you looked at, and when. Continue only if you need it for this task.',
      'Show the real contact details?',
      { confirmButtonText: 'Reveal and record', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  revealing.value = true
  try {
    const { data } = await api.get<{ phone: string; email: string | null }>(
      `/admin/users/${userId}/pii`,
    )
    revealed.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    revealing.value = false
  }
}

async function sanction(kind: 'suspend' | 'ban' | 'unban') {
  const copy = {
    suspend: ['Suspend this user', 'Why are you suspending them?'],
    ban: ['Ban this user permanently', 'Why are you banning them?'],
    unban: ['Reinstate this user', 'Why are you reinstating them?'],
  }[kind]

  let reason: string
  try {
    const result = await ElMessageBox.prompt(copy[1], copy[0], {
      confirmButtonText: copy[0].split(' ')[0],
      cancelButtonText: 'Cancel',
      inputPlaceholder: 'Reason — this is recorded and shown in their history',
      inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      inputType: 'textarea',
    })
    reason = result.value
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/users/${userId}/${kind}`, { reason })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function reviewKyc(decision: 'verified' | 'rejected') {
  let reason: string | undefined

  if (decision === 'rejected') {
    try {
      const result = await ElMessageBox.prompt('Why is this being rejected?', 'Reject KYC', {
        confirmButtonText: 'Reject',
        cancelButtonText: 'Cancel',
        inputPlaceholder: 'The user sees this, so be specific and actionable',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
        inputType: 'textarea',
      })
      reason = result.value
    } catch {
      return
    }
  } else {
    try {
      await ElMessageBox.confirm(
        'Approving makes this user eligible to withdraw money. This decision is final.',
        'Approve KYC?',
        { confirmButtonText: 'Approve', cancelButtonText: 'Cancel', type: 'warning' },
      )
    } catch {
      return
    }
  }

  try {
    const { message } = await api.post(`/admin/users/${userId}/kyc/verify`, { decision, reason })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function toggleFreeze() {
  if (!wallet.value) return
  const freezing = !wallet.value.is_frozen

  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      freezing ? 'Why are you freezing this wallet?' : 'Why are you unfreezing it?',
      freezing ? 'Freeze wallet' : 'Unfreeze wallet',
      {
        confirmButtonText: freezing ? 'Freeze' : 'Unfreeze',
        cancelButtonText: 'Cancel',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
        inputType: 'textarea',
      },
    )
    reason = result.value
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/users/${userId}/wallet/freeze`, {
      frozen: freezing,
      reason,
    })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function openAdjust(direction: 'credit' | 'debit') {
  adjustDirection.value = direction
  adjustOpen.value = true
}

async function afterAdjust() {
  await load()
  ledger.value = []
  integrity.value = null
  if (tab.value === 'wallet') await loadLedger()
}

function format(value: number): string {
  return value.toLocaleString()
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}
</script>

<template>
  <PageHead
    eyebrow="Platform · user"
    :title="user?.display_name ?? `User #${userId}`"
    :lede="user ? `${user.guftagu_id} · ${user.country ?? 'unknown location'}` : ''"
  >
    <template #actions>
      <el-button
        v-if="user && user.status === 'active'"
        v-permission.disable="'users.suspend'"
        size="small"
        @click="sanction('suspend')"
      >
        Suspend
      </el-button>
      <el-button
        v-if="user && user.status !== 'banned'"
        v-permission.disable="'users.ban'"
        size="small"
        type="danger"
        plain
        @click="sanction('ban')"
      >
        Ban
      </el-button>
      <el-button
        v-if="user && user.status !== 'active'"
        v-permission.disable="'users.ban'"
        size="small"
        @click="sanction('unban')"
      >
        Reinstate
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div v-if="user" class="panel mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
      <div>
        <div class="eyebrow">Status</div>
        <el-tag
          :type="user.status === 'active' ? 'success' : user.status === 'banned' ? 'danger' : 'warning'"
          size="small"
        >
          {{ user.status }}
        </el-tag>
      </div>
      <div>
        <div class="eyebrow">Coins</div>
        <div class="key text-[15px]">{{ format(user.coin_balance) }}</div>
      </div>
      <div>
        <div class="eyebrow">Diamonds</div>
        <div class="key text-[15px]">{{ format(user.diamond_balance) }}</div>
      </div>
      <div>
        <div class="eyebrow">KYC</div>
        <div class="key text-[15px]">{{ user.kyc_status }}</div>
      </div>
      <div>
        <div class="eyebrow">Joined</div>
        <div class="key">{{ when(user.created_at) }}</div>
      </div>
    </div>

    <el-tabs :model-value="tab" @update:model-value="onTab">
      <!-- Overview -->
      <el-tab-pane label="Overview" name="overview">
        <div class="grid gap-4 lg:grid-cols-2">
          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Contact</div>
            </div>
            <div class="space-y-3 p-4">
              <div>
                <div class="eyebrow">Phone</div>
                <div class="key text-[14px]">
                  {{ revealed?.phone ?? user?.phone_masked ?? '—' }}
                </div>
              </div>
              <div>
                <div class="eyebrow">Email</div>
                <div class="key text-[14px]">
                  {{ revealed?.email ?? user?.email_masked ?? '—' }}
                </div>
              </div>

              <div v-if="!revealed" v-permission="'users.view_pii'">
                <el-button size="small" :loading="revealing" @click="reveal">
                  Reveal real details
                </el-button>
                <p class="eyebrow mt-1.5 leading-relaxed">
                  recorded against your name in the audit log
                </p>
              </div>
              <p v-else class="eyebrow text-[var(--color-signal)]">
                revealed · this access was recorded
              </p>
            </div>
          </section>

          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Profile</div>
            </div>
            <div class="grid grid-cols-2 gap-3 p-4 text-[13px]">
              <div>
                <div class="eyebrow">City</div>
                {{ detail?.profile?.city ?? '—' }}
              </div>
              <div>
                <div class="eyebrow">Gender</div>
                {{ detail?.profile?.gender ?? '—' }}
              </div>
              <div>
                <div class="eyebrow">Born</div>
                {{ detail?.profile?.date_of_birth ?? '—' }}
              </div>
              <div>
                <div class="eyebrow">Language</div>
                {{ detail?.profile?.language ?? '—' }}
              </div>
              <div class="col-span-2">
                <div class="eyebrow">Bio</div>
                {{ detail?.profile?.bio ?? '—' }}
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Devices</div>
            </div>
            <div v-if="!detail?.devices.length" class="p-4 text-[13px] text-[var(--color-legend)]">
              No devices recorded.
            </div>
            <ul v-else class="divide-y divide-[var(--color-edge)]">
              <li
                v-for="(device, index) in detail.devices"
                :key="index"
                class="flex items-center justify-between px-4 py-2.5 text-[13px]"
              >
                <div>
                  <div>{{ device.platform }} · {{ device.os_version ?? '—' }}</div>
                  <div class="eyebrow">app {{ device.app_version ?? '—' }}</div>
                </div>
                <span class="key text-[var(--color-legend)]">{{ when(device.last_seen_at) }}</span>
              </li>
            </ul>
          </section>

          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Not built yet</div>
            </div>
            <p class="p-4 text-[13px] text-[var(--color-legend)]">
              Room activity arrives with the rooms module, and reports against this user with
              moderation. They are named here so an empty panel is not mistaken for a clean record.
            </p>
          </section>
        </div>
      </el-tab-pane>

      <!-- Wallet -->
      <el-tab-pane label="Wallet" name="wallet">
        <div v-if="wallet" class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <el-button
              v-permission.disable="'wallet.manual_credit'"
              type="primary"
              size="small"
              @click="openAdjust('credit')"
            >
              Credit
            </el-button>
            <el-button
              v-permission.disable="'wallet.manual_debit'"
              type="danger"
              plain
              size="small"
              @click="openAdjust('debit')"
            >
              Debit
            </el-button>
            <el-button v-permission.disable="'wallet.manual_debit'" size="small" @click="toggleFreeze">
              {{ wallet.is_frozen ? 'Unfreeze' : 'Freeze' }} wallet
            </el-button>

            <div class="ml-auto flex items-center gap-2">
              <el-radio-group
                v-model="ledgerCurrency"
                size="small"
                @change="() => { ledger = []; integrity = null; loadLedger() }"
              >
                <el-radio-button value="coin">Coins</el-radio-button>
                <el-radio-button value="diamond">Diamonds</el-radio-button>
              </el-radio-group>
              <el-button size="small" @click="checkIntegrity">Check integrity</el-button>
            </div>
          </div>

          <el-tag v-if="wallet.is_frozen" type="danger" size="small">
            wallet frozen — the user cannot spend
          </el-tag>

          <div class="grid gap-3 sm:grid-cols-4">
            <div class="panel px-4 py-3">
              <div class="eyebrow">Coins</div>
              <div class="key text-[17px]">{{ format(wallet.coin_balance) }}</div>
            </div>
            <div class="panel px-4 py-3">
              <div class="eyebrow">Diamonds</div>
              <div class="key text-[17px]">{{ format(wallet.diamond_balance) }}</div>
            </div>
            <div class="panel px-4 py-3">
              <div class="eyebrow">Lifetime spent</div>
              <div class="key text-[17px]">{{ format(wallet.lifetime_coins_spent) }}</div>
            </div>
            <div class="panel px-4 py-3">
              <div class="eyebrow">Lifetime earned</div>
              <div class="key text-[17px]">{{ format(wallet.lifetime_diamonds_earned) }}</div>
            </div>
          </div>

          <div
            v-if="integrity"
            class="panel border-l-2 px-4 py-3"
            :class="integrity.ok ? 'border-l-[var(--color-ok)]' : 'border-l-[var(--color-cut)]'"
          >
            <div class="eyebrow" :class="integrity.ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-cut)]'">
              {{ integrity.ok ? 'Reconciled' : 'Does not reconcile' }}
            </div>
            <p class="mt-1 text-[13px]">
              Walked {{ integrity.checked }} ledger rows. Ledger totals
              <span class="key">{{ format(integrity.ledger_balance) }}</span>, wallet holds
              <span class="key">{{ format(integrity.wallet_balance) }}</span>.
            </p>
          </div>

          <div v-loading="ledgerLoading" class="panel">
            <EmptyState
              v-if="!ledgerLoading && ledger.length === 0"
              title="No transactions yet"
              body="Every balance change lands here. Rows are immutable — a correction appears as a new entry, never as an edit."
            />

            <el-table v-else :data="ledger" style="width: 100%">
              <el-table-column label="When" width="170">
                <template #default="{ row }: { row: LedgerRow }">
                  <span class="key text-[var(--color-legend)]">{{ when(row.created_at) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Type" width="150">
                <template #default="{ row }: { row: LedgerRow }">
                  <span class="key">{{ row.type }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Change" width="120" align="right">
                <template #default="{ row }: { row: LedgerRow }">
                  <span
                    class="key font-bold"
                    :class="row.direction === 'credit' ? 'text-[var(--color-ok)]' : 'text-[var(--color-cut)]'"
                  >
                    {{ row.direction === 'credit' ? '+' : '−' }}{{ format(row.amount) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="Balance" width="150" align="right">
                <template #default="{ row }: { row: LedgerRow }">
                  <span class="key text-[var(--color-legend)]">
                    {{ format(row.balance_before) }} → {{ format(row.balance_after) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="Note" min-width="200">
                <template #default="{ row }: { row: LedgerRow }">
                  <div class="text-[13px]">{{ row.note ?? '—' }}</div>
                  <div v-if="row.performed_by" class="eyebrow">by {{ row.performed_by }}</div>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- KYC -->
      <el-tab-pane label="KYC" name="kyc">
        <EmptyState
          v-if="!detail?.kyc"
          title="Nothing submitted"
          body="This user has not sent documents, so they cannot withdraw yet."
        />

        <div v-else class="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section class="panel">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Documents</div>
            </div>
            <div class="grid gap-3 p-4 sm:grid-cols-3">
              <figure v-for="side in (['doc_front_url', 'doc_back_url', 'selfie_url'] as const)" :key="side">
                <div
                  class="flex aspect-[4/3] items-center justify-center border border-[var(--color-edge)] bg-[var(--color-recess)]"
                >
                  <img
                    v-if="detail.kyc[side]"
                    :src="detail.kyc[side]!"
                    :alt="side.replace('_url', '').replace('_', ' ')"
                    class="max-h-full max-w-full object-contain"
                  />
                  <span v-else class="eyebrow">not supplied</span>
                </div>
                <figcaption class="eyebrow mt-1">
                  {{ side.replace('_url', '').replace('_', ' ') }}
                </figcaption>
              </figure>
            </div>
          </section>

          <aside class="panel h-fit">
            <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
              <div class="eyebrow">Submission</div>
            </div>
            <div class="space-y-3 p-4 text-[13px]">
              <div>
                <div class="eyebrow">Status</div>
                <el-tag
                  :type="detail.kyc.status === 'verified' ? 'success' : detail.kyc.status === 'rejected' ? 'danger' : 'warning'"
                  size="small"
                >
                  {{ detail.kyc.status }}
                </el-tag>
              </div>
              <div>
                <div class="eyebrow">Name on document</div>
                {{ detail.kyc.full_name }}
              </div>
              <div>
                <div class="eyebrow">Document</div>
                <span class="key">{{ detail.kyc.doc_type }} · {{ detail.kyc.doc_number ?? '—' }}</span>
              </div>
              <div>
                <div class="eyebrow">Payout</div>
                <span class="key">{{ detail.kyc.upi_id ?? detail.kyc.ifsc ?? '—' }}</span>
              </div>
              <div>
                <div class="eyebrow">Submitted</div>
                {{ when(detail.kyc.submitted_at) }}
              </div>

              <div
                v-if="detail.kyc.rejection_reason"
                class="border-l-2 border-l-[var(--color-cut)] bg-[var(--color-raised)] px-3 py-2"
              >
                <div class="eyebrow text-[var(--color-cut)]">Rejected because</div>
                {{ detail.kyc.rejection_reason }}
              </div>

              <div v-if="detail.kyc.status === 'pending'" class="space-y-2 pt-2">
                <el-button
                  v-permission.disable="'users.kyc_verify'"
                  type="primary"
                  class="w-full"
                  @click="reviewKyc('verified')"
                >
                  Approve
                </el-button>
                <el-button
                  v-permission.disable="'users.kyc_verify'"
                  type="danger"
                  plain
                  class="w-full"
                  @click="reviewKyc('rejected')"
                >
                  Reject
                </el-button>
                <p class="eyebrow leading-relaxed">
                  a decision is final — it cannot be reviewed twice
                </p>
              </div>

              <p v-else class="eyebrow">
                reviewed by {{ detail.kyc.reviewed_by ?? 'unknown' }} ·
                {{ when(detail.kyc.reviewed_at) }}
              </p>
            </div>
          </aside>
        </div>
      </el-tab-pane>

      <!-- Sanctions -->
      <el-tab-pane label="History" name="history">
        <EmptyState
          v-if="!detail?.sanctions.length"
          title="A clean record"
          body="No warnings, suspensions or bans have ever been issued against this account."
        />

        <ol v-else class="space-y-1.5">
          <li
            v-for="entry in detail.sanctions"
            :key="entry.id"
            class="panel border-l-2 px-4 py-3"
            :class="entry.in_force ? 'border-l-[var(--color-cut)]' : 'border-l-[var(--color-edge)]'"
          >
            <div class="flex flex-wrap items-baseline gap-x-3">
              <!-- `in_force`, not `is_active`: the stored flag stays true after a window
                   lapses, so keying the label off it labelled expired bans "in force". -->
              <span class="eyebrow" :class="entry.in_force ? 'text-[var(--color-cut)]' : ''">
                {{ entry.type.replace('_', ' ') }}
              </span>
              <span v-if="entry.in_force" class="eyebrow text-[var(--color-cut)]">in force</span>
              <span v-else-if="entry.is_active && !entry.revoked_at" class="eyebrow">lapsed</span>
              <span class="eyebrow ml-auto">{{ when(entry.starts_at) }}</span>
            </div>
            <p class="mt-1 text-[13px]">{{ entry.reason }}</p>
            <p class="eyebrow mt-1">
              by {{ entry.issued_by ?? 'system' }}
              <template v-if="entry.expires_at"> · until {{ when(entry.expires_at) }}</template>
              <template v-if="entry.revoked_at"> · lifted {{ when(entry.revoked_at) }}</template>
            </p>
          </li>
        </ol>
      </el-tab-pane>
    </el-tabs>
  </div>

  <WalletAdjustDialog
    v-if="user && wallet"
    v-model="adjustOpen"
    :user="user"
    :wallet="wallet"
    :direction="adjustDirection"
    @done="afterAdjust"
  />
</template>
