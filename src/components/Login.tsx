import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LoginProps {
  onLoginSuccess: (name: string) => void;
  currentTheme: 'lavender' | 'sunset';
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, currentTheme }) => {
  const isThemeSunset = currentTheme === 'sunset';
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shouldShake, setShouldShake] = useState(false);

  const triggerShake = () => {
    setShouldShake(true);
    setTimeout(() => setShouldShake(false), 500);
  };

  const checkIfDemoMode = () => {
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    return !url || url.includes('your-project-id') || !key || key.includes('your-supabase-anon-key');
  };

  // Google OAuth logic
  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    if (checkIfDemoMode()) {
      setLoading(true);
      setTimeout(() => {
        const mockName = 'Google User';
        localStorage.setItem('divido_authenticated', 'true');
        localStorage.setItem('divido_username', mockName);
        onLoginSuccess(mockName);
        setLoading(false);
      }, 800);
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setErrorMsg(err.message || 'Could not authenticate using Google.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };



  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isThemeSunset
          ? 'linear-gradient(135deg, #FFF1F2 0%, #FAF6F0 100%)'
          : 'linear-gradient(135deg, #FDF2F8 0%, #FAF6F0 100%)',
        padding: '20px',
        color: '#1E293B',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <style>{`
        .suno-card {
          width: 440px;
          background: #FFFFFF;
          border-radius: 28px;
          padding: 44px 36px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
          border: 1.5px solid rgba(0,0,0,0.03);
          position: relative;
          text-align: center;
          box-sizing: border-box;
          animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .suno-title {
          font-size: 26px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }

        /* Google Pill Button */
        .google-pill-btn {
          width: 100%;
          height: 52px;
          border-radius: 26px;
          border: 1.5px solid #FDBA74; /* Orange-300 border for visibility */
          background: #FFF7ED; /* Light Orange-50 background */
          color: #9A3412; /* Darker Orange-800 text for high contrast */
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 10px;
          margin-bottom: 12px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          outline: none;
          box-shadow: 0 4px 6px -1px rgba(253, 186, 116, 0.15);
        }
        .google-pill-btn:hover:not(:disabled) {
          background: #FFEDD5; /* Slightly deeper Orange-100 on hover */
          border-color: #FB923C; /* Orange-400 on hover */
          transform: scale(1.01);
          box-shadow: 0 10px 15px -3px rgba(253, 186, 116, 0.25);
        }
        .google-pill-btn:active:not(:disabled) {
          transform: scale(0.99);
        }
        .google-pill-btn:disabled {
          background: #F1F5F9;
          color: #94A3B8;
          border-color: #E2E8F0;
          cursor: not-allowed;
        }

        .error-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }

        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-6px); }
          100% { transform: translateX(0); }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className={`suno-card ${shouldShake ? 'error-shake' : ''}`}>
        {/* Mascot Header */}
        <div
          className="hover-up"
          style={{
            width: '90px',
            height: '90px',
            borderRadius: '24px',
            overflow: 'hidden',
            border: '4px solid #FEF3C7',
            background: 'white',
            boxShadow: '0 12px 24px -8px rgba(251, 191, 36, 0.4)',
            margin: '0 auto 24px',
            transition: '0.3s all',
            cursor: 'pointer',
          }}
        >
          <img
            src="/divido_laughing_cat_mascot_1778063273427.png"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            alt="Divido Mascot"
          />
        </div>

        <h2 className="suno-title">Welcome to Divido</h2>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '32px', lineHeight: '1.5' }}>
          Manage groups, split expenses, and track balances.
        </p>

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              background: '#FFF1F2',
              border: '1.5px solid #FECDD3',
              borderRadius: '14px',
              fontSize: '13px',
              color: '#9F1239',
              fontWeight: 600,
              textAlign: 'left',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>🛑</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          className="google-pill-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <span style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.17-4.53z" />
            </svg>
          </span>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>




        <p style={{ fontSize: '11px', color: '#64748B', lineHeight: '1.5', marginTop: '36px' }}>
          By continuing, you accept our <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span> and <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Terms of Use</span>.
        </p>
      </div>
    </div>
  );
};
