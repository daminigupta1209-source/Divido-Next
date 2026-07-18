import React, { useEffect } from 'react';
import { escManager } from '../lib/escManager';

interface PremiumConfirmProps {
  show: boolean;
  title: string;
  desc: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'logout' | 'success';
}

export const PremiumConfirm: React.FC<PremiumConfirmProps> = ({
  show,
  title,
  desc,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  type = 'danger',
}) => {
  useEffect(() => {
    if (show) {
      const unregister = escManager.register(onCancel);
      return unregister;
    }
  }, [show, onCancel]);

  useEffect(() => {
    if (show) {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }
  }, [show, onConfirm]);

  if (!show) return null;

  return (
    <div className="premium-confirm-overlay" onClick={onCancel}>
      <div
        className="premium-confirm-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '310px',
          padding: '20px',
          borderRadius: '24px',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        <button
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#94A3B8',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
          }}
          title="Close"
        >
          ✕
        </button>
        <div
          style={{
            width: '48px',
            height: '48px',
            background: type === 'danger' ? '#FEF2F2' : type === 'logout' ? '#EFF6FF' : '#F0FDF4',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            margin: '0 auto 12px',
            border:
              type === 'danger'
                ? '2px solid #FEE2E2'
                : type === 'logout'
                ? '2px solid #DBEAFE'
                : '2px solid #DCFCE7',
          }}
        >
          {type === 'danger' ? '⚠️' : type === 'logout' ? '🚪' : '✨'}
        </div>
        <h3
          className="nunito"
          style={{ fontSize: '18px', fontWeight: 900, marginBottom: '6px', color: '#1E293B' }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--g)',
            lineHeight: 1.4,
            marginBottom: '20px',
            padding: '0 8px',
          }}
        >
          {desc}
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-yellow"
            style={{
              flex: 1,
              background: 'var(--bg)',
              color: '#64748B',
              border: 'none',
              borderRadius: '12px',
              padding: '11px',
              fontWeight: 900,
              fontSize: '13px',
              cursor: 'pointer',
            }}
            onClick={onCancel}
          >
            {cancelText || 'Go Back'}
          </button>
          <button
            className={type === 'danger' ? 'btn-red' : 'btn-green'}
            style={{
              flex: 1.3,
              padding: '11px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 900
            }}
            onClick={onConfirm}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
