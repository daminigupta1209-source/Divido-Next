import React, { useState, useEffect } from 'react';

// A lightweight, dismissible "install this app" banner.
//   * Android/Chrome: captures the browser's beforeinstallprompt event and fires
//     the real install dialog from our own button.
//   * iOS/Safari: no such event exists, so we show the manual Share -> Add to
//     Home Screen steps instead.
// It hides itself when the app is already installed (running standalone) or was
// dismissed in the last 14 days.

const DISMISS_KEY = 'divido_install_dismissed_at';
const DISMISS_DAYS = 14;

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  // iOS Safari exposes this non-standard flag when launched from the home screen
  (navigator as any).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const recentlyDismissed = () => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    // Android/Chrome path: the browser tells us the app is installable.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we show our own UI
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS/Safari path: no event fires, so show the manual-steps banner directly.
    if (isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) {
      setVisible(true);
    }

    // If the app gets installed, drop the banner.
    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
    setShowIosHelp(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { /* ignore */ }
      setDeferredPrompt(null);
      setVisible(false);
      return;
    }
    // No native prompt available (iOS) — reveal the manual steps.
    setShowIosHelp((s) => !s);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        maxWidth: '420px',
        zIndex: 12000,
        background: '#FFFFFF',
        borderRadius: '18px',
        border: '1px solid #F1F5F9',
        boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.25)',
        padding: '14px 16px',
        boxSizing: 'border-box',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, border: '2px solid #FEF3C7', background: '#fff' }}>
          <img src="/divido_laughing_cat_mascot_1778063273427.png" alt="Divido" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Install Divido</div>
          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Add it to your home screen for a faster, app-like experience.</div>
        </div>
        <button
          onClick={handleInstall}
          style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: '12px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          {deferredPrompt ? 'Install' : 'How?'}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '16px', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
        >
          ✕
        </button>
      </div>

      {showIosHelp && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#475569', fontWeight: 600, lineHeight: 1.5 }}>
          On iPhone: tap the <strong>Share</strong> button <span style={{ fontSize: '14px' }}>􀈂</span> at the bottom of Safari, then choose <strong>“Add to Home Screen.”</strong>
        </div>
      )}
    </div>
  );
};
