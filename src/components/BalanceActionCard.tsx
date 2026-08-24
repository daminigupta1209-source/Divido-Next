import React, { useEffect } from 'react';
import { escManager } from '../lib/escManager';

interface BalanceActionCardProps {
  title: string;
  desc: string;
  primaryLabel: string;
  primaryColor: string;   // hex, e.g. '#F97316'
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
}

// A plain confirmation card (no emoji), matching the app's Nunito style:
// a title, one short line, a coloured primary button, and an optional grey
// secondary link. The ✕ closes it (no Cancel button). Used for the
// leave / remove / write-off flows.
export const BalanceActionCard: React.FC<BalanceActionCardProps> = ({
  title, desc, primaryLabel, primaryColor, onPrimary, secondaryLabel, onSecondary, onClose,
}) => {
  useEffect(() => {
    const unregister = escManager.register(onClose);
    return unregister;
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '320px', background: '#FFFFFF', borderRadius: '24px',
          padding: '30px 22px 22px', position: 'relative', textAlign: 'center',
          boxShadow: '0 20px 40px -12px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        <button
          onClick={onClose}
          title="Close"
          style={{
            position: 'absolute', top: '16px', right: '16px', width: '26px', height: '26px',
            borderRadius: '50%', background: '#F1F5F9', color: '#64748B', border: 'none',
            fontSize: '12px', fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', lineHeight: 1.4, margin: '0 0 20px' }}>
          {desc}
        </p>

        <button
          onClick={onPrimary}
          style={{
            width: '100%', padding: '13px', borderRadius: '14px', border: 'none',
            background: primaryColor, color: '#FFFFFF', fontSize: '14px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{primaryLabel}</button>

        {secondaryLabel && (
          <div
            onClick={onSecondary}
            style={{ marginTop: '12px', fontSize: '13px', fontWeight: 800, color: '#94A3B8', cursor: 'pointer' }}
          >{secondaryLabel}</div>
        )}
      </div>
    </div>
  );
};
