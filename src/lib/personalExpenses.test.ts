import { describe, it, expect } from 'vitest';
import { isPersonalExpense, getPersonalExpenses, personalSpendByCurrency } from './personalExpenses';
import { makeIsMe } from './nonGroupPeople';
import { Expense } from './types';

const mkExp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'STANDALONE', title: 't', amt: 0, paid: '', date: '2026-01-01', mode: 'Equally', splitters: [], ...o } as unknown as Expense);

describe('isPersonalExpense', () => {
  const isMe = makeIsMe('Chirag', 'Chirag Gupta');

  it('is true for STANDALONE, paid Chirag, splitters [Chirag]', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: ['Chirag'] }), isMe)).toBe(true);
  });

  it('is true for paid/splitters "You"', () => {
    expect(isPersonalExpense(mkExp({ paid: 'You', splitters: ['You'] }), isMe)).toBe(true);
  });

  it('is true for splitters [Chirag Gupta]', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: ['Chirag Gupta'] }), isMe)).toBe(true);
  });

  it('is true for splitters [Chirag, " chirag "] (same person, different casing/whitespace)', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: ['Chirag', ' chirag '] }), isMe)).toBe(true);
  });

  it('is false when isDeleted', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: ['Chirag'], isDeleted: true }), isMe)).toBe(false);
  });

  it('is false for a non-STANDALONE gId', () => {
    expect(isPersonalExpense(mkExp({ gId: 'g1', paid: 'Chirag', splitters: ['Chirag'] }), isMe)).toBe(false);
  });

  it('is false when the payer is not me', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Rahul', splitters: ['Chirag'] }), isMe)).toBe(false);
  });

  it('is false when splitters include someone else', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: ['Chirag', 'Riya'] }), isMe)).toBe(false);
  });

  it('is false for empty splitters', () => {
    expect(isPersonalExpense(mkExp({ paid: 'Chirag', splitters: [] }), isMe)).toBe(false);
  });
});

describe('getPersonalExpenses', () => {
  const isMe = makeIsMe('Chirag', 'Chirag Gupta');

  it('filters a mixed list down to personal expenses', () => {
    const personal = mkExp({ id: 'p1', paid: 'Chirag', splitters: ['Chirag'] });
    const shared = mkExp({ id: 's1', gId: 'g1', paid: 'Chirag', splitters: ['Chirag', 'Riya'] });
    const other = mkExp({ id: 'o1', paid: 'Riya', splitters: ['Riya'] });
    const out = getPersonalExpenses([personal, shared, other], isMe);
    expect(out.map((e) => e.id)).toEqual(['p1']);
  });

  it('orders same-date entries by timestamp desc', () => {
    const older = mkExp({ id: 'a', paid: 'Chirag', splitters: ['Chirag'], date: '2026-01-01', timestamp: 100 });
    const newer = mkExp({ id: 'b', paid: 'Chirag', splitters: ['Chirag'], date: '2026-01-01', timestamp: 200 });
    const out = getPersonalExpenses([older, newer], isMe);
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('orders by date desc across different dates', () => {
    const earlier = mkExp({ id: 'a', paid: 'Chirag', splitters: ['Chirag'], date: '2026-01-01', timestamp: 999 });
    const later = mkExp({ id: 'b', paid: 'Chirag', splitters: ['Chirag'], date: '2026-02-01', timestamp: 1 });
    const out = getPersonalExpenses([earlier, later], isMe);
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('personalSpendByCurrency', () => {
  const isMe = makeIsMe('Chirag', 'Chirag Gupta');

  it('sums per currency', () => {
    const a = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100 });
    const b = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 50 });
    expect(personalSpendByCurrency([a, b], isMe, '₹')).toEqual({ '₹': 150 });
  });

  it('uses the fallback currency when the expense has none', () => {
    const a = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, currency: undefined });
    expect(personalSpendByCurrency([a], isMe, '₹')).toEqual({ '₹': 100 });
  });

  it('keeps multiple currencies separate', () => {
    const inr = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, currency: '₹' });
    const usd = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 20, currency: '$' });
    expect(personalSpendByCurrency([inr, usd], isMe, '₹')).toEqual({ '₹': 100, '$': 20 });
  });

  it('excludes rows marked as settlement/written-off', () => {
    const settlementCategory = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, category: '✅' });
    const settlementTitle = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, title: '✅ Settlement' });
    const writtenOffTitle = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, title: 'Written off' });
    const writtenOffNotes = mkExp({ paid: 'Chirag', splitters: ['Chirag'], amt: 100, notes: 'Written off' });
    expect(
      personalSpendByCurrency([settlementCategory, settlementTitle, writtenOffTitle, writtenOffNotes], isMe, '₹')
    ).toEqual({});
  });

  it('returns {} when there are no personal expenses', () => {
    expect(personalSpendByCurrency([], isMe, '₹')).toEqual({});
  });
});
