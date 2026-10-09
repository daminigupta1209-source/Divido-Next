// Single place that builds `upi://pay` links so every param is URL-encoded the
// same way. A malformed URI (raw spaces, unescaped VPA chars) makes PSP apps
// like GPay fail with a generic "limit exceeded" error.
export function buildUpiLink(opts: { pa: string; pn?: string; am?: number | string; tn?: string }): string {
  // '@' is legal in a query string; keep it literal since some UPI apps don't decode %40.
  const parts = [`pa=${encodeURIComponent(opts.pa.trim()).replace(/%40/g, '@')}`];
  if (opts.pn) parts.push(`pn=${encodeURIComponent(opts.pn)}`);
  if (opts.am !== undefined && opts.am !== '') {
    const am = typeof opts.am === 'number' ? opts.am.toFixed(2) : opts.am;
    parts.push(`am=${am}`, 'cu=INR');
  }
  if (opts.tn) parts.push(`tn=${encodeURIComponent(opts.tn)}`);
  return `upi://pay?${parts.join('&')}`;
}
