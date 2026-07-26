import React from 'react';
import { Group, Expense, UserMetadata } from '../../lib/types';

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
  onReinviteMember?: (memberName: string, inviteUrl: string) => void;
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
  onReinviteMember,
}) => {
  // Hooks must run unconditionally, before any early return, so React sees a
  // stable hook order across renders (toggling showFriendsList otherwise crashes).
  const [editingMemberName, setEditingMemberName] = React.useState<string | null>(null);
  const [inlineRenameVal, setInlineRenameVal] = React.useState<string>('');

  if (selectedId === 'STANDALONE' || !showFriendsList) return null;

  const getMemberBalance = (name: string) => {
    let balance = 0;
    expenses.forEach((e) => {
      if (String(e.gId) !== String(selectedId)) return;
      const splitters = e.splitters || selectedGroup.members || [];
      if (!splitters.includes(name) && e.paid !== name) return;

      const share = !e.mode || e.mode === 'Equally'
        ? e.amt / (splitters.length || 1)
        : e.mode === 'Unequally'
        ? parseFloat(e.shares?.[name]?.toString() || '0')
        : (e.amt * parseFloat(e.shares?.[name]?.toString() || '0')) / 100;

      if (e.paid === name) {
        balance += e.amt - (splitters.includes(name) ? share : 0);
      } else if (splitters.includes(name)) {
        balance -= share;
      }
    });
    return balance;
  };

  const activeMembers = selectedGroup.members.filter((m) => !m.endsWith(' (Left)'));
  const adminName = activeMembers[0] || selectedGroup.members[0];
  const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
  const cleanAdmin = adminName?.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();

  const checkIsMe = (name: string) => {
    // If we are a guest and have not claimed an identity in this group yet,
    // we do not match any member of this group.
    const hasClaim = selectedId && localStorage.getItem(`divido_identity_${selectedId}`);
    if (!hasClaim && cleanMe === 'you') {
      return false;
    }
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={() => setShowFriendsList(false)}
    >
      <div
        className="card shadow-lg"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--w)',
          borderRadius: '24px',
          border: '1.5px solid #F1F5F9',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '90%',
          maxWidth: '360px',
          boxSizing: 'border-box',
          animation: 'balancePopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          position: 'relative',
        }}
      >
        <button
          onClick={() => setShowFriendsList(false)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '18px',
            border: 'none',
            background: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            color: 'var(--g)',
            opacity: 0.6,
            zIndex: 10,
          }}
        >
          ✕
        </button>

        {/* Grouped member lists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', marginTop: '10px' }}>
          
          {/* 1. Joined Group Members */}
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
              Joined Members ({selectedGroup.members.filter(m => !selectedGroup.pendingMembers?.includes(m) && !m.endsWith(' (Left)')).length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedGroup.members
                .filter(m => !selectedGroup.pendingMembers?.includes(m) && !m.endsWith(' (Left)'))
                .map((m) => {
                  return (
                    <div
                      key={m}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#F8FAFC',
                        borderRadius: '12px',
                        boxSizing: 'border-box',
                      }}
                    >
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
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            border: '1.5px solid #6366F1',
                            borderRadius: '6px',
                            background: 'var(--bg)',
                            color: 'var(--t)',
                            outline: 'none',
                            width: '120px',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <span
                          title={checkIsMe(m) ? "Click to edit name ✏️" : undefined}
                          style={{
                            fontWeight: 'bold',
                            fontSize: '12px',
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
                          {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>} {checkIsMe(m) && <span style={{ fontSize: '11px', marginLeft: '8px', opacity: 0.6 }}>✏️</span>}
                        </span>
                      )}
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {userMetadata[m]?.upiId && (
                          <span title="Payment Info Linked 安心" style={{ fontSize: '10px', color: '#1D4ED8', cursor: 'help' }}>
                            💳
                          </span>
                        )}
                        
                        {(isAdmin || checkIsMe(m)) && (
                          <span
                            onClick={async (e) => {
                              e.stopPropagation();
                              const promptMsg = checkIsMe(m) 
                                ? `Are you sure you want to leave this group? Your transaction history will be preserved.`
                                : `Remove "${m}" from the group? This will shift them to Past Members and keep past history.`;
                              if (confirm(promptMsg)) {
                                if (onRemoveMember) {
                                  onRemoveMember(m);
                                }
                              }
                            }}
                            style={{
                              cursor: 'pointer',
                              color: '#EF4444',
                              fontSize: '12px',
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

          {/* 2. Pending Members */}
          {selectedGroup.pendingMembers && selectedGroup.pendingMembers.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
                Pending Invites ({selectedGroup.pendingMembers.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedGroup.pendingMembers.map((m) => (
                  <div
                    key={m}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#F8FAFC',
                      border: 'none',
                      borderRadius: '12px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            border: '1.5px solid #6366F1',
                            borderRadius: '6px',
                            background: 'var(--bg)',
                            color: 'var(--t)',
                            outline: 'none',
                            width: '120px',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <span
                          title="Click to edit name ✏️"
                          style={{
                            fontWeight: 'bold',
                            fontSize: '13px',
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
                          {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>} <span style={{ fontSize: '11px', marginLeft: '8px', opacity: 0.6 }}>✏️</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        style={{
                          background: '#FFEDD5',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '5px 10px',
                          color: '#EA580C',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: '0.15s all ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#FED7AA'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#FFEDD5'; }}
                      >
                        Remind
                      </button>
                      {selectedId !== 'STANDALONE' && (isAdmin || checkIsMe(m)) && (
                        <span
                          style={{ cursor: 'pointer', opacity: 0.6, fontSize: '13px', color: '#EF4444', fontWeight: 'bold' }}
                          title="Remove member"
                          onClick={(e) => {
                            e.stopPropagation();
                            const promptMsg = checkIsMe(m) 
                              ? `Are you sure you want to leave this group? Your transaction history will be preserved.`
                              : `Remove "${m}" from the group? This will shift them to Past Members and keep past history.`;
                            if (confirm(promptMsg)) {
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

          {/* 3. Left Members */}
          {(() => {
            const left = selectedGroup.members.filter((m) => m.endsWith(' (Left)'));
            if (left.length === 0) return null;
            return (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
                  Past Members ({left.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {left.map((m) => {
                    const cleanName = m.replace(' (Left)', '');
                    return (
                      <div
                        key={m}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#F8FAFC',
                          borderRadius: '12px',
                          boxSizing: 'border-box',
                          opacity: 0.7,
                        }}
                      >
                        <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#64748B', textDecoration: 'line-through' }}>
                           {checkIsMe(cleanName) ? 'You' : cleanName} {checkIsAdmin(cleanName) && <span style={{ fontSize: '10px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
                        </span>
                        
                        {isAdmin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                padding: '4px 8px',
                                color: '#4F46E6',
                                fontSize: '10px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: '0.15s all ease',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; }}
                            >
                              🔗 Invite again
                            </button>

                            <span
                              title="Delete past member"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Permanently remove "${cleanName}" from the group's history?`)) {
                                    if (onRemoveMember) {
                                      onRemoveMember(m);
                                    }
                                  }
                              }}
                              style={{ cursor: 'pointer', opacity: 0.9, fontSize: '13px', color: '#EF4444', fontWeight: 'bold', marginLeft: '6px' }}
                            >
                              ✕
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>


        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
          <button
            style={{
              padding: '12px 36px',
              fontSize: '15px',
              fontWeight: 900,
              borderRadius: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'transparent',
              color: '#6366F1',
              border: '1.5px solid #6366F1',
              cursor: 'pointer',
              transition: '0.2s all ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => {
              setShowFriendsList(false);
              setShowAddFriendModal(true);
            }}
          >
            + Friend
          </button>
        </div>
      </div>
    </div>
  );
};
