import React, { useState } from 'react';
import { worldCurrencies } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';

interface CurrencySetupModalProps {
  show: boolean;
  /** Locale-detected best guess, pre-selected for the user to confirm. */
  suggested: string;
  /** Save the chosen currency as the user's default. */
  onConfirm: (symbol: string) => void;
  /** Dismiss without saving a default (keeps guessing from locale). */
  onSkip: () => void;
}

export const CurrencySetupModal: React.FC<CurrencySetupModalProps> = ({
  show,
  suggested,
  onConfirm,
  onSkip,
}) => {
  const [selected, setSelected] = useState(suggested);
  const [showPicker, setShowPicker] = useState(false);

  if (!show) return null;

  const info = worldCurrencies.find((c) => c.s === selected || c.c === selected);

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 6500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className="card shadow-xl"
        style={{
          width: '340px',
          padding: '24px',
          background: 'var(--w)',
          textAlign: 'center',
          borderRadius: '24px',
          animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxSizing: 'border-box',
        }}
      >
        <h2 className="nunito" style={{ fontSize: '19px', fontWeight: 900, color: 'var(--t)', margin: '0 0 6px' }}>
          Which currency do you use?
        </h2>
        <p style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--g)', margin: '0 0 18px', lineHeight: 1.5 }}>
          Choose your default currency for splits and payments.
        </p>

        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: '14px',
            border: '1.5px solid #E2E8F0',
            background: 'var(--bg)',
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--t)', minWidth: '34px', textAlign: 'left' }}>{selected}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--g)' }}>{info?.n || 'Selected currency'}</span>
          </span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#8B5CF6' }}>Change</span>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn-green hover-up"
            onClick={() => onConfirm(selected)}
            style={{ padding: '13px', fontSize: '14px', borderRadius: '14px', width: '100%', fontWeight: 950, border: 'none' }}
          >
            Confirm
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: '10px',
              background: 'none',
              border: 'none',
              color: 'var(--g)',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            Decide later
          </button>
        </div>
      </div>

      <SearchableCurrencyPicker
        show={showPicker}
        onClose={() => setShowPicker(false)}
        current={selected}
        onSelect={(symbol) => {
          setSelected(symbol);
          setShowPicker(false);
        }}
      />
    </div>
  );
};
