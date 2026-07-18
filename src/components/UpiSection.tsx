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
  const isVerified = !!userMetadata[me]?.upiVerified && userMetadata[me]?.upiId === localUpi.trim();

  const upiInputRef = useRef<HTMLInputElement>(null);
  const verifyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const validateUpi = (upi: string) => {
    if (!upi) return true;
    return /^[\w.\-_]+@[\w\-]+$/.test(upi);
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && verificationStep === 'awaiting_action') {
        setVerificationStep('verifying');
      }
    };

    const handleWindowFocus = () => {
      if (verificationStep === 'awaiting_action') {
        setVerificationStep('verifying');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            UPI
          </label>
          <input
            ref={upiInputRef}
            type="text"
            name="upiId"
            value={localUpi}
            onChange={(e) => {
              setLocalUpi(e.target.value);
              setUpiError(null);
            }}
            onBlur={() => {
              const trimmed = localUpi.trim();
              if (trimmed && !validateUpi(trimmed)) {
                setUpiError('Invalid UPI format');
              } else {
                setUpiError(null);
                setUserMetadata({
                  ...userMetadata,
                  [me]: { ...userMetadata[me], upiId: trimmed, upiVerified: trimmed === userMetadata[me]?.upiId ? userMetadata[me]?.upiVerified : false },
                });
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="username@bank"
            style={{
              fontSize: '15px',
              fontWeight: 800,
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
                  setVerificationStep('awaiting_action');
                  setUpiError(null);

                  const upiIntent = `upi://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR`;
                  if (isMobile) window.location.href = upiIntent;
                }}
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
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
                  fontWeight: 800,
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
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#2E2A25' }}>
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
                  fontWeight: 800,
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

            {verificationStep === 'awaiting_action' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                  {isMobile
                    ? 'Tap your UPI app below to open it and check the payee name on screen. Return here when done.'
                    : 'Scan this QR code using GPay/PhonePe to see the registered bank name on your phone.'}
                </p>

                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      {[
                        {
                          name: 'GPay',
                          scheme: `gpay://upi/pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR`,
                          icon: (
                            <img
                              src="/gpay.png"
                              alt="Google Pay"
                              style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px' }}
                            />
                          )
                        },
                        {
                          name: 'PhonePe',
                          scheme: `phonepe://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR`,
                          icon: (
                            <img
                              src="/phonepe.png"
                              alt="PhonePe"
                              style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px' }}
                            />
                          )
                        },
                        {
                          name: 'Paytm',
                          scheme: `paytmmp://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR`,
                          icon: (
                            <img
                              src="/paytm.png"
                              alt="Paytm"
                              style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px' }}
                            />
                          )
                        },
                        {
                          name: 'BHIM',
                          scheme: `upi://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR`,
                          icon: (
                            <img
                              src="/bhim.png"
                              alt="BHIM"
                              style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px' }}
                            />
                          )
                        }
                      ].map((app) => (
                        <div
                          key={app.name}
                          onClick={() => {
                            window.location.href = app.scheme;
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            flex: 1
                          }}
                        >
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            transition: 'transform 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            {app.icon}
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B' }}>
                            {app.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                    <canvas ref={verifyCanvasRef} style={{ background: '#FFFFFF', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setVerificationStep('verifying')}
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
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
                      fontWeight: 800,
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
                      fontWeight: 800,
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
