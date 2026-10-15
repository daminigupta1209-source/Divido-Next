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
