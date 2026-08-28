import React from 'react';
import { SettleModal } from './SettleModal';
import { BalanceDisplay } from './BalanceDisplay';
import { Group, Expense, UserMetadata } from '../lib/types';
import { GROUP_COLORS, formatExactAmount } from '../lib/utils';
import { useGroupDetailForm } from '../hooks/useGroupDetailForm';

// Subcomponents
import { GroupHeader } from './group-detail/GroupHeader';
import { GroupMemberList } from './group-detail/GroupMemberList';
import { PaybackPlan } from './group-detail/PaybackPlan';
import { ExpenseList } from './group-detail/ExpenseList';
import { GroupGallery } from './GroupGallery';

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
  onWriteOff?: (memberName: string) => void;
  onLeaveGroup?: () => void;
  onReinviteMember?: (memberName: string, inviteUrl: string) => void;
  onRemindAllPending?: (pendingNames: string[]) => void;
  onAddMembers?: (names: string[]) => void;
  onRequestRejoin?: () => Promise<void>;
  wasRemovedByAdmin?: boolean;
  onCreateGroup?: () => void;
  activeTab?: 'expenses' | 'balances' | 'photos';
  setActiveTab?: (tab: 'expenses' | 'balances' | 'photos') => void;
  onPhotoViewerChange?: (isOpen: boolean) => void;
  showFriendsList?: boolean;
  setShowFriendsList?: (b: boolean) => void;
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
  onWriteOff,
  onLeaveGroup,
  onReinviteMember,
  onRemindAllPending,
  onAddMembers,
  onRequestRejoin,
  wasRemovedByAdmin,
  onCreateGroup,
  activeTab: propActiveTab,
  setActiveTab: propSetActiveTab,
  onPhotoViewerChange,
  showFriendsList: propShowFriendsList,
  setShowFriendsList: propSetShowFriendsList,
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
    showFriendsList: hookShowFriendsList,
    setShowFriendsList: hookSetShowFriendsList,
    showPaybackPlan,
    setShowPaybackPlan,
    showInfo,
    setShowInfo,
    activeTab: hookActiveTab,
    setActiveTab: hookSetActiveTab,
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

  const activeTab = propActiveTab !== undefined ? propActiveTab : hookActiveTab;
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : hookSetActiveTab;
  const showFriendsList = propShowFriendsList !== undefined ? propShowFriendsList : hookShowFriendsList;
  const setShowFriendsList = propSetShowFriendsList !== undefined ? propSetShowFriendsList : hookSetShowFriendsList;

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

  // Swipe left/right anywhere on the group screen to toggle Activities/Balances.
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    if (!swipeStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.current.x;
    const dy = t.clientY - swipeStart.current.y;
    swipeStart.current = null;
    // Forgiving detection: a shorter (40px) mostly-horizontal flick counts, so
    // toggling tabs feels smooth instead of needing 2-3 tries. Only require the
    // horizontal movement to beat the vertical (drop the strict 1.5x ratio).
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      // Tabs left→right: Activities (expenses) · Settle (balances) · Photos.
      const order: Array<'expenses' | 'balances' | 'photos'> = ['expenses', 'balances', 'photos'];
      const idx = order.indexOf(activeTab as any);
      if (dx < 0) {
        // Swipe left → next tab (stops at the last one).
        if (idx >= 0 && idx < order.length - 1 && setActiveTab) setActiveTab(order[idx + 1]);
      } else {
        // Swipe right → previous tab; only leave the group when already on the
        // first tab (so both directions toggle tabs symmetrically).
        if (idx > 0 && setActiveTab) setActiveTab(order[idx - 1]);
        else setView('summary');
      }
    }
  };

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
    <div className="content-width-limit" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
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
        onCreateGroup={onCreateGroup}
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

        const leftText = wasRemovedByAdmin
          ? "You were removed from this group by the admin. Showing past history."
          : "You have left this group. Showing past history.";
        const bannerText = hasPendingRejoin
          ? "Rejoin request pending approval. Showing past history."
          : leftText;

        return (
          <div id="past-member-banner" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: hasPendingRejoin ? '#FEF3C7' : '#F1F5F9',
                color: hasPendingRejoin ? '#92400E' : '#64748B',
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 500,
                maxWidth: '100%',
                textAlign: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                <path d="M3 3v5h5" />
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <path d="M12 7v5l3 2" />
              </svg>
              {hasPendingRejoin
                ? 'Rejoin request pending approval. Showing past history.'
                : `${wasRemovedByAdmin ? 'You were removed by the admin.' : 'You left this group.'} Showing past history.`}
            </span>
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
                border: '1px solid #C7D2FE',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔔</span>
                <div style={{ textAlign: 'left' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#312E81' }}>
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
                    fontWeight: 600,
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
                    fontWeight: 600,
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
                          fontWeight: 600,
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

              {!isLeftUser ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShareGroupLink) onShareGroupLink();
                  }}
                  style={{
                    background: '#1877F2',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: '999px',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '0.2px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.background = '#166FE5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.background = '#1877F2';
                  }}
                >
                  <span style={{ color: 'inherit', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Invite</span>
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRequestRejoin) onRequestRejoin();
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ color: '#FFFFFF', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Rejoin</span>
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
          onWriteOff={onWriteOff}
          onLeaveGroup={onLeaveGroup}
          onReinviteMember={onReinviteMember}
          onRemindAllPending={onRemindAllPending}
          onAddMembers={onAddMembers}
        />
      </div>

      {(activeTab === 'expenses' || activeTab === 'photos' || activeTab === 'balances') && (() => {
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
          return `${curr}${formatExactAmount(val)}`;
        };

        const PINK = '#E11D48';
        const GREEN = '#10B981';

        // Original single-line look (regular weight, no uppercase). Segments size
        // to content so the longer side gets room; ellipsis is the safety net.
        const segStyle: React.CSSProperties = {
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0 18px',
          cursor: 'pointer',
        };
        // Small translucent count chip for extra currencies (e.g. "+1").
        const chipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.28)', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, flexShrink: 0 };

        if (!hasExpenses) return null;

        return (
          <div style={{ marginBottom: '22px', marginTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px' }}>
              Your Group Balance
            </div>

            <div onClick={() => hasActiveBalancesForCard && setActiveTab('balances')} style={{ position: 'relative', display: 'flex', height: '38px', borderRadius: '999px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.06)', cursor: hasActiveBalancesForCard ? 'pointer' : 'default' }}>
              {!hasActiveBalancesForCard ? (
                <div style={{ ...segStyle, background: GREEN, cursor: 'default' }}>All settled up</div>
              ) : (
                <>
                  {payBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: PINK, paddingRight: getBacks.length > 0 ? '18px' : '34px' }}
                      onClick={() => setActiveTab('balances')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>You pay {primaryAmt(payBacks)}</span>
                      {payBacks.length > 1 && <span style={chipStyle}>+{payBacks.length - 1}</span>}
                    </div>
                  )}
                  {getBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: GREEN, paddingRight: '34px' }}
                      onClick={() => setActiveTab('balances')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>You collect {primaryAmt(getBacks)}</span>
                      {getBacks.length > 1 && <span style={chipStyle}>+{getBacks.length - 1}</span>}
                    </div>
                  )}
                </>
              )}
              {hasActiveBalancesForCard && (
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF', fontSize: '18px', fontWeight: 600, lineHeight: 1, pointerEvents: 'none', opacity: 0.9 }}>›</span>
              )}
            </div>
          </div>
        );
      })()}



      <div style={{
        display: 'flex',
        borderBottom: '1.5px solid #F1F5F9',
        marginBottom: '20px',
        marginTop: '10px',
      }}>
        {([
          { id: 'expenses', label: 'Activities' },
          { id: 'balances', label: 'Settle' },
          { id: 'photos', label: 'Photos' }
        ] as const).map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (setActiveTab) setActiveTab(tab.id as 'expenses' | 'balances' | 'photos');
              }}
              style={{
                flex: 1,
                position: 'relative',
                background: 'transparent',
                border: 'none',
                padding: '10px 4px 12px',
                fontSize: '14px',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                color: isActive ? '#1E293B' : '#94A3B8',
                transition: '0.2s all',
              }}
            >
              {tab.label}
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '-1.5px',
                  transform: `translateX(-50%) scaleX(${isActive ? 1 : 0})`,
                  transformOrigin: 'center',
                  width: '60%',
                  height: '3px',
                  borderRadius: '3px 3px 0 0',
                  background: '#F97316',
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </button>
          );
        })}
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
          fontSize: '12px', fontWeight: 600, color: '#475569',
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
          fontSize: '12px', fontWeight: 600,
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
                      <span style={{ fontSize: '32px' }}>✅</span>
                      <p style={{ margin: '10px 0 0 0', fontWeight: 600, fontSize: '13px' }}>
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
                const balCardChip: React.CSSProperties = { background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 600, lineHeight: '16px' };
                const balPrimary = (list: [string, number][]) => { const [c, v] = list[0]; return `${c}${formatExactAmount(v)}`; };

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
                            padding: '16px',
                            background: '#FFFFFF',
                            border: '0.5px solid #EFE7DC',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderRadius: '20px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: avBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
                            {m.charAt(0).toUpperCase()}
                          </div>

                          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                            <h3  style={{ fontSize: '16px', fontWeight: 600, color: '#2E2A25', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{m}</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              {payList.length > 0 && (
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#E11D48', display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`You pay ${balPrimary(payList)}`}</span>
                                  {payList.length > 1 && <span style={{ background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 600, lineHeight: '16px', flexShrink: 0 }}>+{payList.length - 1}</span>}
                                </span>
                              )}
                              {collectList.length > 0 && (
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`You collect ${balPrimary(collectList)}`}</span>
                                  {collectList.length > 1 && <span style={{ background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 600, lineHeight: '16px', flexShrink: 0 }}>+{collectList.length - 1}</span>}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            className="hover-up-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingExpense({
                                id: 'temp-' + Date.now(),
                                gId: String(selectedId),
                                title: '',
                                amt: 0,
                                date: new Date().toISOString().split('T')[0],
                                mode: 'Equally',
                                paid: me,
                                splitters: [me, m],
                                shares: { [me]: 50, [m]: 50 },
                                timestamp: Date.now()
                              });
                              setShowExpModal(true);
                            }}
                            title={`Add expense with ${m}`}
                            style={{
                              flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%',
                              background: '#059669', color: '#FFFFFF', border: 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                              marginRight: '4px', marginLeft: '4px', boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ width: '15px', height: '15px' }}>
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>

                          <span style={{ fontSize: '18px', color: '#C9BEB2', fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>›</span>
                        </div>
                      );
                    })}

                    {otherTransList.length > 0 && (
                      <h4
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 600,
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
                          style={{
                            padding: '16px',
                            background: '#F8FAFC',
                            border: '0.5px solid #EFE7DC',
                            opacity: 0.9,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            borderRadius: '20px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                            boxSizing: 'border-box',
                            cursor: 'default',
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
                              ✅
                            </div>
                            <div style={{ minWidth: 0, fontSize: '13px', color: '#64748B', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#475569', fontWeight: 600 }}>{t.from}</span>
                              <span style={{ margin: '0 6px', fontWeight: 500, opacity: 0.7 }}>➔</span>
                              <span style={{ color: '#475569', fontWeight: 600 }}>{t.to}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                            <div style={{ width: '80px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                              <BalanceDisplay balances={t.balances} align="right" style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }} />
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <svg
            width="72"
            height="72"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.8, color: '#94A3B8' }}
          >
            <path
              d="M22 10H38L46 18V50C46 52.2 44.2 54 42 54H22C19.8 54 18 52.2 18 50V14C18 11.8 19.8 10 22 10Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M38 10V18H46"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="24"
              y1="24"
              x2="36"
              y2="24"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="3 3"
            />
            <line
              x1="24"
              y1="31"
              x2="40"
              y2="31"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="24"
              y1="38"
              x2="40"
              y2="38"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="24"
              y1="45"
              x2="32"
              y2="45"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="3 3"
            />
            <circle
              cx="39"
              cy="45"
              r="4.5"
              stroke="currentColor"
              strokeWidth="2.5"
            />
          </svg>
          <span
            
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#64748B',
            }}
          >
            No activities yet
          </span>
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

      {activeTab === 'photos' && (
        <GroupGallery
          selectedId={selectedId}
          groups={groups}
          expenses={expenses}
          me={me}
          setView={setView}
          setEditingExpense={setEditingExpense}
          setShowExpModal={setShowExpModal}
          setEditingSettle={setEditingSettle}
          setShowSettleModal={setShowSettleModal}
          onPhotoViewerChange={onPhotoViewerChange}
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
            <h3  style={{
              fontSize: '20px',
              fontWeight: 600,
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
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '16px'
            }}>
              {selectedGroup.members?.filter((m) => m !== me).length} Friends in {selectedGroup.name}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
              {myTrans.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', marginTop: '4px', paddingLeft: '4px' }}>
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
                        style={{
                          padding: '16px',
                          background: '#FFFFFF',
                          border: '0.5px solid #EFE7DC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          borderRadius: '20px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                          boxSizing: 'border-box',
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
                              <h4  style={{ fontSize: '13px', fontWeight: 600, margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                {m}
                              </h4>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          <div>
                            <BalanceDisplay balances={displayBalances} align="right" style={{ fontSize: '14px', fontWeight: 600 }} />
                          </div>

                          <button
                            className="hover-up-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingExpense({
                                id: 'temp-' + Date.now(),
                                gId: String(selectedId),
                                title: '',
                                amt: 0,
                                date: new Date().toISOString().split('T')[0],
                                mode: 'Equally',
                                paid: me,
                                splitters: [me, m],
                                shares: { [me]: 50, [m]: 50 },
                                timestamp: Date.now()
                              });
                              setShowExpModal(true);
                            }}
                            title={`Add expense with ${m}`}
                            style={{
                              flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%',
                              background: '#059669', color: '#FFFFFF', border: 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                              marginRight: '4px', boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ width: '15px', height: '15px' }}>
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>

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
                              fontWeight: 600,
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
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', marginTop: '10px', paddingLeft: '4px' }}>
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
                          ✅
                        </div>
                        <div style={{ minWidth: 0, fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                          <span style={{ color: '#475569', fontWeight: 600 }}>{t.from}</span>
                          <span style={{ margin: '0 4px', fontWeight: 500, opacity: 0.7 }}>➔</span>
                          <span style={{ color: '#475569', fontWeight: 600 }}>{t.to}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <BalanceDisplay balances={t.balances} align="right" style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }} />
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
            <h3  style={{
              fontSize: '18px',
              fontWeight: 600,
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
                  fontWeight: 600,
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
                  fontWeight: 600,
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
