import { Expense } from './types';
import { shown } from './identity';
import { formatExactAmount, getEmoji, parseExpenseId } from './utils';

// One row in a group's "Updates Log": a membership change (SYSTEM row) or an
// expense that was added to the group.
export interface GroupUpdate {
  key: string;
  kind: 'system' | 'expense';
  log: Expense;
  // Epoch ms the row was created, or null when unknown (date-only display).
  when: number | null;
}

const isSettlementLike = (e: Expense): boolean =>
  !!e.title?.toLowerCase().includes('settlement') ||
  e.title === 'Payment Recorded' ||
  e.category === '💸' || e.category === '✅' || e.category === '🤝';

// Creation time: DB created_at (mapped to `timestamp`), else a Date.now()-style id.
const createdAt = (e: Expense): number | null => {
  if (e.timestamp && e.timestamp > 0) return e.timestamp;
  const fromId = parseExpenseId(e.id);
  return fromId > 1000000000000 ? fromId : null;
};

const sortKey = (u: GroupUpdate): number => {
  if (u.when !== null) return u.when;
  const d = new Date(u.log.date).getTime();
  return isNaN(d) ? 0 : d;
};

// Membership logs + expenses added to the group, newest first. Settlements,
// currency conversions and deleted rows are not "expenses added", so skipped.
export const buildGroupUpdates = (expenses: Expense[], groupId: string | number | null | undefined): GroupUpdate[] =>
  expenses
    .filter((e) => String(e.gId) === String(groupId))
    .filter((e) => e.paid === 'SYSTEM' || (!e.isDeleted && !e.isConversion && !e.isNormalization && !isSettlementLike(e)))
    .map((e, idx) => ({
      key: `${e.id}-${idx}`,
      kind: e.paid === 'SYSTEM' ? ('system' as const) : ('expense' as const),
      log: e,
      when: createdAt(e),
    }))
    .sort((a, b) => sortKey(b) - sortKey(a));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "3 Oct 2026, 2.30 pm". Falls back to the stored YYYY-MM-DD date alone when
// the creation time is unknown.
export const formatUpdateStamp = (u: GroupUpdate): string => {
  if (u.when !== null) {
    const d = new Date(u.when);
    const h24 = d.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}.${mm} ${h24 < 12 ? 'am' : 'pm'}`;
  }
  const parts = (u.log.date || '').split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[2], 10)} ${MONTHS[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  }
  return u.log.date;
};

const cleanName = (n: string) => n.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim();

// "🍕 Pizza · ₹1,200"
export const formatExpenseUpdate = (e: Expense): string => {
  const cur = e.currency || '';
  const amount = `${cur}${cur.length > 1 ? ' ' : ''}${formatExactAmount(e.amt)}`;
  const icon = e.category || getEmoji(e.title || '') || '💰';
  return `${icon} ${e.title} · ${amount}`;
};

// "Added by you · Paid by Alice". Older expenses have no creator recorded, so
// they show the payer only.
export const formatExpenseByLine = (e: Expense, me: string): string => {
  const self = cleanName(me).toLowerCase();
  const label = (n: string) => (cleanName(n).toLowerCase() === self ? 'you' : shown(cleanName(n)));
  const parts: string[] = [];
  if (e.addedBy) parts.push(`Added by ${label(e.addedBy)}`);
  if (e.paid) parts.push(`Paid by ${label(e.paid)}`);
  return parts.join(' · ');
};
