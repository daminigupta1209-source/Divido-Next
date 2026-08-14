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
  onRemindAllPending?: (pendingNames: string[]) => void;
  onAddMembers?: (names: string[]) => void;
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
  onRemindAllPending,
  onAddMembers,
}) => {
  // Hooks must run unconditionally, before any early return, so React sees a
  // stable hook order across renders (toggling showFriendsList otherwise crashes).
  const [editingMemberName, setEditingMemberName] = React.useState<string | null>(null);
  const [inlineRenameVal, setInlineRenameVal] = React.useState<string>('');
  const [isAddingInline, setIsAddingInline] = React.useState(false);
  const [inlineAddVal, setInlineAddVal] = React.useState('');
  const inlineInputRef = React.useRef<HTMLInputElement>(null);

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

  const handleInlineAdd = () => {
    const trimmed = inlineAddVal.trim();
    if (!trimmed) return;

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
      onAddMembers([trimmed]);
    }
    setInlineAddVal('');
    // Automatically refocus the input box for consecutive additions
    setTimeout(() => {
      inlineInputRef.current?.focus();
    }, 50);
  };

  const joinedMembersList = selectedGroup.members.filter(m => !selectedGroup.pendingMembers?.includes(m) && !m.endsWith(' (Left)'));
  const pendingMembersList = selectedGroup.pendingMembers || [];
  const leftMembersList = selectedGroup.members.filter((m) => m.endsWith(' (Left)'));

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
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
                fontSize: '24px',
                cursor: 'pointer',
                color: 'var(--t)',
                padding: 0,
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              ←
            </button>
            <h1 style={{ fontSize: '20px', fontWeight: 950, color: 'var(--t)', margin: 0, fontFamily: 'Nunito' }}>
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

        {/* 1. Joined Group Members Card */}
        <div
          className="card"
          style={{
            background: 'var(--w)',
            borderRadius: '24px',
            border: '1.5px solid #F1F5F9',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
            Joined Members ({joinedMembersList.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {joinedMembersList.map((m) => {
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
                      title={checkIsMe(m) ? "Click to edit name" : undefined}
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
                      {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
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
                            ? `Leave group? You won't see new updates.`
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

        {/* 2. Pending Members Card */}
        <div
          className="card"
          style={{
            background: 'var(--w)',
            borderRadius: '24px',
            border: '1.5px solid #F1F5F9',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
              Pending Invites ({pendingMembersList.length})
            </h4>
            {pendingMembersList.length > 0 && (
              <button
                onClick={handleRemindAll}
                style={{
                  background: '#FFEDD5',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '4px 10px',
                  color: '#EA580C',
                  fontSize: '10px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  transition: '0.15s all ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FED7AA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFEDD5'; }}
              >
                Remind All
              </button>
            )}
          </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pendingMembersList.map((m) => (
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
                        title="Click to edit name"
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
                        {checkIsMe(m) ? 'You' : m.replace(/\s*\(me\)$/i, '')} {checkIsAdmin(m) && <span style={{ fontSize: '10px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Admin</span>}
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
                      title={`Remind ${m}`}
                      style={{
                        background: '#FFEDD5',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
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
                        style={{ cursor: 'pointer', opacity: 0.6, fontSize: '13px', color: '#EF4444', fontWeight: 'bold', padding: '0 4px' }}
                        title="Cancel invite"
                        onClick={(e) => {
                          e.stopPropagation();
                          const promptMsg = checkIsMe(m)
                            ? `Leave group? You won't see new updates.`
                            : `Cancel the invite for "${m}"? They haven't joined yet, so this removes them completely.`;
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
              {isAddingInline && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    height: '38px',
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    ref={inlineInputRef}
                    autoFocus
                    type="text"
                    placeholder="Enter name..."
                    value={inlineAddVal}
                    onChange={(e) => setInlineAddVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInlineAdd();
                      if (e.key === 'Escape') {
                        setIsAddingInline(false);
                        setInlineAddVal('');
                      }
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: 'var(--t)',
                      outline: 'none',
                      width: '100%',
                      height: '100%',
                      padding: 0,
                      margin: 0,
                      fontFamily: 'inherit',
                    }}
                  />
                  <span
                    onClick={() => {
                      setIsAddingInline(false);
                      setInlineAddVal('');
                    }}
                    style={{
                      cursor: 'pointer',
                      opacity: 0.6,
                      fontSize: '13px',
                      color: '#EF4444',
                      fontWeight: 'bold',
                      marginLeft: '8px',
                      padding: '0 4px',
                    }}
                  >
                    ✕
                  </span>
                </div>
              )}
            </div>

            {(!isAddingInline || inlineAddVal.length > 0) && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
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
                    padding: '6px 16px',
                    borderRadius: '999px',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: '12px',
                    letterSpacing: '0.2px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(249, 115, 22, 0.3)';
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1, color: '#FFFFFF', display: 'flex', alignItems: 'center' }}>+</span>
                  <span style={{ color: '#FFFFFF', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Friend</span>
                </button>
              </div>
            )}
          </div>

        {/* 3. Past Members Card */}
        {leftMembersList.length > 0 && (
          <div
            className="card"
            style={{
              background: 'var(--w)',
              borderRadius: '24px',
              border: '1.5px solid #F1F5F9',
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
              Past Members ({leftMembersList.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {leftMembersList.map((m) => {
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
                          style={{ cursor: 'pointer', opacity: 0.6, fontSize: '13px', color: '#EF4444', fontWeight: 'bold', padding: '0 4px' }}
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
        )}

        {/* BOTTOM ACTION BUTTON */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
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
              setIsAddingInline(true);
              setTimeout(() => {
                inlineInputRef.current?.focus();
              }, 50);
            }}
          >
            + Friend
          </button>
        </div>
      </div>
    </div>
  );
};
