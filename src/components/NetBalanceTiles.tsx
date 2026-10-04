import React from 'react';
import { formatExactAmount } from '../lib/utils';

// The net balance card used on Home, inside a group, Non-Group and All
// balances: two compact tiles with a tiny "Pay" / "Collect" label above the
// amount (instead of "You pay ₹…" eating the pill's width). Presentational
// only — callers pass already-formatted amounts.
export interface BalanceLine { curr: string; amount: number }

export interface NetBalanceTilesProps {
  /** Formatted main amount to pay, e.g. "₹1,200". Omit when nothing to pay. */
  pay?: string;
  /** How many more currencies are owed beyond `pay` (shows a "+N" chip). */
  payMore?: number;
  /** Formatted main amount to collect. Omit when nothing to collect. */
  collect?: string;
  collectMore?: number;
  /** Every currency, for the summary that opens from the "+N" chip. When
   *  given, tapping "+N" slides up the full breakdown. */
  payLines?: BalanceLine[];
  collectLines?: BalanceLine[];
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

// Slide-up summary of every currency, with All / Pay / Collect and a ✕.
export const BalanceSummarySheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  payLines: BalanceLine[];
  collectLines: BalanceLine[];
  initial?: 'all' | 'pay' | 'collect';
  payLabel?: string;
  collectLabel?: string;
}> = ({ isOpen, onClose, payLines, collectLines, initial = 'all', payLabel = 'You pay', collectLabel = 'You collect' }) => {
  const [filter, setFilter] = React.useState<'all' | 'pay' | 'collect'>(initial);
  React.useEffect(() => { if (isOpen) setFilter(initial); }, [isOpen, initial]);
  if (!isOpen) return null;
  const showPay = filter !== 'collect' && payLines.length > 0;
  const showCollect = filter !== 'pay' && collectLines.length > 0;
  const seg = (key: 'all' | 'pay' | 'collect', label: string, color: string) => {
    const on = filter === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setFilter(key)}
        style={{ flex: 1, border: 'none', borderRadius: '999px', padding: '7px 0', fontSize: '13px', fontWeight: on ? 700 : 600, cursor: 'pointer', background: on ? '#FFFFFF' : 'transparent', color: on ? color : '#64748B', boxShadow: on ? '0 2px 6px rgba(0,0,0,0.08)' : 'none' }}
      >
        {label}
      </button>
    );
  };
  const list = (lines: BalanceLine[], color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {lines.map((l) => (
        <div key={l.curr} style={{ padding: '10px 2px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '16px', fontWeight: 600, color }}>{l.curr}{formatExactAmount(Math.abs(l.amount))}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.22s ease-out' }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '28px', marginBottom: '12px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '-4px' }} />
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>Balance summary</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '999px', padding: '3px', gap: '2px', marginBottom: '14px' }}>
          {seg('all', 'All', '#1E293B')}
          {seg('pay', 'Pay', PINK)}
          {seg('collect', 'Collect', '#047857')}
        </div>

        {showPay && (
          <div style={{ marginBottom: showCollect ? '16px' : 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '2px' }}>{payLabel}</div>
            {list(payLines, '#B91C1C')}
          </div>
        )}
        {showCollect && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '2px' }}>{collectLabel}</div>
            {list(collectLines, '#047857')}
          </div>
        )}
        {!showPay && !showCollect && (
          <div style={{ fontSize: '14px', color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
            {filter === 'pay' ? 'Nothing to pay' : filter === 'collect' ? 'Nothing to collect' : 'All settled up'}
          </div>
        )}
      </div>
    </div>
  );
};

const Tile: React.FC<{ bg: string; label: string; amount: string; more?: number; chevron: boolean; clickable: boolean; onTap?: () => void; onMore?: () => void; dim?: boolean; selected?: boolean }> = ({ bg, label, amount, more, chevron, clickable, onTap, onMore, dim, selected }) => (
  <div
    onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
    style={{
      position: 'relative',
      minWidth: 0,
      background: bg,
      color: '#FFFFFF',
      borderRadius: '14px',
      paddingTop: '6px',
      paddingBottom: '6px',
      paddingRight: chevron ? '28px' : '14px',
      paddingLeft: chevron ? '28px' : '14px',
      boxShadow: selected ? '0 0 0 2px #FFFFFF, 0 0 0 4px ' + bg : '0 6px 16px rgba(0,0,0,0.06)',
      opacity: dim ? 0.45 : 1,
      transition: 'opacity 0.2s, box-shadow 0.2s',
      cursor: clickable ? 'pointer' : 'default',
    }}
  >
    <div style={{ fontSize: '11px', fontWeight: 500, opacity: 0.9, lineHeight: 1.3, textAlign: 'center' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: 0 }}>
      <span style={{ fontSize: '14.5px', fontWeight: 600, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{amount}</span>
      {!!more && more > 0 && (
        onMore ? (
          <button
            type="button"
            aria-label={`${more} more — see summary`}
            onClick={(e) => { e.stopPropagation(); onMore(); }}
            style={{ ...chipStyle, border: 'none', color: '#FFFFFF', cursor: 'pointer', background: 'rgba(255,255,255,0.32)' }}
          >
            +{more}
          </button>
        ) : (
          <span style={chipStyle}>+{more}</span>
        )
      )}
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
  payLines,
  collectLines,
  onClick,
  onPayClick,
  onCollectClick,
  active = null,
  settledLabel = 'All settled up',
  payLabel = 'Pay',
  collectLabel = 'Collect',
  style,
}) => {
  const [summary, setSummary] = React.useState<null | 'pay' | 'collect'>(null);
  const hasLines = !!(payLines || collectLines);
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
    <>
      <div
        onClick={onClick}
        style={{ display: 'grid', gridTemplateColumns: both ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: '8px', width: '100%', ...style }}
      >
        {pay && <Tile bg={PINK} label={payLabel} amount={pay} more={payMore} chevron={!collect && !!onClick} clickable={!!(onClick || onPayClick)} onTap={onPayClick} onMore={hasLines ? () => setSummary('pay') : undefined} dim={active === 'collect'} selected={active === 'pay'} />}
        {collect && <Tile bg={GREEN} label={collectLabel} amount={collect} more={collectMore} chevron={!!onClick} clickable={!!(onClick || onCollectClick)} onTap={onCollectClick} onMore={hasLines ? () => setSummary('collect') : undefined} dim={active === 'pay'} selected={active === 'collect'} />}
      </div>
      {hasLines && (
        <BalanceSummarySheet
          isOpen={summary !== null}
          onClose={() => setSummary(null)}
          payLines={payLines || []}
          collectLines={collectLines || []}
          initial="all"
          payLabel={payLabel === 'Pay' ? 'You pay' : payLabel}
          collectLabel={collectLabel === 'Collect' ? 'You collect' : collectLabel}
        />
      )}
    </>
  );
};
