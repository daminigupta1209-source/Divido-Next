import React from 'react';
import { SettleModal } from './SettleModal';
import { BalanceDisplay } from './BalanceDisplay';
import { Group, Expense, UserMetadata } from '../lib/types';
import { GROUP_COLORS, formatCompactAmount } from '../lib/utils';
import { useGroupDetailForm } from '../hooks/useGroupDetailForm';

// Subcomponents
import { GroupHeader } from './group-detail/GroupHeader';
import { GroupMemberList } from './group-detail/GroupMemberList';
import { PaybackPlan } from './group-detail/PaybackPlan';
import { ExpenseList } from './group-detail/ExpenseList';

interface GroupDetailProps {
  selectedId: string | number | null;
  groups: Group[];
  expenses: Expense[];
  getMemberBalance: (gId: string | number | null, member: string) => Record<string, number>;
  setView: (v: string) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setShowExpModal: (b: boolean) => void;
  setEditingExpense: (exp: Expense | null) => void;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setShowAddFriendModal: (b: boolean) => void;
  onShareGroupLink?: () => void;
  setShowMembersHealth: (b: boolean) => void;
  setShowCurrPickerId: (id: string | null) => void;
  showCurrPickerId: string | null;
  me: string;
  setShowConvertModalId: (id: string | number | null) => void;
  userMetadata: Record<string, UserMetadata>;
  setUserMetadata?: (meta: Record<string, UserMetadata>) => void;
  deleteExpense: (id: string | number) => void;
  onShowQR: (payee: string, amt: number, curr: string) => void;
  setGlobalSettleData: (data: { name: string; gId?: string | number | null } | null) => void;
  showSettleModal: boolean;
  setShowSettleModal: (show: boolean) => void;
  editingSettle: Expense | null;
  setEditingSettle: (exp: Expense | null) => void;
  onOpenAnalytics?: (groupId: string | number) => void;
  showGroupSettleList: boolean;
  setShowGroupSettleList: (show: boolean) => void;
  setIsSidebarOpen: (open: boolean) => void;
  onApproveLinkRequest?: (memberRecordId: string) => Promise<void>;
  onDeclineLinkRequest?: (memberRecordId: string) => Promise<void>;
  onRenameMember?: (oldName: string, newName: string) => void;
  onRemindMember?: (memberName: string) => void;
  onDeleteGroup?: (id: string | number) => void;
  onRemoveMember?: (memberName: string) => void;
  onReinviteMember?: (memberName: string, inviteUrl: string) => void;
  onRequestRejoin?: () => Promise<void>;
}

export const GroupDetail: React.FC<GroupDetailProps> = ({
  selectedId,
  groups,
  expenses,
  getMemberBalance,
  setView,
  setGroups,
  setShowExpModal,
  setEditingExpense,
  setExpenses,
  setShowAddFriendModal,
  onShareGroupLink,
  setShowMembersHealth,
  setShowCurrPickerId,
  showCurrPickerId,
  me,
  setShowConvertModalId,
  userMetadata,
  setUserMetadata = () => {},
  deleteExpense,
  onShowQR,
  setGlobalSettleData,
  showSettleModal,
  setShowSettleModal,
  editingSettle,
  setEditingSettle,
  onOpenAnalytics,
  showGroupSettleList,
  setShowGroupSettleList,
  setIsSidebarOpen,
  onApproveLinkRequest,
  onDeclineLinkRequest,
  onRenameMember,
  onRemindMember,
  onDeleteGroup,
  onRemoveMember,
  onReinviteMember,
  onRequestRejoin,
}) => {
  const {
    currentId,
    selectedGroup,
    isRenaming,
    setIsRenaming,
    newName,
    setNewName,
    nameError,
    setNameError,
    filter,
    setFilter,
    dateRange,
    setDateRange,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    openExpId,
    setOpenExpId,
    showExportMenu,
    setShowExportMenu,
    showFriendsList,
    setShowFriendsList,
    showPaybackPlan,
    setShowPaybackPlan,
    showInfo,
    setShowInfo,
    activeTab,
    setActiveTab,
    filterFriend,
    setFilterFriend,
    filterType,
    setFilterType,
    showGroupOptionsMenu,
    setShowGroupOptionsMenu,
    handleExportCSV,
    handleExportPDF,
    handleCancel,
    handleRename,
    filtered,
    savedTransCount,
    myTrans,
    otherTrans,
    finalTransactions,
    hasExpenses,
    groupUniqueTags,
  } = useGroupDetailForm({
    selectedId,
    groups,
    expenses,
    getMemberBalance,
    setView,
    setGroups,
    setExpenses,
    me,
  });

  const activeMembers = selectedGroup ? selectedGroup.members.filter((m) => !m.endsWith(' (Left)')) : [];
  const isAdmin = selectedGroup ? (activeMembers[0] === me || activeMembers[0] === 'You') : false;
  const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
  const isLeftUser = selectedGroup ? !selectedGroup.members.some(m => {
    const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return cleanM === cleanMe && !m.toLowerCase().endsWith(' (left)');
  }) : false;

  const [showDetailFriendsMenu, setShowDetailFriendsMenu] = React.useState(false);
  const [showDetailBalancesMenu, setShowDetailBalancesMenu] = React.useState(false);
  const [showBalancesFilters, setShowBalancesFilters] = React.useState(false);

  React.useEffect(() => {
    const handleGlobalClick = () => {
      setShowDetailFriendsMenu(false);
      setShowDetailBalancesMenu(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  if (!selectedGroup) {
    return (
      <div className="content-width-limit">
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--g)', fontWeight: 700 }}>
          Please select or create a group 🏡
        </div>
      </div>
    );
  }

  return (
    <div className="content-width-limit">
      <GroupHeader
        selectedGroup={selectedGroup}
        selectedId={selectedId}
        setView={setView}
        isRenaming={isRenaming}
        setIsRenaming={setIsRenaming}
        newName={newName}
        setNewName={setNewName}
        nameError={nameError}
        setNameError={setNameError}
        handleRename={handleRename}
        handleCancel={handleCancel}
        showInfo={showInfo}
        setShowInfo={setShowInfo}
        setIsSidebarOpen={setIsSidebarOpen}
        onShareShortcut={onShareGroupLink || (() => setShowAddFriendModal(true))}
        showGroupOptionsMenu={showGroupOptionsMenu}
        setShowGroupOptionsMenu={setShowGroupOptionsMenu}
        setGroups={setGroups}
        groups={groups}
        setShowConvertModalId={setShowConvertModalId}
        setShowExportMenu={setShowExportMenu}
        onOpenAnalytics={onOpenAnalytics}
        setShowGroupSettleList={setShowGroupSettleList}
        onDeleteGroup={onDeleteGroup}
        me={me}
        expenses={expenses}
        setExpenses={setExpenses}
        setShowExpModal={setShowExpModal}
        setEditingExpense={setEditingExpense}
        onRequestRejoin={onRequestRejoin}
      />

      {/* Past Member Rejoin Banner */}
      {(() => {
        const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
        const isPastMember = selectedGroup.members.some(m => {
          const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
          return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
        });
        if (!isPastMember) return null;

        // Check if current user has a pending rejoin request
        const myRequest = selectedGroup.pendingLinkRequests?.find(
          (req) => req.placeholderName.replace(/\s*\(Left\)$/i, '').toLowerCase() === cleanMe || req.requestName?.toLowerCase() === cleanMe
        );
        const hasPendingRejoin = !!myRequest;

        const bannerText = hasPendingRejoin
          ? "Rejoin request pending approval. Showing past history."
          : "You have left this group. Showing past history.";

        return (
          <div
            id="past-member-banner"
            style={{
              background: '#F1F5F9',
              border: '1.5px solid #CBD5E1',
              borderRadius: '16px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#475569',
              textAlign: 'center',
              marginBottom: '16px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
          >
            {bannerText}
          </div>
        );
      })()}

      {/* Pending link requests approval banner */}
      {isAdmin && selectedGroup.pendingLinkRequests && selectedGroup.pendingLinkRequests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {selectedGroup.pendingLinkRequests.map((req) => (
            <div
              key={req.id}
              style={{
                background: '#EEF2FF',
                border: '1.5px solid #C7D2FE',
                borderRadius: '16px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔔</span>
                <div style={{ textAlign: 'left' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#312E81' }}>
                    Join Request: {req.requestName}
                  </h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#4338CA', fontWeight: 700 }}>
                    wants to link to placeholder nickname <strong>"{req.placeholderName}"</strong>.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    if (onApproveLinkRequest) {
                      await onApproveLinkRequest(req.id);
                    }
                  }}
                  className="btn-green hover-up-mini"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 900,
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Approve ✓
                </button>
                <button
                  onClick={async () => {
                    if (onDeclineLinkRequest) {
                      await onDeclineLinkRequest(req.id);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 900,
                    borderRadius: '10px',
                    border: '1.5px solid #FCA5A5',
                    background: '#FFFFFF',
                    color: '#EF4444',
                    cursor: 'pointer',
                  }}
                >
                  Decline ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members header card with back button */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          {/* Back Chevron */}
          <button
            onClick={() => setView('summary')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              marginLeft: '-11px',
              flexShrink: 0,
            }}
            title="Back to summary"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {selectedGroup && (
            <div
              style={{
                flex: '0 1 380px',
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                border: '1.5px solid #F8FAFC',
                minWidth: 0,
              }}
            >
              {/* Left: Avatar overlap list + member count */}
              <div
                onClick={(e) => { e.stopPropagation(); setShowFriendsList(!showFriendsList); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, minWidth: 0 }}
              >
                {/* Overlapping Avatars */}
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: '32px', width: `${Math.min(selectedGroup.members?.length || 0, 4) * 20 + 8}px`, flexShrink: 0 }}>
                  {(selectedGroup.members || []).slice(0, 4).map((member, idx) => {
                    const initials = (() => {
                      if (!member) return '?';
                      const p = member.trim().split(/\s+/);
                      if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
                      return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
                    })();

                    const avatarColors = ['#E0F2FE', '#F0FDF4', '#FEF2F2', '#FFFBEB', '#F5F3FF', '#FFF1F2'];
                    const textColors = ['#0369A1', '#15803D', '#B91C1C', '#B45309', '#6D28D9', '#BE123C'];
                    const colorIdx = member.charCodeAt(0) % avatarColors.length;

                    return (
                      <div
                        key={member}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: avatarColors[colorIdx],
                          color: textColors[colorIdx],
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9.5px',
                          fontWeight: 900,
                          border: '2px solid #FFFFFF',
                          position: 'absolute',
                          left: `${idx * 20}px`,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          zIndex: 4 - idx,
                        }}
                      >
                        {initials}
                      </div>
                    );
                  })}
                </div>

                {/* Members Count text */}
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.1px' }}>
                  {selectedGroup.members?.length || 0} Members
                </span>
              </div>

              {/* Right: + Friend / Rejoin Button */}
              {!isLeftUser ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAddFriendModal(true);
                  }}
                  style={{
                    background: 'transparent',
                    color: '#6366F1',
                    border: '1.5px solid #6366F1',
                    padding: '5px 13px',
                    borderRadius: '999px',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span> Friend
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRequestRejoin) onRequestRejoin();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  🚪 Rejoin
                </button>
              )}
            </div>
          )}
        </div>

        <GroupMemberList
          selectedGroup={selectedGroup}
          selectedId={selectedId}
          showFriendsList={showFriendsList}
          setShowFriendsList={setShowFriendsList}
          setShowAddFriendModal={setShowAddFriendModal}
          me={me}
          userMetadata={userMetadata}
          expenses={expenses}
          setGroups={setGroups}
              groups={groups}
          onRenameMember={onRenameMember}
          onRemindMember={(name) => {
            if (onRemindMember) onRemindMember(name);
          }}
          onRemoveMember={onRemoveMember}
          onReinviteMember={onReinviteMember}
        />
      </div>

      {activeTab === 'expenses' && (() => {
        const groupBalForCard: Record<string, number> = {};
        finalTransactions.forEach((t) => {
          if (t.from === me) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              groupBalForCard[curr] = (groupBalForCard[curr] || 0) - val;
            });
          } else if (t.to === me) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              groupBalForCard[curr] = (groupBalForCard[curr] || 0) + val;
            });
          }
        });

        const getBacks = Object.entries(groupBalForCard).filter(([_, v]) => v > 0.01);
        const payBacks = Object.entries(groupBalForCard).filter(([_, v]) => v < -0.01);
        const hasActiveBalancesForCard = getBacks.length > 0 || payBacks.length > 0;

        // Only the primary currency's amount is shown in the pill; the small label
        // above it carries a "+N" when more currencies exist (full detail on tap).
        const primaryAmt = (entries: [string, number][]) => {
          const [curr, val] = entries[0];
          return `${curr}${formatCompactAmount(val)}`;
        };

        const PINK = '#DE7093';
        const GREEN = '#6FC7A4';

        // Original single-line look (regular weight, no uppercase). Segments size
        // to content so the longer side gets room; ellipsis is the safety net.
        const segStyle: React.CSSProperties = {
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0 10px',
          cursor: 'pointer',
        };
        // Small translucent count chip for extra currencies (e.g. "+1").
        const chipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.28)', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, flexShrink: 0 };

        if (!hasExpenses) return null;

        return (
          <div style={{ marginBottom: '22px', marginTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px' }}>
              Net Balance
            </div>

            <div onClick={() => hasActiveBalancesForCard && setActiveTab('balances')} style={{ position: 'relative', display: 'flex', height: '36px', borderRadius: '999px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.06)', cursor: hasActiveBalancesForCard ? 'pointer' : 'default' }}>
              {!hasActiveBalancesForCard ? (
                <div style={{ ...segStyle, background: GREEN, cursor: 'default' }}>All settled up</div>
              ) : (
                <>
                  {payBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: PINK }}
                      onClick={() => setActiveTab('balances')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryAmt(payBacks)} to pay</span>
                      {payBacks.length > 1 && <span style={chipStyle}>+{payBacks.length - 1}</span>}
                    </div>
                  )}
                  {getBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: GREEN }}
                      onClick={() => setActiveTab('balances')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryAmt(getBacks)} to collect</span>
                      {getBacks.length > 1 && <span style={chipStyle}>+{getBacks.length - 1}</span>}
                    </div>
                  )}
                </>
              )}
              {hasActiveBalancesForCard && (
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF', fontSize: '20px', fontWeight: 900, lineHeight: 1, pointerEvents: 'none', opacity: 0.9 }}>›</span>
              )}
            </div>
          </div>
        );
      })()}



      <div style={{
        display: 'flex',
        borderBottom: '2px solid #F1F5F9',
        marginBottom: '20px',
        marginTop: '10px',
        alignItems: 'stretch'
      }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setActiveTab('expenses')}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 4px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              color: activeTab === 'expenses' ? '#6366F1' : '#94A3B8',
              borderBottom: activeTab === 'expenses' ? '3px solid #6366F1' : '3px solid transparent',
              marginBottom: '-2px',
              transition: '0.2s all'
            }}
          >
            Activities
          </button>
        </div>

        <div style={{
          width: '1px',
          background: '#E2E8F0',
          marginTop: '10px',
          marginBottom: '0px',
          opacity: 0.8
        }} />

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setActiveTab('balances')}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 4px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              color: activeTab === 'balances' ? '#6366F1' : '#94A3B8',
              borderBottom: activeTab === 'balances' ? '3px solid #6366F1' : '3px solid transparent',
              marginBottom: '-2px',
              transition: '0.2s all'
            }}
          >
            Balances
          </button>
        </div>
      </div>

      {activeTab === 'balances' && (() => {
        // Calculate group balances directly from our finalized transactions to stay 100% in sync
        const groupBal: Record<string, number> = {};
        finalTransactions.forEach((t) => {
          if (t.from === me) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              groupBal[curr] = (groupBal[curr] || 0) - val;
            });
          } else if (t.to === me) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              groupBal[curr] = (groupBal[curr] || 0) + val;
            });
          }
        });
        const getBackEntries = Object.entries(groupBal).filter(([_, v]) => v > 0.01);
        const oweEntries = Object.entries(groupBal).filter(([_, v]) => v < -0.01);
        const hasBalances = getBackEntries.length > 0 || oweEntries.length > 0;
        // Calculate net balance separately per currency to handle multi-currency ledgers correctly
        const currencyBalances: Record<string, number> = {};
        
        getBackEntries.forEach(([c, v]) => {
          currencyBalances[c] = (currencyBalances[c] || 0) + v;
        });
        oweEntries.forEach(([c, v]) => {
          currencyBalances[c] = (currencyBalances[c] || 0) + v; // v is negative here
        });

        // Filter out tiny values close to zero
        const activeBalances = Object.entries(currencyBalances).filter(([_, val]) => Math.abs(val) > 0.01);
        const hasActiveBalances = activeBalances.length > 0;

        let netBg = '#FFFFFF';
        let netBorder = '#F1F5F9';

        if (hasActiveBalances) {
          const allPositive = activeBalances.every(([_, val]) => val > 0.01);
          const allNegative = activeBalances.every(([_, val]) => val < -0.01);

          if (allPositive) {
            netBg = '#F0FDF4';
            netBorder = '#BBF7D0';
          } else if (allNegative) {
            netBg = '#FEF2F2';
            netBorder = '#FECACA';
          }
        }

        const filterFriendLabel = filterFriend === 'all' ? 'All Friends' : filterFriend === 'me' ? 'You' : filterFriend;
        const filterTypeLabel = filterType === 'all' ? 'All Balances' : filterType === 'owed' ? 'To Collect' : 'To Pay';

        const dropdownStyle: React.CSSProperties = {
          position: 'relative',
          flex: 1,
          minWidth: 0,
        };

        const btnStyle: React.CSSProperties = {
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          width: '100%', boxSizing: 'border-box',
          padding: '6px 12px', borderRadius: '20px',
          border: '1.5px solid #E2E8F0', background: 'var(--w)',
          fontSize: '12px', fontWeight: 800, color: '#475569',
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        };

        const popupStyle: React.CSSProperties = {
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: 'var(--w)', border: '1.5px solid #F1F5F9',
          borderRadius: '14px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
          zIndex: 200, width: 'max-content', minWidth: '130px', padding: '6px',
        };

        const optionStyle = (active: boolean): React.CSSProperties => ({
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 800,
          color: active ? '#16A34A' : '#1E293B',
          background: active ? '#F0FDF4' : 'transparent',
        });

        return (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {/* Filter Pills */}
            {(() => {
              const groupExps = expenses.filter((e) => String(e.gId) === String(selectedGroup.id));
              const distinctCurrencies = Array.from(new Set(groupExps.map((e) => e.currency || selectedGroup.currency || '₹')));

              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', animation: 'fadeIn 0.2s ease-out', flexWrap: 'wrap' }}>
                  {/* Friends filter */}
                  <div style={dropdownStyle}>
                    <button style={btnStyle} onClick={(e) => { e.stopPropagation(); setShowDetailFriendsMenu(!showDetailFriendsMenu); setShowDetailBalancesMenu(false); }}>
                      <span>{filterFriendLabel}</span><span style={{ fontSize: '9px', marginLeft: '2px' }}>▼</span>
                    </button>
                    {showDetailFriendsMenu && (
                      <>
                        <div onClick={() => setShowDetailFriendsMenu(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
                        <div style={popupStyle}>
                          <div style={optionStyle(filterFriend === 'all')} onClick={() => { setFilterFriend('all'); setShowDetailFriendsMenu(false); }}>
                            <span>All Friends</span>
                          </div>
                          <div style={optionStyle(filterFriend === 'me')} onClick={() => { setFilterFriend('me'); setShowDetailFriendsMenu(false); }}>
                            <span>You</span>
                          </div>
                          {selectedGroup.members
                            .filter((m) => m !== me)
                            .map((m) => (
                              <div key={m} style={optionStyle(filterFriend === m)} onClick={() => { setFilterFriend(m); setShowDetailFriendsMenu(false); }}>
                                <span>{m}</span>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Balance filter */}
                  <div style={dropdownStyle}>
                    <button style={btnStyle} onClick={(e) => { e.stopPropagation(); setShowDetailBalancesMenu(!showDetailBalancesMenu); setShowDetailFriendsMenu(false); }}>
                      <span>{filterTypeLabel}</span><span style={{ fontSize: '9px', marginLeft: '2px' }}>▼</span>
                    </button>
                    {showDetailBalancesMenu && (
                      <>
                        <div onClick={() => setShowDetailBalancesMenu(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
                        <div style={popupStyle}>
                          {(['all', 'owed', 'owe'] as const).map((opt) => (
                            <div
                              key={opt}
                              onClick={() => {
                                setFilterType(opt);
                                setShowDetailBalancesMenu(false);
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: filterType === opt ? 800 : 600,
                                cursor: 'pointer',
                                color: '#1E293B',
                                background: filterType === opt ? '#F1F5F9' : 'transparent',
                                textAlign: 'left',
                              }}
                            >
                              {opt === 'all' ? 'All Balances' : opt === 'owed' ? 'To Collect' : 'To Pay'}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                </div>
              );
            })()}

            <div className="" style={{ textAlign: 'left', marginTop: '4px' }}>
              {(() => {
                // 1. Combine all transactions
                const allTrans = [
                  ...myTrans.map(t => ({ ...t, isMyTrans: true })),
                  ...otherTrans.map(t => ({ ...t, isMyTrans: false }))
                ];

                // 2. Filter by friend selection
                let filtered = allTrans;
                if (filterFriend === 'me') {
                  filtered = filtered.filter(t => t.from === me || t.to === me);
                } else if (filterFriend !== 'all') {
                  filtered = filtered.filter(t => t.from === filterFriend || t.to === filterFriend);
                }

                // 3. Filter by balance type selection (relative to 'me')
                if (filterType === 'owed') {
                  filtered = filtered.filter(t => t.to === me);
                } else if (filterType === 'owe') {
                  filtered = filtered.filter(t => t.from === me);
                }

                if (filtered.length === 0) {
                  return (
                    <div className="card" style={{ padding: '32px 24px', borderRadius: '24px', textAlign: 'center', color: '#64748B' }}>
                      <span style={{ fontSize: '32px' }}>🤝</span>
                      <p style={{ margin: '10px 0 0 0', fontWeight: 800, fontSize: '13px' }}>
                        {filterFriend === 'all' && filterType === 'all' 
                          ? 'Everyone is fully settled up!' 
                          : 'No matching settlements found for active filters.'
                        }
                      </p>
                    </div>
                  );
                }

                const myTransList = filtered.filter(t => t.isMyTrans);
                const otherTransList = filtered.filter(t => !t.isMyTrans);

                const AV_COLORS = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];
                const balPillBase: React.CSSProperties = { padding: '2px 4px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' };
                const balCardChip: React.CSSProperties = { background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 800, lineHeight: '16px' };
                const balPrimary = (list: [string, number][]) => { const [c, v] = list[0]; return `${c}${formatCompactAmount(v)}`; };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {myTransList.map((t) => {
                      const m = t.from === me ? t.to : t.from;
                      const isOwed = t.to === me;

                      let displayBalances: Record<string, number> = {};
                      if (isOwed) {
                        displayBalances = t.balances;
                      } else {
                        Object.entries(t.balances).forEach(([c, v]) => {
                          displayBalances[c] = -v;
                        });
                      }

                      const balEntries = Object.entries(displayBalances).filter(([_, v]) => Math.abs(v) > 0.01);
                      const collectList = balEntries.filter(([_, v]) => v > 0.01);
                      const payList = balEntries.filter(([_, v]) => v < -0.01);
                      const avBg = AV_COLORS[(m.charCodeAt(0) || 0) % AV_COLORS.length];

                      return (
                        <div
                          key={`my-${m}`}
                          className="card hover-up"
                          onClick={() => {
                             const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                             const isPastMember = selectedGroup.members.some(x => {
                               const cleanM = x.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                               return cleanM === cleanMe && x.toLowerCase().endsWith(' (left)');
                             });
                             if (isPastMember) {
                               if (onRequestRejoin) onRequestRejoin();
                             } else {
                               setGlobalSettleData({ name: m, gId: selectedId });
                             }
                          }}
                          style={{
                            padding: '10px 16px',
                            background: '#FFFFFF',
                            border: '1.5px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                            borderRadius: '18px',
                            cursor: 'pointer',
                            minHeight: '56px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: avBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, flexShrink: 0 }}>
                            {m.charAt(0).toUpperCase()}
                          </div>

                          <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h3 className="nunito" style={{ fontSize: '17px', fontWeight: 800, color: '#2E2A25', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{m}</h3>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end', flexShrink: 0 }}>
                            {payList.length > 0 && (
                              <span style={{ ...balPillBase, color: '#D8608A' }}>
                                {balPrimary(payList)} to pay
                                {payList.length > 1 && <span style={balCardChip}>+{payList.length - 1}</span>}
                              </span>
                            )}
                            {collectList.length > 0 && (
                              <span style={{ ...balPillBase, color: '#3FA97C' }}>
                                {balPrimary(collectList)} to collect
                                {collectList.length > 1 && <span style={balCardChip}>+{collectList.length - 1}</span>}
                              </span>
                            )}
                          </div>

                          <span style={{ fontSize: '18px', color: '#C9BEB2', fontWeight: 900, lineHeight: 1, flexShrink: 0 }}>›</span>
                        </div>
                      );
                    })}

                    {otherTransList.length > 0 && (
                      <h4
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 950,
                          color: '#64748B',
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                          marginTop: '12px',
                          marginBottom: '4px',
                          textAlign: 'center',
                        }}
                      >
                        Other settlements
                      </h4>
                    )}

                    {otherTransList.map((t, idx) => {
                      return (
                        <div
                          key={`other-${idx}`}
                          className="card hover-up"
                          onClick={() => {
                            const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                            const isPastMember = selectedGroup.members.some(x => {
                              const cleanM = x.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                              return cleanM === cleanMe && x.toLowerCase().endsWith(' (left)');
                            });
                            if (isPastMember) {
                              if (onRequestRejoin) onRequestRejoin();
                            } else {
                              setGlobalSettleData({ name: t.from, gId: selectedId });
                            }
                          }}
                          style={{
                            padding: '12px 14px',
                            background: '#F8FAFC',
                            border: '1.5px solid #F1F5F9',
                            opacity: 0.9,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                background: '#E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                                flexShrink: 0,
                              }}
                            >
                              🤝
                            </div>
                            <div style={{ minWidth: 0, fontSize: '13px', color: '#64748B', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#475569', fontWeight: 800 }}>{t.from}</span>
                              <span style={{ margin: '0 6px', fontWeight: 500, opacity: 0.7 }}>➔</span>
                              <span style={{ color: '#475569', fontWeight: 800 }}>{t.to}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                            <div style={{ width: '80px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                              <BalanceDisplay balances={t.balances} align="right" style={{ fontSize: '14px', fontWeight: 800, color: '#64748B' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Clean Slate view for newly created groups / standalone */}
      {!hasExpenses && activeTab === 'expenses' && (
        <div
          className="card"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            border: '1.5px dashed #E2E8F0',
            borderRadius: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            marginTop: '10px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01), 0 2px 4px -1px rgba(0,0,0,0.01)',
          }}
        >
          {/* Removed empty description text */}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%', maxWidth: '240px' }}>
            {/* Add Friend Button matching the top right one's color and design */}
            {!isLeftUser && (
              <button
                className="add-friend-btn-anim"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddFriendModal(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  height: '38px',
                  borderRadius: '999px',
                  background: 'transparent',
                  color: '#6366F1',
                  border: '1.5px solid #6366F1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxSizing: 'border-box',
                  fontSize: '13px',
                  fontWeight: 950,
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
              >
                <span style={{ fontSize: '15px', fontWeight: 950, lineHeight: 1 }}>+</span> Friend
              </button>
            )}

            {/* Circular Add Expense Button lookalike / button matching group's + Add Expense */}
            <button
              id="desktop-add-expense-btn"
              style={{
                width: '100%',
                height: '38px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 950,
                borderRadius: '999px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1.5px solid #059669',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: '0.2s all ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.background = 'rgba(5, 150, 105, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => {
                setEditingExpense(null);
                setShowExpModal(true);
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 950, lineHeight: 1, color: '#059669' }}>+</span> Expense
            </button>
          </div>
        </div>
      )}

      {hasExpenses && activeTab === 'expenses' && (
        <ExpenseList
          setView={setView}
          filtered={filtered}
          me={me}
          selectedGroup={selectedGroup}
          selectedId={selectedId}
          dateRange={dateRange}
          setDateRange={setDateRange}
          filter={filter}
          setFilter={setFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          openExpId={openExpId}
          setOpenExpId={setOpenExpId}
          setEditingExpense={setEditingExpense}
          setShowExpModal={setShowExpModal}
          setEditingSettle={setEditingSettle}
          setShowSettleModal={setShowSettleModal}
          setShowConvertModalId={setShowConvertModalId}
          setExpenses={setExpenses}
          setGroups={setGroups}
          groups={groups}
          deleteExpense={deleteExpense}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          groupUniqueTags={groupUniqueTags}
        />
      )}

      <PaybackPlan
        showPaybackPlan={showPaybackPlan}
        setShowPaybackPlan={setShowPaybackPlan}
        savedTransCount={savedTransCount}
        finalTransactions={finalTransactions}
        myTrans={myTrans}
        otherTrans={otherTrans}
        me={me}
        selectedId={selectedId}
        setGlobalSettleData={setGlobalSettleData}
      />

      {showGroupSettleList && (
        <div
          className="modal-overlay"
          style={{ zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowGroupSettleList(false)}
        >
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '420px',
              padding: '24px 20px',
              borderRadius: '24px',
              position: 'relative',
              animation: 'slideUp 0.3s ease-out',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onClick={() => setShowGroupSettleList(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                cursor: 'pointer',
                fontSize: '18px',
                opacity: 0.3,
                transition: '0.2s all',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
            >
              ✕
            </div>
            <h3 className="nunito" style={{
              fontSize: '20px',
              fontWeight: 950,
              color: '#0F172A',
              marginBottom: '4px',
              textAlign: 'center'
            }}>
              Settle Up
            </h3>
            <p style={{
              textAlign: 'center',
              color: 'var(--g)',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '16px'
            }}>
              {selectedGroup.members?.filter((m) => m !== me).length} Friends in {selectedGroup.name}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
              {myTrans.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', marginTop: '4px', paddingLeft: '4px' }}>
                    Your Settlements
                  </div>
                  {myTrans.map((t) => {
                    const m = t.from === me ? t.to : t.from;
                    const isOwed = t.to === me;
                    
                    let displayBalances: Record<string, number> = {};
                    if (isOwed) {
                      displayBalances = t.balances;
                    } else {
                      Object.entries(t.balances).forEach(([c, v]) => {
                        displayBalances[c] = -v;
                      });
                    }

                    return (
                      <div
                        key={m}
                        className="card hover-up"
                        style={{
                          padding: '12px 14px',
                          background: 'var(--w)',
                          border: '1.5px solid #F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          borderRadius: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '8px',
                              background: isOwed ? '#D1FAE5' : '#FFE4E6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                              flexShrink: 0,
                            }}
                          >
                            {isOwed ? '📈' : '📉'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <h4 className="nunito" style={{ fontSize: '13px', fontWeight: 800, margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                {m}
                              </h4>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          <div>
                            <BalanceDisplay balances={displayBalances} align="right" style={{ fontSize: '14px', fontWeight: 800 }} />
                          </div>
                          <button
                            onClick={() => {
                              setGlobalSettleData({ name: m, gId: selectedId });
                              setShowGroupSettleList(false);
                            }}
                            className="btn-green hover-up-mini"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '8px',
                              fontWeight: 800,
                              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.12)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '60px',
                            }}
                          >
                            Settle
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {otherTrans.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', marginTop: '10px', paddingLeft: '4px' }}>
                    Other Settlements
                  </div>
                  {otherTrans.map((t, idx) => (
                    <div
                      key={idx}
                      className="card"
                      style={{
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        opacity: 0.8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: '#E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            flexShrink: 0,
                          }}
                        >
                          🤝
                        </div>
                        <div style={{ minWidth: 0, fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                          <span style={{ color: '#475569', fontWeight: 800 }}>{t.from}</span>
                          <span style={{ margin: '0 4px', fontWeight: 500, opacity: 0.7 }}>➔</span>
                          <span style={{ color: '#475569', fontWeight: 800 }}>{t.to}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <BalanceDisplay balances={t.balances} align="right" style={{ fontSize: '13px', fontWeight: 800, color: '#64748B' }} />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {myTrans.length === 0 && otherTrans.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--g)', fontSize: '13px', fontWeight: 700 }}>
                  ✨ Everyone is settled up!
                </div>
              )}

              {(!selectedGroup.members || selectedGroup.members.filter((m) => m !== me).length === 0) && (
                <p style={{ textAlign: 'center', color: 'var(--g)', fontSize: '12px', padding: '20px 0' }}>
                  No other members in this group yet. Add friends first! 👥
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group-specific bottom navigation bar */}
      {selectedId !== null && (
        <nav className="bottom-nav">
          <div className="b-nav-btn" onClick={() => setView('summary')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M9.5 20v-6h5v6" />
              </svg>
            </span>
            <span>Home</span>
          </div>
          <div className="b-nav-btn" onClick={() => setView('groups')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '22px', height: '22px' }}>
                <circle cx="8" cy="5" r="3" strokeWidth="1.8" fill="none" stroke="currentColor" />
                <path d="M1 17c0-3.5 3-6 7-6s7 2.5 7 6" strokeWidth="1.8" fill="none" strokeLinecap="round" stroke="currentColor" />
                <circle cx="15" cy="5" r="2.5" strokeWidth="1.5" fill="none" stroke="currentColor" opacity="0.7" />
                <path d="M17 11c2.5 0.5 4.5 2.2 4.5 5" strokeWidth="1.5" fill="none" strokeLinecap="round" stroke="currentColor" opacity="0.7" />
              </svg>
            </span>
            <span>Groups</span>
          </div>

          {/* Central Circular Add Expense Button */}
          <div
            onClick={() => { setEditingExpense(null); setShowExpModal(true); }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '70px', cursor: 'pointer' }}
            title="Add Expense"
          >
            <div
              style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#059669', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '24px', fontWeight: 700, zIndex: 1600, transform: 'translateY(-18px)', transition: 'all 0.15s ease-in-out', lineHeight: 1 }}
              className="hover-up"
            >
              +
            </div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#475569', transform: 'translateY(-10px)' }}>Expense</span>
          </div>

          <div className="b-nav-btn" onClick={() => setView('friends')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M4 8h13" />
                <path d="m14 5 3 3-3 3" />
                <path d="M20 16H7" />
                <path d="m10 13-3 3 3 3" />
              </svg>
            </span>
            <span>Settle All</span>
          </div>
          <div className="b-nav-btn" onClick={() => setView('activity')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M12 8v4l2.5 2" />
                <path d="M3.5 9a9 9 0 1 1-.5 5" />
                <path d="M3 5v4h4" />
              </svg>
            </span>
            <span>Activities</span>
          </div>
        </nav>
      )}

      {/* Export Options Modal */}
      {showExportMenu && (
        <div
          className="modal-overlay"
          style={{ zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowExportMenu(false)}
        >
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '320px',
              padding: '24px 20px',
              borderRadius: '24px',
              position: 'relative',
              animation: 'slideUp 0.3s ease-out',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onClick={() => setShowExportMenu(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                cursor: 'pointer',
                fontSize: '18px',
                opacity: 0.3,
                transition: '0.2s all',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
            >
              ✕
            </div>
            <h3 className="nunito" style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#0F172A',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Export Group Ledger
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-pink hover-up"
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onClick={() => {
                  setShowExportMenu(false);
                  handleExportCSV();
                }}
              >
                <span>📊</span> CSV Spreadsheet
              </button>
              <button
                className="btn-pink hover-up"
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onClick={() => {
                  setShowExportMenu(false);
                  handleExportPDF();
                }}
              >
                <span>🖨️</span> PDF Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
