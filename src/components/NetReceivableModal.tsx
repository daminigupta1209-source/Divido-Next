import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { escManager } from '../lib/escManager';
import { ShareGrid } from './ShareGrid';

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
  const [reminderText, setReminderText] = useState('');
  const [showQr, setShowQr] = useState(false);
  const reminderCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (popupData) {
      const myUpi = userMetadata[me]?.upiId || '';
      setRemPopupUpi(myUpi);
      setRemPopupEditing(!myUpi);
    }
  }, [popupData, userMetadata, me]);

  useEffect(() => {
    if (popupData) {
      const myUpi = remPopupUpi.trim();
      // Keep the visible message clean and human-readable; the tappable pay link
      // is attached only to the shared payload (see shareMessage below).
      const msg = `Hey ${popupData.friendName}, just a quick reminder to settle our net balance of ${popupData.curr}${popupData.amt.toFixed(2)} on Divido.${myUpi ? ` Pay me at UPI: ${myUpi}` : ''} Thank you! 🌸`;
      setReminderText(msg);
    }
  }, [remPopupUpi, popupData]);

  useEffect(() => {
    if (!popupData || !remPopupUpi || remPopupEditing) return;
    const canvas = reminderCanvasRef.current;
    if (canvas) {
      const upiLink = `upi://pay?pa=${remPopupUpi.trim()}&pn=${encodeURIComponent(
        me
      )}&am=${popupData.amt.toFixed(2)}&cu=INR&tn=Divido Settle`;

      QRCode.toCanvas(
        canvas,
        upiLink,
        {
          width: 132,
          margin: 1,
          color: {
            dark: '#1E293B',
            light: '#FFFFFF',
          },
        },
        (err) => {
          if (err) console.error('Error generating reminder QR:', err);
        }
      );
    }
  }, [popupData, remPopupUpi, remPopupEditing, me, showQr]);

  useEffect(() => {
    if (!popupData) return;
    const unregister = escManager.register(() => {
      onClose();
    });
    return unregister;
  }, [popupData, onClose]);

  if (!popupData) return null;

  // The shared payload = clean message + a tappable UPI pay link (amount
  // pre-filled). Kept separate so the raw link never clutters the visible text.
  const upiLink = remPopupUpi.trim()
    ? `upi://pay?pa=${remPopupUpi.trim()}&pn=${encodeURIComponent(me)}&am=${popupData.amt.toFixed(2)}&cu=INR&tn=Divido Settle`
    : '';
  const shareMessage = upiLink ? `${reminderText}\n\nPay instantly: ${upiLink}` : reminderText;

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
        
        <h3 className="nunito" style={{ fontSize: '17px', fontWeight: 950, marginBottom: '3px' }}>
          Send Reminder to {popupData.friendName} 🔔
        </h3>
        <p style={{ fontSize: '10.5px', color: 'var(--g)', fontWeight: 800, marginBottom: '12px' }}>
          Share the reminder, or show your QR to scan in person.
        </p>

        {remPopupEditing ? (
          /* Link UPI first (needed for pay link + QR) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px', background: 'var(--bg)', padding: '16px', borderRadius: '16px', border: '2px dashed var(--b)' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--t)' }}>
              💳 Link your UPI ID to receive payments
            </span>
            <input
              type="text"
              name="upiId"
              id="my-upi-input"
              placeholder="e.g. name@okaxis"
              value={remPopupUpi}
              onChange={(e) => setRemPopupUpi(e.target.value)}
              autoComplete="on"
              style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 800, borderRadius: '10px', border: '1.5px solid #CBD5E1', background: 'white', textAlign: 'center', outline: 'none' }}
            />
            <button
              className="btn-green"
              onClick={() => {
                const trimmed = remPopupUpi.trim();
                if (!trimmed || !trimmed.includes('@')) {
                  alert('Please enter a valid UPI ID (e.g. yourname@okaxis)!');
                  return;
                }
                setUserMetadata((prev) => ({ ...prev, [me]: { ...prev[me], upiId: trimmed } }));
                setRemPopupEditing(false);
              }}
              style={{ padding: '10px', fontSize: '12px', borderRadius: '10px' }}
            >
              Link UPI ID
            </button>
          </div>
        ) : (
          <>
            {/* Primary: share the reminder via apps (same grid as the invite modal) */}
            <ShareGrid message={shareMessage} copyValue={shareMessage} />

            {/* Secondary: reveal QR + editable message on demand */}
            <button
              onClick={() => setShowQr((s) => !s)}
              style={{ background: 'none', border: 'none', color: 'var(--g)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', marginBottom: showQr ? '10px' : '14px', textDecoration: 'underline' }}
            >
              {showQr ? 'Hide QR & message' : 'Show QR & message'}
            </button>

            {showQr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '16px', border: '1px solid #EEF2F6', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <canvas ref={reminderCanvasRef} style={{ borderRadius: '10px', background: 'white' }} />
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--g)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{remPopupUpi}</span>
                    <span onClick={() => setRemPopupEditing(true)} style={{ cursor: 'pointer', fontSize: '11px' }} title="Edit UPI ID">✏️</span>
                  </div>
                </div>
                <textarea
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  style={{ width: '100%', height: '58px', padding: '9px 11px', fontSize: '11.5px', fontWeight: 700, borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: 'var(--t)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn-green hover-up"
            onClick={() => {
              onFinalSettle();
              onClose();
            }}
            style={{ padding: '12px', fontSize: '13px', borderRadius: '14px', width: '100%', fontWeight: 950 }}
          >
            Mark as Settled & Record 💸
          </button>
        </div>
      </div>
    </div>
  );
};
