import { describe, it, expect } from 'vitest';
import { computeNonGroupPeople, makeIsMe } from './nonGroupPeople';
import { Expense } from './types';

const mkExp = (o: Partial<Expense>): Expense =>
  ({ id: 'e', gId: 'STANDALONE', title: 't', amt: 0, paid: '', date: '2026-01-01', mode: 'Equally', splitters: [], ...o } as unknown as Expense);

describe('computeNonGroupPeople (self-only expenses)', () => {
  it('returns [] when the only STANDALONE expense is self-only', () => {
    const exps = [mkExp({ paid: 'Chirag', splitters: ['Chirag'] })];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), () => ({}));
    expect(out).toEqual([]);
  });

  it('returns exactly one entry (Rahul) when a self-only expense is mixed with a Chirag/Rahul expense', () => {
    const exps = [
      mkExp({ id: 'self', paid: 'Chirag', splitters: ['Chirag'] }),
      mkExp({ id: 'shared', paid: 'Chirag', splitters: ['Chirag', 'Rahul'] }),
    ];
    const out = computeNonGroupPeople(exps, [], makeIsMe('Chirag'), () => ({}));
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Rahul');
  });
});
