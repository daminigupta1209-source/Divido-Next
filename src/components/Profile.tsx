import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Group } from '../lib/types';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
import { UpiSection } from './UpiSection';
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
  
  const [highlightSignin, setHighlightSignin] = useState(false);
  const signinCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('divido_highlight_signin') === 'true') {
      setHighlightSignin(true);
      sessionStorage.removeItem('divido_highlight_signin');
      signinCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => {
        setHighlightSignin(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
            className={`card ${highlightSignin ? 'highlight-glow' : ''}`}
            ref={signinCardRef}
            style={{
              padding: '16px 20px',
              background: '#FFFFFF',
              border: highlightSignin ? '1.5px solid #F59E0B' : '0.5px solid #EFE7DC',
              borderRadius: '18px',
              boxShadow: highlightSignin ? '0 0 15px rgba(245, 158, 11, 0.25)' : '0 4px 12px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              transition: 'all 0.5s ease',
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

            {/* Email / Security */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#B3A897', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Account Security
              </label>
              {userEmail ? (
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#2E2A25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div style={{
                    background: '#FFF7ED',
                    border: '1.5px solid #FFEDD5',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#C2410C',
                    lineHeight: 1.4,
                    textAlign: 'left'
                  }}>
                    ⚠️ Guest Account active. Secure sign-in is required to add or edit expenses.
                  </div>
                  <button
                    onClick={async () => {
                      const { error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                          redirectTo: window.location.origin,
                        },
                      });
                      if (error) alert(error.message);
                    }}
                    style={{
                      height: '40px',
                      borderRadius: '20px',
                      border: '1.5px solid #FDBA74',
                      background: '#FFF7ED',
                      color: '#9A3412',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      boxShadow: '0 4px 6px -1px rgba(253, 186, 116, 0.1)',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.17-4.53z" />
                    </svg>
                    Link Google Account
                  </button>
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '0.5px solid #F5EFEB', margin: 0 }} />

            {/* UPI */}
            <UpiSection
              localUpi={localUpi}
              setLocalUpi={setLocalUpi}
              userMetadata={userMetadata}
              setUserMetadata={setUserMetadata}
              me={me}
              userName={userName}
              isMobile={isMobile}
              handleKeyDown={handleKeyDown}
            />
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
