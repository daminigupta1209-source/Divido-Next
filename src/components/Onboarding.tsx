import React from 'react';

interface OnboardingProps {
  tempName: string;
  setTempName: (name: string) => void;
  onOnboard: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({
  tempName,
  setTempName,
  onOnboard,
}) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #FDF2F8 0%, #FAF6F0 100%)',
        padding: '20px',
      }}
    >
      <div
        className="card shadow-xl"
        style={{
          width: '420px',
          padding: '40px',
          textAlign: 'center',
          animation: 'slideUp 0.4s ease-out',
          border: '1.5px solid rgba(0,0,0,0.03)',
        }}
      >
        <div
          className="hover-up"
          style={{
            width: '110px',
            height: '110px',
            borderRadius: '28px',
            overflow: 'hidden',
            border: '4px solid #FEF3C7',
            background: 'var(--w)',
            boxShadow: '0 12px 24px -8px rgba(251, 191, 36, 0.4)',
            position: 'relative',
            margin: '0 auto 24px',
            transition: '0.3s all',
          }}
        >
          <img
            src="/divido_laughing_cat_mascot_1778063273427.png"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              animation: 'laugh-bounce 2s infinite ease-in-out',
            }}
            alt="Mascot"
          />
        </div>

        <h2
          
          style={{
            fontSize: '32px',
            fontWeight: 600,
            color: '#0F172A',
            letterSpacing: '-1.5px',
            marginBottom: '8px',
          }}
        >
          Welcome to Divido <span style={{ color: '#F59E0B' }}>✨</span>
        </h2>
        <p
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--g)',
            lineHeight: 1.5,
            marginBottom: '32px',
          }}
        >
          Split expenses, not friendships. Beautiful, simple, and instant.
        </p>

        <div style={{ textAlign: 'left', marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--g)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            What should we call you?
          </label>
          <input
            type="search"
            placeholder="Enter your name..."
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: '16px',
              border: '2px solid #E2E8F0',
              background: 'var(--w)',
              fontSize: '16px',
              fontWeight: 600,
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tempName.trim()) {
                onOnboard();
              }
            }}
          />
        </div>

        <button
          onClick={onOnboard}
          disabled={!tempName.trim()}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            border: 'none',
            background: tempName.trim()
              ? 'linear-gradient(135deg, var(--accent) 0%, var(--purple-text) 100%)'
              : '#E2E8F0',
            color: tempName.trim() ? 'white' : '#94A3B8',
            fontWeight: 600,
            fontSize: '16px',
            cursor: tempName.trim() ? 'pointer' : 'default',
            boxShadow: tempName.trim() ? '0 10px 15px -3px rgba(219, 39, 119, 0.2)' : 'none',
            transition: '0.2s all',
          }}
          className={tempName.trim() ? 'hover-up' : ''}
        >
          Let's Begin! 🚀
        </button>
      </div>
    </div>
  );
};
