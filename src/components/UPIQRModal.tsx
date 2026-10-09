import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { escManager } from '../lib/escManager';
import { buildUpiLink } from '../lib/upi';
import { useCopyFeedback } from '../hooks/useCopyFeedback';

interface UPIQRModalProps {
  show: boolean;
  onClose: () => void;
  payeeName: string;
  upiId: string;
  amount: number;
  currency: string;
  onSaveUpi: (newUpi: string) => void;
  requestFrom?: string; // Optional: if we are requesting money, this is the friend who owes us
}

export const UPIQRModal: React.FC<UPIQRModalProps> = ({
  show,
  onClose,
  payeeName,
  upiId,
  amount,
  currency,
  onSaveUpi,
  requestFrom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [localUpi, setLocalUpi] = useState(upiId);
  const [isEditing, setIsEditing] = useState(false);
  const { copiedKey, copy } = useCopyFeedback();
  const [shareCopied, setShareCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setLocalUpi(upiId);
    setIsEditing(!upiId);
  }, [upiId, show]);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobileDevice = /android|iphone|ipad|ipod|iemobile|opera mini/i.test(userAgent.toLowerCase());
    setIsMobile(isMobileDevice);
  }, []);

  useEffect(() => {
    if (!show) return;
    const unregister = escManager.register(() => {
      onClose();
    });
    return unregister;
  }, [show, onClose]);

  useEffect(() => {
    if (!show || !localUpi || isEditing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      // Standard UPI Payment URI Format
      const upiLink = buildUpiLink({ pa: localUpi, pn: payeeName, am: amount, tn: 'Divido Settle' });

      QRCode.toCanvas(
        canvas,
        upiLink,
        {
          width: 210,
          margin: 1.5,
          color: {
            dark: '#1E293B', // Deep Slate for code
            light: '#FFFFFF',
          },
        },
        (err) => {
          if (err) {
            console.error('Error generating QR Code:', err);
            return;
          }
          // Draw Circular Mascot inside the center of QR code
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = new Image();
            img.src = '/divido_laughing_cat_mascot_1778063273427.png';
            img.onload = () => {
              const size = 36; // Mascot diameter
              const x = (canvas.width - size) / 2;
              const y = (canvas.height - size) / 2;
              
              // Draw white border circle
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, (size / 2) + 3, 0, 2 * Math.PI);
              ctx.fill();

              // Draw Mascot image inside a circular clip
              ctx.save();
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, size / 2, 0, 2 * Math.PI);
              ctx.clip();
              ctx.drawImage(img, x, y, size, size);
              ctx.restore();
            };
          }
        }
      );
    }
  }, [show, localUpi, isEditing, payeeName, amount]);

  if (!show) return null;

  const handleSave = () => {
    const trimmed = localUpi.trim();
    if (!trimmed) {
      alert('Please enter a valid UPI ID! 💳');
      return;
    }
    if (!trimmed.includes('@')) {
      alert('UPI ID must contain "@" (e.g. name@okaxis) ⚠️');
      return;
    }
    onSaveUpi(trimmed);
    setIsEditing(false);
  };

  const handleCopy = () => copy('upi-inline', localUpi.trim());

  const handleShareRequest = async () => {
    const shareText = `Hi! Please pay ${currency}${amount.toFixed(2)} to settle our dues on Divido.\n\nPay in GPay or any UPI app → Pay UPI ID:\nUPI ID: ${localUpi.trim()}\nAmount: ${currency}${amount.toFixed(2)}\n\nOr try the direct link (some apps decline it): ${buildUpiLink({ pa: localUpi, pn: payeeName, am: amount, tn: 'Divido Settle' })}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Divido Payment Settlement Request',
          text: shareText,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  const upiDeepLink = buildUpiLink({ pa: localUpi, pn: payeeName, am: amount, tn: 'Divido Settle' });
  const copyChipStyle: React.CSSProperties = {
    padding: '8px 10px',
    background: 'var(--w)',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--t)',
    cursor: 'pointer',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 5000 }} onClick={onClose}>
      <div
        className="card shadow-xl"
        style={{
          width: '420px',
          padding: '28px',
          position: 'relative',
          background: 'var(--w)',
          textAlign: 'center',
          animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
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

        {/* Title */}
        <h3  style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>
          {requestFrom ? 'Scan to Settle Dues ✅' : 'UPI Payment QR Code 📱'}
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--g)', fontWeight: 600, marginBottom: '20px' }}>
          {requestFrom ? (
            <span>Let <span style={{ color: 'var(--t)', fontWeight: 600 }}>{requestFrom}</span> scan this to pay you the net amount</span>
          ) : (
            <span>Scan this to transfer the net settled balance directly</span>
          )}
        </p>

        {/* QR Display Area */}
        <div
          style={{
            background: 'var(--bg)',
            padding: '16px',
            borderRadius: '24px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '2px dashed var(--b)',
            minHeight: '232px',
            minWidth: '232px',
          }}
        >
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '200px' }}>
              <span style={{ fontSize: '24px' }}>💳</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t)' }}>
                {requestFrom ? 'Link your UPI ID to receive payments:' : `Link UPI ID for ${payeeName}:`}
              </span>
              <input
                type="search"
                name="upiId"
                id="qr-upi-input"
                placeholder="e.g. name@okhdfcbank"
                value={localUpi}
                onChange={(e) => setLocalUpi(e.target.value)}
                autoComplete="off"
                style={{
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  background: 'white',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <button
                className="btn-green"
                onClick={handleSave}
                style={{ padding: '10px', fontSize: '12px', borderRadius: '10px' }}
              >
                Link & Generate QR
              </button>
            </div>
          ) : (
            <canvas ref={canvasRef} style={{ borderRadius: '12px', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
          )}
        </div>

        {/* Details section */}
        {!isEditing && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--t)', letterSpacing: '-0.5px' }}>
              {currency}{amount.toFixed(2)}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--g)',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>
                To: <strong style={{ color: 'var(--t)' }}>{payeeName}</strong> ({localUpi})
              </span>
              <span
                onClick={handleCopy}
                style={{ cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                title="Copy UPI ID"
              >
                📋
              </span>
              <span
                onClick={() => setIsEditing(true)}
                style={{ cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                title="Edit UPI ID"
              >
                ✏️
              </span>
            </div>
            {copiedKey === 'upi-inline' && (
              <p style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600, marginTop: '4px', animation: 'fadeSlideIn 0.2s ease-out' }}>
                ✓ UPI ID Copied!
              </p>
            )}

            {/* Interactive Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
              {/* Pay-by-UPI-ID is the primary path: UPI apps decline link-launched
                  payments to a personal UPI ID, but "Pay UPI ID" in the app goes
                  through. Only when paying from this device — a request is
                  shared/scanned instead. */}
              {!requestFrom && (
                <div style={{ background: 'var(--bg)', padding: '10px 12px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--g)', margin: 0, lineHeight: 1.45 }}>
                    Open GPay or any UPI app → <strong style={{ color: 'var(--t)' }}>Pay UPI ID</strong> → paste these (or scan the QR in the app):
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="press-anim"
                      onClick={() => copy('upi', localUpi.trim())}
                      style={{ ...copyChipStyle, flex: 1 }}
                      title={localUpi.trim()}
                    >
                      {copiedKey === 'upi' ? '✓ Copied' : `📋 ${localUpi.trim()}`}
                    </button>
                    <button
                      className="press-anim"
                      onClick={() => copy('amt', amount.toFixed(2))}
                      style={{ ...copyChipStyle, flex: '0 0 auto' }}
                    >
                      {copiedKey === 'amt' ? '✓ Copied' : `📋 ${currency}${amount.toFixed(2)}`}
                    </button>
                  </div>
                  <a
                    href={upiDeepLink}
                    style={{ color: 'var(--g)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline', textAlign: 'center' }}
                  >
                    Or try the direct pay link (some UPI apps decline it)
                  </a>
                </div>
              )}

              <button
                onClick={handleShareRequest}
                className="btn-green"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '12px',
                  borderRadius: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                  transition: '0.2s all ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.25)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)'; }}
              >
                <span>🔗 {shareCopied ? '✓ Copied Request' : 'Share Payment Request'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Mascot Hint Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(252, 211, 77, 0.08)',
            padding: '12px 16px',
            borderRadius: '16px',
            border: '1px solid rgba(252, 211, 77, 0.2)',
            textAlign: 'left',
            marginTop: '8px',
          }}
        >
          <img
            src="/divido_laughing_cat_mascot_1778063273427.png"
            style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1.5px solid #FCD34D', flexShrink: 0 }}
            alt="Mascot"
          />
          <p style={{ fontSize: '10px', fontWeight: 600, color: '#92400E', margin: 0, lineHeight: '1.4' }}>
            {requestFrom ? (
              <span>Your friend can scan this or click deep-links to pay you. Once transferred, click Settle to clear.</span>
            ) : (
              <span>Scan using any BHIM UPI app or tap the mobile app button to pay. Tap Settle when complete.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
