import { describe, it, expect } from 'vitest';
import { buildUpiLink } from './upi';

describe('buildUpiLink', () => {
  it('encodes name and note, keeps @ literal, formats amount', () => {
    expect(buildUpiLink({ pa: ' rahul.k@okaxis ', pn: 'Rahul K', am: 250, tn: 'Divido Settle ($3.00)' })).toBe(
      'upi://pay?pa=rahul.k@okaxis&pn=Rahul%20K&am=250.00&cu=INR&tn=Divido%20Settle%20(%243.00)'
    );
  });

  it('passes a preformatted string amount through', () => {
    expect(buildUpiLink({ pa: 'a@ybl', am: '99.50' })).toBe('upi://pay?pa=a@ybl&am=99.50&cu=INR');
  });

  it('omits amount and currency when no amount is given', () => {
    expect(buildUpiLink({ pa: 'a@ybl', pn: 'A' })).toBe('upi://pay?pa=a@ybl&pn=A');
  });
});
