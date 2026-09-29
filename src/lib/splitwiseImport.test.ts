import { describe, it, expect } from 'vitest';
import {
  mapSplitwiseImport,
  allocateGrid,
  SPLITWISE_REVIEW_NOTES_MARKER,
  RawSplitwiseExpense,
  RawSplitwiseUser,
  RawSplitwiseExpenseUser,
  SplitwiseImportInput,
} from './splitwiseImport';

// Deterministic seeded PRNG (mulberry32) so the property test below is
// reproducible and fast — no reliance on Math.random().
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Splits `total` into `parts` positive integers (each >= 1) summing exactly
// to `total`, via random cut points — O(parts), safe for large totals.
function randomPartition(rng: () => number, total: number, parts: number): number[] {
  if (parts === 1) return [total];
  const cuts = new Set<number>();
  while (cuts.size < parts - 1) {
    cuts.add(1 + Math.floor(rng() * (total - 1)));
  }
  const sorted = Array.from(cuts).sort((a, b) => a - b);
  const result: number[] = [];
  let prev = 0;
  sorted.forEach((c) => { result.push(c - prev); prev = c; });
  result.push(total - prev);
  return result;
}

const CURRENT_USER_ID = 1;
const ME_NAME = 'Chirag Gupta';
const ME_EMAIL = 'chirag.g@carwale.com';

const su = (id: number, first: string, last?: string, email?: string): RawSplitwiseUser => ({
  id,
  first_name: first,
  last_name: last,
  email,
});

const eu = (userId: number, first: string, last: string | undefined, paid: string, owed: string, email?: string): RawSplitwiseExpenseUser => ({
  user_id: userId,
  user: { first_name: first, last_name: last, email },
  paid_share: paid,
  owed_share: owed,
});

const baseExp = (over: Partial<RawSplitwiseExpense>): RawSplitwiseExpense => ({
  id: 1,
  group_id: 100,
  description: 'Dinner',
  details: null,
  cost: '100',
  date: '2026-07-01',
  currency_code: 'INR',
  category: { name: 'Dining out' },
  payment: false,
  deleted_at: null,
  users: [],
  ...over,
});

const defaultGroupMembers = () => [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Bob', 'Smith')];

function groupInput(rawExpenses: RawSplitwiseExpense[], over: Partial<SplitwiseImportInput> = {}): SplitwiseImportInput {
  return {
    target: { kind: 'group', rawGroup: { id: 100, name: 'Goa Trip', members: defaultGroupMembers() } },
    rawExpenses,
    currentUserId: CURRENT_USER_ID,
    meName: ME_NAME,
    myEmail: ME_EMAIL,
    multiPayer: 'split',
    ...over,
  };
}

function friendsInput(rawExpenses: RawSplitwiseExpense[], over: Partial<SplitwiseImportInput> = {}): SplitwiseImportInput {
  return {
    target: { kind: 'friends' },
    rawExpenses,
    currentUserId: CURRENT_USER_ID,
    meName: ME_NAME,
    myEmail: ME_EMAIL,
    multiPayer: 'split',
    ...over,
  };
}

const noMismatchWarnings = (warnings: string[]) => warnings.filter((w) => /mismatch/i.test(w));

describe('mapSplitwiseImport — regular (single payer) expenses', () => {
  it('maps a single payer with uneven splits', () => {
    const input = groupInput([
      baseExp({
        id: 1,
        cost: '100',
        users: [
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '40', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '60'),
        ],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.expenses).toHaveLength(1);
    const exp = result.expenses[0];
    expect(exp.id).toBe('sw_1');
    expect(exp.amt).toBe(100);
    expect(exp.paid).toBe(ME_NAME);
    expect(exp.mode).toBe('Unequally');
    expect(exp.shares).toEqual({ [ME_NAME]: 40, 'Bob Smith': 60 });
    expect(exp.splitters?.slice().sort()).toEqual([ME_NAME, 'Bob Smith'].sort());
    expect(exp.category).toBe('🍕'); // 'Dining out' -> pizza emoji
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('falls back to getEmoji(description) when the Splitwise category is unmapped, then null', () => {
    const withDescriptionMatch = mapSplitwiseImport(
      groupInput([
        baseExp({
          id: 1,
          description: 'Cinema evening',
          category: { name: 'Some Unmapped Category' },
          users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50')],
        }),
      ])
    );
    expect(withDescriptionMatch.expenses[0].category).toBe('🍿');

    const withNoMatch = mapSplitwiseImport(
      groupInput([
        baseExp({
          id: 2,
          description: 'Misc thing',
          category: { name: 'Some Unmapped Category' },
          users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50')],
        }),
      ])
    );
    expect(withNoMatch.expenses[0].category).toBeNull();
  });

  it('maps INR/USD to their symbols and passes unknown codes through as-is', () => {
    const mk = (id: number, code: string) =>
      baseExp({
        id,
        currency_code: code,
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50')],
      });
    const result = mapSplitwiseImport(groupInput([mk(1, 'INR'), mk(2, 'USD'), mk(3, 'ZZZ')]));
    expect(result.expenses.map((e) => e.currency)).toEqual(['₹', '$', 'ZZZ']);
  });

  it('produces the same expense ids across repeated runs (idempotent)', () => {
    const input = groupInput([
      baseExp({ id: 5, users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '40', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '60')] }),
    ]);
    const r1 = mapSplitwiseImport(input);
    const r2 = mapSplitwiseImport(input);
    expect(r1.expenses.map((e) => e.id)).toEqual(r2.expenses.map((e) => e.id));
    expect(r1.expenses.map((e) => e.id)).toEqual(['sw_5']);
  });

  it('skips soft-deleted expenses entirely', () => {
    const input = groupInput([
      baseExp({
        id: 1,
        deleted_at: '2026-01-02T00:00:00Z',
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '999', '999', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '0')],
      }),
      baseExp({
        id: 2,
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50')],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_2']);
  });
});

describe('mapSplitwiseImport — settlements (payment:true)', () => {
  it('maps a payment expense to the App.tsx settlement shape', () => {
    const input = groupInput([
      baseExp({
        id: 9,
        payment: true,
        cost: '50',
        description: 'Payment',
        category: null,
        users: [
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '50', '0', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '50'),
        ],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({
      id: 'sw_9',
      title: `✅ Settlement: ${ME_NAME} paid Bob Smith`,
      amt: 50,
      paid: ME_NAME,
      splitters: ['Bob Smith'],
      category: '✅',
      mode: 'Equally',
      shares: {},
    });
  });

  it('routes a settlement with two payers to review instead of crediting one payer the full amount', () => {
    const input = groupInput(
      [
        baseExp({
          id: 10,
          payment: true,
          cost: '100',
          description: 'Payment',
          category: null,
          users: [
            eu(2, 'Alice', 'A', '60', '0'),
            eu(3, 'Bob', 'B', '40', '0'),
            eu(4, 'Cleo', 'C', '0', '100'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B'), su(4, 'Cleo', 'C')],
          },
        },
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.review).toHaveLength(1);
    expect(result.review[0].payers.map((p) => p.name).sort()).toEqual(['Alice A', 'Bob B']);
    expect(result.warnings.some((w) => /routed to review/i.test(w))).toBe(true);
    // No expense silently records this as a clean "one payer covered it all" settlement.
    expect(result.expenses.some((e) => e.category === '✅')).toBe(false);
    expect(result.expenses.some((e) => e.mode === 'Equally' && e.amt === 100)).toBe(false);
  });

  it('routes a settlement with two receivers to review', () => {
    const input = groupInput(
      [
        baseExp({
          id: 11,
          payment: true,
          cost: '100',
          description: 'Payment',
          category: null,
          users: [
            eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '0', ME_EMAIL),
            eu(2, 'Alice', 'A', '0', '60'),
            eu(3, 'Bob', 'B', '0', '40'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B')],
          },
        },
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.review).toHaveLength(1);
    expect(result.expenses.some((e) => e.category === '✅')).toBe(false);
  });
});

describe('mapSplitwiseImport — multi-payer, mode "split"', () => {
  it('splits a 60/40-paid expense with owed 30/30/40 into two exact legs', () => {
    const input = groupInput(
      [
        baseExp({
          id: 20,
          cost: '100',
          users: [
            eu(2, 'Alice', 'A', '60', '30'),
            eu(3, 'Bob', 'B', '40', '30'),
            eu(4, 'Charlie', 'C', '0', '40'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B'), su(4, 'Charlie', 'C')],
          },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_20_p2', 'sw_20_p3']);

    const leg1 = result.expenses[0];
    const leg2 = result.expenses[1];
    expect(leg1.amt).toBe(60);
    expect(leg2.amt).toBe(40);

    const sum = (shares: Record<string, number> | undefined) => Object.values(shares || {}).reduce((a, b) => a + b, 0);
    expect(Math.round(sum(leg1.shares) * 100) / 100).toBe(60);
    expect(Math.round(sum(leg2.shares) * 100) / 100).toBe(40);

    // Each person's total owed across legs must equal their original owed_share exactly.
    const totalFor = (name: string) => (leg1.shares?.[name] || 0) + (leg2.shares?.[name] || 0);
    expect(Math.round(totalFor('Alice A') * 100) / 100).toBe(30);
    expect(Math.round(totalFor('Bob B') * 100) / 100).toBe(30);
    expect(Math.round(totalFor('Charlie C') * 100) / 100).toBe(40);

    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('distributes 100/3-style rounding across legs and people with exact cent sums (largest remainder)', () => {
    const input = groupInput(
      [
        baseExp({
          id: 42,
          cost: '100',
          users: [
            eu(8, 'Payer', 'One', '50', '0'),
            eu(9, 'Payer', 'Two', '50', '0'),
            eu(5, 'Ann', 'Lee', '0', '33.33'),
            eu(6, 'Bob', 'Lee', '0', '33.33'),
            eu(7, 'Cara', 'Lee', '0', '33.34'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [
              su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL),
              su(8, 'Payer', 'One'),
              su(9, 'Payer', 'Two'),
              su(5, 'Ann', 'Lee'),
              su(6, 'Bob', 'Lee'),
              su(7, 'Cara', 'Lee'),
            ],
          },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_42_p8', 'sw_42_p9']);
    const [leg1, leg2] = result.expenses;

    expect(leg1.amt).toBe(50);
    expect(leg2.amt).toBe(50);
    const legSum = (e: typeof leg1) => Object.values(e.shares || {}).reduce((a, b) => a + b, 0);
    expect(Math.round(legSum(leg1) * 100) / 100).toBe(50);
    expect(Math.round(legSum(leg2) * 100) / 100).toBe(50);

    const totalFor = (name: string) => Math.round(((leg1.shares?.[name] || 0) + (leg2.shares?.[name] || 0)) * 100) / 100;
    expect(totalFor('Ann Lee')).toBe(33.33);
    expect(totalFor('Bob Lee')).toBe(33.33);
    expect(totalFor('Cara Lee')).toBe(33.34);

    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('routes to review instead of emitting broken legs when payments do not sum to the cost', () => {
    const input = groupInput(
      [
        baseExp({
          id: 30,
          cost: '100',
          users: [
            eu(2, 'Alice', 'A', '50', '50'),
            eu(3, 'Bob', 'B', '60', '50'), // payments sum to 110, not 100
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B')] },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.warnings.some((w) => /payments sum to 110 but the cost is 100/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /routed to review instead/i.test(w))).toBe(true);
    // No split legs (sw_30_p2 / sw_30_p3) — a single review-shaped expense instead.
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_30']);
    expect(result.review).toHaveLength(1);
    // shares must still sum exactly to amt (100 = 50 + 50).
    const exp = result.expenses[0];
    const shareSum = Object.values(exp.shares || {}).reduce((a, b) => a + b, 0);
    expect(Math.round(shareSum * 100) / 100).toBe(exp.amt);
  });

  it('handles 3+ payers with an uneven split (no drift)', () => {
    const input = groupInput(
      [
        baseExp({
          id: 31,
          cost: '90',
          users: [
            eu(2, 'Alice', 'A', '30', '10'),
            eu(3, 'Bob', 'B', '30', '40'),
            eu(4, 'Charlie', 'C', '30', '40'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B'), su(4, 'Charlie', 'C')],
          },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_31_p2', 'sw_31_p3', 'sw_31_p4']);
    result.expenses.forEach((leg) => {
      const sum = Object.values(leg.shares || {}).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100) / 100).toBe(leg.amt);
    });
    const totalFor = (name: string) =>
      Math.round(result.expenses.reduce((a, e) => a + (e.shares?.[name] || 0), 0) * 100) / 100;
    expect(totalFor('Alice A')).toBe(10);
    expect(totalFor('Bob B')).toBe(40);
    expect(totalFor('Charlie C')).toBe(40);
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('reproduces the reported cost-0.15 4-payer/4-person case exactly (regression)', () => {
    // Minimal failing case from the property-test review: cost 0.15; paid/owed
    // Anna .05/.04, Bert .02/.05, Cleo .02/.04, Dave .06/.02. The old greedy-only
    // allocator left Cleo's leg short by a cent and off by a cent overall.
    const input = groupInput(
      [
        baseExp({
          id: 99,
          cost: '0.15',
          users: [
            eu(2, 'Anna', 'Z', '0.05', '0.04'),
            eu(3, 'Bert', 'Z', '0.02', '0.05'),
            eu(4, 'Cleo', 'Z', '0.02', '0.04'),
            eu(5, 'Dave', 'Z', '0.06', '0.02'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [
              su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL),
              su(2, 'Anna', 'Z'),
              su(3, 'Bert', 'Z'),
              su(4, 'Cleo', 'Z'),
              su(5, 'Dave', 'Z'),
            ],
          },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_99_p2', 'sw_99_p3', 'sw_99_p4', 'sw_99_p5']);
    result.expenses.forEach((leg) => {
      const sum = Object.values(leg.shares || {}).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 10000) / 10000).toBe(leg.amt);
    });
    const totalFor = (name: string) =>
      Math.round(result.expenses.reduce((a, e) => a + (e.shares?.[name] || 0), 0) * 10000) / 10000;
    expect(totalFor('Anna Z')).toBe(0.04);
    expect(totalFor('Bert Z')).toBe(0.05);
    expect(totalFor('Cleo Z')).toBe(0.04);
    expect(totalFor('Dave Z')).toBe(0.02);
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });
});

describe('allocateGrid — exact two-way rounding', () => {
  it('reproduces the reported cost-0.15 failure and now balances both legs and people exactly (regression)', () => {
    const names = ['Anna', 'Bert', 'Cleo', 'Dave'];
    const owedCents = [4, 5, 4, 2]; // rows: Anna, Bert, Cleo, Dave
    const paidCents = [5, 2, 2, 6]; // cols: Anna-leg, Bert-leg, Cleo-leg, Dave-leg
    const costCents = 15;
    const raw = owedCents.map((owed) => paidCents.map((paid) => (owed * paid) / costCents));

    const result = allocateGrid(raw, owedCents, paidCents, names);
    expect(result.ok).toBe(true);
    paidCents.forEach((total, c) => {
      const colSum = result.grid.reduce((a, row) => a + row[c], 0);
      expect(colSum).toBe(total);
    });
    owedCents.forEach((total, r) => {
      const rowSum = result.grid[r].reduce((a, b) => a + b, 0);
      expect(rowSum).toBe(total);
    });
  });

  it(
    'property: random row/col margins always balance exactly (20k cases, seeded)',
    () => {
      const rng = mulberry32(20260929);
      const CASES = 20000;
      // Cache one names array per distinct person-count instead of
      // allocating a fresh one every iteration.
      const namesByCount = new Map<number, string[]>();
      const namesFor = (n: number): string[] => {
        let arr = namesByCount.get(n);
        if (!arr) {
          arr = Array.from({ length: n }, (_, idx) => `P${idx}`);
          namesByCount.set(n, arr);
        }
        return arr;
      };

      // Collect failures instead of calling `expect` per-case/per-cell (tens
      // of thousands of `expect` calls dominates the runtime with stack-trace
      // capture overhead) — one assertion at the end keeps this fast.
      const failures: string[] = [];
      for (let i = 0; i < CASES; i++) {
        const nPayers = 2 + Math.floor(rng() * 3); // 2..4
        const nPeople = 2 + Math.floor(rng() * 5); // 2..6
        const minRequired = nPayers + nPeople; // so every part can be >= 1 cent
        const small = rng() < 0.3;
        const costCents = minRequired + Math.floor(rng() * ((small ? 1000 : 10_000_000) - minRequired));

        const paidCents = randomPartition(rng, costCents, nPayers);
        const owedCents = randomPartition(rng, costCents, nPeople);
        const names = namesFor(nPeople);
        const raw = owedCents.map((owed) => paidCents.map((paid) => (owed * paid) / costCents));

        const result = allocateGrid(raw, owedCents, paidCents, names);
        if (!result.ok) {
          failures.push(`case ${i}: allocateGrid reported ok=false`);
          continue;
        }
        for (let c = 0; c < nPayers; c++) {
          let colSum = 0;
          for (let r = 0; r < nPeople; r++) colSum += result.grid[r][c];
          if (colSum !== paidCents[c]) failures.push(`case ${i}: leg ${c} sums to ${colSum}, expected ${paidCents[c]}`);
        }
        for (let r = 0; r < nPeople; r++) {
          let rowSum = 0;
          for (let c = 0; c < nPayers; c++) rowSum += result.grid[r][c];
          if (rowSum !== owedCents[r]) failures.push(`case ${i}: person ${r} totals ${rowSum}, expected ${owedCents[r]}`);
        }
      }
      expect(failures).toEqual([]);
    },
    15000
  );
});

describe('mapSplitwiseImport — multi-payer, mode "review"', () => {
  it('produces one review-flagged expense with the largest payer credited and a marked note', () => {
    const input = groupInput(
      [
        baseExp({
          id: 42,
          cost: '100',
          users: [
            eu(8, 'Payer', 'One', '50', '0'),
            eu(9, 'Payer', 'Two', '50', '0'),
            eu(5, 'Ann', 'Lee', '0', '33.33'),
            eu(6, 'Bob', 'Lee', '0', '33.33'),
            eu(7, 'Cara', 'Lee', '0', '33.34'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: {
            id: 100,
            name: 'Trip',
            members: [
              su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL),
              su(8, 'Payer', 'One'),
              su(9, 'Payer', 'Two'),
              su(5, 'Ann', 'Lee'),
              su(6, 'Bob', 'Lee'),
              su(7, 'Cara', 'Lee'),
            ],
          },
        },
        multiPayer: 'review',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_42']);
    const exp = result.expenses[0];
    expect(exp.amt).toBe(100);
    // Tie on paid amount (50 == 50) -> alphabetical: "Payer One" < "Payer Two".
    expect(exp.paid).toBe('Payer One');
    expect(exp.shares).toEqual({ 'Ann Lee': 33.33, 'Bob Lee': 33.33, 'Cara Lee': 33.34 });
    expect(exp.notes).toContain(SPLITWISE_REVIEW_NOTES_MARKER);
    expect(exp.notes).toContain('Payer One paid 50');
    expect(exp.notes).toContain('Payer Two paid 50');

    expect(result.review).toHaveLength(1);
    expect(result.review[0]).toMatchObject({ id: 'sw_42', amount: 100, currency: '₹' });
    expect(result.review[0].payers.map((p) => p.name).sort()).toEqual(['Payer One', 'Payer Two']);
  });

  it('review mode records the same per-person owed totals as split mode', () => {
    const rawExpenses = [
      baseExp({
        id: 42,
        cost: '100',
        users: [
          eu(8, 'Payer', 'One', '50', '0'),
          eu(9, 'Payer', 'Two', '50', '0'),
          eu(5, 'Ann', 'Lee', '0', '33.33'),
          eu(6, 'Bob', 'Lee', '0', '33.33'),
          eu(7, 'Cara', 'Lee', '0', '33.34'),
        ],
      }),
    ];
    const rawGroup = {
      id: 100,
      name: 'Trip',
      members: [
        su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL),
        su(8, 'Payer', 'One'),
        su(9, 'Payer', 'Two'),
        su(5, 'Ann', 'Lee'),
        su(6, 'Bob', 'Lee'),
        su(7, 'Cara', 'Lee'),
      ],
    };

    const splitResult = mapSplitwiseImport(groupInput(rawExpenses, { target: { kind: 'group', rawGroup }, multiPayer: 'split' }));
    const reviewResult = mapSplitwiseImport(groupInput(rawExpenses, { target: { kind: 'group', rawGroup }, multiPayer: 'review' }));

    const splitTotal = (name: string) =>
      Math.round(splitResult.expenses.reduce((a, e) => a + (e.shares?.[name] || 0), 0) * 100) / 100;
    const reviewTotal = (name: string) => reviewResult.expenses[0].shares?.[name] || 0;

    ['Ann Lee', 'Bob Lee', 'Cara Lee'].forEach((name) => {
      expect(splitTotal(name)).toBe(reviewTotal(name));
    });
  });
});

describe('mapSplitwiseImport — net-balance verification', () => {
  it('warns when a mapped expense cannot reproduce the raw paid/owed net (drift)', () => {
    const input = groupInput([
      baseExp({
        id: 7,
        cost: '100',
        users: [
          // Paid only 80 of a 100 cost — inconsistent raw data.
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '80', '40', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '60'),
        ],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.warnings.some((w) => /payments sum to 80 but the cost is 100/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /mismatch/i.test(w) && w.includes(ME_NAME))).toBe(true);
  });

  it('does not flag a mismatch for a well-formed regular expense', () => {
    const input = groupInput([
      baseExp({
        id: 1,
        cost: '100',
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '40', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '60')],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('catches an exact 1-cent drift deterministically (integer-cent comparison, not a 0.01 float tolerance)', () => {
    // paid=99.99 vs cost=100.00 is EXACTLY 1 cent off — a `> 0.01` float
    // tolerance check would not fire here (0.01 is not > 0.01), so this
    // regresses the switch to exact integer-cent comparison.
    const input = groupInput([
      baseExp({
        id: 1,
        cost: '100',
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '99.99', '40', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '60')],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.warnings.some((w) => /payments sum to 99.99 but the cost is 100/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /mismatch/i.test(w) && w.includes(ME_NAME))).toBe(true);
  });

  it('review mode still checks the owed side against the raw owed amounts (only the payer credit is excused)', () => {
    // Multi-payer, requested in 'review' mode: Bob is NOT the main payer (tie
    // loses to Alice alphabetically) but still genuinely owes 30 — that debit
    // must still show up in memberNetBalances, it's only the payer/credit
    // side of the mapping that's a deliberate approximation.
    const input = groupInput(
      [
        baseExp({
          id: 50,
          cost: '100',
          users: [
            eu(2, 'Alice', 'A', '50', '70'),
            eu(3, 'Bob', 'B', '50', '30'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B')] },
        },
        multiPayer: 'review',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses[0].shares).toEqual({ 'Alice A': 70, 'Bob B': 30 });
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });
});

describe('mapSplitwiseImport — owed vs cost validation', () => {
  it('routes a single-payer expense to review when owed shares do not sum to the cost', () => {
    const input = groupInput([
      baseExp({
        id: 60,
        cost: '100',
        users: [
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '30', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '30'), // owed sums to 60, not 100
        ],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.warnings.some((w) => /owed shares sum to 60 but the cost is 100/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /routed to review/i.test(w))).toBe(true);
    expect(result.expenses).toHaveLength(1);
    const exp = result.expenses[0];
    expect(exp.id).toBe('sw_60');
    // amt MUST equal the shares' own total, never the (disputed) raw cost.
    expect(exp.amt).toBe(60);
    expect(exp.shares).toEqual({ [ME_NAME]: 30, 'Bob Smith': 30 });
    expect(result.review).toHaveLength(1);
    expect(result.review[0].amount).toBe(100); // original reported cost, preserved for reconciliation
  });

  it('routes a 2-payer 50/50 expense to review (not split legs) when owed shares do not sum to the cost', () => {
    const input = groupInput(
      [
        baseExp({
          id: 61,
          cost: '100',
          users: [
            eu(2, 'Alice', 'A', '50', '30'),
            eu(3, 'Bob', 'B', '50', '30'), // owed sums to 60, not 100 (paid sums to 100, matching cost)
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B')] },
        },
        multiPayer: 'split',
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses.map((e) => e.id)).toEqual(['sw_61']); // no _p2/_p3 legs
    const exp = result.expenses[0];
    expect(exp.amt).toBe(60);
    expect(exp.shares).toEqual({ 'Alice A': 30, 'Bob B': 30 });
    expect(result.review).toHaveLength(1);
  });
});

describe('mapSplitwiseImport — all owed_share = 0', () => {
  it('skips a non-zero-cost expense where every participant owes 0 (single payer)', () => {
    const input = groupInput([
      baseExp({
        id: 70,
        cost: '50',
        users: [
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '50', '0', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '0'),
        ],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.expenses).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.warnings.some((w) => /owed_share is 0/i.test(w))).toBe(true);
    expect(noMismatchWarnings(result.warnings)).toHaveLength(0);
  });

  it('skips a non-zero-cost expense where every participant owes 0 (multi-payer)', () => {
    const input = groupInput(
      [
        baseExp({
          id: 71,
          cost: '50',
          users: [
            eu(2, 'Alice', 'A', '25', '0'),
            eu(3, 'Bob', 'B', '25', '0'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'Alice', 'A'), su(3, 'Bob', 'B')] },
        },
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.expenses).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.warnings.some((w) => /owed_share is 0/i.test(w))).toBe(true);
  });
});

describe('mapSplitwiseImport — roster / identity', () => {
  it('always puts me at roster index 0, regardless of raw member order', () => {
    const input = groupInput(
      [baseExp({ id: 1, users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50')] })],
      { target: { kind: 'group', rawGroup: { id: 100, name: 'Trip', members: [su(2, 'Bob', 'Smith'), su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL)] } } }
    );
    const result = mapSplitwiseImport(input);
    expect(result.group?.members[0]).toBe(ME_NAME);
    expect(result.group?.memberIdentities?.[ME_NAME]).toBe(ME_EMAIL.toLowerCase());
    // Other members are name-only — no email captured in memberIdentities.
    expect(result.group?.memberIdentities?.['Bob Smith']).toBeUndefined();
  });

  it('title-cases ALL-CAPS Splitwise names', () => {
    const input = groupInput(
      [baseExp({ id: 1, users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'JOHN', 'SMITH', '0', '50')] })],
      { target: { kind: 'group', rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'JOHN', 'SMITH')] } } }
    );
    const result = mapSplitwiseImport(input);
    expect(result.group?.members).toContain('John Smith');
  });

  it('deterministically suffixes and warns on a duplicate display name', () => {
    const input = groupInput(
      [
        baseExp({
          id: 1,
          users: [
            eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '0', ME_EMAIL),
            eu(2, 'John', 'Smith', '0', '50'),
            eu(3, 'JOHN', 'SMITH', '0', '50'),
          ],
        }),
      ],
      {
        target: {
          kind: 'group',
          rawGroup: { id: 100, name: 'Trip', members: [su(CURRENT_USER_ID, 'Chirag', 'Gupta', ME_EMAIL), su(2, 'John', 'Smith'), su(3, 'JOHN', 'SMITH')] },
        },
      }
    );
    const result = mapSplitwiseImport(input);
    expect(result.group?.members).toEqual(expect.arrayContaining(['John Smith', 'John Smith (2)']));
    expect(result.warnings.some((w) => /Duplicate name/i.test(w))).toBe(true);
  });
});

describe('mapSplitwiseImport — group id handling', () => {
  it('reuses an existingGroupId instead of minting a new one', () => {
    const result = mapSplitwiseImport(groupInput([], { existingGroupId: 'existing-123' }));
    expect(result.group?.id).toBe('existing-123');
  });

  it('uses idFactory when no existingGroupId is given', () => {
    const result = mapSplitwiseImport(groupInput([], { idFactory: () => 'generated-id' }));
    expect(result.group?.id).toBe('generated-id');
  });
});

describe('mapSplitwiseImport — friends (non-group) target', () => {
  it('returns no group, uses gId STANDALONE, and always includes me in splitters', () => {
    const input = friendsInput([
      baseExp({
        id: 1,
        cost: '100',
        // Bob covers the whole thing; my owed_share is 0.
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '0', '0', ME_EMAIL), eu(2, 'Bob', 'Smith', '100', '100')],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.group).toBeUndefined();
    expect(result.expenses[0].gId).toBe('STANDALONE');
    expect(result.expenses[0].splitters).toEqual(expect.arrayContaining([ME_NAME, 'Bob Smith']));
    expect(result.expenses[0].shares?.[ME_NAME]).toBe(0);
  });

  it('sets otherEmail only when the raw expense has exactly 2 participants', () => {
    const twoPerson = friendsInput([
      baseExp({
        id: 1,
        cost: '100',
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50', 'bob@example.com')],
      }),
    ]);
    const twoPersonResult = mapSplitwiseImport(twoPerson);
    expect(twoPersonResult.expenses[0].otherEmail).toBe('bob@example.com');

    const threePerson = friendsInput([
      baseExp({
        id: 2,
        cost: '90',
        users: [
          eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '90', '30', ME_EMAIL),
          eu(2, 'Bob', 'Smith', '0', '30', 'bob@example.com'),
          eu(3, 'Cara', 'Lee', '0', '30', 'cara@example.com'),
        ],
      }),
    ]);
    const threePersonResult = mapSplitwiseImport(threePerson);
    expect(threePersonResult.expenses[0].otherEmail).toBeUndefined();
  });

  it('never sets otherEmail for a group target, even with exactly 2 participants', () => {
    const input = groupInput([
      baseExp({
        id: 1,
        cost: '100',
        users: [eu(CURRENT_USER_ID, 'Chirag', 'Gupta', '100', '50', ME_EMAIL), eu(2, 'Bob', 'Smith', '0', '50', 'bob@example.com')],
      }),
    ]);
    const result = mapSplitwiseImport(input);
    expect(result.expenses[0].otherEmail).toBeUndefined();
  });
});
