import React from 'react';

// The net balance card used on Home, inside a group, Non-Group and All
// balances: two compact tiles with a tiny "Pay" / "Collect" label above the
// amount (instead of "You pay ₹…" eating the pill's width). Presentational
// only — callers pass already-formatted amounts.
export interface NetBalanceTilesProps {
  /** Formatted main amount to pay, e.g. "₹1,200". Omit when nothing to pay. */
  pay?: string;
  /** How many more currencies are owed beyond `pay` (shows a "+N" chip). */
  payMore?: number;
  /** Formatted main amount to collect. Omit when nothing to collect. */
  collect?: string;
  collectMore?: number;
  /** Tap handler (opens the breakdown / settle screen). */
  onClick?: () => void;
  /** Optional per-tile taps (e.g. open the list filtered to pay / collect). */
  onPayClick?: () => void;
  onCollectClick?: () => void;
  /** Which tile is the active filter (the other one is dimmed). */
  active?: 'pay' | 'collect' | null;
  /** Label for the settled state. */
  settledLabel?: string;
  /** Override the "Pay" / "Collect" labels (e.g. another person's balance). */
  payLabel?: string;
  collectLabel?: string;
  style?: React.CSSProperties;
}

const PINK = '#EF4444';
const GREEN = '#10B981';

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.28)',
  borderRadius: '999px',
  padding: '1px 7px',
  fontSize: '11px',
  fontWeight: 600,
  flexShrink: 0,
};

const Tile: React.FC<{ bg: string; label: string; amount: string; more?: number; chevron: boolean; clickable: boolean; onTap?: () => void; dim?: boolean; selected?: boolean }> = ({ bg, label, amount, more, chevron, clickable, onTap, dim, selected }) => (
  <div
    onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
    style={{
      position: 'relative',
      minWidth: 0,
      background: bg,
      color: '#FFFFFF',
      borderRadius: '14px',
      padding: '6px 14px',
      paddingRight: chevron ? '28px' : '14px',
      boxShadow: selected ? '0 0 0 2px #FFFFFF, 0 0 0 4px ' + bg : '0 6px 16px rgba(0,0,0,0.06)',
      opacity: dim ? 0.45 : 1,
      transition: 'opacity 0.2s, box-shadow 0.2s',
      cursor: clickable ? 'pointer' : 'default',
    }}
  >
    <div style={{ fontSize: '11px', fontWeight: 500, opacity: 0.9, lineHeight: 1.3 }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
      <span style={{ fontSize: '14.5px', fontWeight: 600, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{amount}</span>
      {!!more && more > 0 && <span style={chipStyle}>+{more}</span>}
    </div>
    {chevron && (
      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 600, lineHeight: 1, opacity: 0.9, pointerEvents: 'none' }}>›</span>
    )}
  </div>
);

export const NetBalanceTiles: React.FC<NetBalanceTilesProps> = ({
  pay,
  payMore,
  collect,
  collectMore,
  onClick,
  onPayClick,
  onCollectClick,
  active = null,
  settledLabel = 'All settled up',
  payLabel = 'Pay',
  collectLabel = 'Collect',
  style,
}) => {
  const settled = !pay && !collect;
  if (settled) {
    return (
      <div
        style={{
          height: '38px',
          borderRadius: '999px',
          background: GREEN,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
          width: '100%',
          ...style,
        }}
      >
        {settledLabel}
      </div>
    );
  }
  const both = !!pay && !!collect;
  return (
    <div
      onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: both ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: '8px', width: '100%', ...style }}
    >
      {pay && <Tile bg={PINK} label={payLabel} amount={pay} more={payMore} chevron={!collect && !!onClick} clickable={!!(onClick || onPayClick)} onTap={onPayClick} dim={active === 'collect'} selected={active === 'pay'} />}
      {collect && <Tile bg={GREEN} label={collectLabel} amount={collect} more={collectMore} chevron={!!onClick} clickable={!!(onClick || onCollectClick)} onTap={onCollectClick} dim={active === 'pay'} selected={active === 'collect'} />}
    </div>
  );
};
