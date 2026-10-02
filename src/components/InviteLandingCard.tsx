import React, { useEffect, useRef } from 'react';
import { GROUP_COLORS } from '../lib/utils';
import { escManager } from '../lib/escManager';

// 'rejoin': a group the opener left earlier — selectable like 'available',
// but joining reactivates their old spot.
export type InviteGroupStatus = 'available' | 'rejoin' | 'takenByOther' | 'alreadyMineOpen';

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

const RejoinPill: React.FC = () => (
  <span
    style={{
      fontSize: '11px',
      fontWeight: 700,
      color: '#6D28D9',
      background: '#EDE9FE',
      padding: '2px 8px',
      borderRadius: '999px',
      flexShrink: 0,
    }}
  >
    You left earlier
  </span>
);

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
        {row.status === 'rejoin' ? <RejoinPill /> : <MemberPill count={row.memberCount} />}
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

// The single-group header: the group itself is the content, so there's no
// checkbox and no "choose the groups" copy — just who and how many.
const SingleGroupHeader: React.FC<{
  row: InviteGroupRow;
  titleId: string;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  subtitle: string;
}> = ({ row, titleId, titleRef, subtitle }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
    <GroupAvatar name={row.name} emoji={row.emoji} index={0} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <h3
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="nunito"
        style={{ ...rowNameStyle, fontSize: '16px', fontWeight: 800, margin: 0, outline: 'none' }}
      >
        {row.name || 'A group on Divido'}
      </h3>
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: row.status === 'rejoin' ? '#6D28D9' : '#64748B', marginTop: '2px' }}>
        {subtitle}
      </div>
    </div>
  </div>
);

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  height: '48px',
  borderRadius: '14px',
  border: 'none',
  background: '#16A34A',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: '15px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  opacity: disabled ? 0.6 : 1,
  flexShrink: 0,
});

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

  const isSelectable = (r: InviteGroupRow) => r.status === 'available' || r.status === 'rejoin';
  const hasAvailable = mode === 'signedIn' && rows.some(isSelectable);
  const availableIds = new Set(rows.filter(isSelectable).map((r) => r.groupId));
  const selectedAvailableCount = selectedGroupIds.filter((id) => availableIds.has(id)).length;
  // Every choice on the sheet is a group they left: speak in "rejoin" terms.
  const allRejoin = mode === 'signedIn' && rows.length > 0 && rows.every((r) => r.status === 'rejoin');
  const actionVerb = allRejoin ? 'Rejoin' : 'Join';

  // One group whose details we know: show it as the sheet's header instead
  // of a one-item checklist.
  const count = mode === 'signedOut' ? totalCount : rows.length;
  const single = count === 1 && !!rows[0]?.name && (mode === 'signedOut' || isSelectable(rows[0])) ? rows[0] : null;

  const titleId = 'invite-landing-card-title';
  const title = mode === 'signedOut'
    ? `You're invited to ${totalCount} group${plural(totalCount)}`
    : allRejoin
      ? `Rejoin ${rows.length} group${plural(rows.length)}?`
      : `You're invited to ${rows.length} group${plural(rows.length)}`;

  const singleSubtitle = single
    ? single.status === 'rejoin'
      ? 'You left earlier — rejoin to see its balances'
      : `You're invited${single.memberCount != null ? ` · ${single.memberCount} member${plural(single.memberCount)}` : ''}`
    : '';

  const subtitle = mode === 'signedOut'
    ? 'Sign in to see the groups and pick which ones to join.'
    : allRejoin
      ? 'You left these earlier. Rejoin to see their balances again.'
      : hasAvailable
        ? 'Pick the ones to join.'
        : "You're already part of everything in this invite.";

  const joinLabel = busy
    ? (allRejoin ? 'Rejoining…' : 'Joining…')
    : single
      ? `${actionVerb} group`
      : `${actionVerb} ${selectedAvailableCount} group${plural(selectedAvailableCount)}`;

  const singleError = single ? rowErrors?.[single.groupId] : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        // Tapping the dimmed area outside the sheet = "Not now".
        if (e.target === e.currentTarget && !busy) onDismiss();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200000,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'ilcFade 0.2s ease-out',
      }}
    >
      <style>{`
        @keyframes ilcSpin { to { transform: rotate(360deg); } }
        @keyframes ilcShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes ilcFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ilcSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .ilc-shimmer-bar {
          background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
          background-size: 200% 100%;
          animation: ilcShimmer 1.4s ease-in-out infinite;
        }
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          padding: '10px 20px max(16px, env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          boxShadow: '0 -8px 24px rgba(15,23,42,0.12)',
          animation: 'ilcSheetUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div aria-hidden="true" style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#E2E8F0', margin: '0 auto 16px', flexShrink: 0 }} />

        {single ? (
          <SingleGroupHeader row={single} titleId={titleId} titleRef={titleRef} subtitle={mode === 'signedOut' ? 'Sign in to join this group.' : singleSubtitle} />
        ) : (
          <>
            <h3
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="nunito"
              style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', lineHeight: 1.35, outline: 'none', flexShrink: 0 }}
            >
              {title}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: '0 0 12px 0', lineHeight: 1.4, flexShrink: 0 }}>
              {subtitle}
            </p>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
              {mode === 'signedOut' ? (
                <SignedOutRows totalCount={totalCount} rows={rows} />
              ) : (
                rows.map((row, index) => {
                  if (isSelectable(row)) {
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
          </>
        )}

        {singleError && (
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#B91C1C', margin: '-8px 0 12px' }}>{singleError}</div>
        )}

        {mode === 'signedOut' ? (
          <button
            type="button"
            onClick={onSignIn}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <GoogleIcon />
            Continue with Google
          </button>
        ) : hasAvailable ? (
          <button
            type="button"
            onClick={onJoinSelected}
            disabled={busy || selectedAvailableCount === 0}
            aria-busy={busy}
            style={primaryButtonStyle(busy || selectedAvailableCount === 0)}
          >
            {busy && <Spinner size={16} color="#FFFFFF" />}
            {joinLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            style={{ ...primaryButtonStyle(false), background: '#F1F5F9', color: '#334155' }}
          >
            Done
          </button>
        )}

        {(mode === 'signedOut' || hasAvailable) && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            style={{
              width: '100%',
              height: '40px',
              marginTop: '4px',
              border: 'none',
              background: 'transparent',
              color: '#64748B',
              fontWeight: 700,
              fontSize: '14px',
              cursor: busy ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
};
