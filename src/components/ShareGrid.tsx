import React, { useState } from 'react';

interface ShareGridProps {
  /** The text body shared to WhatsApp/Telegram/SMS/Email. */
  message: string;
  /** A URL to attach (Telegram url param); optional. */
  url?: string;
  /** What the Copy / Instagram buttons write to the clipboard (defaults to url, else message). */
  copyValue?: string;
}

/**
 * Shared social-share button grid (WhatsApp, Telegram, Instagram, SMS, Email,
 * Copy) with branded icons. Used by the invite and reminder modals so they look
 * identical.
 */
export const ShareGrid: React.FC<ShareGridProps> = ({ message, url, copyValue }) => {
  const [copied, setCopied] = useState(false);
  const encodedMsg = encodeURIComponent(message);
  const toCopy = copyValue ?? url ?? message;

  const doCopy = async () => {
    await navigator.clipboard.writeText(toCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apps = [
    {
      label: 'WhatsApp',
      bg: '#25D366',
      action: () => window.open(`https://wa.me/?text=${encodedMsg}`, '_blank'),
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.5l5.797-1.452A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.658-.497-5.188-1.367l-.372-.214-3.437.813.874-3.329-.242-.384A9.954 9.954 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
      ),
    },
    {
      label: 'Telegram',
      bg: '#29B6F6',
      action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url || 'https://divido.app')}&text=${encodedMsg}`, '_blank'),
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
    },
    {
      label: 'Instagram',
      bg: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
      action: () => { navigator.clipboard.writeText(toCopy); alert('Copied! Paste it in an Instagram DM 📸'); },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
        </svg>
      ),
    },
    {
      label: 'SMS',
      bg: '#4CAF50',
      action: () => window.open(`sms:?body=${encodedMsg}`, '_blank'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
        </svg>
      ),
    },
    {
      label: 'Email',
      bg: '#F97316',
      action: () => window.open(`mailto:?subject=Divido reminder&body=${encodedMsg}`, '_blank'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="M2 7l10 7 10-7"/>
        </svg>
      ),
    },
    {
      label: copied ? 'Copied!' : 'Copy',
      bg: copied ? '#10B981' : '#94A3B8',
      action: doCopy,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {copied
            ? <polyline points="20 6 9 17 4 12"/>
            : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>
          }
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: '14px', margin: '10px 0' }}>
      {apps.map((app) => (
        <div key={app.label} onClick={app.action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <div
            style={{ width: '48px', height: '48px', borderRadius: '14px', background: app.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.12s' }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {app.icon}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>{app.label}</span>
        </div>
      ))}
    </div>
  );
};
