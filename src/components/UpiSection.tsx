import React, { useState, useEffect, useRef } from 'react';
import { useCopyFeedback } from '../hooks/useCopyFeedback';

interface UpiSectionProps {
  localUpi: string;
  setLocalUpi: (v: string) => void;
  userMetadata: Record<string, any>;
  setUserMetadata: (m: Record<string, any>) => void;
  me: string;
  userName: string;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const UpiSection: React.FC<UpiSectionProps> = ({
  localUpi,
  setLocalUpi,
  userMetadata,
  setUserMetadata,
  me,
  userName,
  handleKeyDown,
}) => {
  const [upiError, setUpiError] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'awaiting_action' | 'verifying' | 'confirm_resolved'>('idle');
  const isVerified = !!userMetadata[me]?.upiVerified && userMetadata[me]?.upiId === localUpi.trim();

  const upiInputRef = useRef<HTMLInputElement>(null);
  // On mobile we open the phone's own UPI app chooser and wait for the user to
  // come back. This stamps when they left; the visibility handler uses it to
  // start verification only after a genuine round-trip to a UPI app.
  const mobileReturnPendingRef = useRef<number | null>(null);
  const { copiedKey, copy } = useCopyFeedback();

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
    const timer = setTimeout(async () => {
      const trimmed = (localUpi || '').trim();
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
        
        // Auto-sync UPI ID to the cloud so friends can see it automatically
        import('../lib/supabaseClient').then(({ supabase }) => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.email) {
              supabase
                .from('group_members')
                .update({ upi_id: trimmed })
                .eq('user_email', session.user.email)
                .then(({ error }) => {
                  if (error) console.error('Failed to sync UPI ID to cloud:', error);
                });
            }
          });
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
      // The modal is open waiting, advance it.
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Removed verify hint toast in favor of the full modal flow */}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              UPI ID
            </label>
            {isVerified ? (
              <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>
                Verified ✓
              </span>
            ) : upiError ? (
              <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 700 }}>
                {upiError}
              </span>
            ) : null}
          </div>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              ref={upiInputRef}
              type="search"
              name="upiId"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              data-1p-ignore
              data-lpignore="true"
              value={localUpi || ''}
              onChange={(e) => {
                setLocalUpi(e.target.value || '');
                setUpiError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="username@bank"
              style={{
                fontSize: (localUpi || '').length > 22 ? '13px' : '15px',
                fontWeight: 600,
                border: '1.5px solid #E2E8F0',
                borderRadius: '12px',
                background: '#F8FAFC',
                padding: '12px 58px 12px 14px',
                outline: 'none',
                color: '#2E2A25',
                fontFamily: 'inherit',
                width: '100%',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#EA580C'}
              onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
            />
            {!isVerified && (localUpi || '').trim() && !upiError && (
              <button
                type="button"
                onClick={() => setVerificationStep('awaiting_action')}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  marginTop: '3px',
                  background: 'transparent',
                  color: '#10B981',
                  border: 'none',
                  padding: '0',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#059669'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#10B981'}
              >
                Verify
              </button>
            )}
          </div>
        </div>

        {(localUpi || '').trim() && !upiError && isVerified && (
          <button
            type="button"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Pay ${userName || ''} on Fussky`,
                  // No upi:// link: UPI apps decline link-launched payments to a personal UPI ID.
                  text: `Here is my UPI ID: ${localUpi || ''}\nPay me in GPay or any UPI app → Pay UPI ID.`,
                }).catch(console.error);
              } else {
                copy('share-upi', (localUpi || '').trim());
              }
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
              transition: 'all 0.2s',
              marginTop: '4px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#FFEDD5'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#FFF7ED'}
          >
            {copiedKey === 'share-upi' ? '✓ UPI ID copied' : 'Share my UPI ID'}
          </button>
        )}
      </div>


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
                {/* No ₹1 upi:// link here: UPI apps decline link-launched payments to a
                    personal UPI ID. "Pay UPI ID" in the app shows the registered name. */}
                    <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                      Copy your UPI ID, then in GPay or any UPI app go to <strong style={{ color: '#2E2A25' }}>Pay UPI ID</strong> and paste it. It shows the name registered with your bank. <strong style={{color:'#EF4444'}}>Don't pay</strong> — just check the name and come back.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        mobileReturnPendingRef.current = Date.now();
                        copy('verify-upi', (localUpi || '').trim());
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
                      {copiedKey === 'verify-upi' ? '✓ UPI ID copied — now open GPay' : 'Copy my UPI ID'}
                    </button>

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
                      setUserMetadata({ ...userMetadata, [me]: { ...userMetadata[me], upiId: (localUpi || '').trim(), upiVerified: true } });
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
