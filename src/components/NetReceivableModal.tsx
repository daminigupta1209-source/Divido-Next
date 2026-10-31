import React, { useState, useEffect } from 'react';
import { escManager } from '../lib/escManager';
import { ShareGrid } from './ShareGrid';
import { toCurrencyCode } from '../lib/utils';

interface NetReceivableModalProps {
  popupData: { friendName: string; amt: number; curr: string } | null;
  onClose: () => void;
  me: string;
  userMetadata: Record<string, any>;
  setUserMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onFinalSettle: () => void;
}

export const NetReceivableModal: React.FC<NetReceivableModalProps> = ({
  popupData,
  onClose,
  me,
  userMetadata,
  setUserMetadata,
  onFinalSettle,
}) => {
  const [remPopupUpi, setRemPopupUpi] = useState('');
  const [remPopupEditing, setRemPopupEditing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [rates, setRates] = useState<Record<string, number>>({});

  // UPI is an INR-only rail. For a non-INR debt, convert to the INR equivalent
  // (rates fetched with INR base, so rates[CODE] = units of CODE per 1 INR).
  const debtCode = popupData ? toCurrencyCode(popupData.curr) : 'INR';
  const debtIsINR = debtCode === 'INR';
  const inrRate = rates[debtCode];
  const inrEquivalent = !popupData
    ? null
    : debtIsINR
    ? popupData.amt
    : inrRate
    ? popupData.amt / inrRate
    : null;
  const upiAmt = (inrEquivalent != null ? inrEquivalent : popupData ? popupData.amt : 0).toFixed(2);
  const inrNote = !debtIsINR && inrEquivalent != null ? ` (≈ ₹${inrEquivalent.toFixed(2)})` : '';

  useEffect(() => {
    if (popupData) {
      const globalUpi = localStorage.getItem('divido_global_upi_id') || '';
      const myUpi = globalUpi || userMetadata[me]?.upiId || '';
      setRemPopupUpi(myUpi);
      setShowOnboarding(false);
      setRemPopupEditing(false);
    }
  }, [popupData, userMetadata, me]);

  // Fetch live INR-based rates when a non-INR debt popup opens.
  useEffect(() => {
    if (!popupData || debtIsINR) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/INR');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && data.rates) setRates(data.rates);
        }
      } catch (err) {
        console.error('Failed to fetch rates in NetReceivableModal:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [popupData, debtIsINR]);

  useEffect(() => {
    if (popupData) {
      // Keep the message clean; the UPI ID + amount are appended to the shared
      // payload on their own lines (see shareMessage below).
      const msg = `Hey ${popupData.friendName}, just a quick reminder to settle our net balance of ${popupData.curr}${popupData.amt.toFixed(2)}${inrNote} on Fussky. Thank you!`;
      setReminderText(msg);
    }
  }, [popupData, inrNote]);

  useEffect(() => {
    if (!popupData) return;
    const unregister = escManager.register(() => {
      onClose();
    });
    return unregister;
  }, [popupData, onClose]);

  if (!popupData) return null;

  // The shared payload = clean message + the UPI ID and amount on their own lines
  // (easy to copy) for "Pay UPI ID". No upi:// link: UPI apps decline
  // link-launched payments to a personal UPI ID (every variant tested fails).
  const shareMessage = remPopupUpi.trim()
    ? `${reminderText}\n\nPay in GPay or any UPI app → Pay UPI ID:\nUPI ID: ${remPopupUpi.trim()}\nAmount: ₹${upiAmt}`
    : reminderText;

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
        
        <h3  style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px', textAlign: 'center' }}>
          Send Reminder to {popupData.friendName}
        </h3>
        {remPopupEditing ? (
          /* Link UPI first (included in the shared message) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px', background: 'var(--bg)', padding: '16px', borderRadius: '16px', border: '2px dashed var(--b)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t)' }}>
              Link your UPI ID to receive payments
            </span>
            <input
              type="search"
              name="upiId"
              id="my-upi-input"
              placeholder="e.g. name@okaxis"
              value={remPopupUpi}
              onChange={(e) => setRemPopupUpi(e.target.value)}
              autoComplete="on"
              style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '10px', border: '1.5px solid #CBD5E1', background: 'white', textAlign: 'center', outline: 'none' }}
            />
            <button
              className="btn-green"
              onClick={() => {
                const trimmed = remPopupUpi.trim();
                if (!trimmed || !trimmed.includes('@')) {
                  alert('Please enter a valid UPI ID (e.g. yourname@okaxis)!');
                  return;
                }
                localStorage.setItem('divido_global_upi_id', trimmed);
                setUserMetadata((prev) => ({ ...prev, [me]: { ...prev[me], upiId: trimmed } }));
                setRemPopupEditing(false);
              }}
              style={{ padding: '10px', fontSize: '12px', borderRadius: '10px', cursor: 'pointer' }}
            >
              Link UPI ID
            </button>
            <button
              onClick={() => {
                localStorage.setItem('divido_upi_prompt_skipped', 'true');
                setRemPopupUpi('');
                setRemPopupEditing(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                marginTop: '4px'
              }}
            >
              Skip & Share Text Only
            </button>
          </div>
        ) : (
          <>
            {/* Primary: share the reminder via apps (same grid as the invite modal) */}
            <ShareGrid message={shareMessage} copyValue={shareMessage} />

            {remPopupUpi ? (
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '14px' }}>
                UPI ID in message: <span style={{ color: 'var(--t)' }}>{remPopupUpi}</span>{' '}
                <span onClick={() => setRemPopupEditing(true)} style={{ cursor: 'pointer' }} title="Edit UPI ID">✏️</span>
              </div>
            ) : (
              <button
                onClick={() => setRemPopupEditing(true)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#64748B', 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  marginBottom: '14px', 
                  textDecoration: 'underline',
                  display: 'block',
                  margin: '12px auto'
                }}
              >
                Link UPI ID to include it in the reminder
              </button>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <button
            className="hover-up"
            onClick={() => {
              onFinalSettle();
              onClose();
            }}
            style={{ padding: '12px', fontSize: '13px', borderRadius: '14px', width: '100%', fontWeight: 600, background: '#FACC15', color: '#3F2E00', border: 'none', cursor: 'pointer' }}
          >
            Mark as Settled & Record
          </button>
        </div>
      </div>
    </div>
  );
};
