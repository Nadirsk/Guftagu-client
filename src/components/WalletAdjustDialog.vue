<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'

import { ApiError, api } from '@/lib/api'
import type { Currency, UserRow, WalletSummary } from '@/types/api'

/**
 * GFT-034 — the manual credit / debit dialog.
 *
 * Moving someone's money by hand deserves friction, so this screen shows the arithmetic
 * before it happens, requires the note the server requires, and sends an idempotency key
 * so a double-click or a flaky connection cannot pay twice.
 */
const props = defineProps<{
  modelValue: boolean
  user: UserRow
  wallet: WalletSummary
  direction: 'credit' | 'debit'
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()

const form = reactive({ currency: 'coin' as Currency, amount: 0, note: '' })
const busy = ref(false)
const errors = ref<Record<string, string>>({})
const serverError = ref('')

/** A fresh key per opening, so a retry of *this* adjustment is safe but a new one is not blocked. */
const idempotencyKey = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.currency = 'coin'
    form.amount = 0
    form.note = ''
    errors.value = {}
    serverError.value = ''
    idempotencyKey.value = crypto.randomUUID()
  },
)

const isCredit = computed(() => props.direction === 'credit')

const balanceBefore = computed(() =>
  form.currency === 'diamond' ? props.wallet.diamond_balance : props.wallet.coin_balance,
)

const balanceAfter = computed(() =>
  isCredit.value ? balanceBefore.value + form.amount : balanceBefore.value - form.amount,
)

const overdrawn = computed(() => !isCredit.value && form.amount > balanceBefore.value)

const valid = computed(
  () =>
    Number.isInteger(form.amount) &&
    form.amount > 0 &&
    form.note.trim().length >= 3 &&
    !overdrawn.value,
)

const unit = computed(() => (form.currency === 'diamond' ? 'diamonds' : 'coins'))

function format(value: number): string {
  return value.toLocaleString()
}

async function submit() {
  if (!valid.value) return

  busy.value = true
  errors.value = {}
  serverError.value = ''

  try {
    const { message } = await api.post(
      `/admin/users/${props.user.id}/wallet/${props.direction}`,
      { currency: form.currency, amount: form.amount, note: form.note.trim() },
      // The header travels with the request so a retry returns the original result
      // instead of moving money a second time.
      { headers: { 'X-Idempotency-Key': idempotencyKey.value } },
    )

    ElMessage.success(message)
    emit('done')
    emit('update:modelValue', false)
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) serverError.value = e.message
    } else {
      serverError.value = 'Something went wrong.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="isCredit ? 'Credit this wallet' : 'Debit this wallet'"
    width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="text-[13px] text-[var(--color-legend)]">
      {{ user.display_name ?? user.guftagu_id }} ·
      <span class="key">{{ user.guftagu_id }}</span>
    </p>

    <div class="mt-4 space-y-4">
      <div>
        <label class="eyebrow mb-1 block">Currency</label>
        <el-radio-group v-model="form.currency" size="small">
          <el-radio-button value="coin">Coins</el-radio-button>
          <el-radio-button value="diamond">Diamonds</el-radio-button>
        </el-radio-group>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="amount">Amount</label>
        <el-input-number
          id="amount"
          v-model="form.amount"
          :min="0"
          :step="100"
          :precision="0"
          class="w-full"
        />
        <p class="eyebrow mt-1">whole {{ unit }} only — balances are counts, never fractions</p>
        <p v-if="errors.amount" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ errors.amount }}
        </p>
      </div>

      <!-- The arithmetic, before it happens. -->
      <div class="panel px-3 py-2.5">
        <div class="flex items-baseline justify-between">
          <span class="eyebrow">Now</span>
          <span class="key">{{ format(balanceBefore) }} {{ unit }}</span>
        </div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="eyebrow">{{ isCredit ? 'Credit' : 'Debit' }}</span>
          <span
            class="key"
            :class="isCredit ? 'text-[var(--color-ok)]' : 'text-[var(--color-cut)]'"
          >
            {{ isCredit ? '+' : '−' }}{{ format(form.amount) }}
          </span>
        </div>
        <div
          class="mt-1.5 flex items-baseline justify-between border-t border-[var(--color-edge)] pt-1.5"
        >
          <span class="eyebrow text-[var(--color-paper)]">After</span>
          <span
            class="key font-bold"
            :class="overdrawn ? 'text-[var(--color-cut)]' : 'text-[var(--color-paper)]'"
          >
            {{ format(balanceAfter) }} {{ unit }}
          </span>
        </div>
      </div>

      <p v-if="overdrawn" class="text-[12px] text-[var(--color-cut)]">
        That is more than they hold. A balance cannot go negative.
      </p>

      <div>
        <label class="eyebrow mb-1 block" for="note">Note</label>
        <el-input
          id="note"
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="255"
          show-word-limit
          placeholder="Goodwill credit for the 12 Aug outage"
        />
        <p class="eyebrow mt-1">
          required · stored on the ledger row and the audit trail, with your name
        </p>
        <p v-if="errors.note" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.note }}</p>
      </div>

      <p v-if="serverError" class="text-[12px] text-[var(--color-cut)]">{{ serverError }}</p>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancel</el-button>
      <el-button
        :type="isCredit ? 'primary' : 'danger'"
        :loading="busy"
        :disabled="!valid"
        @click="submit"
      >
        {{ isCredit ? 'Credit' : 'Debit' }} {{ format(form.amount) }} {{ unit }}
      </el-button>
    </template>
  </el-dialog>
</template>
