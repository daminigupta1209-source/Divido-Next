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
  const isAdmin = activeMembers[0] === me;

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
                          title={m === me ? "Click to edit name ✏️" : undefined}
                          style={{
                            fontWeight: 'bold',
                            fontSize: '12px',
                            color: '#334155',
                            cursor: m === me ? 'pointer' : 'default',
                            textDecoration: m === me ? 'underline dotted rgba(0,0,0,0.1)' : 'none',
                          }}
                          onClick={(e) => {
                            if (m !== me) {
                              alert("Only this member can rename themselves.");
                              return;
                            }
                            e.stopPropagation();
                            setEditingMemberName(m);
                            setInlineRenameVal(m);
                          }}
                        >
                          {m} {m === me && '(me)'} {m === me && <span style={{ fontSize: '11px', marginLeft: '8px', opacity: 0.6 }}>✏️</span>}
                        </span>
                      )}
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {userMetadata[m]?.upiId && (
                          <span title="Payment Info Linked 安心" style={{ fontSize: '10px', color: '#1D4ED8', cursor: 'help' }}>
                            💳
                          </span>
                        )}
                        
                        {isAdmin && m !== me && (
                          <span
                            onClick={async (e) => {
                              e.stopPropagation();
                              const bal = getMemberBalance(m);
                              if (Math.abs(bal) > 0.01) {
                                alert(`Cannot remove "${m}" because they still have outstanding balances in this group. 💳`);
                                return;
                              }
                              if (confirm(`Remove "${m}" from the group? This will shift them to Left Members and keep past history.`)) {
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
                            title="Remove member"
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
                          {m} {m === me && '(me)'} <span style={{ fontSize: '11px', marginLeft: '8px', opacity: 0.6 }}>✏️</span>
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
                      {selectedId !== 'STANDALONE' && (
                        <span
                          style={{ cursor: 'pointer', opacity: 0.6, fontSize: '13px', color: '#EF4444', fontWeight: 'bold' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const isActive = expenses.some(
                              (exp) =>
                                String(exp.gId) === String(selectedId) &&
                                (exp.paid === m || (exp.splitters ? exp.splitters.includes(m) : true))
                            );
                            if (isActive) {
                              alert(`Cannot remove ${m}! 🛑\n\nThey have active expenses in this group.`);
                            } else if (confirm(`Remove ${m} from this group?`)) {
                              setGroups(
                                groups.map((g) =>
                                  String(g.id) === String(selectedId)
                                    ? { ...g, members: g.members.filter((mem) => mem !== m), pendingMembers: g.pendingMembers?.filter((mem) => mem !== m) }
                                    : g
                                )
                              );
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
                  Left Members ({left.length})
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
                          {cleanName}
                        </span>
                        
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const inviteUrl = `${window.location.origin}/?joinGroupId=${selectedGroup.id}&rejoinName=${encodeURIComponent(cleanName)}`;
                            await navigator.clipboard.writeText(inviteUrl);
                            alert(`Rejoin invite link for "${cleanName}" copied to clipboard! 📋\nSend this to them to rejoin: \n\n${inviteUrl}`);
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
                          🔗 Copy Rejoin Link
                        </button>
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
              background: 'linear-gradient(135deg, #7C3AED, #6366F1)',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(99, 102, 241, 0.25)',
              transition: '0.2s all ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 5px 15px rgba(99, 102, 241, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 3px 10px rgba(99, 102, 241, 0.25)';
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
