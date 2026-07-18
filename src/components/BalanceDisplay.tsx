import React from 'react';

interface BalanceDisplayProps {
  balances: Record<string, number> | null | undefined;
  style?: React.CSSProperties;
  textPrefix?: string;
  highlightZero?: boolean;
  align?: 'left' | 'center' | 'right';
  showDetailedLabels?: boolean;
}

export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({
  balances,
  style,
  textPrefix = '',
  highlightZero = false,
  align = 'center',
  showDetailedLabels = false,
}) => {
  const entries = Object.entries(balances || {}).filter(([_, val]) => Math.abs(val) > 0.01);
  if (entries.length === 0) {
    return (
      <span style={{ ...style, color: highlightZero ? 'var(--g)' : 'inherit' }}>
        {textPrefix}Settled Up
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '12px',
        ...style,
      }}
    >
      {entries.map(([curr, val]) => (
        <div
          key={curr}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
            gap: '4px',
          }}
        >
          {showDetailedLabels && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '2px',
                color: val > 0.01 ? '#16A34A' : val < -0.01 ? '#DC2626' : 'var(--g)',
                opacity: 0.8,
              }}
            >
              {val > 0.01 ? 'You get back 📈' : val < -0.01 ? 'You pay 📉' : 'Settled'}
            </span>
          )}
          <div
            style={{
              color: val < -0.01 ? '#DC2626' : val > 0.01 ? '#16A34A' : '#000000',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <span style={{ width: '12px', textAlign: 'center', display: 'inline-block', flexShrink: 0 }}>
              {val > 0.01 && !showDetailedLabels ? '+' : val < -0.01 && !showDetailedLabels ? '-' : ''}
            </span>
            <span style={{ fontWeight: 400, opacity: 0.8, fontSize: '0.9em', marginLeft: '4px', marginRight: '2px' }}>
              {curr}
            </span>
            <span>
              {Math.abs(val).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
