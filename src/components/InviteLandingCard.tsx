import React, { useEffect, useRef } from 'react';
import { GROUP_COLORS } from '../lib/utils';
import { escManager } from '../lib/escManager';

export type InviteGroupStatus = 'available' | 'takenByOther' | 'alreadyMineOpen';

export interface InviteGroupRow {
  groupId: string;
  name?: string;
  emoji?: string;
  memberCount?: number;
  status: InviteGroupStatus;
}

export interface InviteLandingCardProps {
  mode: 'signedOut' | 'signedIn';
  totalCount: number;            // signed-out: N from link; signed-in: rows.length
  rows: InviteGroupRow[];        // 'unavailable' already filtered out by caller
  selectedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
  onOpenGroup?: (groupId: string) => void;
  busy: boolean;
  joiningGroupId?: string | null;
  rowErrors?: Record<string, string>;
  onJoinSelected: () => void;
  onSignIn: () => void;
  onDismiss: () => void;
}

const plural = (n: number): string => (n === 1 ? '' : 's');

const isImageSrc = (src?: string): boolean =>
  !!src && (src.startsWith('data:image/') || src.startsWith('http'));

// A "real" emoji glyph is short and doesn't start with a letter — that rules out
// plain-text initials (e.g. a stray "A") being rendered like an emoji.
const isShortEmojiGlyph = (src?: string): boolean =>
  !!src && !isImageSrc(src) && src.length <= 4 && !/^[a-zA-Z]/.test(src);

const rowNameStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#0F172A',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const CHECKBOX_COLUMN_WIDTH = 20;

const GoogleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.17-4.53z" />
  </svg>
);

const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#FFFFFF' }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2px solid ${color}55`,
      borderTopColor: color,
      animation: 'ilcSpin 0.7s linear infinite',
      flexShrink: 0,
    }}
  />
);

const GroupAvatar: React.FC<{ name?: string; emoji?: string; index: number }> = ({ name, emoji, index }) => {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  const isImage = isImageSrc(emoji);
  const isGlyph = isShortEmojiGlyph(emoji);
  return (
    <div
      style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: color.bg,
        color: color.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isGlyph ? '18px' : '16px',
        fontWeight: 700,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {isImage ? (
        <img src={emoji} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : isGlyph ? (
        emoji
      ) : (
        (name || '?').charAt(0).toUpperCase()
      )}
    </div>
  );
};

const MemberPill: React.FC<{ count?: number }> = ({ count }) => {
  if (count == null) return null;
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: '#64748B',
        background: '#F1F5F9',
        padding: '2px 8px',
        borderRadius: '999px',
        flexShrink: 0,
      }}
    >
      {count} member{plural(count)}
    </span>
  );
};

const SkeletonRow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '6px 4px' }}>
    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F1F5F9', flexShrink: 0 }} />
    <div className="ilc-shimmer-bar" style={{ height: '14px', width: '60%', borderRadius: '7px' }} />
  </div>
);

// Consecutive unknown (skeleton) rows are grouped into a single accessible
// "block" — screen readers get one summary instead of N identical placeholders.
const SkeletonBlock: React.FC<{ count: number; totalCount: number }> = ({ count, totalCount }) => (
  <div
    role="group"
    aria-label={`${totalCount} group${plural(totalCount)} — details appear after sign-in`}
    style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonRow key={i} />
    ))}
  </div>
);

const SignedOutRows: React.FC<{ totalCount: number; rows: InviteGroupRow[] }> = ({ totalCount, rows }) => {
  const shownCount = Math.min(totalCount, 5);
  const items: React.ReactNode[] = [];
  let skeletonRun = 0;
  const flushSkeletons = () => {
    if (skeletonRun === 0) return;
    items.push(<SkeletonBlock key={`skeleton-${items.length}`} count={skeletonRun} totalCount={totalCount} />);
    skeletonRun = 0;
  };
  for (let i = 0; i < shownCount; i++) {
    const row = rows[i];
    if (row && row.name) {
      flushSkeletons();
      items.push(
        <div key={row.groupId} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '6px 4px' }}>
          <GroupAvatar name={row.name} emoji={row.emoji} index={i} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={rowNameStyle}>{row.name}</span>
            <MemberPill count={row.memberCount} />
          </div>
        </div>
      );
    } else {
      skeletonRun++;
    }
  }
  flushSkeletons();
  return (
    <>
      {items}
      {totalCount > 5 && (
        <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', marginTop: '4px' }}>
          +{totalCount - 5} more
        </div>
      )}
    </>
  );
};

const AvailableRow: React.FC<{
  row: InviteGroupRow;
  index: number;
  checked: boolean;
  isJoining: boolean;
  busy: boolean;
  error?: string;
  onToggleGroup: (groupId: string) => void;
}> = ({ row, index, checked, isJoining, busy, error, onToggleGroup }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minHeight: '44px',
      padding: '6px 4px',
      cursor: busy ? 'default' : 'pointer',
      borderRadius: '12px',
    }}
  >
    <span style={{ width: `${CHECKBOX_COLUMN_WIDTH}px`, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
      {isJoining ? (
        <Spinner size={20} color="#7C3AED" />
      ) : (
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleGroup(row.groupId)}
          disabled={busy}
          style={{ width: '20px', height: '20px', accentColor: '#7C3AED', opacity: busy ? 0.6 : 1 }}
        />
      )}
    </span>
    <GroupAvatar name={row.name} emoji={row.emoji} index={index} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={rowNameStyle}>{row.name}</span>
        <MemberPill count={row.memberCount} />
      </div>
      {error && (
        <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#B91C1C', marginTop: '2px' }}>{error}</div>
      )}
    </div>
  </label>
);

const TakenByOtherRow: React.FC<{ row: InviteGroupRow; index: number }> = ({ row, index }) => (
  <div
    aria-disabled="true"
    aria-label={`${row.name || 'Group'}, already joined`}
    style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '6px 4px', opacity: 0.55 }}
  >
    <span style={{ width: `${CHECKBOX_COLUMN_WIDTH}px`, flexShrink: 0 }} />
    <GroupAvatar name={row.name} emoji={row.emoji} index={index} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={rowNameStyle}>{row.name}</span>
    </div>
    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', background: '#F1F5F9', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
      Already joined
    </span>
  </div>
);

const AlreadyMineOpenRow: React.FC<{ row: InviteGroupRow; index: number; onOpenGroup?: (groupId: string) => void }> = ({ row, index, onOpenGroup }) => {
  const clickable = !!onOpenGroup;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${row.name || 'Group'}, you're in — open group` : undefined}
      onClick={clickable ? () => onOpenGroup!(row.groupId) : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenGroup!(row.groupId);
        }
      } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '6px 4px',
        cursor: clickable ? 'pointer' : 'default', borderRadius: '12px',
      }}
    >
      <span style={{ width: `${CHECKBOX_COLUMN_WIDTH}px`, flexShrink: 0 }} />
      <GroupAvatar name={row.name} emoji={row.emoji} index={index} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={rowNameStyle}>{row.name}</span>
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857', background: '#D1FAE5', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
        You're in
      </span>
    </div>
  );
};

export const InviteLandingCard: React.FC<InviteLandingCardProps> = ({
  mode,
  totalCount,
  rows,
  selectedGroupIds,
  onToggleGroup,
  onOpenGroup,
  busy,
  joiningGroupId,
  rowErrors,
  onJoinSelected,
  onSignIn,
  onDismiss,
}) => {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const unregister = escManager.register(onDismiss);
    return unregister;
  }, [onDismiss]);

  const hasAvailable = mode === 'signedIn' && rows.some((r) => r.status === 'available');
  const availableIds = new Set(rows.filter((r) => r.status === 'available').map((r) => r.groupId));
  const selectedAvailableCount = selectedGroupIds.filter((id) => availableIds.has(id)).length;

  const titleId = 'invite-landing-card-title';
  const title = mode === 'signedOut'
    ? `You're invited to ${totalCount} group${plural(totalCount)}`
    : `You're invited to ${rows.length} group${plural(rows.length)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200000,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        paddingLeft: '20px',
        paddingRight: '20px',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes ilcSpin { to { transform: rotate(360deg); } }
        @keyframes ilcShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .ilc-shimmer-bar {
          background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
          background-size: 200% 100%;
          animation: ilcShimmer 1.4s ease-in-out infinite;
        }
      `}</style>
      <div
        className="card shadow-xl"
        style={{
          width: '90%',
          maxWidth: '360px',
          padding: '24px 20px',
          borderRadius: '24px',
          animation: 'slideUp 0.3s ease-out',
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.05)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          boxSizing: 'border-box',
        }}
      >
        <button
          aria-label="Close"
          onClick={onDismiss}
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            border: 'none',
            background: '#F1F5F9',
            color: '#64748B',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            flexShrink: 0,
          }}
        >
          ×
        </button>

        <h3
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="nunito"
          style={{
            fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0',
            padding: '0 36px 0 0', boxSizing: 'border-box', lineHeight: 1.35, wordBreak: 'break-word',
            outline: 'none', flexShrink: 0,
          }}
        >
          {title}
        </h3>

        <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: '0 0 16px 0', lineHeight: 1.4, flexShrink: 0 }}>
          {mode === 'signedOut'
            ? 'Sign in to see the groups and pick which ones to join.'
            : hasAvailable
              ? "Choose the groups you'd like to join."
              : "You're already part of everything in this invite."}
        </p>

        <div style={{ maxHeight: '46vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {mode === 'signedOut' ? (
            <SignedOutRows totalCount={totalCount} rows={rows} />
          ) : (
            rows.map((row, index) => {
              if (row.status === 'available') {
                return (
                  <AvailableRow
                    key={row.groupId}
                    row={row}
                    index={index}
                    checked={selectedGroupIds.includes(row.groupId)}
                    isJoining={joiningGroupId === row.groupId}
                    busy={busy}
                    error={rowErrors?.[row.groupId]}
                    onToggleGroup={onToggleGroup}
                  />
                );
              }
              if (row.status === 'takenByOther') {
                return <TakenByOtherRow key={row.groupId} row={row} index={index} />;
              }
              return <AlreadyMineOpenRow key={row.groupId} row={row} index={index} onOpenGroup={onOpenGroup} />;
            })
          )}
        </div>

        {mode === 'signedOut' && (
          <>
            <button
              type="button"
              onClick={onSignIn}
              style={{
                width: '100%',
                height: '52px',
                borderRadius: '26px',
                border: '1.5px solid #FDBA74',
                background: '#FFF7ED',
                color: '#9A3412',
                fontWeight: 700,
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginTop: '16px',
                flexShrink: 0,
              }}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </>
        )}

        {mode === 'signedIn' && (
          hasAvailable ? (
            <button
              type="button"
              onClick={onJoinSelected}
              disabled={busy || selectedAvailableCount === 0}
              aria-busy={busy}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '14px',
                border: 'none',
                background: '#16A34A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '14px',
                cursor: busy || selectedAvailableCount === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: busy || selectedAvailableCount === 0 ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {busy && <Spinner size={16} color="#FFFFFF" />}
              {busy ? 'Joining…' : `Join ${selectedAvailableCount} group${plural(selectedAvailableCount)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '14px',
                border: 'none',
                background: '#F1F5F9',
                color: '#334155',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                marginTop: '16px',
                flexShrink: 0,
              }}
            >
              Done
            </button>
          )
        )}
      </div>
    </div>
  );
};
