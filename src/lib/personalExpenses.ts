import type { Expense } from './types';
import { cleanName } from './nonGroupPeople';

export type IsMe = (name: string) => boolean;

// Non-deleted STANDALONE expense whose payer AND single distinct splitter both resolve to me.
// Empty splitters does NOT qualify.
export const isPersonalExpense = (e: Expense, isMe: IsMe): boolean => {
  if (!e || e.isDeleted) return false;
  if (String(e.gId) !== 'STANDALONE') return false;
  if (!isMe(e.paid)) return false;
  const splitters = e.splitters || [];
  if (splitters.length === 0) return false;
  const distinct = new Set(splitters.map((s) => cleanName(s).toLowerCase()));
  if (distinct.size !== 1) return false;
  return isMe(splitters[0]);
};

// Newest first: date desc, then timestamp desc (same as NonGroupView.tsx:356).
export const getPersonalExpenses = (expenses: Expense[], isMe: IsMe): Expense[] =>
  expenses
    .filter((e) => isPersonalExpense(e, isMe))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.timestamp || 0) - (a.timestamp || 0));

// All-time sum of amt per currency (e.currency || fallbackCurrency). Excludes settlement-like
// rows per useAnalytics.ts:84-96 (defensive).
export const personalSpendByCurrency = (expenses: Expense[], isMe: IsMe, fallbackCurrency: string): Record<string, number> => {
  const out: Record<string, number> = {};
  getPersonalExpenses(expenses, isMe).forEach((e) => {
    const t = e.title || '';
    if (e.paid === 'SYSTEM' || e.category === '✅' || t.includes('✅ Settlement') || t === 'Written off' || e.notes === 'Written off') return;
    const curr = e.currency || fallbackCurrency;
    out[curr] = (out[curr] || 0) + (Number(e.amt) || 0);
  });
  return out;
};

// ── Spend period filter (summary card on the personal screen) ────────────────
export type SpendPeriod = 'month' | 'year' | 'fiveYears' | 'all';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Local calendar day of an expense as 'YYYY-MM-DD' (sortable). ISO-prefixed dates
// are read verbatim (no UTC shift); anything else is parsed, falling back to a
// millisecond timestamp/id like getMonthYearKey does. null = undatable.
export const expenseDayKey = (e: Pick<Expense, 'date' | 'timestamp' | 'id'>): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e.date || ''));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(String(e.date || ''));
  if (e.date && !isNaN(d.getTime())) return toDayKey(d);
  const ts = Number(e.timestamp) > 1e12 ? Number(e.timestamp) : Number(e.id);
  return ts > 1e12 ? toDayKey(new Date(ts)) : null;
};

// Half-open calendar range [start, end) for a period, as day keys. 'fiveYears'
// = this calendar year plus the four before it. 'all' has no bounds.
export const periodRange = (period: SpendPeriod, now: Date): { start: string; end: string } | null => {
  const y = now.getFullYear();
  const mo = now.getMonth();
  if (period === 'month') return { start: `${y}-${pad2(mo + 1)}-01`, end: toDayKey(new Date(y, mo + 1, 1)) };
  if (period === 'year') return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  if (period === 'fiveYears') return { start: `${y - 4}-01-01`, end: `${y + 1}-01-01` };
  return null;
};

export const filterByPeriod = <T extends Pick<Expense, 'date' | 'timestamp' | 'id'>>(exps: T[], period: SpendPeriod, now: Date): T[] => {
  const r = periodRange(period, now);
  if (!r) return exps;
  return exps.filter((e) => {
    const k = expenseDayKey(e);
    return !!k && k >= r.start && k < r.end;
  });
};

// Label for the selected period, e.g. "October 2026", "2026", "2022 – 2026".
export const periodLabel = (period: SpendPeriod, now: Date): string => {
  const y = now.getFullYear();
  if (period === 'month') return now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (period === 'year') return String(y);
  if (period === 'fiveYears') return `${y - 4} – ${y}`;
  return 'All time';
};
