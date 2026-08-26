import React, { useState, useEffect, useMemo } from 'react';
import { worldCurrencies } from '../lib/utils';
import { escManager } from '../lib/escManager';

interface SearchableCurrencyPickerProps {
  show: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  current: string;
}

export const SearchableCurrencyPicker: React.FC<SearchableCurrencyPickerProps> = ({
  show,
  onClose,
  onSelect,
  current,
}) => {
  const [search, setSearch] = useState('');
  const [usage, setUsage] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('divido_currency_usage');
    return saved ? JSON.parse(saved) : { '₹': 100, '$': 50, '€': 30, '£': 20 }; // Sensible defaults
  });

  const sortedCurrencies = useMemo(() => {
    return [...worldCurrencies].sort((a, b) => {
      const countA = usage[a.s] || 0;
      const countB = usage[b.s] || 0;
      if (countB !== countA) return countB - countA;
      return a.n.localeCompare(b.n); // Secondary sort by name
    });
  }, [usage]);

  const filtered = sortedCurrencies.filter(
    (curr) =>
      curr.n.toLowerCase().includes(search.toLowerCase()) ||
      curr.c.toLowerCase().includes(search.toLowerCase()) ||
      curr.s.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (show) {
      const unregister = escManager.register(onClose);
      return unregister;
    }
  }, [show, onClose]);

  useEffect(() => {
    if (show) {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && filtered.length > 0) {
          handleSelect(filtered[0].s);
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }
  }, [show, filtered]);

  const handleSelect = (symbol: string) => {
    const newUsage = { ...usage, [symbol]: (usage[symbol] || 0) + 1 };
    setUsage(newUsage);
    localStorage.setItem('divido_currency_usage', JSON.stringify(newUsage));
    onSelect(symbol);
    onClose();
  };

  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        zIndex: 2000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '16px',
          width: '320px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.95)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2  style={{ fontSize: '16px', fontWeight: 600 }}>
            Select Currency
          </h2>
          <button
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'var(--bg)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: 'var(--g)',
            }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 14px',
            borderRadius: '12px',
            border: '1.5px solid #F1F5F9',
            background: 'var(--bg)',
            marginBottom: '10px',
          }}
        >
          <svg
            style={{ opacity: 0.4, color: 'var(--t)', flexShrink: 0 }}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            autoFocus
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            data-1p-ignore
            data-lpignore="true"
            placeholder="Search by name, code, or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 0',
              border: 'none',
              background: 'transparent',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--t)',
              outline: 'none',
            }}
          />
        </div>
        <div
          style={{
            maxHeight: '240px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '4px',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: 'var(--g)', fontWeight: 600, fontSize: '14px' }}>
                No currencies found for "{search}"
              </p>
            </div>
          ) : (
            filtered.map((curr) => (
              <div
                key={curr.c}
                onClick={() => handleSelect(curr.s)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  border: current === curr.s ? '1.5px solid #10B981' : '1px solid #F1F5F9',
                  background: current === curr.s ? '#ECFDF5' : 'white',
                  cursor: 'pointer',
                  transition: '0.2s all',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      background: 'var(--bg)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: curr.s.length > 2 ? '8px' : curr.s.length > 1 ? '10px' : '13px',
                      fontWeight: 600,
                      border: '1px solid #E2E8F0',
                      color: '#0F172A',
                    }}
                  >
                    {curr.s}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>
                      {curr.n}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {curr.c}
                    </div>
                  </div>
                </div>
                {current === curr.s && (
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '12px',
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
