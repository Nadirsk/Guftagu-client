<script setup lang="ts">
import { Parser, Player } from 'svgaplayerweb'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Plays a store/gift animation in the panel. Browsers cannot render SVGA on their own —
 * opening a `.svga` URL just downloads it — so SVGA goes through `svgaplayerweb`, the
 * web build of the same player the app uses. MP4 is a plain <video>. Lottie is not
 * previewed here (it would need lottie-web); the URL is still shown by the caller.
 *
 * `src` may be a remote URL or a local `blob:` URL of a picked-but-not-uploaded file.
 * The Vultr bucket answers GET with `Access-Control-Allow-Origin: *`, which the
 * player's XHR fetch needs.
 */
const props = withDefaults(
  defineProps<{
    src: string
    /** Overrides detection from the URL — needed for `blob:` URLs, which have no extension. */
    type?: string | null
    size?: number
    /** No box of its own — for dropping into a slot that already has one (store cards). */
    bare?: boolean
  }>(),
  { type: null, size: 160, bare: false },
)

const kind = computed(() => {
  if (props.type) return props.type
  const ext = props.src.split('?')[0].split('.').pop()?.toLowerCase()
  return ext === 'json' ? 'lottie' : ext
})

const host = ref<HTMLDivElement | null>(null)
const failed = ref(false)
const loading = ref(false)
let player: Player | null = null

function teardown() {
  player?.stopAnimation(true)
  player?.clear()
  player = null
  if (host.value) host.value.innerHTML = ''
}

function playSvga() {
  teardown()
  failed.value = false
  if (!host.value || !props.src) return

  loading.value = true
  player = new Player(host.value)
  player.loops = 0
  player.setContentMode('AspectFit')

  const requested = props.src
  new Parser().load(
    requested,
    (video) => {
      // A newer src may have arrived while this one was downloading.
      if (requested !== props.src || !player) return
      loading.value = false
      player.setVideoItem(video)
      player.startAnimation()
    },
    () => {
      if (requested !== props.src) return
      loading.value = false
      failed.value = true
    },
  )
}

watch(
  [() => props.src, kind, host],
  () => {
    if (kind.value === 'svga') playSvga()
    else teardown()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(teardown)
</script>

<template>
  <div
    class="relative flex items-center justify-center overflow-hidden"
    :class="{ 'border border-[var(--color-edge)] bg-[var(--color-recess)]': !bare }"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: bare ? undefined : '4px' }"
  >
    <template v-if="kind === 'svga'">
      <div ref="host" class="h-full w-full" />
      <span v-if="loading" class="eyebrow absolute">loading…</span>
      <span v-if="failed" class="eyebrow absolute px-2 text-center text-[var(--color-cut)]">
        could not play this SVGA
      </span>
    </template>
    <video
      v-else-if="kind === 'mp4'"
      :src="src"
      class="h-full w-full object-contain"
      autoplay
      loop
      muted
      playsinline
    />
    <span v-else class="eyebrow px-2 text-center">no preview for {{ kind || 'this file' }}</span>
  </div>
</template>
