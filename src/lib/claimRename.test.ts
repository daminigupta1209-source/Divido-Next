import { describe, it, expect } from 'vitest';
import { computeClaimRenamePatches, ClaimRenameExpenseRow } from './claimRename';

describe('computeClaimRenamePatches', () => {
  it('renames the payer when it matches the old name', () => {
    const rows: ClaimRenameExpenseRow[] = [
      { id: 1, paid: 'Guest 1', splitters: ['Guest 1', 'Ram'], shares: undefined },
    ];
    const out = computeClaimRenamePatches(rows, 'Guest 1', 'Priya');
    expect(out).toEqual([
      { id: 1, paid: 'Priya', splitters: ['Priya', 'Ram'], shares: undefined },
    ]);
  });

  it('renames matching entries in splitters', () => {
    const rows: ClaimRenameExpenseRow[] = [
      { id: 1, paid: 'Ram', splitters: ['Ram', 'Guest 1', 'Guest 1'] },
    ];
    const out = computeClaimRenamePatches(rows, 'Guest 1', 'Priya');
    expect(out).toEqual([
      { id: 1, paid: 'Ram', splitters: ['Ram', 'Priya', 'Priya'], shares: undefined },
    ]);
  });

  it('rekeys shares, preserving values and key order', () => {
    const rows: ClaimRenameExpenseRow[] = [
      { id: 1, paid: 'Ram', splitters: ['Ram', 'Guest 1'], shares: { Ram: 50, 'Guest 1': 50 } },
    ];
    const out = computeClaimRenamePatches(rows, 'Guest 1', 'Priya');
    expect(out).toEqual([
      { id: 1, paid: 'Ram', splitters: ['Ram', 'Priya'], shares: { Ram: 50, Priya: 50 } },
    ]);
    // Key order preserved: 'Ram' still first, 'Priya' still second.
    expect(Object.keys(out[0].shares as Record<string, number>)).toEqual(['Ram', 'Priya']);
  });

  it('excludes rows with no occurrence of the old name', () => {
    const rows: ClaimRenameExpenseRow[] = [
      { id: 1, paid: 'Ram', splitters: ['Ram', 'Shyam'], shares: { Ram: 50, Shyam: 50 } },
    ];
    expect(computeClaimRenamePatches(rows, 'Guest 1', 'Priya')).toEqual([]);
  });

  it('leaves a non-array splitters value untouched', () => {
    const rows: ClaimRenameExpenseRow[] = [
      // Legacy/bad data: splitters is not an array. Rename must still fire on
      // `paid`, but `splitters` must pass through unmodified (not coerced).
      { id: 1, paid: 'Guest 1', splitters: null as unknown },
    ];
    const out = computeClaimRenamePatches(rows, 'Guest 1', 'Priya');
    expect(out).toEqual([{ id: 1, paid: 'Priya', splitters: null, shares: undefined }]);
  });

  it('leaves missing or null shares as-is', () => {
    const rowMissing: ClaimRenameExpenseRow = { id: 1, paid: 'Guest 1', splitters: [] };
    const rowNull: ClaimRenameExpenseRow = { id: 2, paid: 'Guest 1', splitters: [], shares: null };
    const out = computeClaimRenamePatches([rowMissing, rowNull], 'Guest 1', 'Priya');
    expect(out).toEqual([
      { id: 1, paid: 'Priya', splitters: [], shares: undefined },
      { id: 2, paid: 'Priya', splitters: [], shares: null },
    ]);
  });

  it('returns an empty array when old and new names are the same', () => {
    const rows: ClaimRenameExpenseRow[] = [
      { id: 1, paid: 'Guest 1', splitters: ['Guest 1'], shares: { 'Guest 1': 100 } },
    ];
    expect(computeClaimRenamePatches(rows, 'Guest 1', 'Guest 1')).toEqual([]);
  });
});
