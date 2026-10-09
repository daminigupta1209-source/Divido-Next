import React, { useState } from 'react';
import { buildUpiLink } from '../lib/upi';

// TEMPORARY diagnostic: UPI apps (GPay, Amazon Pay) decline our upi:// links to a
// personal UPI ID with "exceeded bank limit". This panel fires a few link
// variants so we can see on a real phone whether any of them gets through.
// Hidden unless enabled via ?upitest=1 (see lib/upiTestFlag.ts).
// Delete this file, lib/upiTestFlag.ts and the use in NetPayableModal once the
// experiment is done.

interface Variant {
  id: string;
  label: string;
  build: (pa: string, pn: string, am: string) => string;
}

const VARIANTS: Variant[] = [
  { id: 'A', label: 'Current link (amount + note)', build: (pa, pn, am) => buildUpiLink({ pa, pn, am, tn: 'Divido Settle' }) },
  { id: 'B', label: 'No amount (type it in the app)', build: (pa, pn) => buildUpiLink({ pa, pn }) },
  { id: 'C', label: 'UPI ID only', build: (pa) => buildUpiLink({ pa }) },
  { id: 'D', label: 'Amount, no note', build: (pa, pn, am) => buildUpiLink({ pa, pn, am }) },
  { id: 'E', label: 'As QR scan (mode=01)', build: (pa, pn, am) => `${buildUpiLink({ pa, pn, am })}&mode=01&purpose=00` },
  { id: 'F', label: 'No amount, as QR scan (mode=01)', build: (pa, pn) => `${buildUpiLink({ pa, pn })}&mode=01&purpose=00` },
  { id: 'G', label: 'GPay-only scheme (tez://)', build: (pa, pn, am) => buildUpiLink({ pa, pn, am }).replace('upi://pay', 'tez://upi/pay') },
  { id: 'H', label: 'GPay-only scheme, no amount', build: (pa, pn) => buildUpiLink({ pa, pn }).replace('upi://pay', 'tez://upi/pay') },
];

export const UpiLinkTestPanel: React.FC<{ upiId: string; payeeName: string }> = ({ upiId, payeeName }) => {
  const [amount, setAmount] = useState('1.00');
  const [last, setLast] = useState<string | null>(null);
  const am = (parseFloat(amount) || 1).toFixed(2);

  return (
    <div style={{ border: '1.5px dashed #F59E0B', background: '#FFFBEB', borderRadius: '14px', padding: '10px 12px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E' }}>
        UPI link test — tap each, note which ones reach the PIN screen
      </div>
      <label style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Test amount ₹
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          style={{ width: '70px', padding: '4px 6px', fontSize: '12px', borderRadius: '8px', border: '1px solid #FCD34D' }}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            className="press-anim"
            onClick={() => {
              setLast(v.id);
              window.location.href = v.build(upiId.trim(), payeeName, am);
            }}
            style={{ textAlign: 'left', padding: '8px 10px', fontSize: '11.5px', fontWeight: 600, borderRadius: '10px', border: '1px solid #FCD34D', background: last === v.id ? '#FEF3C7' : 'white', color: '#78350F', cursor: 'pointer' }}
          >
            <strong>{v.id}</strong> · {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};
