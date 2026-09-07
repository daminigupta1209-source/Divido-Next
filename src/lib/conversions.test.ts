import { describe, it, expect } from 'vitest';
import { revertGroupConversions } from './conversions';
import { Expense } from './types';

const exp = (o: Partial<Expense>): Expense => ({
  id: 'e', gId: 'g1', title: 't', amt: 0, paid: 'A', date: '2026-09-01',
  mode: 'Equally', splitters: ['A', 'B'], shares: {}, currency: '₹', ...o,
} as Expense);

const convLog = (id: string, date: string, snapshot: any[], fromCurr = '₹', toCurr = '$'): Expense =>
  exp({ id, date, isConversion: true, title: `Currency Conversion to ${toCurr}`, fromCurr, toCurr, snapshot: JSON.stringify(snapshot) });

describe('revertGroupConversions', () => {
  it('restores originals and removes the single conversion log', () => {
    const expenses = [
      convLog('c1', '2026-09-02', [{ id: 'x', amt: 100, currency: '₹' }]),
      exp({ id: 'x', amt: 1.2, currency: '$' }), // was converted
    ];
    const { expenses: next, restoredCurrency } = revertGroupConversions(expenses, 'g1');
    expect(next.find((e) => e.id === 'c1')).toBeUndefined();     // log removed
    const x = next.find((e) => e.id === 'x')!;
    expect(x.amt).toBe(100);
    expect(x.currency).toBe('₹');
    expect(restoredCurrency).toBe('₹');
  });

  it('restores the TRUE original from stacked logs (earliest snapshot wins)', () => {
    const expenses = [
      // Oldest log snapshots the original ₹100; a later log snapshots the $1.2 intermediate.
      convLog('c1', '2026-09-02', [{ id: 'x', amt: 100, currency: '₹' }], '₹', '$'),
      convLog('c2', '2026-09-03', [{ id: 'x', amt: 1.2, currency: '$' }], '$', '₹'),
      exp({ id: 'x', amt: 99, currency: '₹' }), // current messy value after 2 conversions
    ];
    const { expenses: next } = revertGroupConversions(expenses, 'g1');
    expect(next.filter((e) => e.isConversion).length).toBe(0); // ALL logs removed
    const x = next.find((e) => e.id === 'x')!;
    expect(x.amt).toBe(100);   // true original, not the $1.2 intermediate
    expect(x.currency).toBe('₹');
  });

  it('leaves other groups untouched', () => {
    const expenses = [
      convLog('c1', '2026-09-02', [{ id: 'x', amt: 100, currency: '₹' }]),
      exp({ id: 'x', amt: 1.2, currency: '$' }),
      exp({ id: 'y', gId: 'g2', amt: 50, currency: '₹' }),
    ];
    const { expenses: next } = revertGroupConversions(expenses, 'g1');
    expect(next.find((e) => e.id === 'y')!.amt).toBe(50);
  });
});
