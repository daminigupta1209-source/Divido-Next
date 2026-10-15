import { describe, it, expect } from 'vitest';
import { isPersonalExpense, getPersonalExpenses, personalSpendByCurrency, expenseDayKey, periodRange, filterByPeriod, periodLabel, type SpendPeriod } from './personalExpenses';
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

describe('expenseDayKey', () => {
  it('reads ISO dates verbatim (no timezone shift)', () => {
    expect(expenseDayKey({ id: 'x', date: '2026-10-01' })).toBe('2026-10-01');
    expect(expenseDayKey({ id: 'x', date: '2026-10-01T23:30:00Z' })).toBe('2026-10-01');
  });

  it('parses non-ISO dates as local dates', () => {
    expect(expenseDayKey({ id: 'x', date: 'Oct 5, 2026' })).toBe('2026-10-05');
  });

  it('falls back to timestamp, then id, when the date is unusable', () => {
    const ts = new Date(2025, 2, 9, 12).getTime();
    expect(expenseDayKey({ id: 'x', date: '', timestamp: ts })).toBe('2025-03-09');
    expect(expenseDayKey({ id: ts, date: 'garbage' })).toBe('2025-03-09');
  });

  it('returns null when nothing is datable', () => {
    expect(expenseDayKey({ id: 'abc', date: '' })).toBeNull();
  });
});

describe('periodRange / filterByPeriod', () => {
  const now = new Date(2026, 9, 15); // 15 Oct 2026
  const days = ['2021-12-31', '2022-01-01', '2025-12-31', '2026-01-01', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01', '2027-01-01'];
  const exps = days.map((date, i) => mkExp({ id: `e${i}`, date }));
  const pick = (p: SpendPeriod) => filterByPeriod(exps, p, now).map((e) => e.date);

  it('month = 1st of this month up to (not incl.) 1st of next', () => {
    expect(periodRange('month', now)).toEqual({ start: '2026-10-01', end: '2026-11-01' });
    expect(pick('month')).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('month rolls over the year in December', () => {
    expect(periodRange('month', new Date(2026, 11, 31))).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });

  it('year = this calendar year', () => {
    expect(pick('year')).toEqual(['2026-01-01', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01']);
  });

  it('fiveYears = this year plus the four before it', () => {
    expect(periodRange('fiveYears', now)).toEqual({ start: '2022-01-01', end: '2027-01-01' });
    expect(pick('fiveYears')).toEqual(days.slice(1, 8));
  });

  it('all keeps everything, including undatable rows', () => {
    const withBad = [...exps, mkExp({ id: 'bad', date: '' })];
    expect(filterByPeriod(withBad, 'all', now)).toHaveLength(withBad.length);
    expect(filterByPeriod(withBad, 'fiveYears', now).some((e) => e.id === 'bad')).toBe(false);
  });

  it('labels each period', () => {
    expect(periodLabel('month', now)).toBe('October 2026');
    expect(periodLabel('year', now)).toBe('2026');
    expect(periodLabel('fiveYears', now)).toBe('2022 – 2026');
    expect(periodLabel('all', now)).toBe('All time');
  });

  it('period totals = sum of amt per currency over the filtered personal expenses', () => {
    const isMe = makeIsMe('Chirag');
    const mine = (o: Partial<Expense>) => mkExp({ paid: 'Chirag', splitters: ['Chirag'], currency: '₹', ...o });
    const all = [mine({ id: 'a', date: '2026-10-02', amt: 1500 }), mine({ id: 'b', date: '2026-10-20', amt: 250.5 }), mine({ id: 'c', date: '2026-03-01', amt: 1000 }), mine({ id: 'd', date: '2026-10-05', amt: 40, currency: '$' })];
    expect(personalSpendByCurrency(filterByPeriod(all, 'month', now), isMe, '₹')).toEqual({ '₹': 1750.5, $: 40 });
    expect(personalSpendByCurrency(filterByPeriod(all, 'year', now), isMe, '₹')).toEqual({ '₹': 2750.5, $: 40 });
  });
});
