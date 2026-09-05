import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface UpiSectionProps {
  localUpi: string;
  setLocalUpi: (v: string) => void;
  userMetadata: Record<string, any>;
  setUserMetadata: (m: Record<string, any>) => void;
  me: string;
  userName: string;
  isMobile: boolean;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const UpiSection: React.FC<UpiSectionProps> = ({
  localUpi,
  setLocalUpi,
  userMetadata,
  setUserMetadata,
  me,
  userName,
  isMobile,
  handleKeyDown,
}) => {
  const [upiError, setUpiError] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'awaiting_action' | 'verifying' | 'confirm_resolved'>('idle');
  // Brief on-screen hint shown while the phone's UPI app chooser opens.
  const [showVerifyHint, setShowVerifyHint] = useState(false);
  const isVerified = !!userMetadata[me]?.upiVerified && userMetadata[me]?.upiId === localUpi.trim();

  const upiInputRef = useRef<HTMLInputElement>(null);
  const verifyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // On mobile we open the phone's own UPI app chooser and wait for the user to
  // come back. This stamps when they left; the visibility handler uses it to
  // start verification only after a genuine round-trip to a UPI app.
  const mobileReturnPendingRef = useRef<number | null>(null);

  const validateUpi = (upi: string) => {
    if (!upi) return true;
    return /^[\w.\-_]+@[\w\-]+$/.test(upi);
  };

  useEffect(() => {
    if (sessionStorage.getItem('divido_autofocus_upi') === 'true') {
      sessionStorage.removeItem('divido_autofocus_upi');
      setTimeout(() => {
        if (upiInputRef.current) {
          upiInputRef.current.focus();
          upiInputRef.current.select();
        }
      }, 350);
    }
  }, []);

  // Debounced auto-save for UPI ID (fixes the bug where closing Profile via Back button erases the ID)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = localUpi.trim();
      if (trimmed && !validateUpi(trimmed)) {
        setUpiError('Invalid UPI format');
        return;
      }
      setUpiError(null);
      if ((userMetadata[me]?.upiId || '') !== trimmed) {
        setUserMetadata({
          ...userMetadata,
          [me]: {
            ...userMetadata[me],
            upiId: trimmed,
            upiVerified: trimmed === userMetadata[me]?.upiId ? userMetadata[me]?.upiVerified : false
          },
        });
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [localUpi, me, userMetadata, setUserMetadata]);


  useEffect(() => {
    // Auto-advance to "verifying" only when the user genuinely left to their UPI
    // app and came back — NOT when they just opened and dismissed the "Open with"
    // app chooser. We require the page to have been backgrounded (hidden) for a
    // moment; a quick chooser open-and-cancel returns almost instantly and won't
    // qualify. (The window "focus" event fires on chooser-cancel too, so we
    // deliberately rely on visibility + elapsed time, not focus.)
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const awayFor = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      // A quick open-and-cancel of the app chooser returns almost instantly —
      // ignore it. Only a genuine trip to a UPI app takes longer.
      if (awayFor <= 1000) return;

      // Mobile: user came back from their UPI app -> start verifying.
      if (mobileReturnPendingRef.current && Date.now() - mobileReturnPendingRef.current < 60000) {
        mobileReturnPendingRef.current = null;
        setVerificationStep('verifying');
        return;
      }
      // Desktop QR flow: the modal is open waiting, advance it.
      if (verificationStep === 'awaiting_action') {
        setVerificationStep('verifying');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [verificationStep]);

  useEffect(() => {
    if (verificationStep === 'verifying') {
      const timer = setTimeout(() => {
        setVerificationStep('confirm_resolved');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [verificationStep]);

  useEffect(() => {
    if (verificationStep === 'awaiting_action' && verifyCanvasRef.current && localUpi.trim()) {
      const upiLink = `upi://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR&tn=Divido Verify`;
      QRCode.toCanvas(
        verifyCanvasRef.current,
        upiLink,
        {
          width: 120,
          margin: 1,
          color: {
            dark: '#2E2A25',
            light: '#FFFFFF',
          },
        },
        (err) => {
          if (err) console.error('Error generating verification QR:', err);
        }
      );
    }
  }, [verificationStep, localUpi]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Compact horizontal hint shown for 3s while the phone's UPI app chooser
          opens — with a shrinking timer bar and a small dismiss button. */}
      {showVerifyHint && (
        <div
          style={{
            position: 'fixed',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10001,
            width: 'calc(100% - 24px)',
            maxWidth: '380px',
            background: '#2E2A25',
            borderRadius: '12px',
            boxShadow: '0 10px 24px -8px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px 8px 14px' }}>
            <span style={{ flex: 1, color: '#FFFFFF', fontSize: '11px', fontWeight: 700, lineHeight: 1.35 }}>
              Open your UPI app, check the payee name, then come back.
            </span>
            <button
              type="button"
              onClick={() => setShowVerifyHint(false)}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '14px', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
          <div style={{ height: '3px', background: 'rgba(255,255,255,0.15)' }}>
            <div style={{ height: '100%', background: '#F97316', width: '100%', animation: 'dividoHintTimer 3s linear forwards' }} />
          </div>
          <style>{`@keyframes dividoHintTimer { from { width: 100%; } to { width: 0%; } }`}</style>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            UPI
          </label>
          <input
            ref={upiInputRef}
            type="search"
            name="upiId"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            data-1p-ignore
            data-lpignore="true"
            value={localUpi}
            onChange={(e) => {
              setLocalUpi(e.target.value);
              setUpiError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="username@bank"
            style={{
              fontSize: '15px',
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              padding: '2px 2px',
              outline: 'none',
              color: '#2E2A25',
              fontFamily: 'inherit',
              width: '100%',
            }}
          />
        </div>

        {localUpi.trim() && !upiError && (
          <div style={{ flexShrink: 0 }}>
            {!isVerified && verificationStep === 'idle' && (
              <span
                onClick={() => {
                  setUpiError(null);
                  if (isMobile) {
                    // Show a brief hint, then open the phone's own UPI app chooser
                    // (every installed UPI app), and wait for the user to return.
                    setShowVerifyHint(true);
                    setTimeout(() => setShowVerifyHint(false), 3000);
                    mobileReturnPendingRef.current = Date.now();
                    window.location.href = `upi://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR&tn=Divido Verify`;
                  } else {
                    // Desktop has no UPI apps — show our QR code to scan instead.
                    setVerificationStep('awaiting_action');
                  }
                }}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#EA580C',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Verify
              </span>
            )}
            {isVerified && (
              <span
                onClick={() => setUserMetadata({ ...userMetadata, [me]: { ...userMetadata[me], upiVerified: false } })}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#16A34A',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Verified ✓
              </span>
            )}
          </div>
        )}
      </div>

      {upiError && (
        <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 700 }}>
          {upiError}
        </span>
      )}

      {verificationStep !== 'idle' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(46, 42, 37, 0.4)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            padding: '24px',
            width: '100%',
            maxWidth: '360px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#2E2A25' }}>
                Verify UPI VPA
              </span>
              <button
                type="button"
                onClick={() => {
                  setVerificationStep('idle');
                  setUpiError(null);
                }}
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  background: '#F1F5F9',
                  border: 'none',
                  color: '#64748B',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#E2E8F0'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Desktop only: mobile opens the phone's UPI app chooser directly. */}
            {verificationStep === 'awaiting_action' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                  Scan this QR code using GPay/PhonePe to see the registered bank name on your phone.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <canvas ref={verifyCanvasRef} style={{ background: '#FFFFFF', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                </div>

                <button
                  type="button"
                  onClick={() => setVerificationStep('verifying')}
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#64748B',
                    border: '1.5px solid #E2E8F0',
                    background: '#FFFFFF',
                    padding: '8px 16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                >
                  I have opened the UPI app
                </button>
              </div>
            )}

            {verificationStep === 'verifying' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px 0', textAlign: 'center' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid #F1F5F9',
                  borderTopColor: '#10B981',
                  borderRadius: '50%',
                  display: 'inline-block',
                }} className="animate-spin-custom" />
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>
                  Waiting for banking network response...
                </span>
                <style>{`
                  @keyframes spinCustom {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  .animate-spin-custom {
                    animation: spinCustom 0.8s linear infinite;
                  }
                `}</style>
              </div>
            )}

            {verificationStep === 'confirm_resolved' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 700, lineHeight: 1.4 }}>
                  Did your UPI app show your correct registered bank name?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMetadata({ ...userMetadata, [me]: { ...userMetadata[me], upiId: localUpi.trim(), upiVerified: true } });
                      setVerificationStep('idle');
                    }}
                    style={{
                      width: '100%',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: '#10B981',
                      color: 'white',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    Yes, Confirm & Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep('idle');
                      setUpiError('Name mismatch. Please enter the correct UPI ID.');
                    }}
                    style={{
                      width: '100%',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#FFFFFF',
                      border: '1.5px solid #F1F5F9',
                      color: '#64748B',
                      padding: '10px',
                      borderRadius: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    No, Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
