import { Expense } from './types';

// Undo ALL currency conversions in a group at once: reconstruct each expense's
// true original amount/currency/shares from the conversion logs (earliest
// snapshot per id wins), restore them, and drop every conversion log. Robust
// even when several conversions were stacked (the old bug), so a single "undo"
// always returns the group to its pre-conversion state.
export const revertGroupConversions = (
  expenses: Expense[],
  groupId: string | number
): { expenses: Expense[]; restoredCurrency: string } => {
  const gid = String(groupId);
  const isThisGroup = (e: Expense) => String(e.gId) === gid;

  const logs = expenses.filter((e) => isThisGroup(e) && e.isConversion);
  const logsOldestFirst = [...logs].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || ((a.timestamp || 0) - (b.timestamp || 0))
  );

  const originalById: Record<string, { amt: number; currency: string; shares?: Record<string, number> }> = {};
  for (const log of logsOldestFirst) {
    let snap: any[] = [];
    try { snap = log.snapshot ? JSON.parse(log.snapshot) : []; } catch { snap = []; }
    for (const s of snap) { if (!(s.id in originalById)) originalById[s.id] = s; }
  }

  // The group's original currency: the oldest log's fromCurr when it's a real
  // single currency, else the most common currency among restored originals.
  let restoredCurrency = '';
  const oldest = logsOldestFirst[0];
  if (oldest?.fromCurr && oldest.fromCurr !== 'ALL') restoredCurrency = oldest.fromCurr;
  if (!restoredCurrency) {
    const counts: Record<string, number> = {};
    Object.values(originalById).forEach((o) => { if (o.currency) counts[o.currency] = (counts[o.currency] || 0) + 1; });
    restoredCurrency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '₹';
  }

  const next = expenses
    .filter((e) => !(isThisGroup(e) && e.isConversion))
    .map((e) => {
      if (isThisGroup(e) && originalById[String(e.id)]) {
        const o = originalById[String(e.id)];
        return { ...e, amt: o.amt, currency: o.currency, shares: o.shares };
      }
      return e;
    });

  return { expenses: next, restoredCurrency };
};
