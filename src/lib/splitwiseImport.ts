/**
 * Pure Splitwise -> Divido import mapper.
 *
 * Takes raw Splitwise API payloads (a group + its expenses, or a set of
 * "friends" / non-group expenses) and produces Divido `Group`/`Expense`
 * objects, ready to be handed to the same code paths as `handleCreateGroup`
 * and the sync layer. Has no React/Supabase dependency so it can be unit
 * tested in isolation — see splitwiseImport.test.ts.
 *
 * Money is handled in the currency's MAJOR units (e.g. rupees, dollars) at
 * the Expense boundary, exactly like the rest of the app (see
 * calculations.ts). Internally, the multi-payer "split" allocator and the
 * net-balance verification both work in MINOR units (integer cents) so
 * every check is an exact integer comparison, never a float-tolerance one —
 * see allocateMultiPayerLegs / allocateGrid / verifyNetBalances below.
 */
import { Expense, Group } from './types';
import { genGroupId, getEmoji, titleCaseName, worldCurrencies } from './utils';
import { memberNetBalances } from './calculations';

// ── Raw Splitwise shapes (only the fields we read) ─────────────────────────

export interface RawSplitwiseUser {
  id: number;
  first_name: string;
  last_name?: string;
  email?: string;
}

export interface RawSplitwiseGroup {
  id: number;
  name: string;
  members: RawSplitwiseUser[];
}

export interface RawSplitwiseExpenseUser {
  user_id: number;
  user: { first_name: string; last_name?: string; email?: string };
  paid_share: string;
  owed_share: string;
}

export interface RawSplitwiseExpense {
  id: number;
  group_id?: number | null;
  description: string;
  details?: string | null;
  cost: string;
  date: string;
  currency_code: string;
  category?: { name: string } | null;
  payment: boolean;
  deleted_at?: string | null;
  users: RawSplitwiseExpenseUser[];
}

// ── Public API ───────────────────────────────────────────────────────────

export type SplitwiseImportTarget =
  | { kind: 'group'; rawGroup: RawSplitwiseGroup }
  | { kind: 'friends' };

export interface SplitwiseImportInput {
  target: SplitwiseImportTarget;
  rawExpenses: RawSplitwiseExpense[];
  currentUserId: number;
  meName: string;
  myEmail: string;
  multiPayer: 'split' | 'review';
  // Reuse an already-created group id instead of minting a new one.
  existingGroupId?: string | number;
  // Override the imported group's display name (defaults to rawGroup.name).
  nameOverride?: string;
  // Test hook: replaces genGroupId() when minting a new group id.
  idFactory?: () => string;
}

export interface SplitwiseReviewPayer {
  name: string;
  amount: number;
}

export interface SplitwiseReviewItem {
  id: string;
  title: string;
  date: string;
  amount: number;
  currency: string;
  payers: SplitwiseReviewPayer[];
}

export interface SplitwiseImportResult {
  group?: Group;
  expenses: Expense[];
  warnings: string[];
  review: SplitwiseReviewItem[];
}

// Prepended to the `notes` of any expense routed to `review` (a multi-payer
// expense in 'review' mode, or ANY expense whose raw numbers couldn't be
// mapped exactly — see pushToReview), so it's easy to find which expenses
// only got an approximate mapping.
export const SPLITWISE_REVIEW_NOTES_MARKER = '⚠️ Splitwise expense — needs manual review';

export function mapSplitwiseImport(input: SplitwiseImportInput): SplitwiseImportResult {
  const { target, rawExpenses, currentUserId, meName, myEmail, multiPayer, existingGroupId, nameOverride, idFactory } = input;

  const warnings: string[] = [];
  const review: SplitwiseReviewItem[] = [];
  const expenses: Expense[] = [];

  const identity = resolveIdentities(target, rawExpenses, currentUserId, meName, myEmail);
  warnings.push(...identity.warnings);
  const nameFor = (id: number): string => identity.nameByUserId.get(id) || `Unknown (${id})`;

  const activeExpenses = rawExpenses.filter((e) => !e.deleted_at);

  const gId: string | number = target.kind === 'group' ? (existingGroupId ?? (idFactory ? idFactory() : genGroupId())) : 'STANDALONE';

  // Raw expense ids (`sw_<id>`) that were routed to `review` instead of a
  // direct mapping. Only the payer/credit side of these is a deliberate
  // approximation (see pushToReview) — the net-balance verification pass
  // still checks the owed/debit side of these against the true raw data.
  const reviewOverrides = new Map<string, { mainPayerName: string; creditAmount: number }>();
  // Raw expense ids that produced NO mapped expense at all (no payer, no
  // receiver, or every owed_share is 0). Excluded from verification so a
  // skip doesn't ALSO surface as a redundant "net balance mismatch".
  const skippedIds = new Set<string>();

  activeExpenses.forEach((e) => {
    const description = e.description || '';
    const currency = resolveCurrencySymbol(e.currency_code);
    const notes = e.details || undefined;
    const date = (e.date || '').slice(0, 10);
    const otherEmail = computeOtherEmail(target, e, currentUserId);
    const swId = `sw_${e.id}`;

    warnPaidCostDrift(e, description, warnings);
    warnOwedCostDrift(e, description, warnings);

    const payers = extractPayers(e, nameFor);
    if (payers.length === 0) {
      warnings.push(`Expense ${swId} ("${description}"): no payer found; skipped.`);
      skippedIds.add(swId);
      return;
    }

    if (e.payment) {
      const receivers = extractSplitters(e, nameFor, false);
      if (receivers.length === 0) {
        warnings.push(`Settlement ${swId} ("${description}"): no receiver found; skipped.`);
        skippedIds.add(swId);
        return;
      }

      const paidCentsTotal = payers.reduce((a, p) => a + toCents(p.paid), 0);
      const costCents = toCents(parseNum(e.cost));
      const isSimpleSettlement = payers.length === 1 && receivers.length === 1 && paidCentsTotal === costCents;

      if (!isSimpleSettlement) {
        // More than one payer, more than one receiver, or the amounts don't
        // agree with the cost — there's no single clean "X paid Y" fact to
        // record. Route through the same review path as any other
        // inconsistent expense, rather than silently crediting an arbitrary
        // payer with the full cost.
        warnings.push(`Settlement ${swId} ("${description}"): expected exactly one payer and one receiver whose amounts match the cost; routed to review.`);
        const category = resolveCategoryEmoji(e.category?.name, description);
        pushToReview(e, payers, receivers, description, { currency, date, notes, category, otherEmail, gId }, expenses, review, reviewOverrides);
        return;
      }

      const giver = payers[0];
      const receiver = receivers[0];
      expenses.push({
        id: swId,
        gId,
        title: `✅ Settlement: ${giver.name} paid ${receiver.name}`,
        amt: round2(parseNum(e.cost)),
        paid: giver.name,
        splitters: [receiver.name],
        date,
        notes,
        currency,
        category: '✅',
        mode: 'Equally',
        shares: {},
        ...(otherEmail ? { otherEmail } : {}),
      });
      return;
    }

    const category = resolveCategoryEmoji(e.category?.name, description);
    // Friends (non-group) threads always model both people as splitters —
    // even one whose owed_share happens to be 0 — so the Divido side stays
    // "me + them" instead of silently dropping a zero-share participant.
    const splitters = extractSplitters(e, nameFor, target.kind === 'friends');

    const costCents = toCents(parseNum(e.cost));
    const owedCentsTotal = splitters.reduce((a, s) => a + toCents(s.owed), 0);

    // Nobody owes anything for a non-zero-cost expense: there's no valid
    // shares map to construct (memberNetBalances would credit the payer
    // with nothing to debit against, while simplifyMultiCurrencyDebts skips
    // an expense with no splitters outright — the two engines would then
    // disagree). Skip rather than emit something inconsistent.
    if (owedCentsTotal === 0 && costCents !== 0) {
      warnings.push(`Expense ${swId} ("${description}"): every participant's owed_share is 0 for a non-zero cost; skipped.`);
      skippedIds.add(swId);
      return;
    }

    if (payers.length === 1) {
      const payer = payers[0];
      if (owedCentsTotal !== costCents) {
        // Emitting shares=owed with amt=cost here would violate "shares sum
        // to amt exactly" (bug fix #2). Route to review instead of silently
        // rewriting `cost` — pushToReview keeps the invariant by using the
        // shares' own (validated) total as amt, while the review item still
        // shows the original reported cost for a human to reconcile.
        warnings.push(`Expense ${swId} ("${description}"): owed shares don't sum to the cost; routed to review.`);
        pushToReview(e, payers, splitters, description, { currency, date, notes, category, otherEmail, gId }, expenses, review, reviewOverrides);
        return;
      }
      const shares: Record<string, number> = {};
      splitters.forEach((s) => { shares[s.name] = round2(s.owed); });
      expenses.push({
        id: swId,
        gId,
        title: description,
        amt: round2(parseNum(e.cost)),
        paid: payer.name,
        splitters: splitters.map((s) => s.name),
        date,
        notes,
        currency,
        category,
        mode: 'Unequally',
        shares,
        ...(otherEmail ? { otherEmail } : {}),
      });
      return;
    }

    // Multiple payers.
    if (multiPayer === 'review') {
      pushToReview(e, payers, splitters, description, { currency, date, notes, category, otherEmail, gId }, expenses, review, reviewOverrides);
      return;
    }

    // multiPayer === 'split': one expense leg per payer.
    const allocation = allocateMultiPayerLegs(e, payers, splitters);
    if (!allocation.ok) {
      warnings.push(`Expense ${swId} ("${description}"): could not produce an exact multi-payer split (payments/owed shares/cost don't all agree, or no exact cent-allocation exists); routed to review instead.`);
      pushToReview(e, payers, splitters, description, { currency, date, notes, category, otherEmail, gId }, expenses, review, reviewOverrides);
      return;
    }
    warnings.push(`Expense ${swId} ("${description}") had ${payers.length} payers; split into ${payers.length} legs.`);
    allocation.legs.forEach((leg) => {
      expenses.push({
        id: `${swId}_p${leg.payerUserId}`,
        gId,
        title: `${description} (paid by ${leg.payerName})`,
        amt: leg.amt,
        paid: leg.payerName,
        splitters: leg.splitterNames,
        date,
        notes,
        currency,
        category,
        mode: 'Unequally',
        shares: leg.shares,
        ...(otherEmail ? { otherEmail } : {}),
      });
    });
  });

  warnings.push(...verifyNetBalances(activeExpenses, nameFor, expenses, reviewOverrides, skippedIds));

  let group: Group | undefined;
  if (target.kind === 'group') {
    group = {
      id: gId,
      name: nameOverride ?? target.rawGroup.name,
      members: identity.rosterNames,
      currency: resolveGroupCurrency(activeExpenses),
      simplifyDebts: false,
      createdDate: resolveCreatedDate(activeExpenses),
      // Everyone except me is a not-yet-claimed invitee, mirroring
      // handleCreateGroup (App.tsx:3450).
      pendingMembers: identity.rosterNames.slice(1),
      memberIdentities: identity.memberIdentities,
      pendingSync: true,
    };
  }

  return { group, expenses, warnings, review };
}

// ── Identity / roster resolution ────────────────────────────────────────

interface IdentityResolution {
  nameByUserId: Map<number, string>;
  // Only meaningful for kind:'group' — meName first, then the rest in
  // encounter order.
  rosterNames: string[];
  memberIdentities: Record<string, string>;
  warnings: string[];
}

const rawFullName = (first: string, last?: string): string =>
  titleCaseName(`${first || ''} ${last || ''}`.replace(/\s+/g, ' ').trim());

function resolveIdentities(
  target: SplitwiseImportTarget,
  rawExpenses: RawSplitwiseExpense[],
  currentUserId: number,
  meName: string,
  myEmail: string
): IdentityResolution {
  const warnings: string[] = [];
  const nameByUserId = new Map<number, string>();
  const usedNameCounts = new Map<string, number>();
  const memberIdentities: Record<string, string> = {};

  // Assigns `userId` a display name derived from `baseName`, deterministically
  // suffixing (and warning) if that name is already taken by a different
  // Splitwise user id.
  const assign = (userId: number, baseName: string): string => {
    const existing = nameByUserId.get(userId);
    if (existing) return existing;
    const count = usedNameCounts.get(baseName) || 0;
    const finalName = count > 0 ? `${baseName} (${count + 1})` : baseName;
    if (count > 0) {
      warnings.push(`Duplicate name "${baseName}" — renamed to "${finalName}" for a different Splitwise user.`);
    }
    usedNameCounts.set(baseName, count + 1);
    nameByUserId.set(userId, finalName);
    return finalName;
  };

  // 'me' claims the base name first, before any other member, so no one
  // else's name can push me into a "(2)" suffix.
  assign(currentUserId, meName);
  memberIdentities[meName] = myEmail.trim().toLowerCase();

  const rosterNames: string[] = [meName];

  if (target.kind === 'group') {
    target.rawGroup.members.forEach((m) => {
      if (m.id === currentUserId) return;
      rosterNames.push(assign(m.id, rawFullName(m.first_name, m.last_name)));
    });
  }

  // Pick up anyone who shows up in the expenses but wasn't already assigned
  // (e.g. a member removed from the Splitwise group, or — for friends — any
  // counterparty at all, since there's no member list to seed from).
  rawExpenses.forEach((e) => {
    if (e.deleted_at) return;
    e.users.forEach((u) => {
      if (nameByUserId.has(u.user_id)) return;
      const name = assign(u.user_id, rawFullName(u.user.first_name, u.user.last_name));
      if (target.kind === 'group') rosterNames.push(name);
    });
  });

  return { nameByUserId, rosterNames, memberIdentities, warnings };
}

// ── Currency / category / amount helpers ────────────────────────────────

function resolveCurrencySymbol(code: string): string {
  const match = worldCurrencies.find((c) => c.c === code);
  return match ? match.s : code;
}

// Splitwise's built-in category names -> emoji. Not exhaustive; anything
// unmapped falls back to getEmoji(description), then null.
const SPLITWISE_CATEGORY_EMOJI: Record<string, string> = {
  Groceries: '🛒',
  'Dining out': '🍕',
  'Fast food': '🍕',
  'Food and drink': '🍕',
  Liquor: '🍻',
  Movies: '🍿',
  Music: '🍿',
  'Other entertainment': '🎉',
  Sports: '🏋️‍♂️',
  Games: '🎮',
  Rent: '🏠',
  Mortgage: '🏠',
  Electricity: '⚡',
  'Heat/gas': '⚡',
  Water: '⚡',
  'TV/Phone/Internet': '📶',
  Trash: '🧹',
  Furniture: '🏠',
  'Household supplies': '🧼',
  Maintenance: '🧹',
  'Other home': '🏠',
  'Bus/train': '🚇',
  Car: '🚗',
  'Gas/fuel': '⛽',
  Hotel: '🏰',
  Parking: '🎫',
  Plane: '✈️',
  Taxi: '🚗',
  Bicycle: '🚗',
  'Other transportation': '🚗',
  'Medical expenses': '🏥',
  'Life insurance': '🏥',
  'Pet food/supplies': '🐾',
  Clothing: '🛍️',
  Electronics: '💻',
  Gifts: '🎁',
  Education: '📚',
};

function resolveCategoryEmoji(categoryName: string | undefined, description: string): string | null {
  if (categoryName && SPLITWISE_CATEGORY_EMOJI[categoryName]) return SPLITWISE_CATEGORY_EMOJI[categoryName];
  return getEmoji(description);
}

function resolveGroupCurrency(activeExpenses: RawSplitwiseExpense[]): string {
  const counts = new Map<string, number>();
  activeExpenses.forEach((e) => {
    if (!e.currency_code) return;
    counts.set(e.currency_code, (counts.get(e.currency_code) || 0) + 1);
  });
  let bestCode: string | null = null;
  let bestCount = 0;
  counts.forEach((count, code) => {
    // Strict `>` so the first-seen code wins ties, keeping this deterministic.
    if (count > bestCount) { bestCount = count; bestCode = code; }
  });
  return bestCode ? resolveCurrencySymbol(bestCode) : '₹';
}

function resolveCreatedDate(activeExpenses: RawSplitwiseExpense[]): string | undefined {
  let earliest: string | undefined;
  activeExpenses.forEach((e) => {
    const d = (e.date || '').slice(0, 10);
    if (!d) return;
    if (!earliest || d < earliest) earliest = d;
  });
  return earliest;
}

function computeOtherEmail(target: SplitwiseImportTarget, e: RawSplitwiseExpense, currentUserId: number): string | undefined {
  if (target.kind !== 'friends') return undefined;
  if (e.users.length !== 2) return undefined;
  const other = e.users.find((u) => u.user_id !== currentUserId);
  const email = other?.user.email;
  if (!email || !email.includes('@')) return undefined;
  return email.trim().toLowerCase();
}

// Money: round to 2 decimal places (the currency's minor unit), matching the
// `Math.round(x * 100) / 100` convention used across the app (e.g. App.tsx).
const round2 = (n: number): number => Math.round(n * 100) / 100;
// Convert a major-unit amount to an integer count of minor units (cents).
const toCents = (n: number): number => Math.round(n * 100);
const parseNum = (s: string | undefined | null): number => parseFloat(s || '0') || 0;
// Sum a list of major-unit amounts by first converting EACH to cents, so
// floating-point error can't accumulate across many additions before the
// final rounding (unlike `toCents(a.reduce((x,y)=>x+y))`).
const sumCents = (values: number[]): number => values.reduce((a, v) => a + toCents(v), 0);

function warnPaidCostDrift(e: RawSplitwiseExpense, description: string, warnings: string[]): boolean {
  const paidCents = sumCents(e.users.map((u) => parseNum(u.paid_share)));
  const costCents = toCents(parseNum(e.cost));
  if (paidCents !== costCents) {
    warnings.push(`Expense sw_${e.id} ("${description}"): payments sum to ${round2(paidCents / 100)} but the cost is ${round2(costCents / 100)}.`);
    return true;
  }
  return false;
}

function warnOwedCostDrift(e: RawSplitwiseExpense, description: string, warnings: string[]): boolean {
  const owedCents = sumCents(e.users.map((u) => parseNum(u.owed_share)));
  const costCents = toCents(parseNum(e.cost));
  if (owedCents !== costCents) {
    warnings.push(`Expense sw_${e.id} ("${description}"): owed shares sum to ${round2(owedCents / 100)} but the cost is ${round2(costCents / 100)}.`);
    return true;
  }
  return false;
}

interface PayerEntry { userId: number; name: string; paid: number }
interface SplitterEntry { name: string; owed: number }

function extractPayers(e: RawSplitwiseExpense, nameFor: (id: number) => string): PayerEntry[] {
  return e.users
    .map((u) => ({ userId: u.user_id, name: nameFor(u.user_id), paid: parseNum(u.paid_share) }))
    .filter((p) => p.paid > 0);
}

function extractSplitters(e: RawSplitwiseExpense, nameFor: (id: number) => string, includeZeroOwed: boolean): SplitterEntry[] {
  return e.users
    .map((u) => ({ name: nameFor(u.user_id), owed: parseNum(u.owed_share) }))
    .filter((s) => includeZeroOwed || s.owed > 0);
}

// ── Routing an expense to `review` instead of a direct mapping ─────────
//
// Used for: a user-requested 'review' mapping of a multi-payer expense, a
// single-payer expense whose owed shares don't sum to its cost, and a
// multi-payer 'split' expense whose legs couldn't be allocated exactly.
//
// The emitted Expense's `amt` is deliberately the shares' OWN total (not the
// raw `cost`, which may have drifted from it) — this is the "safer of the
// two" option from the owed/cost bug fix: it guarantees shares-sum-to-amt
// for every emitted Unequally expense, at the cost of `amt` occasionally
// differing from Splitwise's reported `cost`. The original `cost` is never
// lost — it's preserved as the review item's `amount`, and only the payer
// (paid) side of the net-balance check is excused for this expense; the
// owed side is still checked against the true raw owed_share (see
// verifyNetBalances).
interface ReviewPushContext {
  currency: string;
  date: string;
  notes: string | undefined;
  category: string | null;
  otherEmail: string | undefined;
  gId: string | number;
}

function pushToReview(
  e: RawSplitwiseExpense,
  payers: PayerEntry[],
  splitters: SplitterEntry[],
  description: string,
  ctx: ReviewPushContext,
  expenses: Expense[],
  review: SplitwiseReviewItem[],
  reviewOverrides: Map<string, { mainPayerName: string; creditAmount: number }>
): void {
  const swId = `sw_${e.id}`;
  const shares: Record<string, number> = {};
  splitters.forEach((s) => { shares[s.name] = round2(s.owed); });
  const owedTotal = round2(splitters.reduce((a, s) => a + s.owed, 0));
  const mainPayer = [...payers].sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name))[0];
  const payerList = [...payers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ name: p.name, amount: round2(p.paid) }));
  const payerLine = payerList.map((p) => `${p.name} paid ${p.amount}`).join(', ');
  const reviewNotes = `${SPLITWISE_REVIEW_NOTES_MARKER}\n${payerLine}` + (ctx.notes ? `\n\n${ctx.notes}` : '');

  expenses.push({
    id: swId,
    gId: ctx.gId,
    title: description,
    amt: owedTotal,
    paid: mainPayer.name,
    splitters: splitters.map((s) => s.name),
    date: ctx.date,
    notes: reviewNotes,
    currency: ctx.currency,
    category: ctx.category,
    mode: 'Unequally',
    shares,
    ...(ctx.otherEmail ? { otherEmail: ctx.otherEmail } : {}),
  });
  review.push({ id: swId, title: description, date: ctx.date, amount: round2(parseNum(e.cost)), currency: ctx.currency, payers: payerList });
  reviewOverrides.set(swId, { mainPayerName: mainPayer.name, creditAmount: owedTotal });
}

// ── Multi-payer "split" leg allocation ──────────────────────────────────
//
// For an expense with N payers and M splitters, produces one leg per payer
// where leg.amt === that payer's own paid_share, and the leg's shares are a
// proportional slice of each splitter's owed_share (owed * paid_c / cost).
//
// Formula (major units): share[r][c] = owed_r * paid_c / cost.
// Two invariants must hold EXACTLY at 2 decimal places:
//   1) sum_r share[r][c] == paid_c            (each leg balances on its own)
//   2) sum_c share[r][c] == owed_r             (each person's total across
//                                                legs matches their original
//                                                owed_share)
// Both are integer-cent constraints, so the allocator works entirely in
// integer cents (allocateGrid) to guarantee both sums exactly, rather than
// only rounding each leg independently. This is only attempted when
// Σpaid_cents == Σowed_cents == cost_cents — if the raw numbers disagree,
// the two invariants can't both be satisfied, so the caller routes the
// whole expense to review instead of guessing.
interface Leg {
  payerUserId: number;
  payerName: string;
  amt: number;
  splitterNames: string[];
  shares: Record<string, number>;
}

function allocateMultiPayerLegs(
  e: RawSplitwiseExpense,
  payers: PayerEntry[],
  splitters: SplitterEntry[]
): { ok: boolean; legs: Leg[] } {
  const costCents = toCents(parseNum(e.cost));
  const payerCents = payers.map((p) => toCents(p.paid));
  const owedCents = splitters.map((s) => toCents(s.owed));
  const splitterNames = splitters.map((s) => s.name);
  const sumPaidCents = payerCents.reduce((a, b) => a + b, 0);
  const sumOwedCents = owedCents.reduce((a, b) => a + b, 0);

  if (sumPaidCents !== costCents || sumOwedCents !== costCents) {
    return { ok: false, legs: [] };
  }

  const nR = splitterNames.length;
  const nC = payers.length;
  const raw: number[][] = [];
  for (let r = 0; r < nR; r++) {
    const row: number[] = [];
    for (let c = 0; c < nC; c++) {
      row.push(costCents > 0 ? (owedCents[r] * payerCents[c]) / costCents : 0);
    }
    raw.push(row);
  }

  const result = allocateGrid(raw, owedCents, payerCents, splitterNames);
  if (!result.ok) {
    return { ok: false, legs: [] };
  }

  const legs = payers.map((p, c) => {
    const shares: Record<string, number> = {};
    splitterNames.forEach((name, r) => { shares[name] = round2(result.grid[r][c] / 100); });
    return { payerUserId: p.userId, payerName: p.name, amt: round2(payerCents[c] / 100), splitterNames, shares };
  });
  return { ok: true, legs };
}

// Rounds the fractional `raw` grid to integers so every row sums to
// `rowTotals[r]` and every column sums to `colTotals[c]` EXACTLY (assumes
// sum(rowTotals) === sum(colTotals) — the caller only invokes this when that
// holds). This is the classic two-way "controlled rounding" problem; a 0/1
// (floor-or-ceil) solution is guaranteed to exist whenever the margins
// agree, so every cell here ends up at floor(raw) or floor(raw)+1.
//
// Pass 1 (greedy largest-remainder) resolves the vast majority of cells
// correctly and fast, but — because it's a single deterministic left-to-right
// pass — can strand a row/column pair even when a valid solution exists
// (see the file's test suite for a concrete counter-example). Pass 2 repairs
// any remaining shortfall with bipartite augmenting paths: rows and columns
// still short of their target are connected through cells that can be
// "moved" (bumped from floor to floor+1, or un-bumped back to floor) without
// disturbing any OTHER row/column's total, which always finds a fix when one
// exists (standard transportation-problem integrality argument).
export function allocateGrid(
  raw: number[][],
  rowTotals: number[],
  colTotals: number[],
  rowNames: string[]
): { grid: number[][]; ok: boolean } {
  const nR = raw.length;
  const nC = raw[0]?.length || 0;
  const floor = raw.map((row) => row.map((v) => Math.floor(v)));
  const bumped: boolean[][] = floor.map((row) => row.map(() => false));
  const rowRemaining = rowTotals.map((t, r) => t - floor[r].reduce((a, b) => a + b, 0));
  const colRemaining = colTotals.map((t, c) => t - floor.reduce((a, row) => a + row[c], 0));

  const rowRemainingSum = rowRemaining.reduce((a, b) => a + b, 0);
  const colRemainingSum = colRemaining.reduce((a, b) => a + b, 0);
  if (rowRemainingSum !== colRemainingSum || rowRemaining.some((v) => v < 0) || colRemaining.some((v) => v < 0)) {
    // Precondition violated — the caller's margins don't actually agree.
    return { grid: floor, ok: false };
  }

  // Pass 1: greedy largest-remainder, tie-broken by row name then column.
  const cells: { r: number; c: number; rem: number }[] = [];
  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) cells.push({ r, c, rem: raw[r][c] - floor[r][c] });
  }
  cells.sort((a, b) => b.rem - a.rem || rowNames[a.r].localeCompare(rowNames[b.r]) || a.c - b.c);
  for (const cell of cells) {
    if (rowRemaining[cell.r] > 0 && colRemaining[cell.c] > 0) {
      bumped[cell.r][cell.c] = true;
      rowRemaining[cell.r] -= 1;
      colRemaining[cell.c] -= 1;
    }
  }

  // Pass 2: repair any row still short via an augmenting path to a column
  // still short.
  for (let r = 0; r < nR; r++) {
    while (rowRemaining[r] > 0) {
      const path = findAugmentingPath(r, nR, nC, bumped, colRemaining);
      if (!path) {
        const partial = floor.map((row, rr) => row.map((v, cc) => v + (bumped[rr][cc] ? 1 : 0)));
        return { grid: partial, ok: false };
      }
      // Edges alternate "bump" (add this cell's extra cent) / "un-bump"
      // (move a previously-added cent away, freeing it to be re-routed).
      path.forEach((cell, i) => { bumped[cell.r][cell.c] = i % 2 === 0; });
      rowRemaining[path[0].r] -= 1;
      colRemaining[path[path.length - 1].c] -= 1;
    }
  }

  const grid = floor.map((row, r) => row.map((v, c) => v + (bumped[r][c] ? 1 : 0)));
  const ok = rowRemaining.every((v) => v === 0) && colRemaining.every((v) => v === 0);
  return { grid, ok };
}

// BFS for an alternating path starting at row `startRow` (which still needs
// +1 unit) and ending at any column that still needs +1 unit. Graph edges:
//   row r -> col c   when (r,c) is NOT bumped  (using it BUMPS that cell)
//   col c -> row r   when (r,c) IS bumped      (using it UN-BUMPS that cell,
//                                                freeing its unit to move
//                                                elsewhere in the row it
//                                                came from)
// Returns the ordered list of cells to flip (even index -> bump, odd index
// -> un-bump), or null if `startRow` has no augmenting path at all.
function findAugmentingPath(
  startRow: number,
  nR: number,
  nC: number,
  bumped: boolean[][],
  colRemaining: number[]
): { r: number; c: number }[] | null {
  type NodeKey = string;
  const keyOf = (kind: 'row' | 'col', idx: number): NodeKey => `${kind}:${idx}`;
  const visitedRows = new Set<number>([startRow]);
  const visitedCols = new Set<number>();
  const cameFrom = new Map<NodeKey, { prevKey: NodeKey; cell: { r: number; c: number } }>();
  const queue: ({ kind: 'row'; idx: number } | { kind: 'col'; idx: number })[] = [{ kind: 'row', idx: startRow }];

  let qi = 0;
  while (qi < queue.length) {
    const node = queue[qi++];
    const nodeKey = keyOf(node.kind, node.idx);
    if (node.kind === 'row') {
      const r = node.idx;
      for (let c = 0; c < nC; c++) {
        if (bumped[r][c] || visitedCols.has(c)) continue;
        visitedCols.add(c);
        cameFrom.set(keyOf('col', c), { prevKey: nodeKey, cell: { r, c } });
        if (colRemaining[c] > 0) return reconstructPath(keyOf('col', c), cameFrom);
        queue.push({ kind: 'col', idx: c });
      }
    } else {
      const c = node.idx;
      for (let r = 0; r < nR; r++) {
        if (!bumped[r][c] || visitedRows.has(r)) continue;
        visitedRows.add(r);
        cameFrom.set(keyOf('row', r), { prevKey: nodeKey, cell: { r, c } });
        queue.push({ kind: 'row', idx: r });
      }
    }
  }
  return null;
}

function reconstructPath(
  endKey: string,
  cameFrom: Map<string, { prevKey: string; cell: { r: number; c: number } }>
): { r: number; c: number }[] {
  const cells: { r: number; c: number }[] = [];
  let key: string | undefined = endKey;
  while (key) {
    const entry = cameFrom.get(key);
    if (!entry) break;
    cells.push(entry.cell);
    key = entry.prevKey;
  }
  return cells.reverse();
}

// ── Post-mapping net-balance verification ───────────────────────────────
//
// Cross-checks the mapped Expenses against the raw Splitwise data: for every
// (non-deleted, non-skipped) raw expense, each participant's true owed_share
// is always compared against what's actually recorded (never excused — a
// review-mode expense's `shares` map is still the raw owed_share, whether
// used directly or as an exact per-leg sum). The paid/credit side is also
// compared directly UNLESS the expense was routed to review, where crediting
// only the largest payer is a deliberate, known approximation (excused via
// `reviewOverrides`). Comparison is in integer cents — no float tolerance.
function verifyNetBalances(
  activeExpenses: RawSplitwiseExpense[],
  nameFor: (id: number) => string,
  mappedExpenses: Expense[],
  reviewOverrides: Map<string, { mainPayerName: string; creditAmount: number }>,
  skippedIds: Set<string>
): string[] {
  const expectedCents: Record<string, Record<string, number>> = {};
  const bumpCents = (name: string, currency: string, deltaCents: number) => {
    if (!expectedCents[name]) expectedCents[name] = {};
    expectedCents[name][currency] = (expectedCents[name][currency] || 0) + deltaCents;
  };

  activeExpenses.forEach((e) => {
    const swId = `sw_${e.id}`;
    if (skippedIds.has(swId)) return;
    const currency = resolveCurrencySymbol(e.currency_code);
    const override = reviewOverrides.get(swId);
    e.users.forEach((u) => {
      const name = nameFor(u.user_id);
      // Owed/debit side: never excused.
      bumpCents(name, currency, -toCents(parseNum(u.owed_share)));
      // Paid/credit side: the true paid_share, unless this expense was
      // routed to review, in which case only its designated main payer is
      // credited (with the shares' own total, not their true paid_share).
      if (override) {
        if (name === override.mainPayerName) bumpCents(name, currency, toCents(override.creditAmount));
      } else {
        bumpCents(name, currency, toCents(parseNum(u.paid_share)));
      }
    });
  });

  const allNames = new Set<string>(Object.keys(expectedCents));
  mappedExpenses.forEach((e) => {
    if (e.paid) allNames.add(e.paid);
    (e.splitters || []).forEach((s) => allNames.add(s));
  });
  const actual = memberNetBalances(Array.from(allNames), mappedExpenses, '₹');

  const warnings: string[] = [];
  allNames.forEach((name) => {
    const currencies = new Set([...Object.keys(expectedCents[name] || {}), ...Object.keys(actual[name] || {})]);
    currencies.forEach((currency) => {
      const expCents = expectedCents[name]?.[currency] || 0;
      const actCents = Math.round((actual[name]?.[currency] || 0) * 100);
      if (expCents !== actCents) {
        warnings.push(`Net balance mismatch for ${name} in ${currency}: expected ${round2(expCents / 100)}, mapped to ${round2(actCents / 100)}.`);
      }
    });
  });
  return warnings;
}
