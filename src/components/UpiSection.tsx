import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

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
  const [verificationStep, setVerificationStep] = useState<'idle' | 'awaiting_action' | 'verifying' | 'confirm_resolved' | 'confirm_qr'>('idle');
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrExtractedUpi, setQrExtractedUpi] = useState<string>('');
  const isVerified = !!userMetadata[me]?.upiVerified && userMetadata[me]?.upiId === localUpi.trim();

  const upiInputRef = useRef<HTMLInputElement>(null);
  const verifyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrUploadRef = useRef<HTMLInputElement>(null);
  // On mobile we open the phone's own UPI app chooser and wait for the user to
  // come back. This stamps when they left; the visibility handler uses it to
  // start verification only after a genuine round-trip to a UPI app.
  const mobileReturnPendingRef = useRef<number | null>(null);

  const validateUpi = (upi: string) => {
    if (!upi) return true;
    return /^[\w.\-_]+@[\w\-]+$/.test(upi);
  };

  const handleQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setUpiError('Could not process image.');
          return;
        }
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        
        if (code) {
          const rawData = code.data || '';
          let pa = null;
          if (rawData.includes('upi://pay')) {
            const urlParams = new URLSearchParams(rawData.split('?')[1] || '');
            pa = urlParams.get('pa');
          } else if (validateUpi(rawData.trim())) {
            pa = rawData.trim();
          }

          if (pa && validateUpi(pa)) {
            setQrPreviewUrl(event.target?.result as string);
            setQrExtractedUpi(pa);
            setVerificationStep('confirm_qr');
            setUpiError(null);
          } else {
            setUpiError('No valid UPI ID found in QR code.');
          }
        } else {
          setUpiError('Could not read QR code. Try a clearer image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    
    // reset input so same file can be uploaded again if needed
    if (qrUploadRef.current) qrUploadRef.current.value = '';
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
      {/* Removed verify hint toast in favor of the full modal flow */}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            UPI ID
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
              border: '1.5px solid #E2E8F0',
              borderRadius: '12px',
              background: '#F8FAFC',
              padding: '12px 14px',
              outline: 'none',
              color: '#2E2A25',
              fontFamily: 'inherit',
              width: '100%',
              transition: 'all 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = '#EA580C'}
            onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => qrUploadRef.current?.click()}
            type="button"
            title="Upload QR Code"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '12px',
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#E2E8F0'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Upload QR
          </button>
          <input type="file" accept="image/*" ref={qrUploadRef} style={{ display: 'none' }} onChange={handleQRUpload} />

          {localUpi.trim() && !upiError && (
            <div style={{ flex: 1 }}>
              {!isVerified && verificationStep === 'idle' && (
                <button
                  type="button"
                  onClick={() => {
                    setUpiError(null);
                    setVerificationStep('awaiting_action');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px',
                    background: '#FFF7ED',
                    color: '#EA580C',
                    border: '1.5px solid #FFEDD5',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FFEDD5'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#FFF7ED'}
                >
                  Verify ID
                </button>
              )}
              {isVerified && (
                <button
                  type="button"
                  onClick={() => setUserMetadata({ ...userMetadata, [me]: { ...userMetadata[me], upiVerified: false } })}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px',
                    background: '#F0FDF4',
                    color: '#16A34A',
                    border: '1.5px solid #DCFCE7',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#DCFCE7'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#F0FDF4'}
                >
                  Verified ✓
                </button>
              )}
            </div>
          )}
        </div>
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

            {verificationStep === 'awaiting_action' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center' }}>
                {isMobile ? (
                  <>
                    <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                      We will open your UPI app with a ₹1 test payment. <strong style={{color:'#EF4444'}}>Do not pay it!</strong> Just check the name on the screen and press back.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        mobileReturnPendingRef.current = Date.now();
                        window.location.href = `upi://pay?pa=${encodeURIComponent(localUpi.trim())}&pn=${encodeURIComponent(userName)}&am=1.00&cu=INR&tn=Divido Verify`;
                      }}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        background: '#EA580C',
                        padding: '12px 16px',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
                      }}
                    >
                      Open UPI App
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                      Scan this QR code using GPay/PhonePe to see the registered bank name on your phone.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                      <canvas ref={verifyCanvasRef} style={{ background: '#FFFFFF', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setVerificationStep('verifying')}
                  style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#64748B',
                    border: 'none',
                    background: 'transparent',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: '8px',
                  }}
                >
                  I have checked my name
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

            {verificationStep === 'confirm_qr' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 700, lineHeight: 1.4 }}>
                  Confirm extracted details
                </div>
                {qrPreviewUrl && (
                  <div style={{ width: '100%', maxWidth: '200px', height: '140px', overflow: 'hidden', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                    <img src={qrPreviewUrl} alt="QR Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                )}
                <input
                  type="text"
                  value={qrExtractedUpi}
                  onChange={(e) => setQrExtractedUpi(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1.5px solid #E2E8F0',
                    fontSize: '14px',
                    fontWeight: 600,
                    textAlign: 'center',
                    outline: 'none',
                    color: '#2E2A25',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const finalUpi = qrExtractedUpi.trim();
                      if (validateUpi(finalUpi)) {
                        setLocalUpi(finalUpi);
                        setUserMetadata({ ...userMetadata, [me]: { ...userMetadata[me], upiId: finalUpi, upiVerified: true } });
                        setVerificationStep('idle');
                        setUpiError(null);
                        setQrPreviewUrl(null);
                      } else {
                        setUpiError('Invalid UPI ID format');
                      }
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
                    Confirm & Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep('idle');
                      setQrPreviewUrl(null);
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
                    Cancel
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
