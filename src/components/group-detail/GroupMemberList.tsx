import React, { useState } from 'react';
import { Group, Expense, UserMetadata } from '../../lib/types';
import { BalanceActionCard } from '../BalanceActionCard';
import { buildPeopleSuggestions, balancesByIdentity, getPersonKey, isValidEmail } from '../../lib/identity';

interface GroupMemberListProps {
  selectedGroup: Group;
  selectedId: string | number | null;
  showFriendsList: boolean;
  setShowFriendsList: (b: boolean) => void;
  setShowAddFriendModal: (b: boolean) => void;
  me: string;
  userMetadata: Record<string, UserMetadata>;
  expenses: Expense[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  groups: Group[];
  onRenameMember?: (oldName: string, newName: string) => void;
  onRemindMember?: (memberName: string) => void;
  onRemoveMember?: (memberName: string) => void;
  onWriteOff?: (memberName: string) => void;
  onSettleMember?: (memberName: string) => void;
  onLeaveGroup?: () => void;
  onReinviteMember?: (memberName: string, inviteUrl: string) => void;
  onRemindAllPending?: (pendingNames: string[]) => void;
  onAddMembers?: (names: string[], emails?: Record<string, string>, identities?: Record<string, string>) => void;
}

export const GroupMemberList: React.FC<GroupMemberListProps> = ({
  selectedGroup,
  selectedId,
  showFriendsList,
  setShowFriendsList,
  setShowAddFriendModal,
  me,
  userMetadata,
  expenses,
  setGroups,
  groups,
  onRenameMember,
  onRemindMember,
  onRemoveMember,
  onWriteOff,
  onSettleMember,
  onLeaveGroup,
  onReinviteMember,
  onRemindAllPending,
  onAddMembers,
}) => {
  // Hooks must run unconditionally, before any early return, so React sees a
  // stable hook order across renders (toggling showFriendsList otherwise crashes).
  const [editingMemberName, setEditingMemberName] = React.useState<string | null>(null);
  const [inlineRenameVal, setInlineRenameVal] = React.useState<string>('');
  const [isAddingInline, setIsAddingInline] = React.useState(false);
  const [inlineAddVal, setInlineAddVal] = React.useState('');
  const [inlineEmailVal, setInlineEmailVal] = React.useState('');
  const inlineInputRef = React.useRef<HTMLInputElement>(null);
  const [actionCard, setActionCard] = useState<null | {
    title: string; desc: string; primaryLabel: string; primaryColor: string; onPrimary: () => void;
    secondaryLabel?: string; onSecondary?: () => void;
  }>(null);
  // Which segment of the members screen is showing. One list at a time replaces
  // the old three stacked cards (and makes the duplicate-section render bug
  // impossible — only the active tab is ever mounted).
  const [activeTab, setActiveTab] = useState<'joined' | 'pending' | 'left'>('joined');

  if (selectedId === 'STANDALONE' || !showFriendsList) return null;

  // The email tied to a member (from their hidden identity), shown under the
  // name so two people with the same name are distinguishable. Only real emails
  // are shown — name-only members (identity = person_id or a bare name) show
  // nothing extra.
  const emailFor = (name: string): string => {
    const id = selectedGroup.memberIdentities?.[name] || '';
    return typeof id === 'string' && id.includes('@') ? id : '';
  };

  // "People you've split with before" — see buildPeopleSuggestions (identity.ts).
  const buildSuggestions = () => buildPeopleSuggestions(groups, selectedGroup.id, selectedGroup.members, me);

  // Per-currency net for a member (positive = to collect, negative = to pay).
  // This member's balance WITH ME in this group, via the ONE canonical engine +
  // identity keys — never a hand-rolled copy (which diverged from the Settle tab
  // and showed a wrong figure). It is pairwise (me ↔ them), matching the number
  // shown everywhere else the user looks (the group Settle tab, the friend card),
  // and it's exactly what "Settle up" can clear. Positive = they collect from me,
  // negative = they pay me.
  const getMemberBalanceByCurrency = (name: string): Record<string, number> => {
    const groupExps = expenses.filter((e) => String(e.gId) === String(selectedId));
    const txns = balancesByIdentity(selectedGroup, groupExps, !!selectedGroup.simplifyDebts);
    const memberKey = getPersonKey(selectedGroup, name);
    // My per-group identity may differ from the flat `me` after a claim/rename.
    let myG = me;
    try { const c = localStorage.getItem(`divido_identity_${selectedId}`); if (c) myG = c; } catch { /* ignore */ }
    const meKey = getPersonKey(selectedGroup, myG);
    const bal: Record<string, number> = {};
    txns.forEach((t) => {
      const fromK = getPersonKey(selectedGroup, t.from);
      const toK = getPersonKey(selectedGroup, t.to);
      const meAndThem =
        (fromK === meKey && toK === memberKey) || (fromK === memberKey && toK === meKey);
      if (!meAndThem) return;
      Object.entries(t.balances).forEach(([curr, val]) => {
        if (toK === memberKey) bal[curr] = (bal[curr] || 0) + val;        // they collect from me
        else bal[curr] = (bal[curr] || 0) - val;                          // they pay me
      });
    });
    return bal;
  };
  // Member-centric balance line, e.g. "Ravi has ₹400 to pay, $10 to collect".
  // NOTE: this describes the OTHER member's own net, so it must NOT be phrased
  // as "You pay/collect" — that flips the subject and reads as the current
  // user's balance (the direction/subject bug the consistency rule warns about).
  const memberBalanceText = (name: string): string => {
    const clean = name.replace(/\s*\(Left\)$/i, '').trim();
    const parts: string[] = [];
    for (const [c, amt] of Object.entries(getMemberBalanceByCurrency(name))) {
      if (Math.abs(amt) >= 0.5) parts.push(`${c}${Math.abs(amt).toFixed(0)} to ${amt < 0 ? 'pay' : 'collect'}`);
    }
    return parts.length ? `${clean} has ${parts.join(', ')}` : '';
  };
  const memberHasBalance = (name: string): boolean =>
    Object.values(getMemberBalanceByCurrency(name)).some((v) => Math.abs(v) >= 0.5);

  const memberHasThirdPartyBalance = (name: string): boolean => {
    const groupExps = expenses.filter((e) => String(e.gId) === String(selectedId));
    const txns = balancesByIdentity(selectedGroup, groupExps, !!selectedGroup.simplifyDebts);
    const memberKey = getPersonKey(selectedGroup, name);
    let myG = me;
    try { const c = localStorage.getItem(`divido_identity_${selectedId}`); if (c) myG = c; } catch { /* ignore */ }
    const meKey = getPersonKey(selectedGroup, myG);

    return txns.some((t) => {
      const fromK = getPersonKey(selectedGroup, t.from);
      const toK = getPersonKey(selectedGroup, t.to);
      if (fromK !== memberKey && toK !== memberKey) return false;
      if ((fromK === meKey && toK === memberKey) || (fromK === memberKey && toK === meKey)) return false;
      return Object.values(t.balances).some((v) => Math.abs(v) >= 0.5);
    });
  };

  const activeMembers = selectedGroup.members.filter((m) => !m.endsWith(' (Left)'));
  const adminName = activeMembers[0] || selectedGroup.members[0];
  const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
  const cleanAdmin = adminName?.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();

  const checkIsMe = (name: string) => {
    const cleanN = name.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return cleanN === cleanMe;
  };

  const checkIsAdmin = (name: string) => {
    if (!cleanAdmin) return false;
    const cleanN = name.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return cleanN === cleanAdmin;
  };

  const isAdmin = checkIsMe(adminName || '');

  const handleInlineSave = (oldName: string) => {
    const trimmed = inlineRenameVal.trim();
    if (!trimmed) {
      setEditingMemberName(null);
      return;
    }
    if (trimmed.toLowerCase() !== oldName.toLowerCase() && selectedGroup.members.some(x => x.toLowerCase() === trimmed.toLowerCase())) {
      alert(`"${trimmed}" is already taken in this group! 🛑`);
      setEditingMemberName(null);
      return;
    }
    if (onRenameMember) {
      onRenameMember(oldName, trimmed);
    }
    setEditingMemberName(null);
  };

  const handleRemindAll = () => {
    const pending = selectedGroup.pendingMembers || [];
    if (pending.length === 0) return;
    if (onRemindAllPending) {
      onRemindAllPending(pending);
    } else {
      alert(`Reminding all ${pending.length} pending members! ⏳`);
    }
  };

  const handleInlineAdd = (rawName?: string, emailArg?: string, identityArg?: string) => {
    const fromArg = typeof rawName === 'string' ? rawName : undefined;
    const trimmed = (fromArg ?? inlineAddVal).trim();
    if (!trimmed) return;

    // Typed path: an email is optional, but reject obvious junk (no silent drop).
    if (fromArg === undefined) {
      const typed = inlineEmailVal.trim();
      if (typed && !isValidEmail(typed)) {
        alert("That doesn't look like a valid email. Leave it blank or fix it.");
        return;
      }
    }

    // Check duplicates against selectedGroup.members (case-insensitive)
    const isDuplicate = selectedGroup.members.some(
      (m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      const isLeft = selectedGroup.members.some(
        (m) => m.trim().toLowerCase() === `${trimmed.toLowerCase()} (left)`
      );
      if (isLeft) {
        alert(`⏳ "${trimmed}" is a past member! Reinvite them using the 'Invite again' button in Past Members.`);
      } else {
        alert(`👥 "${trimmed}" is already in the group! Try adding a surname.`);
      }
      return;
    }

    if (onAddMembers) {
      // Attach a typed email (or a suggestion's email, passed via emailArg) so
      // the new member is keyed by it and auto-claims when they sign in with it.
      const email = (typeof emailArg === 'string' ? emailArg : inlineEmailVal).trim().toLowerCase();
      const emails = email.includes('@') ? { [trimmed]: email } : undefined;
      // Reuse a picked person's stable id (email or hidden person_id) so the same
      // name-only friend stays ONE person across groups instead of duplicating.
      const identity = (email.includes('@') ? email : (identityArg || '')).trim();
      const identities = identity ? { [trimmed]: identity } : undefined;
      onAddMembers([trimmed], emails, identities);
    }
    if (fromArg === undefined) { setInlineAddVal(''); setInlineEmailVal(''); }
    // Automatically refocus the input box for consecutive additions
    setTimeout(() => {
      inlineInputRef.current?.focus();
    }, 50);
  };

  const joinedMembersList = selectedGroup.members.filter(m => !selectedGroup.pendingMembers?.includes(m) && !m.endsWith(' (Left)'));
  const pendingMembersList = selectedGroup.pendingMembers || [];
  const leftMembersList = selectedGroup.members.filter((m) => m.endsWith(' (Left)'));

  // Two-letter initials for a member's avatar (first + last word, else first two
  // letters of a single word).
  const initialsFor = (name: string): string => {
    const clean = name.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '');
    return (a + b).toUpperCase();
  };
  // Stable [bg, text] color pair per name so the same person keeps their color.
  const AVATAR_COLORS: [string, string][] = [
    ['#E6F1FB', '#185FA5'], ['#FBEAF0', '#993556'], ['#E1F5EE', '#0F6E56'],
    ['#FAEEDA', '#854F0B'], ['#EEEDFE', '#534AB7'], ['#FAECE7', '#993C1D'],
    ['#E1F5EE', '#0F6E56'], ['#FBEAF0', '#993556'],
  ];
  const avatarColor = (name: string): [string, string] => {
    const clean = name.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    let h = 0;
    for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  const STATUS_DOT: Record<'joined' | 'pending' | 'left', string> = {
    joined: '#1D9E75', pending: '#EF9F27', left: '#94A3B8',
  };
  // A round avatar with a status dot, shared across all three tabs.
  const Avatar: React.FC<{ name: string; status: 'joined' | 'pending' | 'left' }> = ({ name, status }) => {
    const [bg, fg] = avatarColor(name);
    return (
      <div style={{ position: 'relative', width: '38px', height: '38px', flex: 'none' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
          {initialsFor(name)}
        </div>
        <span style={{ position: 'absolute', right: '-1px', bottom: '-1px', width: '11px', height: '11px', borderRadius: '50%', background: STATUS_DOT[status], border: '2.5px solid var(--w)' }} />
      </div>
    );
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg)',
        zIndex: 9999,
        overflowY: 'auto',
        padding: '20px 16px 100px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {actionCard && (
        <BalanceActionCard
          title={actionCard.title}
          desc={actionCard.desc}
          primaryLabel={actionCard.primaryLabel}
          primaryColor={actionCard.primaryColor}
          onPrimary={actionCard.onPrimary}
          secondaryLabel={actionCard.secondaryLabel}
          onSecondary={actionCard.onSecondary}
          onClose={() => setActionCard(null)}
        />
      )}
      <div
        className="content-width-limit"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          width: '100%',
        }}
      >
        {/* HEADER */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: '24px',
          position: 'sticky',
          top: '-24px',
          paddingTop: '24px',
          paddingBottom: '16px',
          background: 'var(--bg)',
          zIndex: 10,
          margin: '-24px -20px 24px -20px',
          paddingLeft: '20px',
          paddingRight: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => {
                setInlineAddVal('');
                setIsAddingInline(false);
                setShowFriendsList(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--t)',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                marginLeft: '-6px',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--t)', margin: 0,  }}>
              Group Members
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isAddingInline && inlineAddVal.trim()) {
                handleInlineAdd();
              }
              setShowFriendsList(false);
            }}
            title="Save changes and close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803D',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>

        {/* Segmented tab bar */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg)',
            border: '1.5px solid #F1F5F9',
            borderRadius: '999px',
            padding: '4px',
            gap: '2px',
          }}
        >
          {([
            ['joined', 'Joined', joinedMembersList.length],
            ['pending', 'Pending', pendingMembersList.length],
            ['left', 'Left', leftMembersList.length],
          ] as [typeof activeTab, string, number][]).map(([key, label, count]) => {
            const on = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: on ? 'var(--w)' : 'transparent',
                  color: on ? '#334155' : '#94A3B8',
                  fontWeight: on ? 700 : 500,
                  fontSize: '12.5px',
                  borderRadius: '999px',
                  padding: '8px 0',
                  cursor: 'pointer',
                  boxShadow: on ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: '0.15s all ease',
                }}
              >
                {label} · {count}
              </button>
            );
          })}
        </div>

        {/* JOINED TAB */}
        {activeTab === 'joined' && (
        <div
          className="card"
          style={{
            background: 'var(--w)',
            borderRadius: '24px',
            border: '1.5px solid #F1F5F9',
            padding: '8px 16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {joinedMembersList.map((m, idx) => {
              return (
                <div
                  key={m}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '11px',
                    padding: '11px 2px',
                    borderBottom: idx < joinedMembersList.length - 1 ? '1px solid #F1F5F9' : 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <Avatar name={m} status="joined" />
                  {editingMemberName === m ? (
                    <input
                      autoFocus
                      value={inlineRenameVal}
                      onChange={(e) => setInlineRenameVal(e.target.value)}
                      onBlur={() => handleInlineSave(m)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleInlineSave(m);
                        if (e.key === 'Escape') setEditingMemberName(null);
                      }}
                      style={{
                        flex: 1,
                        fontSize: '13px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        border: '1.5px solid #6366F1',
                        borderRadius: '6px',
                        background: 'var(--bg)',
                        color: 'var(--t)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                      <span
                        title={checkIsMe(m) ? "Click to edit name" : undefined}
                        style={{
                          fontWeight: 'bold',
                          fontSize: '14px',
                          color: '#334155',
                          cursor: checkIsMe(m) ? 'pointer' : 'default',
                          textDecoration: checkIsMe(m) ? 'underline dotted rgba(0,0,0,0.1)' : 'none',
                        }}
                        onClick={(e) => {
                          if (!checkIsMe(m)) {
                            alert("Only this member can rename themselves.");
                            return;
                          }
                          e.stopPropagation();
                          setEditingMemberName(m);
                          setInlineRenameVal(m);
                        }}
                      >
                        {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
                      </span>
                      {emailFor(m) && (
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {emailFor(m)}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    {userMetadata[m]?.upiId && (
                      <span title="Payment Info Linked 安心" style={{ fontSize: '12px', color: '#1D4ED8', cursor: 'help' }}>
                        💳
                      </span>
                    )}

                    {(isAdmin || checkIsMe(m)) && (
                      <span
                        onClick={async (e) => {
                          e.stopPropagation();
                          const bt = memberBalanceText(m);
                          if (checkIsMe(m)) {
                            // Leaving (self) → App's bespoke leave card.
                            if (onLeaveGroup) onLeaveGroup();
                            else if (confirm('Leave group?') && onRemoveMember) onRemoveMember(m);
                            return;
                          }
                          // Removing someone else — zero-to-remove: a live balance
                          // must be cleared first. Offer Settle up (record the
                          // payment) or Write off & remove (cancel the balance).
                          // There is deliberately no "Remove anyway".
                          const hasThirdPartyDebt = memberHasThirdPartyBalance(m);
                          if (hasThirdPartyDebt) {
                            setActionCard({
                              title: `Cannot remove "${m}"`,
                              desc: 'They have unsettled debts with other members.',
                              primaryLabel: 'Got it',
                              primaryColor: '#3B82F6',
                              onPrimary: () => setActionCard(null),
                            });
                          } else if (bt) {
                            setActionCard({
                              title: `Remove "${m}"?`,
                              desc: `Balance remaining: ${bt}. Settle up or write it off to remove them.`,
                              primaryLabel: 'Settle up →',
                              primaryColor: '#10B981',
                              // Close the member-list panel (z 9999) first, else the
                              // settle sheet (z 4000) opens behind it and looks dead.
                              onPrimary: () => { setActionCard(null); setShowFriendsList(false); onSettleMember && onSettleMember(m); },
                              secondaryLabel: 'Write off & remove',
                              onSecondary: () => { setActionCard(null); onWriteOff && onWriteOff(m); onRemoveMember && onRemoveMember(m); },
                            });
                          } else {
                            // No balance — a plain Remove, straight to Past Members.
                            setActionCard({
                              title: `Remove "${m}"?`,
                              desc: 'They move to Past Members and history is kept.',
                              primaryLabel: 'Remove',
                              primaryColor: '#F97316',
                              onPrimary: () => { setActionCard(null); onRemoveMember && onRemoveMember(m); },
                            });
                          }
                        }}
                        style={{
                          cursor: 'pointer',
                          color: '#EF4444',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          padding: '0 4px',
                        }}
                        title={checkIsMe(m) ? "Leave group" : "Remove member"}
                      >✕</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
        <div
          className="card"
          style={{
            background: 'var(--w)',
            borderRadius: '24px',
            border: '1.5px solid #F1F5F9',
            padding: '8px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {pendingMembersList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: '10px' }}>
              <button
                onClick={handleRemindAll}
                style={{
                  background: '#FFEDD5',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '5px 12px',
                  color: '#EA580C',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: '0.15s all ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FED7AA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFEDD5'; }}
              >
                Remind all
              </button>
            </div>
          )}
          {pendingMembersList.length === 0 && (
            <p style={{ margin: 0, padding: '20px 4px', fontSize: '13px', color: '#94A3B8', textAlign: 'center' }}>
              No pending invites.
            </p>
          )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pendingMembersList.map((m, idx) => (
                <div
                  key={m}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '11px',
                    padding: '11px 2px',
                    borderBottom: idx < pendingMembersList.length - 1 ? '1px solid #F1F5F9' : 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <Avatar name={m} status="pending" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                    {editingMemberName === m ? (
                      <input
                        autoFocus
                        value={inlineRenameVal}
                        onChange={(e) => setInlineRenameVal(e.target.value)}
                        onBlur={() => handleInlineSave(m)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleInlineSave(m);
                          if (e.key === 'Escape') setEditingMemberName(null);
                        }}
                        style={{
                          fontSize: '13px',
                          fontWeight: 'bold',
                          padding: '2px 6px',
                          border: '1.5px solid #6366F1',
                          borderRadius: '6px',
                          background: 'var(--bg)',
                          color: 'var(--t)',
                          outline: 'none',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <>
                      <span
                        title="Click to edit name"
                        style={{
                          fontWeight: 'bold',
                          fontSize: '14px',
                          color: '#334155',
                          cursor: 'pointer',
                          textDecoration: 'underline dotted rgba(0,0,0,0.1)',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingMemberName(m);
                          setInlineRenameVal(m);
                        }}
                      >
                        {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>Invite sent</span>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (onRemindMember) {
                          onRemindMember(m);
                        } else {
                          const inviteLink = `${window.location.origin}/?joinGroupId=${selectedId}`;
                          await navigator.clipboard.writeText(inviteLink);
                          alert(`Invite link for "${m}" copied to clipboard! 📋`);
                        }
                      }}
                      title={`Remind ${m}`}
                      style={{
                        background: '#FFEDD5',
                        border: 'none',
                        borderRadius: '50%',
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#EA580C',
                        cursor: 'pointer',
                        transition: '0.15s all ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FED7AA'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#FFEDD5'; }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    </button>
                    {selectedId !== 'STANDALONE' && (isAdmin || checkIsMe(m)) && (
                      <span
                        style={{ cursor: 'pointer', opacity: 0.6, fontSize: '14px', color: '#EF4444', fontWeight: 'bold', padding: '0 4px' }}
                        title="Cancel invite"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (checkIsMe(m)) {
                            if (onLeaveGroup) onLeaveGroup();
                            else if (confirm('Leave group?') && onRemoveMember) onRemoveMember(m);
                            return;
                          }
                          const bt = memberBalanceText(m);
                          // Cancel invite locally when there's no wired handler.
                          const localRemove = () => {
                            if (onRemoveMember) {
                              onRemoveMember(m);
                            } else {
                              setGroups(
                                groups.map((g) =>
                                  String(g.id) === String(selectedId)
                                    ? { ...g, members: g.members.map((mem) => (mem === m ? m + ' (Left)' : mem)), pendingMembers: g.pendingMembers?.filter((mem) => mem !== m) }
                                    : g
                                )
                              );
                            }
                          };
                          const hasThirdPartyDebt = memberHasThirdPartyBalance(m);
                          if (hasThirdPartyDebt) {
                            setActionCard({
                              title: `Cannot remove "${m}"`,
                              desc: 'They have unsettled debts with other members.',
                              primaryLabel: 'Got it',
                              primaryColor: '#3B82F6',
                              onPrimary: () => setActionCard(null),
                            });
                          } else if (bt) {
                            // Zero-to-remove: even a not-yet-joined member with a
                            // live balance must settle or be written off first.
                            setActionCard({
                              title: `Remove "${m}"?`,
                              desc: `Balance remaining: ${bt}. Settle up or write it off to remove them.`,
                              primaryLabel: 'Settle up →',
                              primaryColor: '#10B981',
                              onPrimary: () => { setActionCard(null); setShowFriendsList(false); onSettleMember && onSettleMember(m); },
                              secondaryLabel: 'Write off & remove',
                              onSecondary: () => { setActionCard(null); onWriteOff && onWriteOff(m); localRemove(); },
                            });
                          } else {
                            setActionCard({
                              title: `Remove "${m}"?`,
                              desc: "They haven't joined yet — this removes them.",
                              primaryLabel: 'Remove',
                              primaryColor: '#F97316',
                              onPrimary: () => { setActionCard(null); localRemove(); },
                            });
                          }
                        }}
                      >
                        ✕
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADD FRIEND — shared across all tabs */}
        <div
          className="card"
          style={{
            background: 'var(--w)',
            borderRadius: '24px',
            border: '1.5px solid #F1F5F9',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {isAddingInline && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px',
                    background: '#F8FAFC',
                    borderRadius: '16px',
                    border: '1.5px solid #E2E8F0',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Add New Member
                    </span>
                    <span
                      onClick={() => {
                        setIsAddingInline(false);
                        setInlineAddVal('');
                        setInlineEmailVal('');
                      }}
                      style={{
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#94A3B8',
                        fontWeight: 'bold',
                        padding: '0 4px',
                      }}
                    >
                      ✕
                    </span>
                  </div>
                  
                  <input
                    ref={inlineInputRef}
                    id="dv-member-add"
                    autoFocus
                    type="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder="Enter name..."
                    value={inlineAddVal}
                    onChange={(e) => setInlineAddVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAddingInline(false);
                        setInlineAddVal('');
                        setInlineEmailVal('');
                      }
                    }}
                    style={{
                      height: '38px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--t)',
                      padding: '0 12px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  />

                  <input
                    type="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder="Email (optional)"
                    value={inlineEmailVal}
                    onChange={(e) => setInlineEmailVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInlineAdd(); }}
                    style={{
                      height: '38px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      padding: '0 12px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  />

                  <button
                    onClick={() => handleInlineAdd()}
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#10B981',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                    }}
                  >
                    Add to Group
                  </button>
                </div>
              )}

              {/* Suggestions: people you've split with before */}
              {isAddingInline && (() => {
                const q = inlineAddVal.trim().toLowerCase();
                const shown = buildSuggestions()
                  .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
                  .slice(0, 6);
                if (shown.length === 0) return null;
                return (
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ margin: '0 0 6px 0', fontSize: '10px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
                      Recently split with
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                      {shown.map((s) => (
                        <button
                          key={s.email || s.name}
                          type="button"
                          onClick={() => handleInlineAdd(s.name, s.email, s.identity)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: '10px', padding: '7px 10px', cursor: 'pointer' }}
                        >
                          <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                            {s.name.charAt(0).toUpperCase()}
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.email && <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>}
                          </span>
                          <span style={{ color: '#6366F1', fontSize: '16px', fontWeight: 700, flexShrink: 0 }}>+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            {(!isAddingInline || inlineAddVal.length > 0) && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (isAddingInline) {
                      handleInlineAdd();
                    } else {
                      setIsAddingInline(true);
                      setTimeout(() => {
                        inlineInputRef.current?.focus();
                      }, 50);
                    }
                  }}
                  style={{
                    background: '#F97316',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '14px 28px',
                    borderRadius: '999px',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: '16px',
                    letterSpacing: '0.2px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 4px 10px -2px rgba(249, 115, 22, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.background = '#EA580C';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.background = '#F97316';
                  }}
                >
                  <span style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1, color: '#FFFFFF', display: 'flex', alignItems: 'center' }}>+</span>
                  <span style={{ color: '#FFFFFF', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Add Friend</span>
                </button>
              </div>
            )}
        </div>

        {/* LEFT TAB */}
        {activeTab === 'left' && (
          <div
            className="card"
            style={{
              background: 'var(--w)',
              borderRadius: '24px',
              border: '1.5px solid #F1F5F9',
              padding: '8px 16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {leftMembersList.length === 0 && (
              <p style={{ margin: 0, padding: '20px 4px', fontSize: '13px', color: '#94A3B8', textAlign: 'center' }}>
                No past members.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {leftMembersList.map((m, idx) => {
                const cleanName = m.replace(' (Left)', '');
                return (
                  <div
                    key={m}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '11px',
                      padding: '11px 2px',
                      borderBottom: idx < leftMembersList.length - 1 ? '1px solid #F1F5F9' : 'none',
                      boxSizing: 'border-box',
                      opacity: 0.7,
                    }}
                  >
                    <Avatar name={cleanName} status="left" />
                    <span style={{ flex: 1, fontWeight: 'bold', fontSize: '14px', color: '#64748B', textDecoration: 'line-through' }}>
                      {checkIsMe(cleanName) ? 'You' : cleanName} {checkIsAdmin(cleanName) && <span style={{ fontSize: '10px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
                    </span>

                    {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const inviteUrl = `${window.location.origin}/?joinGroupId=${selectedGroup.id}&rejoinName=${encodeURIComponent(cleanName)}`;
                            if (onReinviteMember) {
                              onReinviteMember(cleanName, inviteUrl);
                            } else {
                              await navigator.clipboard.writeText(inviteUrl);
                              alert(`Rejoin invite link for "${cleanName}" copied to clipboard! 📋\nSend this to them to rejoin: \n\n${inviteUrl}`);
                            }
                          }}
                          style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '5px 10px',
                            color: '#4F46E6',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: '0.15s all ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; }}
                        >
                          🔗 Invite again
                        </button>
                        {/* Past members are never removable: their expenses keep the
                            group's balances correct, so they stay in history. */}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
