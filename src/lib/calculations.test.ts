import { describe, it, expect } from 'vitest';
import { simplifyMultiCurrencyDebts, calculateNextOccurrenceDate, computeRawPairwiseTransactions } from './calculations';
import { Expense } from './types';

describe('simplifyMultiCurrencyDebts', () => {
  it('should split equally within a default currency', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses: Expense[] = [
      {
        id: '1',
        gId: 'test-group',
        title: 'Dinner',
        amt: 90,
        paid: 'Alice',
        splitters: ['Alice', 'Bob', 'Charlie'],
        date: '2026-07-01',
        category: 'Food',
        mode: 'Equally',
        currency: '₹',
        shares: {}
      }
    ];

    const results = simplifyMultiCurrencyDebts(members, expenses, '₹');
    
    // Alice paid 90, each owes 30. Alice is owed 30 from Bob and 30 from Charlie.
    expect(results).toContainEqual({
      from: 'Bob',
      to: 'Alice',
      balances: { '₹': 30 }
    });
    expect(results).toContainEqual({
      from: 'Charlie',
      to: 'Alice',
      balances: { '₹': 30 }
    });
  });

  it('should handle multi-currency ledger splits separately without mixing values', () => {
    const members = ['Alice', 'Bob'];
    const expenses: Expense[] = [
      {
        id: '1',
        gId: 'test-group',
        title: 'Rupee spend',
        amt: 100,
        paid: 'Alice',
        splitters: ['Alice', 'Bob'],
        date: '2026-07-01',
        category: 'Food',
        mode: 'Equally',
        currency: '₹',
        shares: {}
      },
      {
        id: '2',
        gId: 'test-group',
        title: 'Euro spend',
        amt: 300,
        paid: 'Bob',
        splitters: ['Alice', 'Bob'],
        date: '2026-07-02',
        category: 'Travel',
        mode: 'Equally',
        currency: '€',
        shares: {}
      }
    ];

    const results = simplifyMultiCurrencyDebts(members, expenses, '₹');
    
    // Alice paid ₹100, Bob owes ₹50
    // Bob paid €300, Alice owes €150
    // Because they are different currencies, they MUST not be summed to -100 or +100
    expect(results).toContainEqual({
      from: 'Bob',
      to: 'Alice',
      balances: { '₹': 50 }
    });
    expect(results).toContainEqual({
      from: 'Alice',
      to: 'Bob',
      balances: { '€': 150 }
    });
  });

  it('should handle unequal shares correctly', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses: Expense[] = [
      {
        id: '1',
        gId: 'test-group',
        title: 'Unequal Rent',
        amt: 1000,
        paid: 'Alice',
        splitters: ['Alice', 'Bob', 'Charlie'],
        date: '2026-07-01',
        category: 'Rent',
        mode: 'Unequally',
        currency: '₹',
        shares: {
          'Alice': 200,
          'Bob': 500,
          'Charlie': 300
        }
      }
    ];

    const results = simplifyMultiCurrencyDebts(members, expenses, '₹');
    
    // Bob owes 500 to Alice, Charlie owes 300 to Alice
    expect(results).toContainEqual({
      from: 'Bob',
      to: 'Alice',
      balances: { '₹': 500 }
    });
    expect(results).toContainEqual({
      from: 'Charlie',
      to: 'Alice',
      balances: { '₹': 300 }
    });
  });
});

describe('calculateNextOccurrenceDate', () => {
  it('should shift weekly correctly', () => {
    const nextDate = calculateNextOccurrenceDate('2026-07-01', 'weekly');
    expect(nextDate).toBe('2026-07-08');
  });

  it('should handle end-of-month monthly bounds correctly', () => {
    const nextDate = calculateNextOccurrenceDate('2026-01-31', 'monthly');
    expect(nextDate).toBe('2026-02-28'); // Rollback since Feb has no 31st
  });

  it('should handle leap year yearly bounds correctly', () => {
    const nextDate = calculateNextOccurrenceDate('2024-02-29', 'yearly');
    expect(nextDate).toBe('2025-02-28'); // Rollback since 2025 has no Feb 29
  });

  it('should roll a 31st into a 30-day month (Mar 31 -> Apr 30)', () => {
    expect(calculateNextOccurrenceDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });

  it('should cross the year boundary monthly (Dec 31 -> Jan 31)', () => {
    expect(calculateNextOccurrenceDate('2026-12-31', 'monthly')).toBe('2027-01-31');
  });

  it('should shift weekly across a month boundary', () => {
    expect(calculateNextOccurrenceDate('2026-01-28', 'weekly')).toBe('2026-02-04');
  });

  it('should shift weekly across a year boundary', () => {
    expect(calculateNextOccurrenceDate('2026-12-31', 'weekly')).toBe('2027-01-07');
  });

  it('should keep a non-leap Feb 28 stable year over year', () => {
    expect(calculateNextOccurrenceDate('2023-02-28', 'yearly')).toBe('2024-02-28');
  });

  it('should roll Jan 31 into a leap-year February (Feb 29)', () => {
    // 2028 is a leap year, so Jan 31 -> Feb 29 (not Feb 28).
    expect(calculateNextOccurrenceDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });
});

describe('computeRawPairwiseTransactions', () => {
  const base = {
    gId: 'g1',
    title: 'x',
    date: '2026-07-01',
    category: 'Food',
    mode: 'Equally' as const,
    currency: '₹',
    shares: {},
  };

  it('nets a simple two-person debt into one directed transaction', () => {
    const members = ['Alice', 'Bob'];
    const expenses: Expense[] = [
      { ...base, id: '1', amt: 100, paid: 'Alice', splitters: ['Alice', 'Bob'] },
    ];
    // Alice paid 100, Bob's share is 50 -> Bob owes Alice 50.
    expect(computeRawPairwiseTransactions(members, expenses, '₹')).toEqual([
      { from: 'Bob', to: 'Alice', balances: { '₹': 50 } },
    ]);
  });

  it('preserves hyphenated names instead of splitting on the dash', () => {
    // This is the phantom-people / delimiter regression guard.
    const members = ['Jean-Paul', 'Anne-Marie'];
    const expenses: Expense[] = [
      { ...base, id: '1', amt: 40, paid: 'Jean-Paul', splitters: ['Jean-Paul', 'Anne-Marie'] },
    ];
    const result = computeRawPairwiseTransactions(members, expenses, '₹');
    expect(result).toEqual([
      { from: 'Anne-Marie', to: 'Jean-Paul', balances: { '₹': 20 } },
    ]);
  });

  it('treats a null/undefined amount as zero instead of producing NaN', () => {
    const members = ['Alice', 'Bob'];
    const expenses: Expense[] = [
      // @ts-expect-error deliberately passing a bad amount to prove it is guarded
      { ...base, id: '1', amt: null, paid: 'Alice', splitters: ['Alice', 'Bob'] },
    ];
    // A null amount nets to nothing, so there are no transactions (and no NaN).
    expect(computeRawPairwiseTransactions(members, expenses, '₹')).toEqual([]);
  });
});

describe('Integration: Group & Friends View Debt Simplification Sync', () => {
  it('should sync simplified multi-currency outcomes identically to how FriendsView aggregates them', () => {
    // Scenario: Alice (me), Bob, Jia.
    // Jia pays ₹60 split equally among Alice, Bob, Jia (everyone owes Jia ₹20)
    // Alice pays Bob ₹20 split equally (Bob owes Alice ₹10)
    // Simplify debts is ON.
    const me = 'Alice';
    const members = ['Alice', 'Bob', 'Jia'];
    const expenses: Expense[] = [
      {
        id: '1',
        gId: 'group-1',
        title: 'Jia Dinner',
        amt: 60,
        paid: 'Jia',
        splitters: ['Alice', 'Bob', 'Jia'],
        date: '2026-07-01',
        category: 'Food',
        mode: 'Equally',
        currency: '₹',
        shares: {}
      },
      {
        id: '2',
        gId: 'group-1',
        title: 'Alice Pay Bob',
        amt: 20,
        paid: 'Alice',
        splitters: ['Alice', 'Bob'],
        date: '2026-07-02',
        category: 'Travel',
        mode: 'Equally',
        currency: '₹',
        shares: {}
      }
    ];

    // Compute simplified group transactions
    const groupTransactions = simplifyMultiCurrencyDebts(members, expenses, '₹');

    // Simulate FriendsView accumulation logic for 'me' (Alice)
    const masterBal: Record<string, Record<string, number>> = {};
    groupTransactions.forEach((t) => {
      if (t.from === me) {
        const friend = t.to;
        if (!masterBal[friend]) masterBal[friend] = {};
        Object.entries(t.balances).forEach(([curr, val]) => {
          masterBal[friend][curr] = (masterBal[friend][curr] || 0) - val;
        });
      } else if (t.to === me) {
        const friend = t.from;
        if (!masterBal[friend]) masterBal[friend] = {};
        Object.entries(t.balances).forEach(([curr, val]) => {
          masterBal[friend][curr] = (masterBal[friend][curr] || 0) + val;
        });
      }
    });

    // Check balances sync correctly:
    // Jia paid ₹60 (Alice owes ₹20, Bob owes ₹20)
    // Alice paid ₹20 (Bob owes ₹10)
    // Before simplification: Alice owes Jia ₹20, Bob owes Alice ₹10, Bob owes Jia ₹20
    // Total: Alice is at -₹10 net, Bob is at -₹10 net, Jia is at +₹20 net.
    // Simplified transaction should result in Alice owes Jia ₹10, Bob owes Jia ₹10 (0 transactions involving Alice paying Bob).
    
    // Alice owes Jia ₹10
    expect(masterBal['Jia']).toEqual({ '₹': -10 });
    // Alice has no direct transaction with Bob anymore because of simplification!
    expect(masterBal['Bob'] || {}).toEqual({});
  });
});
