import { describe, it, expect } from 'vitest';
import { expenseToRow, rowToExpenseFields, diffExpenseRow, EXPENSE_FIELDS } from './expenseSchema';
import { Expense } from './types';

const mk = (o: Partial<Expense>): Expense => ({
  id: 'e1', gId: 'g1', title: 'Dinner', amt: 100, paid: 'Alice', date: '2026-09-01',
  mode: 'Equally', splitters: ['Alice', 'Bob'], shares: {}, category: '🍽️',
  currency: '₹', ...o,
} as Expense);

describe('expenseSchema', () => {
  it('round-trips core + conversion fields through row and back', () => {
    const e = mk({
      isConversion: true, snapshot: '[{"id":"x"}]', ratesUsed: '{"$":83}',
      toCurr: '₹', fromCurr: '$', origAmt: 5, prevCurr: '$', notes: 'trip',
    });
    const row = expenseToRow(e);
    // db column names are used on the wire
    expect(row.group_id).toBe('g1');
    expect(row.is_conversion).toBe(true);
    expect(row.rates_used).toBe('{"$":83}');
    expect(row.to_curr).toBe('₹');

    const back = rowToExpenseFields(row);
    expect(back.gId).toBe('g1');
    expect(back.isConversion).toBe(true);
    expect(back.ratesUsed).toBe('{"$":83}');
    expect(back.toCurr).toBe('₹');
    expect(back.snapshot).toBe('[{"id":"x"}]');
    expect(back.amt).toBe(100);
  });

  it('applies defaults on save (mode/is_deleted/recurrence)', () => {
    const row = expenseToRow(mk({ mode: undefined as any }));
    expect(row.mode).toBe('Equally');
    expect(row.is_deleted).toBe(false);
    expect(row.recurrence).toBe('none');
    expect(row.splitters).toEqual(['Alice', 'Bob']);
  });

  it('diff returns only changed columns', () => {
    const oldE = mk({ amt: 100 });
    const next = mk({ amt: 250 });
    const d = diffExpenseRow(oldE, next);
    expect(d).toEqual({ amt: 250 });
  });

  it('diff detects a soft-delete and a snapshot change', () => {
    const oldE = mk({ isDeleted: false, snapshot: undefined });
    const next = mk({ isDeleted: true, snapshot: '[]' });
    const d = diffExpenseRow(oldE, next);
    expect(d.is_deleted).toBe(true);
    expect(d.snapshot).toBe('[]');
  });

  it('diff uses String compare for gId and deep compare for splitters', () => {
    expect(diffExpenseRow(mk({ gId: '1' as any }), mk({ gId: 1 as any }))).toEqual({});
    expect(diffExpenseRow(mk({ splitters: ['A'] }), mk({ splitters: ['A'] }))).toEqual({});
    expect(diffExpenseRow(mk({ splitters: ['A'] }), mk({ splitters: ['A', 'B'] })).splitters).toEqual(['A', 'B']);
  });

  it('every field maps a distinct db column (no accidental collisions)', () => {
    const cols = EXPENSE_FIELDS.map((f) => f.db);
    expect(new Set(cols).size).toBe(cols.length);
  });
});
