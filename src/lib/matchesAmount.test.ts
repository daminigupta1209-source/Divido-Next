import { describe, it, expect } from 'vitest';
import { matchesAmount } from './utils';

describe('matchesAmount', () => {
  const amts: Array<[string, number]> = [['₹', -1200.5], ['$', 45]];
  it('matches plain, comma, currency and decimal forms', () => {
    expect(matchesAmount('1200', amts)).toBe(true);
    expect(matchesAmount('1,200', amts)).toBe(true);
    expect(matchesAmount('₹1,200.50', amts)).toBe(true);
    expect(matchesAmount('$45', amts)).toBe(true);
  });
  it('ignores text and non-matching numbers', () => {
    expect(matchesAmount('goa', amts)).toBe(false);
    expect(matchesAmount('999', amts)).toBe(false);
    expect(matchesAmount('', amts)).toBe(false);
  });
});
