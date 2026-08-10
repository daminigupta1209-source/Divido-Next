import React, { useState, useEffect } from 'react';
import { escManager } from '../lib/escManager';
import { toCurrencyCode } from '../lib/utils';

interface NetPayableModalProps {
  popupData: { friendName: string; amt: number; curr: string } | null;
  onClose: () => void;
  me: string;
  userMetadata: Record<string, any>;
  setUserMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onFinalSettle: () => void;
}

export const NetPayableModal: React.FC<NetPayableModalProps> = ({
  popupData,
  onClose,
  me,
  userMetadata,
  setUserMetadata,
  onFinalSettle,
}) => {
  const [payPopupUpi, setPayPopupUpi] = useState('');
  const [payPopupEditing, setPayPopupEditing] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesError, setRatesError] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  // The user's own primary currency: explicit profile default, else browser locale, else ₹.
  const getPrimaryCurrency = (): string => {
    const profileDefault = userMetadata[me]?.defaultCurrency;
    if (profileDefault) return profileDefault;
    try {
      const locale = Intl.NumberFormat().resolvedOptions().locale;
      if (locale.includes('IN')) return '₹';
      if (locale.includes('US')) return '$';
      if (locale.includes('GB')) return '£';
      if (locale.includes('FR') || locale.includes('DE') || locale.includes('ES') || locale.includes('IT')) return '€';
    } catch {
      /* ignore */
    }
    return '₹';
  };

  const primaryCurrency = getPrimaryCurrency();
  const primaryIsINR = toCurrencyCode(primaryCurrency) === 'INR';
  const debtIsINR = popupData ? toCurrencyCode(popupData.curr) === 'INR' : false;

  // Convert the (possibly foreign) debt into an INR amount for the UPI rail.
  // Rates are fetched with INR as the base, so rates[CODE] = units of CODE per 1 INR.
  const debtCode = popupData ? toCurrencyCode(popupData.curr) : 'INR';
  const inrRate = rates[debtCode]; // foreign units per 1 INR
  const inrEquivalent = popupData
    ? debtIsINR
      ? popupData.amt
      : inrRate
      ? popupData.amt / inrRate
      : null
    : null;

  // UPI is an INR-only rail. Offer it only when the payer's primary currency is INR.
  const canPayViaUpi = (debtIsINR || inrEquivalent !== null);

  useEffect(() => {
    if (popupData) {
      const existingUpi = userMetadata[popupData.friendName]?.upiId || '';
      setPayPopupUpi(existingUpi);
      setPayPopupEditing(!existingUpi);
      setAwaitingConfirm(false);
    }
  }, [popupData, userMetadata]);

  // Fetch live INR-based rates whenever a non-INR debt popup opens.
  useEffect(() => {
    if (!popupData || debtIsINR) return;
    let cancelled = false;
    setRatesError(false);
    (async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/INR');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && data.rates) {
            setRates(data.rates);
            return;
          }
        }
        if (!cancelled) setRatesError(true);
      } catch {
        if (!cancelled) setRatesError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [popupData, debtIsINR]);

  useEffect(() => {
    if (!popupData) return;
    const unregister = escManager.register(() => {
      onClose();
    });
    return unregister;
  }, [popupData, onClose]);

  if (!popupData) return null;

  const inrDisplay =
    inrEquivalent !== null
      ? `₹${inrEquivalent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="card shadow-xl"
        style={{
          width: '340px',
          padding: '20px',
          position: 'relative',
          background: 'var(--w)',
          textAlign: 'center',
          animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            cursor: 'pointer',
            fontSize: '20px',
            opacity: 0.3,
            transition: '0.2s all',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
        >
          ✕
        </div>

        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--g)', margin: '2px 0 4px' }}>
          Paying <strong style={{ color: 'var(--accent)', fontSize: '18px' }}>{popupData.curr}{popupData.amt.toFixed(2)}</strong> to {popupData.friendName}
        </p>
        {/* Cross-currency equivalent line */}
        {!debtIsINR && (
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--g)', margin: '0 0 14px', opacity: 0.85 }}>
            {inrDisplay ? (
              <>≈ <strong style={{ color: 'var(--t)' }}>{inrDisplay}</strong> via UPI</>
            ) : ratesError ? (
              <span style={{ color: '#B91C1C' }}>Live rate unavailable — settle offline</span>
            ) : (
              'Fetching live rate…'
            )}
          </p>
        )}
        {debtIsINR && <div style={{ height: '10px' }} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Non-INR payer: UPI can't be used at all. */}
          {!canPayViaUpi ? (
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--g)', background: 'var(--bg)', padding: '12px', borderRadius: '16px', lineHeight: 1.5 }}>
              UPI only supports ₹. Pay {popupData.friendName} {popupData.curr}{popupData.amt.toFixed(2)} using your usual method, then record it below.
            </div>
          ) : (
            <>
              {payPopupEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg)', padding: '12px', borderRadius: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase' }}>
                    Link {popupData.friendName}'s UPI ID
                  </label>
                  <style>{`
                    #payee-upi-input::placeholder { color: #CBD5E1; font-weight: 600; }
                    #payee-upi-input:-webkit-autofill,
                    #payee-upi-input:-webkit-autofill:focus {
                      -webkit-text-fill-color: #94A3B8;
                      -webkit-box-shadow: 0 0 0 1000px #FAFAFA inset;
                      caret-color: #94A3B8;
                    }
                  `}</style>
                  <input
                    type="search"
                    name="upiId"
                    id="payee-upi-input"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder="friendname@okaxis"
                    value={payPopupUpi}
                    onChange={(e) => setPayPopupUpi(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      border: '1px solid #EEF2F6',
                      background: '#FAFAFA',
                      color: '#94A3B8',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--g)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <span>Paying to: <strong style={{ color: 'var(--t)' }}>{payPopupUpi}</strong></span>
                  <span onClick={() => setPayPopupEditing(true)} style={{ cursor: 'pointer', fontSize: '12px' }} title="Edit UPI ID">✏️</span>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* UPI pay — only for INR payers with a resolvable INR amount. Does NOT settle on its own. */}
            {primaryIsINR && (
              <button
                className="btn-green hover-up"
                disabled={!canPayViaUpi}
                onClick={() => {
                  const finalUpi = payPopupUpi.trim();
                  if (!finalUpi || !finalUpi.includes('@')) {
                    alert('Please enter a valid UPI ID (e.g. friend@okaxis) to proceed!');
                    return;
                  }
                  if (inrEquivalent === null) {
                    alert('Could not fetch a live exchange rate. Please settle this one offline.');
                    return;
                  }

                  setUserMetadata((prev) => ({
                    ...prev,
                    [popupData.friendName]: {
                      ...prev[popupData.friendName],
                      upiId: finalUpi,
                    },
                  }));

                  const inrAmt = inrEquivalent.toFixed(2);
                  const note = debtIsINR
                    ? 'Divido Settle'
                    : `Divido Settle (${popupData.curr}${popupData.amt.toFixed(2)})`;
                  window.location.href = `upi://pay?pa=${finalUpi}&pn=${encodeURIComponent(
                    popupData.friendName
                  )}&am=${inrAmt}&cu=INR&tn=${encodeURIComponent(note)}`;

                  // A upi:// intent can't report success back to the web app, so we
                  // must NOT auto-settle. Ask the user to confirm after they return.
                  setAwaitingConfirm(true);
                }}
                style={{ padding: '12px', fontSize: '13px', borderRadius: '14px', width: '100%', fontWeight: 950, opacity: canPayViaUpi ? 1 : 0.5, cursor: canPayViaUpi ? 'pointer' : 'not-allowed' }}
              >
                {debtIsINR ? 'Proceed to Pay ⚡' : `Pay ${inrDisplay || '…'} via UPI ⚡`}
              </button>
            )}

            {/* Explicit confirmation shown after the UPI app was launched. */}
            {awaitingConfirm && (
              <button
                onClick={() => {
                  onFinalSettle();
                  onClose();
                }}
                style={{ padding: '12px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
                className="hover-up"
              >
                I've paid — mark as settled ✔
              </button>
            )}

            <button
              onClick={() => {
                if (awaitingConfirm) {
                  // "Not yet" — don't settle; just close without recording.
                  onClose();
                } else {
                  onFinalSettle();
                  onClose();
                }
              }}
              style={{
                padding: '12px',
                background: 'none',
                border: '1.5px solid #E2E8F0',
                color: 'var(--t)',
                borderRadius: '14px',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
              className="hover-up"
            >
              {awaitingConfirm ? 'Not yet — keep it open' : 'Just Record locally (Cash/Other) 💵'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
