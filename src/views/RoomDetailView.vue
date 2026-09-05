<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { RoomCategoryRow, RoomDetail, RoomSeatRow, SilentJoinResult } from '@/types/api'

/** GFT-044 — the room detail drawer, as a page: seat map, members, actions. */
const route = useRoute()
const roomId = Number(route.params.id)

const detail = ref<RoomDetail | null>(null)
const categories = ref<RoomCategoryRow[]>([])
const loading = ref(true)
const membersDialogOpen = ref(false)

const room = computed(() => detail.value?.room ?? null)

/** The sidebar shows the first few; "See all" opens the full roster in a dialog. */
const visibleMembers = computed(() => detail.value?.members.slice(0, 4) ?? [])

onMounted(async () => {
  await load()
  loading.value = false

  try {
    const { data } = await api.get<RoomCategoryRow[]>('/admin/room-categories')
    categories.value = data
  } catch {
    /* the category picker just has no options */
  }
})

async function load() {
  try {
    const { data } = await api.get<RoomDetail>(`/admin/rooms/${roomId}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function forceClose() {
  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      'Everyone is turned out and the room cannot reopen. Recorded against your name in both the audit and moderation logs.',
      'Force-close this room',
      {
        confirmButtonText: 'Force-close',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Why is this room being closed?',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      },
    )
    reason = result.value
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/rooms/${roomId}/close`, { reason })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function toggleSeat(seat: RoomSeatRow) {
  const locking = !seat.is_locked

  if (locking && seat.user) {
    try {
      await ElMessageBox.confirm(
        `${seat.user.display_name ?? seat.user.guftagu_id} is on seat ${seat.seat_number}. Locking it turns them out.`,
        'Lock an occupied seat?',
        { confirmButtonText: 'Lock and remove', cancelButtonText: 'Cancel', type: 'warning' },
      )
    } catch {
      return
    }
  }

  try {
    await api.post(`/admin/rooms/${roomId}/seats/${seat.seat_number}/lock`, { locked: locking })
    ElMessage.success(locking ? 'Seat locked' : 'Seat unlocked')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function toggleVip(seat: RoomSeatRow) {
  const marking = !seat.is_vip

  try {
    await api.post(`/admin/rooms/${roomId}/seats/${seat.seat_number}/vip`, { vip: marking })
    ElMessage.success(marking ? 'Seat marked VIP' : 'Seat unmarked')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function togglePin() {
  if (!room.value) return
  try {
    await api.post(`/admin/rooms/${roomId}/pin`, { pinned: !room.value.is_pinned })
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function changeCategory(categoryId: number) {
  try {
    await api.patch(`/admin/rooms/${roomId}/category`, { category_id: categoryId })
    ElMessage.success('Category changed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/** Which seat a given user occupies, if any — so the member list can offer mute/unmute. */
const seatByUser = computed(() => {
  const map = new Map<number, RoomSeatRow>()
  for (const seat of detail.value?.seats ?? []) {
    if (seat.user) map.set(seat.user.id, seat)
  }
  return map
})

/**
 * C.1b — silent observe. The room's own state is not touched by this; the API writes only
 * an audit and moderation-log row.
 */
async function silentJoin() {
  try {
    const { data } = await api.post<SilentJoinResult>(`/admin/rooms/${roomId}/silent-join`)
    ElMessage.success('Logged')
    ElMessage.info(data.note)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** C.2a. */
async function muteSeat(seat: RoomSeatRow) {
  if (!seat.user) return

  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      `${seat.user.display_name ?? seat.user.guftagu_id} loses the mic until unmuted or the duration passes.`,
      `Mute seat ${seat.seat_number}`,
      {
        confirmButtonText: 'Mute',
        cancelButtonText: 'Cancel',
        inputPlaceholder: 'Why are they being muted?',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      },
    )
    reason = result.value
  } catch {
    return
  }

  try {
    await api.post(`/admin/rooms/${roomId}/seats/${seat.seat_number}/mute`, {
      duration_minutes: 60,
      reason,
    })
    ElMessage.success('Muted for 60 minutes')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function unmuteSeat(seat: RoomSeatRow) {
  try {
    await api.post(`/admin/rooms/${roomId}/seats/${seat.seat_number}/unmute`)
    ElMessage.success('Unmuted')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** C.2b. */
async function kickMember(member: { user_id: number; display_name: string | null; guftagu_id: string | null }) {
  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      `${member.display_name ?? member.guftagu_id} is removed from this room, and blocked from rejoining for 30 minutes.`,
      'Kick from room',
      {
        confirmButtonText: 'Kick',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Why are they being removed?',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      },
    )
    reason = result.value
  } catch {
    return
  }

  try {
    await api.post(`/admin/rooms/${roomId}/members/${member.user_id}/kick`, {
      reentry_block_minutes: 30,
      reason,
    })
    ElMessage.success('Removed')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** C.2c. */
async function warnMember(member: { user_id: number; display_name: string | null; guftagu_id: string | null }) {
  let message: string
  try {
    const result = await ElMessageBox.prompt(
      `Sent to ${member.display_name ?? member.guftagu_id} as an in-app notification.`,
      'Warn',
      {
        confirmButtonText: 'Warn',
        cancelButtonText: 'Cancel',
        inputPlaceholder: 'What should they be told?',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A message is required',
      },
    )
    message = result.value
  } catch {
    return
  }

  try {
    const { data } = await api.post<{ chat_posted: boolean; note: string }>(
      `/admin/rooms/${roomId}/warn`,
      { user_id: member.user_id, message },
    )
    ElMessage.success('Warning sent')
    // The chat half genuinely does not exist yet — say so rather than implying it worked.
    if (!data.chat_posted) ElMessage.info(data.note)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}
</script>

<template>
  <PageHead
    eyebrow="Platform · room"
    :title="room?.name ?? `Room #${roomId}`"
    :lede="room ? `${room.room_code} · ${room.category?.name ?? 'uncategorised'} · ${room.seat_layout} layout` : ''"
  >
    <template #actions>
      <el-button v-if="room" v-permission="'rooms.join_silent'" size="small" @click="silentJoin">
        Silent observe
      </el-button>
      <el-button v-if="room" v-permission="'rooms.pin'" size="small" @click="togglePin">
        {{ room.is_pinned ? 'Unpin' : 'Pin' }}
      </el-button>
      <el-button
        v-if="room && (room.status === 'live' || room.status === 'idle')"
        v-permission="'rooms.force_close'"
        size="small"
        type="danger"
        plain
        @click="forceClose"
      >
        Force-close
      </el-button>
      <RouterLink to="/rooms"><el-button size="small">Back</el-button></RouterLink>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div
      v-if="detail?.closure"
      class="panel mb-5 border-l-2 border-l-[var(--color-cut)] px-4 py-3"
    >
      <div class="eyebrow text-[var(--color-cut)]">{{ detail.closure.status }}</div>
      <p class="mt-1 text-[13px]">{{ detail.closure.reason }}</p>
      <p class="eyebrow mt-1">
        by {{ detail.closure.closed_by ?? 'unknown' }} · {{ when(detail.closure.ended_at) }}
      </p>
    </div>

    <div v-if="room" class="panel mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
      <div>
        <div class="eyebrow">Status</div>
        <el-tag :type="room.status === 'live' ? 'success' : room.status === 'force_closed' ? 'danger' : 'info'" size="small">
          {{ room.status }}
        </el-tag>
      </div>
      <div>
        <div class="eyebrow">Listeners</div>
        <div class="key text-[15px]">{{ room.listener_count.toLocaleString() }}</div>
      </div>
      <div>
        <div class="eyebrow">Peak</div>
        <div class="key text-[15px]">{{ room.peak_listeners.toLocaleString() }}</div>
      </div>
      <div>
        <div class="eyebrow">Diamonds</div>
        <div class="key text-[15px]">{{ room.diamonds.toLocaleString() }}</div>
      </div>
      <div>
        <div class="eyebrow">Host</div>
        <div class="key text-[15px]">{{ room.owner?.display_name ?? '—' }}</div>
      </div>
      <div v-permission="'rooms.categorise'" class="ml-auto">
        <div class="eyebrow mb-1">Category</div>
        <el-select
          :model-value="room.category?.id"
          size="small"
          class="w-40"
          @change="changeCategory($event as number)"
        >
          <el-option v-for="c in categories" :key="c.id" :label="c.name_en" :value="c.id" />
        </el-select>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[1fr_300px]">
      <!-- Seat map: the room's actual shape, not a table of rows. -->
      <section class="panel">
        <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Seat map</div>
          <div class="key text-[var(--color-legend)]">
            {{ detail?.seats.filter((s) => s.user).length ?? 0 }}/{{ room?.seat_count ?? 0 }} taken
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
          <span class="eyebrow">Seat template</span>
          <span class="key text-[14px]">
            {{ detail?.seat_template ? `${detail.seat_template.name}` : 'None decided — VIP seats set individually' }}
          </span>
          <span v-if="detail?.seat_template" class="eyebrow">
            VIP at {{ detail.seat_template.vip_positions.join(', ') || 'none' }}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-5">
          <div v-for="seat in detail?.seats ?? []" :key="seat.seat_number" class="relative aspect-square">
            <button
              type="button"
              class="flex h-full w-full flex-col items-center justify-center gap-1 border p-1.5 text-center transition-colors"
              :class="[
                seat.is_locked
                  ? 'border-[var(--color-cut)] bg-[color-mix(in_srgb,var(--color-cut)_10%,transparent)]'
                  : seat.user
                    ? 'border-[var(--color-signal)] bg-[color-mix(in_srgb,var(--color-signal)_10%,transparent)]'
                    : 'border-[var(--color-edge)] border-dashed',
                seat.is_vip ? 'ring-2 ring-[var(--color-signal)] ring-offset-1 ring-offset-[var(--color-panel)]' : '',
              ]"
              style="border-radius: 3px"
              :title="
                seat.is_locked
                  ? 'Locked'
                  : seat.user
                    ? `${seat.user.display_name ?? seat.user.guftagu_id} — click to lock`
                    : 'Empty — click to lock'
              "
              @click="toggleSeat(seat)"
            >
              <span class="eyebrow">{{ seat.seat_number }}</span>

              <span v-if="seat.is_locked" class="eyebrow text-[var(--color-cut)]">locked</span>
              <template v-else-if="seat.user">
                <span class="w-full truncate text-[11px] leading-tight font-medium">
                  {{ seat.user.display_name ?? seat.user.guftagu_id }}
                </span>
                <span v-if="seat.is_muted_by_host" class="eyebrow text-[var(--color-legend-dim)]">
                  muted
                </span>
              </template>
              <span v-else class="eyebrow text-[var(--color-legend-dim)]">empty</span>
            </button>

            <!-- Persistent, readable, whenever the seat is VIP — regardless of who (if
                 anyone) is sitting there. The corner star underneath is the toggle. -->
            <span
              v-if="seat.is_vip"
              class="absolute top-0.5 left-0.5 rounded-sm bg-[var(--color-signal)] px-1 text-[9px] font-bold leading-tight tracking-wide text-[var(--color-ink)]"
            >
              VIP
            </span>

            <!-- A prior sanction in this room, worth seeing before deciding — not a click
                 target, just a signal. -->
            <span
              v-if="seat.user && seat.user.prior_sanctions_here > 0"
              class="absolute bottom-0.5 left-0.5 rounded-full bg-[var(--color-cut)] px-1 text-[9px] leading-tight text-white"
              :title="`${seat.user.prior_sanctions_here} prior sanction(s) in this room`"
            >
              {{ seat.user.prior_sanctions_here }}
            </span>

            <button
              v-if="seat.user"
              v-permission="'moderation.mute_user'"
              type="button"
              class="absolute top-0.5 right-0.5 rounded-sm bg-[var(--color-raised)] px-1 text-[9px] leading-tight text-[var(--color-legend)] hover:text-[var(--color-signal)]"
              :title="seat.is_muted_by_host ? 'Unmute' : 'Mute for 60 minutes'"
              @click.stop="seat.is_muted_by_host ? unmuteSeat(seat) : muteSeat(seat)"
            >
              {{ seat.is_muted_by_host ? '🔇' : '🎙' }}
            </button>

            <!-- VIP applies to the seat itself, occupied or not, so this shows regardless
                 of whether anyone is sitting there. -->
            <button
              v-permission="'rooms.seat_vip'"
              type="button"
              class="absolute bottom-0.5 right-0.5 rounded-sm bg-[var(--color-raised)] px-1 text-[9px] leading-tight"
              :class="seat.is_vip ? 'text-[var(--color-signal)]' : 'text-[var(--color-legend)] hover:text-[var(--color-signal)]'"
              :title="seat.is_vip ? 'VIP seat — click to unmark' : 'Mark this seat VIP'"
              @click.stop="toggleVip(seat)"
            >
              {{ seat.is_vip ? '★' : '☆' }}
            </button>
          </div>
        </div>

        <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
          click a seat to lock or unlock it · locking an occupied seat turns the occupant out ·
          the mic icon mutes without locking · the star marks a seat VIP, independent of who's on it
        </p>
      </section>

      <aside class="space-y-4">
        <section class="panel">
          <div class="flex items-baseline justify-between border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">In the room</div>
            <div class="key text-[var(--color-legend)]">{{ detail?.members.length ?? 0 }}</div>
          </div>
          <div
            v-if="!detail?.members.length"
            class="px-4 py-6 text-center text-[13px] text-[var(--color-legend)]"
          >
            Nobody is in this room.
          </div>
          <template v-else>
            <ul class="divide-y divide-[var(--color-edge)]">
              <li
                v-for="member in visibleMembers"
                :key="member.user_id"
                class="flex items-center justify-between gap-2 px-4 py-2"
              >
                <RouterLink
                  :to="`/users/${member.user_id}`"
                  class="min-w-0 text-[13px] hover:text-[var(--color-signal)]"
                >
                  <div class="truncate">
                    {{ member.display_name ?? member.guftagu_id }}
                    <span v-if="member.prior_sanctions_here > 0" class="eyebrow text-[var(--color-signal)]">
                      ({{ member.prior_sanctions_here }})
                    </span>
                  </div>
                  <div class="eyebrow">{{ member.role }}</div>
                </RouterLink>

                <div class="flex shrink-0 items-center gap-1">
                  <span class="key text-[var(--color-legend-dim)]">
                    {{ member.joined_at ? new Date(member.joined_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '' }}
                  </span>
                  <el-button
                    v-if="seatByUser.get(member.user_id)"
                    v-permission="'moderation.mute_user'"
                    size="small"
                    text
                    @click="
                      seatByUser.get(member.user_id)!.is_muted_by_host
                        ? unmuteSeat(seatByUser.get(member.user_id)!)
                        : muteSeat(seatByUser.get(member.user_id)!)
                    "
                  >
                    {{ seatByUser.get(member.user_id)!.is_muted_by_host ? 'Unmute' : 'Mute' }}
                  </el-button>
                  <el-button v-permission="'moderation.warn_user'" size="small" text @click="warnMember(member)">
                    Warn
                  </el-button>
                  <el-button v-permission="'moderation.kick_user'" size="small" text @click="kickMember(member)">
                    Kick
                  </el-button>
                </div>
              </li>
            </ul>

            <div v-if="detail.members.length > 4" class="border-t border-[var(--color-edge)] px-4 py-2 text-center">
              <el-button size="small" text @click="membersDialogOpen = true">
                See all {{ detail.members.length }}
              </el-button>
            </div>
          </template>
        </section>

        <section class="panel px-4 py-3">
          <div class="eyebrow">Not built yet</div>
          <p class="mt-1 text-[13px] text-[var(--color-legend)]">
            In-room chat and gift volume arrive with the chat and gifting modules. Listener
            counts are the last value written to the database, not a live feed.
          </p>
        </section>
      </aside>
    </div>

    <el-dialog v-model="membersDialogOpen" title="In the room" width="480">
      <ul v-if="detail" class="divide-y divide-[var(--color-edge)]">
        <li
          v-for="member in detail.members"
          :key="member.user_id"
          class="flex items-center justify-between gap-2 py-2"
        >
          <RouterLink
            :to="`/users/${member.user_id}`"
            class="min-w-0 text-[13px] hover:text-[var(--color-signal)]"
            @click="membersDialogOpen = false"
          >
            <div class="truncate">
              {{ member.display_name ?? member.guftagu_id }}
              <span v-if="member.prior_sanctions_here > 0" class="eyebrow text-[var(--color-signal)]">
                ({{ member.prior_sanctions_here }})
              </span>
            </div>
            <div class="eyebrow">{{ member.role }}</div>
          </RouterLink>

          <div class="flex shrink-0 items-center gap-1">
            <span class="key text-[var(--color-legend-dim)]">
              {{ member.joined_at ? new Date(member.joined_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '' }}
            </span>
            <el-button
              v-if="seatByUser.get(member.user_id)"
              v-permission="'moderation.mute_user'"
              size="small"
              text
              @click="
                seatByUser.get(member.user_id)!.is_muted_by_host
                  ? unmuteSeat(seatByUser.get(member.user_id)!)
                  : muteSeat(seatByUser.get(member.user_id)!)
              "
            >
              {{ seatByUser.get(member.user_id)!.is_muted_by_host ? 'Unmute' : 'Mute' }}
            </el-button>
            <el-button v-permission="'moderation.warn_user'" size="small" text @click="warnMember(member)">
              Warn
            </el-button>
            <el-button v-permission="'moderation.kick_user'" size="small" text @click="kickMember(member)">
              Kick
            </el-button>
          </div>
        </li>
      </ul>
    </el-dialog>
  </div>
</template>
