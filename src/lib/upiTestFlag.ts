// TEMPORARY: toggle for the UPI link test panel (components/UpiLinkTestPanel.tsx).
// Opening the app once with ?upitest=1 turns it on, ?upitest=0 turns it off.
// Delete together with the panel once the experiment is done.

const FLAG_KEY = 'divido_upi_test';

// Capture the URL toggle at module load, before any routing rewrites the URL.
try {
  const p = new URLSearchParams(window.location.search).get('upitest');
  if (p === '1') localStorage.setItem(FLAG_KEY, '1');
  if (p === '0') localStorage.removeItem(FLAG_KEY);
} catch {
  /* storage unavailable — panel just stays hidden */
}

export const isUpiTestEnabled = (): boolean => {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
};
