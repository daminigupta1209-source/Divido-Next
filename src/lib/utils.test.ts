import { describe, it, expect } from 'vitest';
import { formatCompactAmount } from './utils';

describe('formatCompactAmount', () => {
  it('abbreviates amounts of 10K and up with K/M/B regardless of system locale', () => {
    expect(formatCompactAmount(75000)).toBe('75K');
    expect(formatCompactAmount(233333)).toBe('233.3K');
    expect(formatCompactAmount(1500000)).toBe('1.5M');
    expect(formatCompactAmount(450000000)).toBe('450M');
    expect(formatCompactAmount(900000000)).toBe('900M');
    expect(formatCompactAmount(10000)).toBe('10K');
  });

  it('keeps values under 10,000 in full with grouping', () => {
    expect(formatCompactAmount(9999)).toBe('9,999');
    expect(formatCompactAmount(1500)).toBe('1,500');
    expect(formatCompactAmount(23)).toBe('23');
    expect(formatCompactAmount(0)).toBe('0');
  });

  it('uses the magnitude (absolute value) of negative balances', () => {
    expect(formatCompactAmount(-1500000)).toBe('1.5M');
    expect(formatCompactAmount(-4200)).toBe('4,200');
  });
});
