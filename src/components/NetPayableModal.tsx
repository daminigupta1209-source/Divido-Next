import React, { useState, useEffect } from 'react';
import { escManager } from '../lib/escManager';

interface NetPayableModalProps {
  popupData: { friendName: string; amt: number; curr: string } | null;
  onClose: () => void;
  userMetadata: Record<string, any>;
  setUserMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onFinalSettle: () => void;
}

export const NetPayableModal: React.FC<NetPayableModalProps> = ({
  popupData,
  onClose,
  userMetadata,
  setUserMetadata,
  onFinalSettle,
}) => {
  const [payPopupUpi, setPayPopupUpi] = useState('');
  const [payPopupEditing, setPayPopupEditing] = useState(false);

  useEffect(() => {
    if (popupData) {
      const existingUpi = userMetadata[popupData.friendName]?.upiId || '';
      setPayPopupUpi(existingUpi);
      setPayPopupEditing(!existingUpi);
    }
  }, [popupData, userMetadata]);

  useEffect(() => {
    if (!popupData) return;
    const unregister = escManager.register(() => {
      onClose();
    });
    return unregister;
  }, [popupData, onClose]);

  if (!popupData) return null;

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
        
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--g)', margin: '2px 0 16px' }}>
          Paying <strong style={{ color: 'var(--accent)', fontSize: '18px' }}>{popupData.curr}{popupData.amt.toFixed(2)}</strong> to {popupData.friendName}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                type="text"
                name="upiId"
                id="payee-upi-input"
                placeholder="friendname@okaxis"
                value={payPopupUpi}
                onChange={(e) => setPayPopupUpi(e.target.value)}
                autoComplete="on"
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn-green hover-up"
              onClick={() => {
                const finalUpi = payPopupUpi.trim();
                if (!finalUpi || !finalUpi.includes('@')) {
                  alert('Please enter a valid UPI ID (e.g. friend@okaxis) to proceed!');
                  return;
                }
                
                setUserMetadata((prev) => ({
                  ...prev,
                  [popupData.friendName]: {
                    ...prev[popupData.friendName],
                    upiId: finalUpi,
                  },
                }));

                window.location.href = `upi://pay?pa=${finalUpi}&pn=${encodeURIComponent(
                  popupData.friendName
                )}&am=${popupData.amt.toFixed(2)}&cu=INR&tn=Divido Settle`;

                onFinalSettle();
                onClose();
              }}
              style={{ padding: '12px', fontSize: '13px', borderRadius: '14px', width: '100%', fontWeight: 950 }}
            >
              Proceed to Pay ⚡
            </button>
            <button
              onClick={() => {
                onFinalSettle();
                onClose();
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
              Just Record locally (Cash/Other) 💵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
