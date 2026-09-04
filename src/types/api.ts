/**
 * Mirrors the backend contract in docs/03. Field names are taken from the actual
 * controller responses, not guessed — if one of these drifts, the API changed.
 */

export interface Meta {
  request_id: string
  timestamp: string
  current_page?: number
  per_page?: number
  total?: number
  last_page?: number
}

export interface Envelope<T> {
  success: true
  message: string
  data: T
  meta: Meta
}

export interface ErrorEnvelope {
  success: false
  message: string
  error: { code: ErrorCode; details?: Record<string, unknown> | null }
  meta: Meta
}

/** docs/03 §15. Only the codes this module can actually produce. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_ESCALATION_DENIED'
  | 'DELEGATION_TARGET_DENIED'
  | 'SELF_GRANT_DENIED'
  | 'MFA_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'

export type RoleKey = 'super_admin' | 'admin' | 'manager' | 'moderator'

export interface RoleRef {
  id: number
  key: RoleKey
  name: string
}

export interface AdminProfile {
  id: number
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  status: 'active' | 'suspended'
  mfa_enabled: boolean
  session_timeout_minutes?: number | null
  role: RoleRef | null
  last_login_at: string | null
  created_at?: string | null
}

export interface LoginResult {
  mfa_required: boolean
  challenge_id?: string
  expires_at?: string
  sent_to?: string
  token?: string
  idle_timeout_minutes?: number
  admin?: AdminProfile
}

export interface SessionResult {
  token: string
  expires_at: string
  idle_timeout_minutes: number
  admin: AdminProfile
}

export interface MeResult {
  admin: AdminProfile
  permissions: string[]
  session: { idle_timeout_minutes: number; reauth_satisfied: boolean }
}

export type RiskLevel = 'low' | 'medium' | 'high'

export interface PermissionItem {
  id: number
  key: string
  action: string
  name: string
  risk_level: RiskLevel
}

export interface ModuleGroup {
  module: string
  permissions: PermissionItem[]
}

export interface GrantScope {
  room_categories?: number[]
  agencies?: number[]
  shift?: { from: string; to: string; tz?: string }
}

/** Where a permission comes from. The two `denied_*` values mean it is NOT effective. */
export type PermissionOrigin =
  | 'super_admin'
  | 'role'
  | 'direct_grant'
  | 'role_and_direct'
  | 'denied_over_role'
  | 'denied_direct'

export interface EffectivePermissionRow {
  key: string
  module: string
  action: string
  risk_level: RiskLevel
  origin: PermissionOrigin
  expires_at: string | null
  scope: GrantScope | null
}

export interface EffectivePermissions {
  admin: { id: number; name: string; role: RoleKey | null }
  effective_keys: string[]
  detail: EffectivePermissionRow[]
}

export interface GrantableResult {
  can_delegate: boolean
  grantable_to_roles: RoleKey[]
  modules: ModuleGroup[]
  total: number
}

export interface RoleSummary {
  id: number
  key: RoleKey
  name: string
  description: string | null
  is_system: boolean
  permission_count: number
  admin_count: number
}

export interface PermissionLogRow {
  id: number
  action: 'grant' | 'revoke' | 'scope_change' | 'deny'
  permission: string | null
  effect_before: string | null
  effect_after: string | null
  scope: GrantScope | null
  reason: string | null
  actor: { id: number; name: string } | null
  ip: string | null
  created_at: string | null
}

export interface LastOtp {
  otp: string | null
  challenge_id: string | null
  purpose: 'login' | 'reauth' | null
  for: string | null
  expires_at: string | null
  attempts: number | null
  source: string
  note: string
}

// ---------------------------------------------------------------- epic A.3

export type UserStatus = 'active' | 'suspended' | 'banned' | 'deleted'
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type Currency = 'coin' | 'diamond'

export interface UserRow {
  id: number
  uuid: string
  guftagu_id: string
  display_name: string | null
  avatar_url: string | null
  country: string | null
  phone_masked: string | null
  email_masked: string | null
  status: UserStatus
  kyc_status: KycStatus
  coin_balance: number
  diamond_balance: number
  wallet_frozen: boolean
  last_active_at: string | null
  created_at: string | null
}

export interface WalletSummary {
  coin_balance: number
  diamond_balance: number
  frozen_coins: number
  frozen_diamonds: number
  available_coins?: number
  available_diamonds?: number
  lifetime_coins_purchased: number
  lifetime_coins_spent: number
  lifetime_diamonds_earned: number
  is_frozen: boolean
  version?: number
  /** Derived from the lifetime counters above against the level ladder, unless overridden. */
  wealth_level: ResolvedLevel
  charm_level: ResolvedLevel
}

export interface LedgerRow {
  uuid: string
  direction: 'credit' | 'debit'
  amount: number
  signed_amount: number
  balance_before: number
  balance_after: number
  type: string
  note: string | null
  performed_by: string | null
  is_adjustment: boolean
  created_at: string | null
}

export interface KycRecord {
  id: number
  status: Exclude<KycStatus, 'none'>
  full_name: string
  doc_type: string
  doc_number: string | null
  doc_front_url: string | null
  doc_back_url: string | null
  selfie_url: string | null
  ifsc: string | null
  upi_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  submitted_at: string | null
}

export interface SanctionRow {
  id: number
  type: string
  reason: string
  issued_by: string | null
  starts_at: string | null
  expires_at: string | null
  revoked_at: string | null
  /** The stored flag. */
  is_active: boolean
  /** Whether it still bites right now — these differ once a window has lapsed. */
  in_force: boolean
}

export interface DeviceRow {
  platform: string
  app_version: string | null
  os_version: string | null
  last_seen_at: string | null
  is_active: boolean
}

export interface UserDetail {
  user: UserRow
  profile: {
    display_name: string
    bio: string | null
    gender: string
    date_of_birth: string | null
    country: string | null
    city: string | null
    language: string
    avatar_url: string | null
  } | null
  wallet: WalletSummary
  kyc: KycRecord | null
  devices: DeviceRow[]
  sanctions: SanctionRow[]
  pending: { rooms: boolean; reports: boolean }
}

export interface LedgerIntegrity {
  ok: boolean
  checked: number
  wallet_balance: number
  ledger_balance: number
  breaks: Array<Record<string, string | number>>
}

// ---------------------------------------------------------------- epic A.4

export type RoomStatus = 'live' | 'idle' | 'closed' | 'force_closed'

export interface RoomRow {
  id: number
  uuid: string
  room_code: string
  name: string
  description: string | null
  cover_url: string | null
  visibility: 'public' | 'private'
  status: RoomStatus
  category: { id: number; key: string; name: string } | null
  owner: { id: number; guftagu_id: string; display_name: string | null } | null
  seat_count: number
  seat_layout: string
  video_enabled: boolean
  listener_count: number
  peak_listeners: number
  diamonds: number
  is_pinned: boolean
  /** Effective state — already accounts for an expired window. */
  is_featured: boolean
  /** The raw column, which can still be true after expiry. */
  featured_flag: boolean
  featured_until: string | null
  started_at: string | null
  created_at: string | null
}

export interface RoomSeatRow {
  seat_number: number
  is_locked: boolean
  is_vip: boolean
  is_muted_by_host: boolean
  is_camera_on: boolean
  occupied_at: string | null
  user: {
    id: number
    guftagu_id: string
    display_name: string | null
    avatar_url: string | null
    /** Prior sanctions issued in this specific room. */
    prior_sanctions_here: number
  } | null
}

export interface RoomDetail {
  room: RoomRow
  seat_template: { id: number; name: string; total_seats: number; vip_positions: number[] } | null
  seats: RoomSeatRow[]
  members: Array<{
    user_id: number
    display_name: string | null
    guftagu_id: string | null
    role: string
    joined_at: string | null
    prior_sanctions_here: number
  }>
  closure: { status: string; reason: string | null; closed_by: string | null; ended_at: string | null } | null
  pending: { chat: boolean; gifts: boolean }
}

export interface LiveRooms {
  rooms: RoomRow[]
  total: number
  listeners: number
  realtime: { available: boolean; source: string; note: string }
  as_of: string
}

export interface RoomCategoryRow {
  id: number
  key: string
  name_en: string
  name_hi: string | null
  icon_url: string | null
  sort_order: number
  is_active: boolean
  room_count: number
}

export interface RoomThemeRow {
  id: number
  name: string
  background_url: string | null
  preview_url: string | null
  is_premium: boolean
  required_vip_tier_id: number | null
  coin_price: number
  is_active: boolean
  room_count: number
}

// ---------------------------------------------------------------- epic A.6

export type GiftTier = 'basic' | 'premium' | 'luxury' | 'legendary'
export type AnimationType = 'lottie' | 'svga' | 'mp4'

export interface GiftRow {
  id: number
  code: string
  name_en: string
  name_hi: string | null
  category: { id: number; key: string; name: string } | null
  tier: GiftTier
  coin_price: number
  diamond_value: number
  thumbnail_url: string | null
  animation_url: string | null
  animation_type: AnimationType | null
  duration_ms: number | null
  is_fullscreen: boolean
  max_combo: number
  vip_tier: { id: number; level: number } | null
  is_limited: boolean
  /** null = unlimited, 0 = sold out. */
  stock: number | null
  available_from: string | null
  available_to: string | null
  is_active: boolean
  sort_order: number
  /** Three separate reasons a gift may not be sellable. */
  state: { available: boolean; sold_out: boolean; in_window: boolean }
}

export interface GiftCategoryRow {
  id: number
  key: string
  name_en: string
  name_hi: string | null
  icon_url: string | null
  sort_order: number
  is_active: boolean
  gift_count: number
}

/** A reusable "N seats, these ones VIP" layout (docs/02 §3.2). */
export interface RoomSeatTemplateRow {
  id: number
  name: string
  total_seats: number
  vip_positions: number[]
  vip_seats: number
  is_active: boolean
}

export type LevelType = 'wealth' | 'charm'

/**
 * A rung on the wealth/charm ladder (GFT-027, docs/00 §7). A user's actual level is
 * never stored — it is resolved server-side from wallet lifetime totals against rows
 * like this one, or from an admin override.
 */
export interface WealthCharmLevelRow {
  id: number
  type: LevelType
  level: number
  name_en: string
  name_hi: string | null
  threshold: number
  badge_url: string | null
  is_active: boolean
}

/**
 * One rung of the monthly gift-target ladder (mehfil's "Policies", ported) — separate
 * from HostTargetRow, which is a bespoke per-host target, not a shared ladder.
 */
export interface GiftTargetPolicyRow {
  id: number
  time_minutes: number
  target_coins: number
  host_reward_paise: number
  agency_reward_paise: number
  is_active: boolean
}

/** A host's standing against the ladder for one calendar month. */
export interface HostGiftTargetResultRow {
  id: number
  host: {
    id: number
    display_name: string | null
    agency: { id: number; name: string } | null
  }
  period: string
  coins_sent: number
  minutes_live: number
  policy_id: number | null
  policy: { target_coins: number; time_minutes: number } | null
  host_reward_paise: number
  agency_reward_paise: number
  evaluated_at: string | null
}

/**
 * One row of `/admin/hosts/gift-targets/tracker` — always present per active host,
 * whether their month has been evaluated yet or is still live. See HostGiftTargetResultRow
 * for the (evaluated-only) results list this powers when `is_frozen` is true.
 */
export interface GiftTargetTrackerRow {
  host: {
    id: number
    guftagu_id: string | null
    display_name: string | null
    agency: { id: number; name: string } | null
  }
  period: string
  coins_sent: number
  minutes_live: number
  target: { id: number; target_coins: number; time_minutes: number } | null
  coins_pct: number | null
  minutes_pct: number | null
  overall_pct: number | null
  host_reward_paise: number
  agency_reward_paise: number
  is_frozen: boolean
  source: string
}

/** The wealth or charm level attached to a user's wallet in the detail view. */
export interface ResolvedLevel {
  id: number | null
  level: number | null
  name_en: string | null
  badge_url: string | null
  is_override: boolean
}

export interface ImageUploadResult {
  url: string
  path: string
  size: number
}

export interface VipTierRow {
  id: number
  level: number
  name_en: string
  name_hi: string | null
  badge_url: string | null
  frame_url: string | null
  monthly_price_paise: number
  quarterly_price_paise: number
  yearly_price_paise: number
  coin_price: number
  monthly_rupees: number
  privileges: string[]
  is_active: boolean
}

export interface VipTiersResult {
  tiers: VipTierRow[]
  privilege_catalogue: Array<{ key: string; label: string }>
}

export interface CosmeticsResult {
  badges: Array<{
    id: number
    key: string
    name_en: string
    name_hi: string | null
    icon_url: string | null
    description: string | null
    is_auto_awarded: boolean
    is_active: boolean
  }>
}

// ------------------------------------------------------------- store items (the Mall)

export type StoreItemType = 'frame' | 'bubble' | 'entry_banner' | 'entrance_effect'

export interface StoreItemRow {
  id: number
  type: StoreItemType
  name: string
  image_url: string | null
  animation_url: string | null
  animation_type: string | null
  duration_ms: number | null
  trigger: string | null
  min_gift_coin_value: number | null
  source: string | null
  coin_price: number
  rental_days: number | null
  required_vip_tier_id: number | null
  vip_level: number | null
  is_active: boolean
}

export interface StoreItemsResult {
  items: StoreItemRow[]
  types: StoreItemType[]
  sources: string[]
  triggers: string[]
}

// ---------------------------------------------------------------- epic A.7

export type WithdrawalStatus =
  | 'pending'
  | 'pending_super_approval'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'reverted'

export interface WithdrawalRow {
  id: number
  uuid: string
  user: { id: number; guftagu_id: string; display_name: string | null } | null
  diamonds: number
  gross_paise: number
  commission_paise: number
  tds_paise: number
  net_paise: number
  net_rupees: number
  /** The rate this request was PRICED at — not today's. */
  rate: string
  method: string
  status: WithdrawalStatus
  is_open: boolean
  needs_super_admin: boolean
  requested_at: string | null
  reviewed_by: string | null
  second_approved_by: string | null
  rejection_reason: string | null
  utr: string | null
}

export interface WithdrawalSummary {
  pending_count: number
  awaiting_super_count: number
  open_total_paise: number
  approved_today_paise: number
  super_approval_paise: number
  minimum_diamonds: number
}

export interface RateRow {
  id: number
  key: string
  rate_numerator: number
  rate_denominator: number
  as_decimal: number
  display: string
  effective_from: string | null
  effective_to: string | null
  in_force: boolean
  set_by: string | null
  note: string | null
}

export interface RatesResult {
  rates: Record<string, { current: RateRow | null; history: RateRow[] }>
  note: string
}

export interface PackageRow {
  id: number
  name: string
  coins: number
  bonus_coins: number
  total_coins: number
  price_paise: number
  price_rupees: number
  paise_per_coin: number
  is_first_purchase_only: boolean
  badge_text: string | null
  is_active: boolean
  sort_order: number
}

export interface SlabRow {
  id: number
  applies_to: string
  agency_id: number | null
  metric: string
  min_value: number
  max_value: number | null
  percentage_bp: number
  percent: number
  effective_from: string | null
  effective_to: string | null
  created_by: string | null
}

export interface SlabsResult {
  slabs: SlabRow[]
  applies_to: string[]
  metrics: string[]
  note: string
}

export interface ReconciliationReport {
  ok: boolean
  checked_at: string
  currencies: Record<
    string,
    {
      wallets: number
      ledger_rows: number
      mismatches: Array<{
        user_id: number
        wallet_balance: number
        ledger_total: number
        delta: number
        note?: string
      }>
    }
  >
}

// ---------------------------------------------------------------- epic A.9

export type EventType = 'event' | 'tournament' | 'lucky_draw'
export type EventPhase = 'draft' | 'upcoming' | 'live' | 'ended' | 'cancelled'

export interface EventRow {
  id: number
  uuid: string
  type: EventType
  title_en: string
  title_hi: string | null
  description: string | null
  banner_url: string | null
  entry_type: string
  entry_cost: number
  starts_at: string
  ends_at: string
  /** The operator's intent. */
  status: 'draft' | 'scheduled' | 'cancelled'
  /** What is true right now — derived from the clock, never written. */
  phase: EventPhase
  max_participants: number | null
  is_featured: boolean
  participant_count: number
  created_by: string | null
}

export interface EventRewardRow {
  id: number
  rank_from: number
  rank_to: number
  reward_type: string
  reward_value: number
  quantity: number | null
  claimed_count: number
  /** Coins and diamonds reach the ledger; cosmetics have no inventory table yet. */
  payable: boolean
}

export interface LuckyDrawRow {
  id: number
  draw_at: string | null
  winner_count: number
  algorithm: string
  /** Published from the start — the commitment. */
  seed_hash: string
  /** Null until the draw has run. */
  seed: string | null
  drawn_at: string | null
  result: { winners: number[]; entrant_count: number; seed: string; seed_hash: string } | null
  has_run: boolean
}

export interface EventDetail {
  event: EventRow
  rewards: EventRewardRow[]
  participants: Array<{
    user_id: number
    guftagu_id: string | null
    display_name: string | null
    score: number
    rank: number | null
    status: string
  }>
  lucky_draw: LuckyDrawRow | null
}

export interface RankingRuleRow {
  id: number
  key: string
  board_type: string
  period: string
  metric: string
  min_threshold: number
  top_n: number
  is_active: boolean
  computable: boolean
}

export interface RankingRulesResult {
  rules: RankingRuleRow[]
  board_types: string[]
  periods: string[]
  metrics: string[]
  computable_board_types: string[]
}

export interface BoardResult {
  rule: RankingRuleRow
  period: { start: string; end: string }
  entries: Array<{
    rank: number
    entity_id: number
    score: number
    guftagu_id: string | null
    display_name: string | null
  }>
  source: { live: boolean; note: string }
}

export interface DrawVerification {
  valid: boolean
  hash_matches: boolean
  winners_match: boolean
  recomputed: number[]
}

// ------------------------------------------------------------- moderation (A.5)

export interface BannedWordRow {
  id: number
  word: string
  language: string
  severity: 'block' | 'flag' | 'replace'
  replacement: string | null
  scope: string[]
  applies_everywhere: boolean
  is_regex: boolean
  is_active: boolean
  created_by: string | null
  created_at: string | null
}

export interface FilterTestResult {
  original: string
  filtered: string
  severity: 'block' | 'flag' | 'replace' | null
  matches: Array<{ word: string; severity: string }>
  outcome: string
  flag_recorded: boolean
}

export interface ReportRow {
  id: number
  uuid: string
  target_type: string
  target_id: string
  category: string
  description: string | null
  evidence_urls: string[] | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: string
  is_open: boolean
  reporter: { id: number; guftagu_id: string } | null
  assigned_to: string | null
  assigned_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string | null
  /** How long an open report has been waiting. Null once resolved. */
  waiting_minutes: number | null
  /** C.3a — the holder, or null when nothing is holding it. Derived, so it self-releases. */
  claimed_by: string | null
  claim_expires_in_min: number | null
}

export interface ReportDetail {
  report: ReportRow
  actions: Array<{
    id: number
    action: string
    duration_minutes: number | null
    note: string | null
    by: string | null
    created_at: string | null
    reversed: boolean
    reversed_by: string | null
    reversal_reason: string | null
  }>
  target: {
    id: number
    guftagu_id: string
    display_name: string | null
    status: string
    effective_status: string
    prior_sanctions: number
    open_reports: number
  } | null
  target_note: string | null
  /** Whether this admin may act — unclaimed, theirs, or the claim has lapsed. */
  actionable_by_me: boolean
  ban_policy: BanPolicyInfo | null
}

export interface QueueSummary {
  open: number
  critical: number
  high: number
  medium: number
  low: number
  unassigned: number
  mine: number
  oldest_critical: string | null
}

export interface ModeratorStatRow {
  admin_user_id: number
  name: string
  actions: number
  dismissed: number
  reversed: number
  reversal_rate: number
  avg_response_minutes: number | null
}

export interface ModerationStatsResult {
  days: number
  moderators: ModeratorStatRow[]
  note: string
}

export interface SanctionRegisterRow {
  id: number
  user: { id: number; guftagu_id: string } | null
  type: string
  scope: string | null
  reason: string | null
  issued_by: string | null
  starts_at: string | null
  expires_at: string | null
  revoked_at: string | null
  /** The stored flag. */
  is_active: boolean
  /** Whether it still bites right now — these differ once a window lapses. */
  in_force: boolean
}

export interface ModerationLogRow {
  id: number
  by: string
  action: string
  target_type: string | null
  target_id: string | null
  room_id: number | null
  reason: string | null
  ip: string | null
  created_at: string | null
}


// ---------------------------------------------------------------- agency (A.8)

export interface AgencyRow {
  id: number
  uuid: string
  code: string
  name: string
  logo_url: string | null
  owner: { id: number; guftagu_id: string } | null
  /** Integer basis points. 1500 = 15%. */
  commission_bp: number
  status: 'pending' | 'approved' | 'suspended' | 'rejected'
  is_approved: boolean
  host_count: number
  document_count: number
  approved_by: string | null
  approved_at: string | null
  managed_by: string | null
  created_at: string | null
}

export interface AgencyDocument {
  type: string
  url: string
  uploaded_at?: string
}

export interface AgencyPerformance {
  diamonds: number
  gross_paise: number
  agency_cut_paise: number
  host_cut_paise: number
  room_hours: number
  earning_hosts: number
  total_hosts: number
}

export interface AgencyDetail {
  agency: AgencyRow & {
    description: string | null
    documents: AgencyDocument[]
    contact_phone: string | null
    contact_email: string | null
    rejection_reason: string | null
  }
  period: { from: string; to: string }
  performance: AgencyPerformance
  hosts: Array<{
    id: number
    guftagu_id: string | null
    tier: string | null
    status: string
    under_contract: boolean
  }>
  settlements: Array<{
    id: number
    period_start: string
    period_end: string
    net_payable_paise: number
    status: string
  }>
  note: string | null
}

export interface HostApplicationRow {
  id: number
  user: { id: number; guftagu_id: string; display_name: string | null; avatar_url: string | null } | null
  agency: { id: number; name: string } | null
  intro_audio_url: string | null
  experience: string | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  reason: string | null
  created_at: string | null
  waiting_days: number | null
}

export interface HostRow {
  id: number
  user_id: number
  guftagu_id: string | null
  display_name: string | null
  avatar_url: string | null
  agency: { id: number; name: string; code: string } | null
  status: string
  tier: string | null
  base_commission_bp: number
  /** Derived from the contract dates, not a stored flag. */
  under_contract: boolean
  applied_at: string | null
}

export interface HostTotals {
  diamonds: number
  gross_paise: number
  platform_cut_paise: number
  agency_cut_paise: number
  net_paise: number
  gift_count: number
  room_hours: number
  active_days: number
  /** Null, not zero: the diamond ledger does not record who sent a gift. */
  unique_gifters: number | null
  /** Diamonds with no rupees behind them means no rate covered the period. */
  unpriced: boolean
}

export interface HostTargetRow {
  id: number
  host_id: number
  guftagu_id: string | null
  agency: string | null
  period_start: string
  period_end: string
  target_diamonds: number
  target_hours: number
  target_days: number
  status: 'active' | 'achieved' | 'missed' | 'cancelled'
  is_open: boolean
  is_frozen: boolean
  evaluated_at: string | null
  incentive_paise: number | null
  incentive_bp: number | null
  achieved_diamonds: number | null
  achieved_hours: number | null
  achieved_days: number | null
  achievement_pct: number | null
  per_metric?: Record<string, number>
  source: string
  note?: string | null
}

export interface HostDetail {
  host: HostRow & {
    contract_start: string | null
    contract_end: string | null
    notes: string | null
    approved_by: string | null
    approved_at: string | null
  }
  period: { from: string; to: string }
  totals: HostTotals
  daily: Array<{
    date: string
    diamonds_earned: number
    gross_paise: number
    platform_cut_paise: number
    agency_cut_paise: number
    net_paise: number
    gift_count: number
    room_hours: number
    unique_gifters: number | null
  }>
  targets: HostTargetRow[]
  note: string
  pricing_note: string | null
}

export interface EarningsVerification {
  matches: boolean
  rollup_diamonds: number
  ledger_diamonds: number
  difference: number
  days: number
  period: { from: string; to: string }
  note: string
}

export interface SettlementRow {
  id: number
  uuid: string
  agency: { id: number; name: string; code: string } | null
  period_start: string
  period_end: string
  gross_diamonds: number
  gross_paise: number
  platform_cut_paise: number
  agency_cut_paise: number
  host_cut_paise: number
  /** The agency commission — what the platform actually transfers. */
  net_payable_paise: number
  host_count: number
  status: 'draft' | 'manager_raised' | 'admin_approved' | 'paid' | 'rejected'
  is_editable: boolean
  /** platform + agency + host == gross. */
  splits_balance: boolean
  rate: { numerator: number; denominator: number; note: string } | null
  raised_by: string | null
  approved_by: string | null
  approved_at: string | null
  paid_at: string | null
  batch_id: number | null
}

export interface SettlementBatchRow {
  id: number
  batch_number: string
  status: string
  count: number
  total_paise: number
  processed_at: string | null
  created_at: string | null
}


// ------------------------------------------------------------------ CMS (A.10)

export type ContentState = 'off' | 'scheduled' | 'live' | 'expired' | 'awaiting_approval'

export interface BannerRow {
  id: number
  title: string
  image_url: string
  placement: string
  action_type: string | null
  action_value: string | null
  sort_order: number
  starts_at: string | null
  ends_at: string | null
  /** The operator intent. */
  is_active: boolean
  /** What is true right now, derived from the window. */
  state: ContentState
  is_live: boolean
  click_count: number
  impression_count: number
  /** Null until something has been shown — zero would mean "shown, never clicked". */
  click_rate: number | null
  created_by: string | null
  /** B.3b — an unapproved banner never shows, however active and in-window it is. */
  is_approved: boolean
  approved_by: string | null
}

export interface BannerResult {
  banners: BannerRow[]
  placements: string[]
  awaiting_approval: number
  by_placement: Array<{ placement: string; banners: number; clicks: number; impressions: number }>
}

export interface AnnouncementRow {
  id: number
  title_en: string
  title_hi: string | null
  body_en: string
  body_hi: string | null
  type: string
  target_roles: string[]
  applies_to_everyone: boolean
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  state: ContentState
  created_by: string | null
  bilingual: boolean
}

export interface CmsPageRow {
  id: number
  slug: string
  title_en: string
  title_hi: string | null
  type: string
  version: number
  versions: number
  is_published: boolean
  is_legal: boolean
  published_at: string | null
  updated_by: string | null
  bilingual: boolean
}

export interface CmsPageDetail {
  page: {
    id: number
    slug: string
    title_en: string
    title_hi: string | null
    content_en: string
    content_hi: string | null
    type: string
    version: number
    is_published: boolean
    is_legal: boolean
    published_at: string | null
  }
  versions: Array<{
    id: number
    version: number
    title_en: string
    created_by: string | null
    created_at: string | null
    length: number
  }>
  note: string | null
}

export interface FaqRow {
  id: number
  category: string
  question_en: string
  question_hi: string | null
  answer_en: string
  answer_hi: string | null
  sort_order: number
  is_active: boolean
  bilingual: boolean
}

export interface FaqResult {
  faqs: FaqRow[]
  categories: string[]
  missing_hindi: number
}

export interface AudiencePreview {
  matched: number
  reachable_push: number
  unreachable: number
  note: string | null
  sample: Array<{ id: number; guftagu_id: string; display_name: string | null }>
}

export interface BroadcastRow {
  id: number
  uuid: string
  title: string
  body: string
  image_url: string | null
  deep_link: string | null
  audience: 'all' | 'segment' | 'user_list'
  channels: string[]
  /** Frozen at send time — what the audience actually was. */
  audience_count: number | null
  scheduled_at: string | null
  status: string
  is_editable: boolean
  sent_count: number
  delivered_count: number
  opened_count: number
  /** Null, not zero: nothing has reported back yet. */
  delivery_rate: number | null
  open_rate: number | null
  sent_at: string | null
  created_by: string | null
  approved_by: string | null
  stats_note: string | null
}

export interface BroadcastSendResult {
  audience_count: number
  in_app_created: number
  push_reachable: number
  push_dispatched: boolean
  note: string | null
  stats_note: string
}

// -------------------------------------------------------------- reports (A.10)

export interface ReportTypeInfo {
  type: string
  columns: string[]
  permission: string
}

export interface ReportCatalogue {
  /** Present only on a scoped account. */
  scope: ScopeDescriptor | null
  types: ReportTypeInfo[]
  filters: string[]
  preview_limit: number
  formats: string[]
  /** PDF is laid out in memory and capped; CSV streams and has no cap. */
  pdf_row_cap: number
  note: string
}

export interface ReportPreview {
  columns: string[]
  rows: Array<Record<string, unknown>>
  total: number
  truncated: boolean
  note: string | null
}

export interface RevenueReconciliation {
  period: { from: string; to: string }
  ledger_coins: number
  rollup_coins: number
  difference: number
  matches: boolean
  authoritative: string
  note: string
}

export interface ExportRow {
  uuid: string
  type: string
  format: string
  status: string
  row_count: number | null
  error: string | null
  filters: Record<string, unknown> | null
  created_at: string | null
  expires_at: string | null
  downloadable: boolean
}

// ---------------------------------------------------------------- audit (A.10)

export interface AuditLogRow {
  id: number
  actor: string
  actor_id: number | null
  action: string
  module: string
  entity_type: string | null
  entity_id: string | null
  ip: string | null
  request_id: string | null
  created_at: string | null
  /** `service` rows carry a real diff; `middleware` rows are safety-net captures. */
  source: 'service' | 'middleware'
  has_diff: boolean
}

export interface AuditChange {
  field: string
  from: unknown
  to: unknown
  kind: 'set' | 'changed' | 'recorded_before_only'
}

export interface AuditLogDetail {
  log: AuditLogRow & {
    actor_email: string | null
    user_agent: string | null
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
  }
  changes: AuditChange[]
  related: Array<{ id: number; action: string; module: string }>
  source: 'service' | 'middleware'
  source_note: string | null
}

export interface AuditFilters {
  modules: string[]
  actions: Array<{ action: string; total: number }>
  actors: Array<{ id: number; name: string }>
  oldest: string | null
  total: number
}

export interface AuditCoverage {
  since: string
  total: number
  fallback: number
  explicit: number
  modules: Array<{ module: string; total: number; fallback: number; explicit: number }>
  note: string
}


// ------------------------------------------------------------- scoping (B.1a)

/** What a scoped account is limited to. Null on the wire means unrestricted. */
export interface ScopeDescriptor {
  agencies: number[] | null
  room_categories: number[] | null
  note: string
}

/**
 * The Manager dashboard payload. A different shape from `Kpis`, not a subset — platform
 * figures are absent because they cannot be attributed to an agency.
 */
export interface ScopedKpis {
  scope: { agencies: Array<{ id: number; name: string; code: string }> }
  period: { from: string; to: string }
  hosts: { total: number; approved: number; pending: number; suspended: number; under_contract: number }
  earnings: {
    diamonds: number
    gross_paise: number
    agency_cut_paise: number
    host_cut_paise: number
    earning_hosts: number
    unpriced: boolean
  }
  targets: { running: number; achieved: number; missed: number }
  settlements: {
    draft: number
    raised: number
    approved: number
    paid: number
    outstanding_paise: number
    paid_paise: number
  }
  rooms: { total: number; live: number; note: string | null }
  note: string
}


// ------------------------------------------------------------- support (B.4)

export type SlaState = 'on_track' | 'at_risk' | 'response_breached' | 'resolution_breached' | 'closed'

export interface SupportTicketRow {
  id: number
  ref: string
  subject: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: string
  is_open: boolean
  user: { id: number; guftagu_id: string; display_name: string | null } | null
  assigned_to: string | null
  escalated: boolean
  /** Derived from the clock, not a stored flag. */
  sla_state: SlaState
  /** Minutes; negative when late. Null once answered — the timer stopped. */
  first_response_due_in: number | null
  first_response_minutes: number | null
  created_at: string | null
  resolved_at: string | null
}

export interface SupportMessage {
  id: number
  sender_type: 'user' | 'admin' | 'system'
  sender: string | null
  body: string
  attachments: string[]
  /** Staff-only. Never shown to the person who raised the ticket. */
  is_internal: boolean
  created_at: string | null
}

export interface SupportTicketDetail {
  ticket: SupportTicketRow & {
    description: string
    attachments: string[]
    resolution: string | null
    resolved_by: string | null
    escalation_note: string | null
    escalated_to: string | null
  }
  messages: SupportMessage[]
  sla: {
    state: SlaState
    first_response_minutes: number | null
    first_response_due_in: number | null
    promise_minutes: number
    note: string
  }
}

export interface SupportSummary {
  open: number
  urgent: number
  high: number
  unassigned: number
  mine: number
  unanswered: number
  breaching: number
  escalated: number
}

export interface CannedReplyRow {
  id: number
  title: string
  category: string
  body_en: string
  body_hi: string | null
  use_count: number
  bilingual: boolean
}

// -------------------------------------------------- moderation additions (C)

export interface BanPolicyInfo {
  max_ban_hours: number | null
  max_ban_minutes: number | null
  note: string | null
}

export interface ModerationPolicy {
  ban: BanPolicyInfo
  claim_minutes: number
}

export interface RecurringIssues {
  window_hours: number
  threshold: number
  users: Array<{
    id: number
    guftagu_id: string
    display_name: string | null
    status: string
    reports: number
    /** Five from one person is a feud; five from five is a pattern. */
    distinct_reporters: number
    has_critical: boolean
  }>
  rooms: Array<{ room_id: string; reports: number }>
  note: string
}

export interface OwnActionRow {
  id: number
  report_id: number
  category: string | null
  target: string | null
  action: string
  duration_minutes: number | null
  note: string | null
  created_at: string | null
  reversed: boolean
  reversed_by: string | null
  reversal_reason: string | null
}

export interface OwnActionsResult {
  days: number
  actions: OwnActionRow[]
  reversed: number
  note: string
}

export interface CampaignOutcome {
  sent: boolean
  sent_at?: string
  audience_count?: number | null
  reach?: number
  delivered?: number
  opened?: number
  delivery_rate?: number | null
  open_rate?: number | null
  window_hours?: number
  recharges?: number
  recharging_users?: number
  coins_purchased?: number
  /** `correlated`, never causal — nobody clicked a tracked link. */
  attribution?: string
  note: string
}


// -------------------------------------------------- live-room enforcement (C)

export interface SilentJoinResult {
  room_id: number
  audio: boolean
  note: string
}

// ---------------------------------------------------------------- system logs (IT Admin)

export interface LaravelLogEntry {
  timestamp: string
  level: string
  message: string
  stack: string | null
}

export interface LaravelLogResult {
  entries: LaravelLogEntry[]
  truncated: boolean
  file_size: number
}

export interface FrontendErrorLogRow {
  id: number
  level: string
  message: string
  stack: string | null
  source_url: string | null
  user_agent: string | null
  meta: Record<string, unknown> | null
  admin: { id: number; name: string } | null
  created_at: string | null
}
