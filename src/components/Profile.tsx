import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

import { Group } from '../lib/types';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
import { worldCurrencies } from '../lib/utils';

interface ProfileProps {
  groups: Group[];
  expenses: any[];
  handleHardReset: () => void;
  currentTheme: 'lavender' | 'sunset';
  onThemeChange: (t: 'lavender' | 'sunset') => void;
  userName: string;
  setUserName: (n: string) => void;
  me: string;
  setShowDeleteAccountModal: (b: boolean) => void;
  userMetadata: Record<string, any>;
  setUserMetadata: (m: Record<string, any>) => void;
  handleLogout: () => void;
  userEmail: string;
}

export const Profile: React.FC<ProfileProps> = ({
  groups,
  expenses,
  handleHardReset,
  currentTheme,
  onThemeChange,
  userName,
  setUserName,
  me,
  setShowDeleteAccountModal,
  userMetadata,
  setUserMetadata,
  handleLogout,
  userEmail,
}) => {
  const [localName, setLocalName] = useState(userName);
  const [localUpi, setLocalUpi] = useState(userMetadata[me]?.upiId || '');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [manualRates, setManualRates] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const upiInputRef = useRef<HTMLInputElement>(null);
  const verifyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  }, []);

  const defaultCurrency = userMetadata[me]?.defaultCurrency || '₹';
  const currencyInfo = worldCurrencies.find((c) => c.s === defaultCurrency);

  const handleNameBlur = () => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== userName) {
      setUserName(trimmed);
    } else {
      setLocalName(userName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setLocalName(userName);
      e.currentTarget.blur();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserMetadata({
          ...userMetadata,
          [me]: {
            ...userMetadata[me],
            profilePhoto: reader.result as string,
          },
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const profilePhoto = userMetadata[me]?.profilePhoto;
  const initials = userName
    .split(' ')
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DG';

  return (
    <div className="content-width-limit animate-fade-in" style={{ maxWidth: '440px', margin: '0 auto', padding: '0 16px 32px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Avatar / Photo Header Block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0 6px' }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: '#FFEBE0',
              border: '4px solid #FFF3EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              boxShadow: '0 8px 24px rgba(251, 146, 60, 0.12)',
              overflow: 'hidden',
              transition: '0.2s all ease',
            }}
            className="hover-up-mini"
            title="Upload Profile Photo"
          >
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#E65100', userSelect: 'none' }}>
                {initials}
              </span>
            )}
            
            {/* Camera Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.25s ease',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 700,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
            >
              📷 Edit
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />

          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#2E2A25', margin: '14px 0 2px', lineHeight: 1.2 }}>
            {userName}
          </h2>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#A09586', letterSpacing: '0.3px' }}>
            Personal Account
          </span>
        </div>

        {/* Section 1: Personal Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#A09586', textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 4px 2px' }}>
            Personal Details
          </span>
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#FFFFFF',
              border: '0.5px solid #EFE7DC',
              borderRadius: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {/* Full Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Full Name
              </label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={handleKeyDown}
                placeholder="Enter your name"
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

            <hr style={{ border: 'none', borderTop: '0.5px solid #F5EFEB', margin: 0 }} />

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email
              </label>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#2E2A25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userEmail || 'Guest Account'}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '0.5px solid #F5EFEB', margin: 0 }} />

            {/* UPI */}
            {(() => {
              const [upiError, setUpiError] = useState<string | null>(null);
              const [verificationStep, setVerificationStep] = useState<'idle' | 'awaiting_action' | 'verifying' | 'confirm_resolved'>('idle');
              const isVerified = !!userMetadata[me]?.upiVerified && userMetadata[me]?.upiId === localUpi.trim();

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
            })()}
          </div>
        </div>

        {/* Section 2: Preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#A09586', textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 4px 2px' }}>
            Preferences
          </span>
          <div
            className="card hover-up-mini"
            id="profile-default-currency-btn"
            onClick={() => setShowCurrencyPicker(true)}
            style={{
              padding: '16px 20px',
              background: '#FFFFFF',
              border: '0.5px solid #EFE7DC',
              borderRadius: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#FEF3C7',
                  border: '1.5px solid #FDE68A',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                🪙
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#2E2A25' }}>Primary Currency</span>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#A09586', marginTop: '2px' }}>
                  {currencyInfo?.c || 'INR'} — {currencyInfo?.n || 'Indian Rupee'}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '20px', color: '#CFC6BB', fontWeight: 900, userSelect: 'none' }}>›</span>
          </div>
        </div>

        {/* Currency Picker Modal */}
        <SearchableCurrencyPicker
          show={showCurrencyPicker}
          onClose={() => setShowCurrencyPicker(false)}
          current={defaultCurrency}
          onSelect={(symbol) => {
            setUserMetadata({
              ...userMetadata,
              [me]: {
                ...userMetadata[me],
                defaultCurrency: symbol,
              },
            });
            setShowCurrencyPicker(false);
          }}
        />

        {/* Section 3: Appearance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#A09586', textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 4px 2px' }}>
            Appearance
          </span>
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#FFFFFF',
              border: '0.5px solid #EFE7DC',
              borderRadius: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
              display: 'flex',
              gap: '10px',
            }}
          >
            <button
              onClick={() => onThemeChange('lavender')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '12px',
                border: currentTheme === 'lavender' ? '1.5px solid #DB2777' : '1.5px solid #F1F5F9',
                background: currentTheme === 'lavender' ? '#FFF5F5' : '#F8FAFC',
                color: currentTheme === 'lavender' ? '#DB2777' : '#64748B',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                transition: '0.2s all',
              }}
            >
              🌸 Lavender
            </button>
            <button
              onClick={() => onThemeChange('sunset')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '12px',
                border: currentTheme === 'sunset' ? '1.5px solid #F97316' : '1.5px solid #F1F5F9',
                background: currentTheme === 'sunset' ? '#FFF7ED' : '#F8FAFC',
                color: currentTheme === 'sunset' ? '#EA580C' : '#64748B',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                transition: '0.2s all',
              }}
            >
              ☀️ Sunset
            </button>
          </div>
        </div>

        {/* Section 4: Settings & Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#A09586', textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 4px 2px' }}>
            System Settings
          </span>
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: '#FFFFFF',
              border: '0.5px solid #EFE7DC',
              borderRadius: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <button
              onClick={handleLogout}
              className="hover-up-mini"
              style={{
                width: '100%',
                background: '#F8FAFC',
                color: '#475569',
                border: '1px solid #E2E8F0',
                padding: '10px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#F8FAFC'}
            >
              Logout
            </button>
            <button
              onClick={handleHardReset}
              className="hover-up-mini"
              style={{
                width: '100%',
                background: '#FEF2F2',
                color: '#EF4444',
                border: '1px solid #FCA5A5',
                padding: '10px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🚨 Hard Reset Data
            </button>
            <button
              onClick={() => setShowDeleteAccountModal(true)}
              className="hover-up-mini"
              style={{
                width: '100%',
                background: '#FFFFFF',
                color: '#EF4444',
                border: '1px solid #FEE2E2',
                padding: '10px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🗑️ Delete Account
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
