<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import ImageUpload from "@/components/ImageUpload.vue";
import PageHead from "@/components/PageHead.vue";
import { ApiError, api } from "@/lib/api";
import type {
  StoreItemRow,
  StoreItemsResult,
  StoreItemType,
  VipTierRow,
  VipTiersResult,
} from "@/types/api";

/**
 * The app's "Mall" — frames, bubbles, entry banners and entrance effects, all bought with
 * coins and (optionally) held for a limited rental period. See `StoreItem` on the backend
 * for why these four share one table instead of four near-identical ones.
 */
const TABS: Array<{ type: StoreItemType; label: string }> = [
  { type: "frame", label: "Frame" },
  { type: "entrance_effect", label: "Entry Effect" },
  { type: "bubble", label: "Bubbles" },
  { type: "entry_banner", label: "Entry Banner" },
];

const items = ref<StoreItemRow[]>([]);
const sources = ref<string[]>([]);
const triggers = ref<string[]>([]);
const vipTiers = ref<VipTierRow[]>([]);
const loading = ref(true);
const tab = ref<StoreItemType>("frame");

const dialog = ref(false);
const saving = ref(false);
const errors = ref<Record<string, string>>({});
const imageUpload = ref<InstanceType<typeof ImageUpload> | null>(null);

const form = reactive({
  id: null as number | null,
  type: "frame" as StoreItemType,
  name: "",
  image_url: null as string | null,
  animation_url: "",
  animation_type: "",
  duration_ms: 0,
  trigger: "vip_entry",
  min_gift_coin_value: 0,
  source: "admin",
  coin_price: 0,
  rental_days: null as number | null,
  required_vip_tier_id: null as number | null,
  is_active: true,
});

const rowsForTab = computed(() =>
  items.value.filter((i) => i.type === tab.value),
);

onMounted(async () => {
  await Promise.all([load(), loadVipTiers()]);
  loading.value = false;
});

async function load() {
  try {
    const { data } = await api.get<StoreItemsResult>("/admin/store-items", {
      include_inactive: true,
    });
    items.value = data.items;
    sources.value = data.sources;
    triggers.value = data.triggers;
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}

async function loadVipTiers() {
  try {
    const { data } = await api.get<VipTiersResult>("/admin/vip-tiers");
    vipTiers.value = data.tiers;
  } catch {
    /* the tier picker just falls back to no options */
  }
}

function priceLabel(row: StoreItemRow): string {
  if (!row.coin_price) return "free";
  const days = row.rental_days ? ` / ${row.rental_days}d` : "";
  return `${row.coin_price.toLocaleString()} coins${days}`;
}

function newItem() {
  Object.assign(form, {
    id: null,
    type: tab.value,
    name: "",
    image_url: null,
    animation_url: "",
    animation_type: "",
    duration_ms: 0,
    trigger: "vip_entry",
    min_gift_coin_value: 0,
    source: "admin",
    coin_price: 0,
    rental_days: null,
    required_vip_tier_id: null,
    is_active: true,
  });
  errors.value = {};
  dialog.value = true;
}

function editItem(row: StoreItemRow) {
  Object.assign(form, {
    id: row.id,
    type: row.type,
    name: row.name,
    image_url: row.image_url,
    animation_url: row.animation_url ?? "",
    animation_type: row.animation_type ?? "",
    duration_ms: row.duration_ms ?? 0,
    trigger: row.trigger ?? "vip_entry",
    min_gift_coin_value: row.min_gift_coin_value ?? 0,
    source: row.source ?? "admin",
    coin_price: row.coin_price,
    rental_days: row.rental_days,
    required_vip_tier_id: row.required_vip_tier_id,
    is_active: row.is_active,
  });
  errors.value = {};
  dialog.value = true;
}

async function save() {
  saving.value = true;
  errors.value = {};

  const body: Record<string, unknown> = {
    name: form.name,
    coin_price: form.coin_price,
    rental_days: form.rental_days,
    required_vip_tier_id: form.required_vip_tier_id,
    is_active: form.is_active,
  };

  if (form.type === "frame") {
    body.source = form.source;
    body.animation_url = form.animation_url || null;
  }

  if (form.type === "entrance_effect") {
    body.animation_url = form.animation_url || null;
    body.animation_type = form.animation_type || null;
    body.duration_ms = form.duration_ms || null;
    body.trigger = form.trigger;
    body.min_gift_coin_value = form.min_gift_coin_value || null;
  }

  try {
    if (form.id === null) {
      const { data } = await api.post<{ id: number }>("/admin/store-items", {
        ...body,
        type: form.type,
      });

      if (imageUpload.value?.hasPendingFile)
        await imageUpload.value.uploadNow(data.id);

      ElMessage.success("Item created");
    } else {
      await api.patch(`/admin/store-items/${form.id}`, body);
      ElMessage.success("Item updated");
    }
    dialog.value = false;
    await load();
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors;
      if (!Object.keys(errors.value).length) ElMessage.error(e.message);
    }
  } finally {
    saving.value = false;
  }
}

async function removeItem(row: StoreItemRow) {
  try {
    await ElMessageBox.confirm(`Delete “${row.name}”?`, "Delete item", {
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      type: "warning",
    });
  } catch {
    return;
  }

  try {
    await api.del(`/admin/store-items/${row.id}`);
    ElMessage.success("Item deleted");
    await load();
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}
</script>

<template>
  <PageHead
    eyebrow="Store"
    title="Store"
    lede="The app's Mall — frames, bubbles, entry banners and entrance effects a user buys with coins."
  >
    <template #actions>
      <el-button
        v-permission="'vip.manage'"
        type="primary"
        size="small"
        @click="newItem"
      >
        Add item
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs
      :model-value="tab"
      @update:model-value="tab = $event as StoreItemType"
    >
      <el-tab-pane
        v-for="t in TABS"
        :key="t.type"
        :label="`${t.label} (${items.filter((i) => i.type === t.type).length})`"
        :name="t.type"
      >
        <EmptyState
          v-if="!loading && rowsForTab.length === 0"
          :title="`No ${t.label.toLowerCase()} items yet`"
          body="Add one with the button above."
        />

        <div
          v-else
          class="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
        >
          <article
            v-for="row in rowsForTab"
            :key="row.id"
            class="panel overflow-hidden"
          >
            <div
              class="flex h-20 items-center justify-center border-b border-[var(--color-edge)] bg-[var(--color-recess)]"
            >
              <img
                v-if="row.image_url"
                :src="row.image_url"
                alt=""
                class="h-full w-full object-contain p-2"
              />
              <svg
                v-else
                viewBox="0 0 24 24"
                class="h-8 w-8 text-[var(--color-legend)]"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                <path
                  d="M21 15l-5-5-9 9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[13px] font-medium">{{
                  row.name
                }}</span>
                <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                  {{ row.is_active ? "active" : "hidden" }}
                </el-tag>
              </div>
              <div class="key mt-0.5 text-[var(--color-legend)]">
                {{ priceLabel(row) }}
              </div>
              <el-tag
                v-if="row.vip_level"
                type="warning"
                size="small"
                class="mt-1"
              >
                VIP {{ row.vip_level }}+
              </el-tag>
              <div class="mt-2 flex gap-2">
                <el-button
                  v-permission.disable="'vip.manage'"
                  size="small"
                  @click="editItem(row)"
                  >Edit</el-button
                >
                <el-button
                  v-permission.disable="'vip.manage'"
                  size="small"
                  type="danger"
                  plain
                  @click="removeItem(row)"
                >
                  Delete
                </el-button>
              </div>
            </div>
          </article>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <el-dialog
    v-model="dialog"
    :title="form.id ? 'Edit item' : 'Add item'"
    width="440"
  >
    <div class="space-y-3">
      <div v-if="form.id === null">
        <label class="eyebrow mb-1 block">Type</label>
        <el-select v-model="form.type" class="w-full">
          <el-option
            v-for="t in TABS"
            :key="t.type"
            :label="t.label"
            :value="t.type"
          />
        </el-select>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="si-name">Name</label>
        <el-input id="si-name" v-model="form.name" />
        <p v-if="errors.name" class="mt-1 text-[12px] text-[var(--color-cut)]">
          {{ errors.name }}
        </p>
      </div>

      <ImageUpload
        ref="imageUpload"
        v-model="form.image_url"
        upload-url="/admin/store-items/image"
        label="Image"
        :record-id="form.id"
        @saved="load"
      />

      <template v-if="form.type === 'frame'">
        <div>
          <label class="eyebrow mb-1 block">Source</label>
          <el-select v-model="form.source" class="w-full">
            <el-option v-for="s in sources" :key="s" :label="s" :value="s" />
          </el-select>
        </div>
        <div>
          <label class="eyebrow mb-1 block">Animation URL</label>
          <el-input v-model="form.animation_url" placeholder="https://…" />
        </div>
      </template>

      <template v-if="form.type === 'entrance_effect'">
        <div>
          <label class="eyebrow mb-1 block">Animation URL</label>
          <el-input v-model="form.animation_url" placeholder="https://…" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">Animation type</label>
            <el-select
              v-model="form.animation_type"
              clearable
              placeholder="—"
              class="w-full"
            >
              <el-option label="Lottie" value="lottie" />
              <el-option label="SVGA" value="svga" />
              <el-option label="MP4" value="mp4" />
            </el-select>
          </div>
          <div>
            <label class="eyebrow mb-1 block">Duration (ms)</label>
            <el-input-number
              v-model="form.duration_ms"
              :min="0"
              :step="500"
              class="w-full"
            />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">Trigger</label>
            <el-select v-model="form.trigger" class="w-full">
              <el-option
                v-for="t in triggers"
                :key="t"
                :label="t.replace('_', ' ')"
                :value="t"
              />
            </el-select>
          </div>
          <div>
            <label class="eyebrow mb-1 block">Min. gift value (coins)</label>
            <el-input-number
              v-model="form.min_gift_coin_value"
              :min="0"
              :step="500"
              class="w-full"
            />
          </div>
        </div>
      </template>

      <div
        class="grid grid-cols-2 gap-3 border-t border-[var(--color-edge)] pt-3"
      >
        <div>
          <label class="eyebrow mb-1 block">Price in coins</label>
          <el-input-number
            v-model="form.coin_price"
            :min="0"
            :step="500"
            class="w-full"
          />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Rental (days)</label>
          <el-input-number
            v-model="form.rental_days"
            :min="1"
            :max="3650"
            class="w-full"
            placeholder="permanent"
          />
          <p class="eyebrow mt-1">
            leave unset for a permanent, one-time purchase
          </p>
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block">Minimum VIP tier</label>
        <el-select
          v-model="form.required_vip_tier_id"
          clearable
          placeholder="No tier requirement"
          class="w-full"
        >
          <el-option
            v-for="t in vipTiers"
            :key="t.id"
            :label="`VIP ${t.level} — ${t.name_en}`"
            :value="t.id"
          />
        </el-select>
      </div>

      <el-checkbox v-model="form.is_active" size="small"
        >Offer this in the app</el-checkbox
      >
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.name"
        @click="save"
      >
        Save
      </el-button>
    </template>
  </el-dialog>
</template>
