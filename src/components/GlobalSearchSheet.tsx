import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group } from '../lib/types';
import { searchGroupsAndFriends, GroupSearchResult, FriendSearchResult } from '../lib/globalSearch';
import { FriendBalance } from '../hooks/useFriendsBalances';
import { GROUP_COLORS, formatExactAmount } from '../lib/utils';
import { escManager } from '../lib/escManager';

export interface GlobalSearchSheetProps {
  open: boolean;
  groups: Group[];
  friends: FriendBalance[];
  isCalculatingFriends: boolean;
  memberAvatars?: Record<string, string>;
  // Optional; when absent a group row falls back to a plain member count.
  groupBalanceLine?: (group: Group) => { text: string; tone: 'pay' | 'collect' | 'settled' } | null;
  onOpenGroup: (groupId: string | number) => void;
  onOpenFriend: (friend: FriendBalance) => void;
  onClose: () => void;
}

// Same palette FriendsView uses for a friend's fallback (photo-less) avatar.
const AV_COLORS = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];

const TONE_COLORS: Record<'pay' | 'collect' | 'settled', string> = {
  pay: '#E11D48',
  collect: '#3FA97C',
  settled: '#94A3B8',
};

const MagnifierIcon: React.FC<{ size: number; color: string; strokeWidth?: number }> = ({ size, color, strokeWidth = 2.2 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// A friend is "settled" when every currency balance rounds to zero — same
// threshold (0.01) FriendsView/MasterSummary use to decide whether a balance
// is worth showing at all.
const isFriendSettled = (friend: FriendBalance): boolean =>
  Object.values(friend.bals).every((v) => Math.abs(v) < 0.01);

// Marker pushed onto `window.history.state` while the sheet is open, so the
// phone/browser back gesture can close it (see the history-management effect
// below) without reaching for `any`.
interface GlobalSearchHistoryState {
  dividoGlobalSearch?: boolean;
}

const hasGlobalSearchHistoryMarker = (): boolean =>
  Boolean((window.history.state as GlobalSearchHistoryState | null)?.dividoGlobalSearch);

export const GlobalSearchSheet: React.FC<GlobalSearchSheetProps> = ({
  open,
  groups,
  friends,
  isCalculatingFriends,
  memberAvatars,
  groupBalanceLine,
  onOpenGroup,
  onOpenFriend,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the query every time the sheet reopens, so a stale search never
  // greets the next open. Adjusting state during render (rather than in an
  // effect) on an `open` transition is the pattern React recommends for
  // resetting state when a prop changes; `prevOpen` makes the transition
  // one-shot.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setQuery('');
  }

  // Autofocus the pill input on open. The `autoFocus` prop can be unreliable
  // for portaled content mounted on the same tick it becomes visible, so a
  // ref-based fallback runs whenever `open` flips to true.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A result tap needs to navigate only once the sheet's own history entry is
  // gone, so the popstate this triggers doesn't also land on the destination
  // screen's top-level-screen branch. Stashed here and run from the popstate
  // handler below (after onClose), or invoked directly when there's no entry
  // left to pop.
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Back-gesture handling: push one history entry on open, close on popstate
  // (phone back / browser back). Restoring focus to whatever had it before we
  // opened happens here too, on the same cleanup, regardless of which close
  // path was used.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Guard against a duplicate marker (e.g. StrictMode double-invoke).
    if (!hasGlobalSearchHistoryMarker()) {
      window.history.pushState({ dividoGlobalSearch: true }, '');
    }
    const onPopState = () => {
      onClose();
      const pendingNavigation = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (pendingNavigation) pendingNavigation();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open, onClose]);

  // Every other close path (chevron, Escape, result tap, desktop backdrop
  // click) routes through here: if our history entry is still the current
  // one, popping it fires the popstate handler above (which calls onClose).
  // If it's already gone — the back gesture itself got us here — just close
  // directly, so we never navigate twice.
  const requestClose = useCallback(() => {
    if (hasGlobalSearchHistoryMarker()) {
      window.history.back();
    } else {
      onClose();
    }
  }, [onClose]);

  // Same close logic as requestClose, but for paths that also need to
  // navigate afterwards (a result tap): if our history entry is still live,
  // defer `navigate` until the popstate handler's onClose has run; otherwise
  // (back gesture already popped us) close and navigate right away.
  const navigateAfterClose = useCallback(
    (navigate: () => void) => {
      if (hasGlobalSearchHistoryMarker()) {
        pendingNavigationRef.current = navigate;
        window.history.back();
      } else {
        onClose();
        navigate();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    return escManager.register(requestClose);
  }, [open, requestClose]);

  const groupIndexById = useMemo(() => {
    const map = new Map<string | number, number>();
    groups.forEach((g, i) => map.set(g.id, i));
    return map;
  }, [groups]);

  const results = useMemo(
    () => (open ? searchGroupsAndFriends(groups, friends, deferredQuery) : { groups: [], friends: [] }),
    [open, groups, friends, deferredQuery]
  );

  const handleOpenGroup = useCallback(
    (groupId: string | number) => navigateAfterClose(() => onOpenGroup(groupId)),
    [navigateAfterClose, onOpenGroup]
  );

  const handleOpenFriend = useCallback(
    (friend: FriendBalance) => navigateAfterClose(() => onOpenFriend(friend)),
    [navigateAfterClose, onOpenFriend]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (results.groups.length > 0) {
      handleOpenGroup(results.groups[0].group.id);
      return;
    }
    const firstActionableFriend = results.friends.find((r) => !isFriendSettled(r.friend as FriendBalance));
    if (firstActionableFriend) handleOpenFriend(firstActionableFriend.friend as FriendBalance);
  };

  if (!open) return null;

  const trimmedQuery = query.trim();
  const showEmptyPrompt = trimmedQuery === '';
  const showFriendSkeleton = !showEmptyPrompt && isCalculatingFriends;
  const hasGroups = results.groups.length > 0;
  const hasFriends = results.friends.length > 0;
  const showNoMatches = !showEmptyPrompt && !showFriendSkeleton && !hasGroups && !hasFriends;

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#94A3B8',
    margin: '0 0 8px',
    padding: '0 18px',
  };

  const rowButtonReset: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 18px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  };

  const chevron = (
    <span style={{ fontSize: '18px', color: '#B8ADA0', fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>›</span>
  );

  const renderGroupRow = (result: GroupSearchResult) => {
    const group = result.group;
    const colorIndex = groupIndexById.get(group.id) ?? 0;
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    const balanceInfo = groupBalanceLine ? groupBalanceLine(group) : null;
    const memberCount = group.members.length;
    return (
      <button
        key={`group-${group.id}`}
        type="button"
        onClick={() => handleOpenGroup(group.id)}
        style={rowButtonReset}
      >
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: color.bg,
            color: color.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 600,
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {group.emoji && (group.emoji.startsWith('data:image/') || group.emoji.startsWith('http')) ? (
            <img src={group.emoji} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          ) : (
            group.name.charAt(0).toUpperCase() || '👤'
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <h3
            style={{
              fontSize: '17px',
              color: '#2E2A25',
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.2,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {group.name || 'Untitled Group'}
          </h3>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: balanceInfo ? TONE_COLORS[balanceInfo.tone] : '#94A3B8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {balanceInfo ? balanceInfo.text : `${memberCount} member${memberCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        {chevron}
      </button>
    );
  };

  const renderFriendRow = (result: FriendSearchResult) => {
    const friend = result.friend as FriendBalance;
    const settled = isFriendSettled(friend);
    const email = friend.id && String(friend.id).includes('@') ? String(friend.id).toLowerCase() : '';
    const photo = (email && memberAvatars?.[email]) || '';
    const avSeed = friend.name.charCodeAt(0) || 0;
    const avBg = AV_COLORS[avSeed % AV_COLORS.length];
    const balEntries = Object.entries(friend.bals).filter(([, v]) => Math.abs(v) > 0.01);
    const payList = balEntries.filter(([, v]) => v < 0);
    const collectList = balEntries.filter(([, v]) => v > 0);

    const avatar = photo ? (
      <img
        src={photo}
        alt={friend.name}
        referrerPolicy="no-referrer"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    ) : (
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: avBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
        {friend.name.charAt(0).toUpperCase()}
      </div>
    );

    const body = (
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2E2A25', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize', flexShrink: 1 }}>
            {friend.name}
          </h3>
          {!email && friend.groups.length > 0 && (
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
              ({friend.groups.join(', ')})
            </span>
          )}
        </div>
        {settled ? (
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8' }}>Settled up</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            {payList.map(([curr, val]) => (
              <span key={`pay-${curr}`} style={{ fontSize: '13px', fontWeight: 500, color: '#B91C1C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                You pay {curr}{formatExactAmount(Math.abs(val))}
              </span>
            ))}
            {collectList.map(([curr, val]) => (
              <span key={`collect-${curr}`} style={{ fontSize: '13px', fontWeight: 500, color: '#047857', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                You collect {curr}{formatExactAmount(val)}
              </span>
            ))}
          </div>
        )}
      </div>
    );

    if (settled) {
      return (
        <div key={`friend-${friend.id}`} style={{ ...rowButtonReset, cursor: 'default' }}>
          {avatar}
          {body}
        </div>
      );
    }

    return (
      <button
        key={`friend-${friend.id}`}
        type="button"
        onClick={() => handleOpenFriend(friend)}
        style={rowButtonReset}
      >
        {avatar}
        {body}
        {chevron}
      </button>
    );
  };

  const renderFriendSkeletonRows = () => (
    <>
      <style>{`@keyframes gs-sk-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {[0, 1, 2].map((i) => (
        <div key={`gs-sk-${i}`} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '12px', animation: 'gs-sk-pulse 1.2s ease-in-out infinite' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EEE9E2', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ height: '12px', width: '45%', borderRadius: '6px', background: '#EEE9E2' }} />
            <div style={{ height: '10px', width: '30%', borderRadius: '6px', background: '#F1ECE4' }} />
          </div>
        </div>
      ))}
    </>
  );

  return createPortal(
    <div
      className="global-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search groups and friends"
      onClick={requestClose}
    >
      <div className="global-search-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header: back chevron + pill search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 18px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close search"
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#475569', flexShrink: 0 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ position: 'relative', flex: 1, lineHeight: 0, fontSize: 0 }}>
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none', display: 'flex' }}>
              <MagnifierIcon size={14} color="#64748B" strokeWidth={2.5} />
            </span>
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoFocus
              placeholder="Search groups and friends"
              aria-label="Search groups and friends"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                display: 'block',
                width: '100%',
                height: '44px',
                lineHeight: 'normal',
                fontSize: '14px',
                fontWeight: 600,
                margin: 0,
                padding: query ? '0 38px 0 40px' : '0 16px 0 40px',
                borderRadius: '999px',
                border: '2px solid #F1F5F9',
                outline: 'none',
                background: 'var(--w)',
                color: '#334155',
                boxSizing: 'border-box',
                verticalAlign: 'top',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                aria-label="Clear search"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: '4px', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 0' }}>
          {showEmptyPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '90px 24px', textAlign: 'center' }}>
              <span style={{ opacity: 0.5, marginBottom: '4px' }}>
                <MagnifierIcon size={40} color="#CBD5E1" strokeWidth={1.5} />
              </span>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#475569' }}>Search your groups and friends</p>
            </div>
          ) : showNoMatches ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#94A3B8' }}>
                No matches for &ldquo;{trimmedQuery}&rdquo;
              </p>
            </div>
          ) : (
            <>
              {hasGroups && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={sectionLabelStyle}>Groups</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {results.groups.map(renderGroupRow)}
                  </div>
                </div>
              )}
              {(hasFriends || showFriendSkeleton) && (
                <div>
                  <div style={sectionLabelStyle}>Friends</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {showFriendSkeleton ? renderFriendSkeletonRows() : results.friends.map(renderFriendRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GlobalSearchSheet;
