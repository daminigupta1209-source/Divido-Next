import React from 'react';
import { Group } from '../lib/types';
import { formatDate } from '../lib/utils';
import { AppNotification } from '../lib/notifications';

interface MobileHeaderProps {
  view: string;
  selectedId: string | number | null;
  selectedGroup: Group | undefined;
  me: string;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setIsSidebarOpen: (b: boolean) => void;
  setView: (v: string) => void;
  headerRenaming: boolean;
  setHeaderRenaming: (b: boolean) => void;
  headerNewName: string;
  setHeaderNewName: (s: string) => void;
  headerNameError: string;
  setHeaderNameError: (s: string) => void;
  handleHeaderRename: () => void;
  onInviteFriend?: () => void;
  showInfo: boolean;
  setShowInfo: (b: boolean) => void;
  mobileShowGroupOptionsMenu: boolean;
  setMobileShowGroupOptionsMenu: (b: boolean) => void;
  setShowConvertModalId: (id: string | number | null) => void;
  handleMobileExportCSV: () => void;
  setAnalyticsGroupId: (id: string | number | null) => void;
  handleDeleteGroup: (id: string | number) => void;
  pageDescriptions: Record<string, string>;
  notifications?: AppNotification[];
  unreadNotifCount?: number;
  showNotifPanel?: boolean;
  setShowNotifPanel?: (b: boolean) => void;
  onOpenNotifications?: () => void;
  onClearNotifications?: () => void;
  onNotificationClick?: (n: AppNotification) => void;
  onHeaderSearch?: () => void;
  onAcceptRename?: (n: AppNotification) => void;
  onRejectRename?: (n: AppNotification) => void;
  searchQuery?: string;
  setSearchQuery?: (val: string) => void;
  isHeaderSearchActive?: boolean;
  setIsHeaderSearchActive?: (val: boolean) => void;
  headerHidden?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  view,
  selectedId,
  selectedGroup,
  me,
  groups,
  setGroups,
  setIsSidebarOpen,
  setView,
  headerRenaming,
  setHeaderRenaming,
  headerNewName,
  setHeaderNewName,
  headerNameError,
  setHeaderNameError,
  handleHeaderRename,
  onInviteFriend,
  showInfo,
  setShowInfo,
  mobileShowGroupOptionsMenu,
  setMobileShowGroupOptionsMenu,
  setShowConvertModalId,
  handleMobileExportCSV,
  setAnalyticsGroupId,
  handleDeleteGroup,
  pageDescriptions,
  notifications = [],
  unreadNotifCount = 0,
  showNotifPanel = false,
  setShowNotifPanel = () => {},
  onOpenNotifications = () => {},
  onClearNotifications = () => {},
  onNotificationClick = () => {},
  onHeaderSearch = () => {},
  onAcceptRename = () => {},
  onRejectRename = () => {},
  searchQuery = '',
  setSearchQuery = () => {},
  isHeaderSearchActive = false,
  setIsHeaderSearchActive = () => {},
  headerHidden = false,
}) => {
  const [editingDate, setEditingDate] = React.useState(false);
  const isHomeStyle = true;

  const relTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day === 1) return 'yesterday';
    if (day < 7) return `${day}d ago`;
    return `${Math.floor(day / 7)}w ago`;
  };

  const notifIcon = (type: string) => {
    if (type === 'reminder') return '⏰';
    if (type === 'payment_request') return '💸';
    if (type === 'group_add' || type === 'join') return '👥';
    if (type === 'link_request') return '🔗';
    if (type === 'rename_request') return '✏️';
    if (type === 'admin_transfer') return '👑';
    return '🔔';
  };

  return (
    <div className={`mobile-header-bar ${isHomeStyle ? 'mobile-header-bar--home' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: 'auto', gap: '10px', padding: '16px 20px', marginBottom: '24px', transform: headerHidden ? 'translateY(-110%)' : 'translateY(0)', transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', height: '40px' }}>
        {view === 'detail' && selectedGroup ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', height: '100%' }}>
            <button
              className="menu-burger-btn"
              onClick={() => setIsSidebarOpen(true)}
              style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', margin: 0, zIndex: 2 }}
            >
              <span className="burger-line"></span>
              <span className="burger-line"></span>
              <span className="burger-line"></span>
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', overflow: 'hidden', maxWidth: '70%', zIndex: 1 }}>
              {headerRenaming ? (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={headerNewName}
                    onChange={(e) => {
                      setHeaderNewName(e.target.value);
                      setHeaderNameError('');
                    }}
                    onBlur={handleHeaderRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleHeaderRename();
                      if (e.key === 'Escape') {
                        setHeaderRenaming(false);
                        setHeaderNewName(selectedGroup?.name || '');
                      }
                    }}
                    className="nunito"
                    style={{
                      fontSize: '22px',
                      fontWeight: 950,
                      letterSpacing: '-0.5px',
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      color: headerNameError ? '#EF4444' : 'var(--t)',
                      padding: 0,
                      margin: 0,
                      width: '100%',
                      textAlign: 'center'
                    }}
                  />
                  {headerNameError && (
                    <span style={{ fontSize: '9px', color: '#EF4444', fontWeight: 700 }}>
                      {headerNameError}
                    </span>
                  )}
                </div>
              ) : (
                <h1
                  className="nunito"
                  style={{
                    fontSize: selectedId === 'STANDALONE' ? '18px' : '22px',
                    fontWeight: 950,
                    letterSpacing: '-0.5px',
                    cursor: selectedId === 'STANDALONE' ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    margin: 0,
                    color: 'var(--t)',
                  }}
                  onClick={() => {
                    if (selectedId === 'STANDALONE') return;
                    setHeaderNewName(selectedGroup?.name || '');
                    setHeaderRenaming(true);
                  }}
                >
                  <span style={{
                    position: 'relative',
                    whiteSpace: 'nowrap',
                    overflow: 'visible',
                    textOverflow: 'ellipsis',
                    maxWidth: selectedId === 'STANDALONE' ? '220px' : '180px'
                  }}>
                    {selectedGroup?.name || 'Untitled Group'}
                    {selectedId !== 'STANDALONE' && (
                      <span
                        className="edit-pencil"
                        style={{
                          position: 'absolute',
                          right: '-22px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '13px',
                          opacity: 0.5,
                          lineHeight: 1,
                        }}
                      >
                        ✏️
                      </span>
                    )}
                  </span>
                </h1>
              )}
            </div>

            {/* ⋮ Vertical three-dots button — positioned absolutely at the rightmost edge */}
            {selectedGroup && (
              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 9999, display: 'inline-flex', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileShowGroupOptionsMenu(!mobileShowGroupOptionsMenu);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#475569',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    padding: 0,
                    borderRadius: '8px',
                    transition: '0.15s all',
                  }}
                  title="Group options"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
                    <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                {mobileShowGroupOptionsMenu && (
                  <div
                    className="card"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: '-8px',
                      top: 'calc(100% + 6px)',
                      padding: '6px',
                      borderRadius: '16px',
                      background: '#FFFFFF',
                      border: '1.5px solid rgba(226, 232, 240, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: '180px',
                      boxShadow: '0 10px 30px -5px rgba(0,0,0,0.08), 0 4px 12px -2px rgba(0,0,0,0.03)',
                      zIndex: 9999,
                      animation: 'slideUp 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 8px', borderBottom: '1px solid rgba(241, 245, 249, 0.7)', marginBottom: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 900, color: '#111827', whiteSpace: 'nowrap' }}>Simplify Debts</span>
                        <span
                          style={{ fontSize: '11px', color: '#94A3B8', cursor: 'pointer', userSelect: 'none', padding: '0 2px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            alert("Simplify Debts automatically reduces the total number of transactions needed to settle up. Net balances remain unchanged.");
                          }}
                          title="What is this?"
                        >ⓘ</span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroups(groups.map((g) => String(g.id) === String(selectedId) ? { ...g, simplifyDebts: !g.simplifyDebts } : g));
                        }}
                        style={{
                          width: '32px',
                          height: '18px',
                          borderRadius: '20px',
                          background: selectedGroup?.simplifyDebts ? '#10B981' : '#CBD5E1',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            position: 'absolute',
                            top: '2px',
                            left: selectedGroup?.simplifyDebts ? '16px' : '2px',
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {[
                      ...(selectedId !== 'STANDALONE' ? [{ emoji: '🔗', label: 'Invite Friend', onClick: () => { setMobileShowGroupOptionsMenu(false); onInviteFriend && onInviteFriend(); } }] : []),
                      { emoji: '💱', label: 'Convert Currency', onClick: () => { setMobileShowGroupOptionsMenu(false); setShowConvertModalId(selectedId); } },
                      { emoji: '📤', label: 'Export Data', onClick: () => { setMobileShowGroupOptionsMenu(false); handleMobileExportCSV(); } },
                      { emoji: '📊', label: 'Analytics', onClick: () => { setMobileShowGroupOptionsMenu(false); setAnalyticsGroupId(selectedId); setView('analytics'); } },
                      ...(selectedId !== 'STANDALONE' ? [{ emoji: (selectedGroup?.members?.length ?? 0) > 1 ? '🚪' : '🗑️', label: (selectedGroup?.members?.length ?? 0) > 1 ? 'Leave Group' : 'Delete Group', onClick: () => { setMobileShowGroupOptionsMenu(false); handleDeleteGroup(selectedId || ''); }, danger: true }] : []),
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          border: 'none',
                          background: 'none',
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 800,
                          color: item.danger ? '#DC2626' : '#374151',
                          transition: '0.15s all',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = item.danger ? '#FEF2F2' : 'rgba(249, 250, 251, 0.6)';
                          e.currentTarget.style.color = item.danger ? '#B91C1C' : '#111827';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = item.danger ? '#DC2626' : '#374151';
                        }}
                      >
                        <span style={{ fontSize: '13px' }}>{item.emoji}</span> {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', height: '100%' }}>
            {view === 'profile' ? (
              <span
                onClick={() => setView('summary')}
                style={{
                  position: 'absolute',
                  left: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  opacity: 0.5,
                  padding: '8px',
                  lineHeight: 1,
                  color: 'var(--t)',
                  fontWeight: 900,
                  userSelect: 'none',
                }}
              >
                ←
              </span>
            ) : (
              <button
                className="menu-burger-btn"
                onClick={() => setIsSidebarOpen(true)}
                style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', margin: 0 }}
              >
                <span className="burger-line"></span>
                <span className="burger-line"></span>
                <span className="burger-line"></span>
              </button>
            )}
            
            {!(isHomeStyle && isHeaderSearchActive) && (
              <h1 className={`nunito ${isHomeStyle ? 'home-header-title' : ''}`} style={{ fontSize: '22px', fontWeight: 950, letterSpacing: '-0.5px', color: 'var(--t)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>
                  {view === 'summary' && `Hi ${me}!`}
                  {view === 'groups' && 'Your Groups'}
                  {view === 'friends' && 'Settle All'}
                  {view === 'activity' && 'All Activities'}
                  {view === 'analytics' && 'Analytics'}
                  {view === 'profile' && 'Profile'}
                </span>
                <span
                  className="home-page-info"
                  style={{ fontSize: '16px', color: 'var(--g)', cursor: 'pointer', opacity: 0.6, userSelect: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInfo(!showInfo);
                  }}
                  title="What is this page?"
                >
                  ⓘ
                </span>
              </h1>
            )}

            {isHomeStyle && (
              <div className="home-header-actions" aria-label="Home actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flex: 1, marginLeft: isHeaderSearchActive ? '40px' : '0px', minWidth: 0 }}>
                {isHeaderSearchActive && (view === 'summary' || view === 'friends') && (
                  <input
                    type="text"
                    placeholder={view === 'friends' ? 'Search friends...' : 'Search groups...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Keep input, do not dismiss on enter
                      }
                      if (e.key === 'Escape') {
                        setIsHeaderSearchActive(false);
                        setSearchQuery('');
                      }
                    }}
                    className="header-search-input"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1.5px solid #C9BCAB',
                      borderRadius: '0px',
                      outline: 'none',
                      boxShadow: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      height: '30px',
                      lineHeight: '30px',
                      boxSizing: 'border-box',
                      padding: '0',
                      margin: '0',
                      color: 'var(--t)',
                      width: '100%',
                      maxWidth: '200px',
                      marginRight: '12px',
                      fontFamily: 'inherit',
                    }}
                    autoFocus
                  />
                )}
                {(view === 'summary' || view === 'friends') && (
                  <button
                    type="button"
                    className="home-header-icon"
                    aria-label="Search"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isHeaderSearchActive) {
                        setIsHeaderSearchActive(false);
                        setSearchQuery('');
                      } else {
                        setIsHeaderSearchActive(true);
                      }
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                      <circle cx="10.8" cy="10.8" r="6.6" />
                      <path d="m16 16 4.2 4.2" />
                    </svg>
                  </button>
                )}
                <button type="button" className="home-header-icon" aria-label="Notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); onOpenNotifications(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                  </svg>
                  {unreadNotifCount > 0 && (
                    <span style={{ position: 'absolute', top: '-2px', right: '-2px', minWidth: '16px', height: '16px', padding: '0 4px', borderRadius: '8px', background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, boxSizing: 'border-box' }}>
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Notifications panel */}
      {showNotifPanel && (
        <>
          <div onClick={() => setShowNotifPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: '58px', right: '12px', width: 'min(340px, calc(100vw - 24px))',
              background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '16px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 3001, overflow: 'hidden',
              animation: 'fadeSlideIn 0.18s ease-out', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid #F1F5F9' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#2E2A25' }}>Notifications</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {notifications.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Clear all notifications?')) {
                        onClearNotifications();
                      }
                    }}
                    title="Clear all notifications"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#94A3B8',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                )}
                <span onClick={() => setShowNotifPanel(false)} style={{ fontSize: '18px', color: '#94A3B8', cursor: 'pointer', lineHeight: 1 }}>✕</span>
              </div>
            </div>
            <div style={{ overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9C948B' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>You're all caught up</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px' }}>Invites, reminders and payment requests will show up here.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => n.type !== 'rename_request' && onNotificationClick(n)}
                    style={{
                      display: 'flex', gap: '10px', padding: '12px 16px', cursor: n.type === 'rename_request' ? 'default' : 'pointer',
                      borderBottom: '0.5px solid #F6F1EA', background: n.isRead ? '#FFFFFF' : '#FBF6EF',
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1.2 }}>{notifIcon(n.type)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2E2A25' }}>{n.title}</div>
                      {n.body && <div style={{ fontSize: '12px', color: '#6B6259', marginTop: '2px', lineHeight: 1.4 }}>{n.body}</div>}
                      <div style={{ fontSize: '11px', color: '#B0A79C', marginTop: '3px' }}>{relTime(n.createdAt)}</div>
                      {n.type === 'rename_request' && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAcceptRename(n); }}
                            style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '10px', border: 'none', background: '#059669', color: '#fff', cursor: 'pointer' }}
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onRejectRename(n); }}
                            style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '10px', border: '1.5px solid #FECACA', background: '#FFFFFF', color: '#EF4444', cursor: 'pointer' }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                    {!n.isRead && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', flexShrink: 0, marginTop: '5px' }} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Formed-on date, small and editable */}
      {view === 'detail' && selectedGroup && selectedId !== 'STANDALONE' && !headerRenaming && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-12px' }}>
          {editingDate ? (
            <input
              type="date"
              autoFocus
              value={selectedGroup.createdDate || ''}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setGroups(groups.map((g) => (String(g.id) === String(selectedId) ? { ...g, createdDate: v } : g)));
              }}
              onBlur={() => setEditingDate(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingDate(false);
                }
              }}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748B',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                padding: '2px 8px',
                outline: 'none',
                background: 'var(--w)',
              }}
            />
          ) : (
            <span
              onClick={() => setEditingDate(true)}
              title="Tap to edit"
              style={{
                fontSize: '11px',
                fontWeight: 650,
                color: '#94A3B8',
                cursor: 'pointer',
                userSelect: 'none',
                letterSpacing: '0.2px',
              }}
            >
              Since · {selectedGroup.createdDate ? (() => {
                const d = new Date(selectedGroup.createdDate);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[d.getMonth()]} ${d.getFullYear()}`;
              })() : '—'}
            </span>
          )}
        </div>
      )}
      {showInfo && (
        <div style={{
          fontSize: '11px',
          color: 'var(--purple-text)',
          background: 'var(--nav-bg)',
          padding: '8px 12px',
          borderRadius: '10px',
          border: '1px solid var(--nav-hover)',
          fontWeight: 800,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxSizing: 'border-box',
          animation: 'fadeSlideIn 0.2s ease-out',
        }}>
          <span>ℹ️</span>
          <span style={{ lineHeight: 1.3 }}>{pageDescriptions[view === 'detail' ? 'detail' : view] || ''}</span>
        </div>
      )}
    </div>
  );
};
