<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type {
  AnnouncementRow,
  BannerResult,
  BannerRow,
  CmsPageDetail,
  CmsPageRow,
  ContentState,
  FaqResult,
  FaqRow,
} from '@/types/api'

/** GFT-110 — banners with placement preview, plus announcements, pages and FAQs (A.10a). */
const tab = ref('banners')

const banners = ref<BannerResult | null>(null)
const announcements = ref<AnnouncementRow[]>([])
const pages = ref<CmsPageRow[]>([])
const faqs = ref<FaqResult | null>(null)
const pageDetail = ref<CmsPageDetail | null>(null)

const loading = ref(true)
const busy = ref(false)

const bannerDialog = ref(false)
const editingBanner = ref<BannerRow | null>(null)
const bannerForm = ref({
  title: '',
  image_url: '',
  placement: 'home_top',
  action_type: 'url',
  action_value: '',
  sort_order: 10,
  starts_at: '',
  ends_at: '',
  is_active: true,
})

const announcementDialog = ref(false)
const editingAnnouncement = ref<AnnouncementRow | null>(null)
const announcementForm = ref({
  title_en: '',
  title_hi: '',
  body_en: '',
  body_hi: '',
  type: 'marquee',
  starts_at: '',
  ends_at: '',
  is_active: true,
})

const pageDrawer = ref(false)
const pageForm = ref({ title_en: '', content_en: '', title_hi: '', content_hi: '' })

const faqDialog = ref(false)
const editingFaq = ref<FaqRow | null>(null)
const faqForm = ref({
  category: 'general',
  question_en: '',
  question_hi: '',
  answer_en: '',
  answer_hi: '',
  is_active: true,
})

/** Amber for "not showing yet", teal for live, muted for done. */
const STATE_TYPE: Record<ContentState, 'success' | 'warning' | 'info' | 'danger' | ''> = {
  live: 'success',
  scheduled: 'warning',
  expired: 'info',
  off: '',
  // B.3b — not showing, and the reason is a missing signature rather than a window.
  awaiting_approval: 'danger',
}

const STATE_LABEL: Record<ContentState, string> = {
  live: 'live',
  scheduled: 'scheduled',
  expired: 'expired',
  off: 'off',
  awaiting_approval: 'needs approval',
}

onMounted(async () => {
  await Promise.all([loadBanners(), loadAnnouncements(), loadPages(), loadFaqs()])
  loading.value = false
})

async function loadBanners() {
  try {
    const { data } = await api.get<BannerResult>('/admin/content/banners')
    banners.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadAnnouncements() {
  try {
    const { data } = await api.get<{ announcements: AnnouncementRow[] }>('/admin/content/announcements')
    announcements.value = data.announcements
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadPages() {
  try {
    const { data } = await api.get<{ pages: CmsPageRow[] }>('/admin/content/pages')
    pages.value = data.pages
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadFaqs() {
  try {
    const { data } = await api.get<FaqResult>('/admin/content/faqs')
    faqs.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

// ------------------------------------------------------------------ banners

function newBanner() {
  editingBanner.value = null
  bannerForm.value = {
    title: '', image_url: '', placement: 'home_top', action_type: 'url', action_value: '',
    sort_order: 10, starts_at: '', ends_at: '', is_active: true,
  }
  bannerDialog.value = true
}

function editBanner(row: BannerRow) {
  editingBanner.value = row
  bannerForm.value = {
    title: row.title,
    image_url: row.image_url,
    placement: row.placement,
    action_type: row.action_type ?? 'none',
    action_value: row.action_value ?? '',
    sort_order: row.sort_order,
    starts_at: row.starts_at?.slice(0, 16) ?? '',
    ends_at: row.ends_at?.slice(0, 16) ?? '',
    is_active: row.is_active,
  }
  bannerDialog.value = true
}

async function saveBanner() {
  const body = {
    ...bannerForm.value,
    starts_at: bannerForm.value.starts_at || null,
    ends_at: bannerForm.value.ends_at || null,
    action_value: bannerForm.value.action_value || null,
  }

  await run(async () => {
    if (editingBanner.value) {
      await api.patch(`/admin/content/banners/${editingBanner.value.id}`, body)
    } else {
      await api.post('/admin/content/banners', body)
    }
    bannerDialog.value = false
    await loadBanners()
  })
}

/** B.3b — sign a banner off so it can actually show. */
async function approveBanner(row: BannerRow) {
  await run(async () => {
    await api.post(`/admin/content/banners/${row.id}/approve`)
    await loadBanners()
  })
}

async function removeBanner(row: BannerRow) {
  try {
    await ElMessageBox.confirm(`"${row.title}" stops showing everywhere.`, 'Remove this banner?', {
      confirmButtonText: 'Remove', cancelButtonText: 'Cancel', type: 'warning',
    })
  } catch {
    return
  }

  await run(async () => {
    await api.del(`/admin/content/banners/${row.id}`)
    await loadBanners()
  })
}

// ------------------------------------------------------------ announcements

function newAnnouncement() {
  editingAnnouncement.value = null
  announcementForm.value = {
    title_en: '', title_hi: '', body_en: '', body_hi: '',
    type: 'marquee', starts_at: '', ends_at: '', is_active: true,
  }
  announcementDialog.value = true
}

function editAnnouncement(row: AnnouncementRow) {
  editingAnnouncement.value = row
  announcementForm.value = {
    title_en: row.title_en,
    title_hi: row.title_hi ?? '',
    body_en: row.body_en,
    body_hi: row.body_hi ?? '',
    type: row.type,
    starts_at: row.starts_at?.slice(0, 16) ?? '',
    ends_at: row.ends_at?.slice(0, 16) ?? '',
    is_active: row.is_active,
  }
  announcementDialog.value = true
}

async function saveAnnouncement() {
  const body = {
    ...announcementForm.value,
    title_hi: announcementForm.value.title_hi || null,
    body_hi: announcementForm.value.body_hi || null,
    starts_at: announcementForm.value.starts_at || null,
    ends_at: announcementForm.value.ends_at || null,
  }

  await run(async () => {
    if (editingAnnouncement.value) {
      await api.patch(`/admin/content/announcements/${editingAnnouncement.value.id}`, body)
    } else {
      await api.post('/admin/content/announcements', body)
    }
    announcementDialog.value = false
    await loadAnnouncements()
  })
}

async function removeAnnouncement(row: AnnouncementRow) {
  await run(async () => {
    await api.del(`/admin/content/announcements/${row.id}`)
    await loadAnnouncements()
  })
}

// ------------------------------------------------------------------- pages

async function openPage(row: CmsPageRow) {
  pageDrawer.value = true
  pageDetail.value = null

  try {
    const { data } = await api.get<CmsPageDetail>(`/admin/content/pages/${row.id}`)
    pageDetail.value = data
    pageForm.value = {
      title_en: data.page.title_en,
      content_en: data.page.content_en,
      title_hi: data.page.title_hi ?? '',
      content_hi: data.page.content_hi ?? '',
    }
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function savePage() {
  if (!pageDetail.value) return

  await run(async () => {
    await api.patch(`/admin/content/pages/${pageDetail.value!.page.id}`, {
      title_en: pageForm.value.title_en,
      content_en: pageForm.value.content_en,
      title_hi: pageForm.value.title_hi || null,
      content_hi: pageForm.value.content_hi || null,
    })
    ElMessage.info('Saved as a draft edit. Publish to cut a version.')
  })
}

async function publishPage() {
  if (!pageDetail.value) return

  const page = pageDetail.value.page

  try {
    await ElMessageBox.confirm(
      page.is_legal
        ? 'This is a legal page. Publishing records a new version — the text people agreed to before stays retrievable.'
        : 'The current text becomes the live version.',
      'Publish this page?',
      { confirmButtonText: 'Publish', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  await run(async () => {
    await api.post(`/admin/content/pages/${page.id}/publish`)
    await Promise.all([loadPages(), openPage({ id: page.id } as CmsPageRow)])
  })
}

async function restoreVersion(versionId: number, version: number) {
  if (!pageDetail.value) return

  const page = pageDetail.value.page

  try {
    await ElMessageBox.confirm(
      `Version ${version} becomes the live text, published as a new version. Nothing is deleted.`,
      'Roll back?',
      { confirmButtonText: 'Restore', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }

  await run(async () => {
    await api.post(`/admin/content/pages/${page.id}/restore/${versionId}`)
    await Promise.all([loadPages(), openPage({ id: page.id } as CmsPageRow)])
  })
}

// --------------------------------------------------------------------- FAQs

function newFaq() {
  editingFaq.value = null
  faqForm.value = {
    category: 'general', question_en: '', question_hi: '', answer_en: '', answer_hi: '', is_active: true,
  }
  faqDialog.value = true
}

function editFaq(row: FaqRow) {
  editingFaq.value = row
  faqForm.value = {
    category: row.category,
    question_en: row.question_en,
    question_hi: row.question_hi ?? '',
    answer_en: row.answer_en,
    answer_hi: row.answer_hi ?? '',
    is_active: row.is_active,
  }
  faqDialog.value = true
}

async function saveFaq() {
  const body = {
    ...faqForm.value,
    question_hi: faqForm.value.question_hi || null,
    answer_hi: faqForm.value.answer_hi || null,
  }

  await run(async () => {
    if (editingFaq.value) {
      await api.patch(`/admin/content/faqs/${editingFaq.value.id}`, body)
    } else {
      await api.post('/admin/content/faqs', body)
    }
    faqDialog.value = false
    await loadFaqs()
  })
}

async function removeFaq(row: FaqRow) {
  await run(async () => {
    await api.del(`/admin/content/faqs/${row.id}`)
    await loadFaqs()
  })
}

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    ElMessage.success('Saved')
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHead
    eyebrow="Content"
    title="App content"
    lede="Banners, announcements, legal pages and FAQs. Anything scheduled shows what is live right now, not just what was switched on."
  />

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <el-tabs v-model="tab">
      <!-- GFT-110 -->
      <el-tab-pane label="Banners" name="banners">
        <div v-if="banners" class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div v-for="p in banners.by_placement" :key="p.placement" class="panel px-3 py-2.5">
            <div class="eyebrow">{{ p.placement.replace('_', ' ') }}</div>
            <div class="key text-[16px]">{{ p.clicks.toLocaleString() }} clicks</div>
            <div class="eyebrow">{{ p.impressions.toLocaleString() }} shown · {{ p.banners }} banners</div>
          </div>
        </div>

        <div class="mb-3 flex items-center justify-end gap-2">
          <span
            v-if="banners && banners.awaiting_approval > 0"
            class="eyebrow mr-auto text-[var(--color-signal)]"
          >
            {{ banners.awaiting_approval }}
            {{ banners.awaiting_approval === 1 ? 'banner is' : 'banners are' }} waiting for approval
          </span>
          <el-button v-permission="'cms.banner_manage'" size="small" type="primary" @click="newBanner">
            Add banner
          </el-button>
        </div>

        <div class="panel">
          <EmptyState
            v-if="banners && banners.banners.length === 0"
            title="No banners"
            body="A banner is the strip at the top of the home screen, the room list, or the wallet."
          />

          <ul v-else-if="banners">
            <li
              v-for="b in banners.banners"
              :key="b.id"
              class="flex items-center gap-3 border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
            >
              <!-- Placement preview: the actual image at the aspect it will render. -->
              <img
                :src="b.image_url"
                :alt="b.title"
                class="h-12 w-24 shrink-0 rounded-sm border border-[var(--color-edge)] object-cover"
                loading="lazy"
              />

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="truncate font-medium">{{ b.title }}</span>
                  <span class="eyebrow">{{ b.placement.replace('_', ' ') }}</span>
                </div>
                <div class="eyebrow">
                  {{ b.starts_at?.slice(0, 10) ?? 'always' }} → {{ b.ends_at?.slice(0, 10) ?? 'no end' }}
                </div>
              </div>

              <div class="shrink-0 text-right">
                <div class="key">{{ b.click_count.toLocaleString() }}</div>
                <div class="eyebrow">
                  {{ b.click_rate === null ? 'not shown yet' : `${(b.click_rate * 100).toFixed(2)}% CTR` }}
                </div>
              </div>

              <el-tag :type="STATE_TYPE[b.state]" size="small" class="shrink-0">
                {{ STATE_LABEL[b.state] }}
              </el-tag>

              <div class="shrink-0">
                <el-button
                  v-if="!b.is_approved"
                  v-permission="'cms.banner_approve'"
                  size="small"
                  text
                  :loading="busy"
                  @click="approveBanner(b)"
                >
                  Approve
                </el-button>
                <el-button v-permission="'cms.banner_manage'" size="small" text @click="editBanner(b)">Edit</el-button>
                <el-button v-permission="'cms.banner_manage'" size="small" text @click="removeBanner(b)">Remove</el-button>
              </div>
            </li>
          </ul>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Announcements" name="announcements">
        <div class="mb-3 flex justify-end">
          <el-button v-permission="'cms.announcement_manage'" size="small" type="primary" @click="newAnnouncement">
            Add announcement
          </el-button>
        </div>

        <div class="panel">
          <EmptyState v-if="announcements.length === 0" title="No announcements" />

          <ul v-else>
            <li
              v-for="a in announcements"
              :key="a.id"
              class="border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
            >
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-medium">{{ a.title_en }}</span>
                <span class="eyebrow">{{ a.type }}</span>
                <el-tag v-if="!a.bilingual" size="small" type="warning">English only</el-tag>
                <el-tag :type="STATE_TYPE[a.state]" size="small" class="ml-auto">{{ a.state }}</el-tag>
              </div>
              <p class="mt-1 text-[13px] text-[var(--color-legend)]">{{ a.body_en }}</p>
              <div class="mt-1 flex items-baseline gap-2">
                <span class="eyebrow">
                  {{ a.applies_to_everyone ? 'everyone' : a.target_roles.join(', ') }}
                </span>
                <span class="eyebrow ml-auto">
                  <el-button v-permission="'cms.announcement_manage'" size="small" text @click="editAnnouncement(a)">Edit</el-button>
                  <el-button v-permission="'cms.announcement_manage'" size="small" text @click="removeAnnouncement(a)">Remove</el-button>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Pages" name="pages">
        <div class="panel">
          <EmptyState v-if="pages.length === 0" title="No pages" />

          <el-table v-else :data="pages" style="width: 100%" @row-click="openPage">
            <el-table-column label="Page" min-width="220">
              <template #default="{ row }">
                <div class="font-medium">{{ row.title_en }}</div>
                <div class="key text-[var(--color-legend)]">/{{ row.slug }}</div>
              </template>
            </el-table-column>
            <el-table-column label="Type" width="130">
              <template #default="{ row }">
                <span class="key">{{ row.type }}</span>
                <el-tag v-if="row.is_legal" size="small" type="warning" class="ml-1">legal</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Version" width="110" align="right">
              <template #default="{ row }">
                <span class="key">v{{ row.version }}</span>
                <span class="eyebrow"> of {{ row.versions }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Hindi" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.bilingual" size="small" type="success">yes</el-tag>
                <el-tag v-else size="small" type="warning">missing</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="120">
              <template #default="{ row }">
                <el-tag :type="row.is_published ? 'success' : 'info'" size="small">
                  {{ row.is_published ? 'published' : 'draft' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="FAQs" name="faqs">
        <div class="mb-3 flex items-center gap-2">
          <span v-if="faqs && faqs.missing_hindi > 0" class="eyebrow text-[var(--color-signal)]">
            {{ faqs.missing_hindi }} active {{ faqs.missing_hindi === 1 ? 'FAQ has' : 'FAQs have' }} no Hindi answer
          </span>
          <el-button v-permission="'cms.page_manage'" size="small" type="primary" class="ml-auto" @click="newFaq">
            Add FAQ
          </el-button>
        </div>

        <div class="panel">
          <EmptyState v-if="faqs && faqs.faqs.length === 0" title="No FAQs" />

          <ul v-else-if="faqs">
            <li
              v-for="f in faqs.faqs"
              :key="f.id"
              class="border-b border-[var(--color-edge)] px-4 py-3 last:border-b-0"
            >
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="eyebrow">{{ f.category }}</span>
                <span class="font-medium" :class="f.is_active ? '' : 'opacity-50'">{{ f.question_en }}</span>
                <el-tag v-if="!f.bilingual" size="small" type="warning">English only</el-tag>
                <span class="ml-auto">
                  <el-button v-permission="'cms.page_manage'" size="small" text @click="editFaq(f)">Edit</el-button>
                  <el-button v-permission="'cms.page_manage'" size="small" text @click="removeFaq(f)">Remove</el-button>
                </span>
              </div>
              <p class="mt-1 text-[13px] text-[var(--color-legend)]">{{ f.answer_en }}</p>
            </li>
          </ul>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <!-- Page editor -->
  <el-drawer v-model="pageDrawer" size="640px" :title="pageDetail?.page.title_en ?? 'Loading…'">
    <div v-if="pageDetail" class="space-y-4">
      <p v-if="pageDetail.note" class="panel px-4 py-3 text-[13px] text-[var(--color-legend)]">
        {{ pageDetail.note }}
      </p>

      <el-form label-position="top">
        <el-form-item label="Title (English)">
          <el-input v-model="pageForm.title_en" />
        </el-form-item>
        <el-form-item label="Content (English)">
          <el-input v-model="pageForm.content_en" type="textarea" :rows="10" />
        </el-form-item>
        <el-form-item label="Title (Hindi)">
          <el-input v-model="pageForm.title_hi" />
        </el-form-item>
        <el-form-item label="Content (Hindi)">
          <el-input v-model="pageForm.content_hi" type="textarea" :rows="6" />
        </el-form-item>
      </el-form>

      <div class="flex gap-2">
        <el-button v-permission="'cms.page_manage'" :loading="busy" @click="savePage">Save draft</el-button>
        <el-button v-permission="'cms.page_manage'" type="primary" :loading="busy" @click="publishPage">
          Publish v{{ pageDetail.page.version + 1 }}
        </el-button>
      </div>

      <section class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Version history</div></div>
        <EmptyState v-if="pageDetail.versions.length === 0" title="Never published" />
        <ul v-else>
          <li
            v-for="v in pageDetail.versions"
            :key="v.id"
            class="flex items-center gap-2 border-b border-[var(--color-edge)] px-4 py-2.5 last:border-b-0"
          >
            <span class="key">v{{ v.version }}</span>
            <span class="eyebrow">{{ v.created_at?.slice(0, 10) }}</span>
            <span class="eyebrow">{{ v.created_by }}</span>
            <span class="eyebrow ml-auto">{{ v.length.toLocaleString() }} chars</span>
            <el-button
              v-if="v.version !== pageDetail.page.version"
              v-permission="'cms.page_manage'"
              size="small"
              text
              :loading="busy"
              @click="restoreVersion(v.id, v.version)"
            >
              Restore
            </el-button>
          </li>
        </ul>
      </section>
    </div>
  </el-drawer>

  <el-dialog v-model="bannerDialog" :title="editingBanner ? 'Edit banner' : 'Add banner'" width="480px">
    <el-form label-position="top">
      <el-form-item label="Title"><el-input v-model="bannerForm.title" /></el-form-item>
      <el-form-item label="Image URL"><el-input v-model="bannerForm.image_url" /></el-form-item>
      <el-form-item label="Placement">
        <el-select v-model="bannerForm.placement" style="width: 100%">
          <el-option v-for="p in banners?.placements ?? []" :key="p" :label="p.replace('_', ' ')" :value="p" />
        </el-select>
      </el-form-item>
      <el-form-item label="Tapping it opens">
        <el-select v-model="bannerForm.action_type" style="width: 100%">
          <el-option label="Nothing" value="none" />
          <el-option label="A URL" value="url" />
          <el-option label="A room" value="room" />
          <el-option label="An event" value="event" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="bannerForm.action_type !== 'none'" label="Target">
        <el-input v-model="bannerForm.action_value" />
      </el-form-item>
      <el-form-item label="Window">
        <div class="flex w-full gap-2">
          <el-input v-model="bannerForm.starts_at" type="datetime-local" />
          <el-input v-model="bannerForm.ends_at" type="datetime-local" />
        </div>
        <p class="eyebrow mt-1 leading-relaxed">
          leave blank for no limit — visibility is worked out from these, nothing has to be
          switched off manually when the window closes
        </p>
      </el-form-item>
      <el-form-item><el-checkbox v-model="bannerForm.is_active" label="Active" /></el-form-item>
    </el-form>
    <p class="eyebrow leading-relaxed">
      a banner also needs approval before it shows — active and in-window is not enough
    </p>
    <template #footer>
      <el-button @click="bannerDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveBanner">Save</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="announcementDialog" :title="editingAnnouncement ? 'Edit announcement' : 'Add announcement'" width="520px">
    <el-form label-position="top">
      <el-form-item label="Type">
        <el-radio-group v-model="announcementForm.type">
          <el-radio-button value="marquee">Marquee</el-radio-button>
          <el-radio-button value="popup">Popup</el-radio-button>
          <el-radio-button value="banner">Banner</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Title (English)"><el-input v-model="announcementForm.title_en" /></el-form-item>
      <el-form-item label="Body (English)">
        <el-input v-model="announcementForm.body_en" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="Title (Hindi)"><el-input v-model="announcementForm.title_hi" /></el-form-item>
      <el-form-item label="Body (Hindi)">
        <el-input v-model="announcementForm.body_hi" type="textarea" :rows="3" />
        <p class="eyebrow mt-1 leading-relaxed">
          without Hindi, Hindi-speaking users see the English text
        </p>
      </el-form-item>
      <el-form-item label="Window">
        <div class="flex w-full gap-2">
          <el-input v-model="announcementForm.starts_at" type="datetime-local" />
          <el-input v-model="announcementForm.ends_at" type="datetime-local" />
        </div>
      </el-form-item>
      <el-form-item><el-checkbox v-model="announcementForm.is_active" label="Active" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="announcementDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveAnnouncement">Save</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="faqDialog" :title="editingFaq ? 'Edit FAQ' : 'Add FAQ'" width="520px">
    <el-form label-position="top">
      <el-form-item label="Category"><el-input v-model="faqForm.category" /></el-form-item>
      <el-form-item label="Question (English)"><el-input v-model="faqForm.question_en" /></el-form-item>
      <el-form-item label="Answer (English)">
        <el-input v-model="faqForm.answer_en" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="Question (Hindi)"><el-input v-model="faqForm.question_hi" /></el-form-item>
      <el-form-item label="Answer (Hindi)">
        <el-input v-model="faqForm.answer_hi" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item><el-checkbox v-model="faqForm.is_active" label="Active" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="faqDialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="saveFaq">Save</el-button>
    </template>
  </el-dialog>
</template>
