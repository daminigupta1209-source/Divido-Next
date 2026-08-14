import React from 'react';
import { createPortal } from 'react-dom';
import { Group, Expense } from '../lib/types';
import { formatDate } from '../lib/utils';
import { AppNotification } from '../lib/notifications';
import { CameraCaptureModal } from './CameraCaptureModal';

interface MobileHeaderProps {
  view: string;
  selectedId: string | number | null;
  selectedGroup: Group | undefined;
  me: string;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setIsSidebarOpen: (b: boolean) => void;
  onEditGroup?: (id: string | number) => void;
  setView: (v: string) => void;
  setSelectedId?: (id: any) => void;
  groupDetailTab?: 'expenses' | 'balances';
  setGroupDetailTab?: (tab: 'expenses' | 'balances') => void;
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
  onOpenConvert?: () => void;
  headerHidden?: boolean;
  expenses?: Expense[];
  setExpenses?: React.Dispatch<React.SetStateAction<Expense[]>>;
  setShowExpModal?: (b: boolean) => void;
  setEditingExpense?: (exp: Expense | null) => void;
  onRequestRejoin?: () => void;
  onCreateGroup?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  view,
  selectedId,
  selectedGroup,
  me,
  groups,
  setGroups,
  setIsSidebarOpen,
  onEditGroup,
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
  setSelectedId,
  groupDetailTab,
  setGroupDetailTab,
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
  onOpenConvert = () => {},
  headerHidden = false,
  expenses = [],
  setExpenses = () => {},
  setShowExpModal = () => {},
  setEditingExpense = () => {},
  onRequestRejoin,
  onCreateGroup,
}) => {
  // View-only guard: a member who has left this group can browse but not edit it.
  const amIPastMember = (() => {
    const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return !!selectedGroup?.members?.some((m: string) => {
      const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
    });
  })();
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = React.useState<string | null>(null);
  const [showDecisionModal, setShowDecisionModal] = React.useState(false);
  const [photoCaption, setPhotoCaption] = React.useState('');
  const [showAttachMenu, setShowAttachMenu] = React.useState(false);
  const [showCameraCapture, setShowCameraCapture] = React.useState(false);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (headerRenaming) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 50);
    }
  }, [headerRenaming]);

  const [showMobileBellMenu, setShowMobileBellMenu] = React.useState(false);

  React.useEffect(() => {
    const handleGlobalClick = () => {
      setShowMobileBellMenu(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const addAttachmentDataUrl = (dataUrl: string) => {
    setSelectedPhoto(dataUrl);
    setPhotoCaption('');
    setShowDecisionModal(true);
    setShowCameraCapture(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedPhoto(reader.result as string);
      setPhotoCaption('');
      setShowDecisionModal(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveToGalleryOnly = () => {
    if (!selectedPhoto || !selectedGroup) return;
    const newPhotoExpense: Expense = {
      id: 'photo-' + Date.now(),
      gId: selectedGroup.id,
      title: photoCaption.trim() || 'Gallery Photo',
      amt: 0,
      currency: selectedGroup.currency || '₹',
      paid: me,
      date: new Date().toISOString().split('T')[0],
      category: '🖼️',
      attachments: [selectedPhoto],
      tags: ['Gallery'],
      mode: 'Equally',
      shares: {}
    };
    setExpenses((prev) => [newPhotoExpense, ...prev]);
    setShowDecisionModal(false);
    setSelectedPhoto(null);
  };

  const handleCreateSplitExpense = () => {
    if (!selectedPhoto || !selectedGroup) return;
    const tempExpense: Expense = {
      id: 'temp-' + Date.now(),
      gId: selectedGroup.id,
      title: photoCaption.trim() || 'Split Expense',
      amt: 0,
      currency: selectedGroup.currency || '₹',
      paid: me,
      date: new Date().toISOString().split('T')[0],
      category: '🛒',
      attachments: [selectedPhoto],
      tags: [],
      mode: 'Equally',
      shares: {}
    };
    setEditingExpense(tempExpense);
    setShowExpModal(true);
    setShowDecisionModal(false);
    setSelectedPhoto(null);
  };
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

  // Absolute clock time (e.g. "2:30 PM") to show alongside the relative time.
  const clockTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Clean line-icon badge per notification type (replaces the emoji icons).
  const notifIcon = (type: string) => {
    const map: Record<string, { bg: string; color: string; path: React.ReactNode }> = {
      reminder: {
        bg: '#FEF3C7', color: '#D97706',
        path: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M5 3 2 6" /><path d="m22 6-3-3" /></>),
      },
      payment_request: {
        bg: '#D1FAE5', color: '#059669',
        path: (<><rect x="2" y="5" width="20" height="14" rx="3" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
      },
      group_add: {
        bg: '#E0E7FF', color: '#4F46E5',
        path: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
      },
      join: {
        bg: '#E0E7FF', color: '#4F46E5',
        path: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
      },
      link_request: {
        bg: '#DBEAFE', color: '#2563EB',
        path: (<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>),
      },
      rename_request: {
        bg: '#EDE9FE', color: '#7C3AED',
        path: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
      },
      admin_transfer: {
        bg: '#FEF3C7', color: '#D97706',
        path: (<><path d="M3 7l4 4 5-6 5 6 4-4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /></>),
      },
      removed: {
        bg: '#FEE2E2', color: '#DC2626',
        path: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M17 8l5 5M22 8l-5 5" /></>),
      },
    };
    const cfg = map[type] || { bg: '#F1F5F9', color: '#64748B', path: (<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>) };
    return (
      <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {cfg.path}
        </svg>
      </span>
    );
  };

  return (
    <div className={`mobile-header-bar ${isHomeStyle ? 'mobile-header-bar--home' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: 'auto', gap: '10px', padding: '16px 20px', marginBottom: '24px', transform: headerHidden ? 'translateY(-110%)' : 'translateY(0)', transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', height: '40px' }}>
        {view === 'detail' && selectedGroup ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: '10px' }}>
            <button
              onClick={() => {
                if (groupDetailTab === 'balances') {
                  if (setGroupDetailTab) setGroupDetailTab('expenses');
                } else {
                  if (setSelectedId) setSelectedId(null);
                  setView('summary');
                }
              }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '40px',
                marginLeft: '-6px',
                marginRight: '-4px',
                flexShrink: 0,
                zIndex: 2,
              }}
              title="Back to summary"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div
              onClick={() => {
                if (selectedId === 'STANDALONE') return;
                if (amIPastMember) { onRequestRejoin && onRequestRejoin(); return; }
                if (onEditGroup && selectedGroup) {
                  onEditGroup(selectedGroup.id);
                }
              }}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'var(--nav-bg)',
                color: 'var(--purple-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 900,
                overflow: 'hidden',
                flexShrink: 0,
                zIndex: 2,
                cursor: selectedId === 'STANDALONE' ? 'default' : 'pointer',
              }}
            >
              {selectedGroup.emoji && (selectedGroup.emoji.startsWith('data:image/') || selectedGroup.emoji.startsWith('http')) ? (
                <img src={selectedGroup.emoji} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              ) : (
                selectedGroup.name?.charAt(0).toUpperCase() || '👤'
              )}
            </div>

            <div style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              zIndex: 1,
              overflow: 'hidden',
              marginRight: '12px'
            }}>
              {headerRenaming ? (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'flex-start' }}>
                  <input
                    ref={renameInputRef}
                    type="search"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
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
                    placeholder="New Group Name..."
                    className="nunito"
                    style={{
                      fontSize: '20px',
                      fontWeight: 950,
                      letterSpacing: '-0.5px',
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      color: headerNameError ? '#EF4444' : 'var(--t)',
                      padding: 0,
                      margin: 0,
                      width: '100%',
                      textAlign: 'left'
                    }}
                  />
                  {headerNameError && (
                    <span style={{ fontSize: '9px', color: '#EF4444', fontWeight: 700 }}>
                      {headerNameError}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <h1
                    className="nunito"
                    style={{
                      fontSize: selectedId === 'STANDALONE' ? '18px' : '20px',
                      fontWeight: 950,
                      letterSpacing: '-0.5px',
                      cursor: selectedId === 'STANDALONE' ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      margin: 0,
                      color: 'var(--t)',
                      lineHeight: 1.1,
                      textAlign: 'left',
                      width: '100%',
                      overflow: 'hidden'
                    }}
                    onClick={() => {
                      if (selectedId === 'STANDALONE') return;
                      if (amIPastMember) { onRequestRejoin && onRequestRejoin(); return; }
                      if (onEditGroup && selectedGroup) {
                        onEditGroup(selectedGroup.id);
                      }
                    }}
                  >
                    <span style={{
                      position: 'relative',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      display: 'inline-block',
                    }}>
                      {selectedGroup?.name || 'Untitled Group'}
                    </span>
                  </h1>
                </>
              )}
            </div>
 
            {/* ⋮ Vertical three-dots button — positioned at the rightmost edge */}
            {selectedGroup && (
              <div style={{ zIndex: 9999, display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                {/* Share Group Link Button */}
                {!amIPastMember && (
                  <button
                    onClick={() => { onInviteFriend && onInviteFriend(); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: 0,
                      borderRadius: '8px',
                      transition: '0.15s all',
                      marginRight: '-4px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    title="Share Group Link"
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}>
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                )}


                <button
                  onClick={() => setShowAttachMenu(true)}
                  style={{
                    display: 'none',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    width: '36px',
                    height: '36px',
                    flexShrink: 0,
                    padding: 0,
                    borderRadius: '8px',
                    transition: '0.15s all',
                    marginRight: '-2px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  title="Add attachment"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowMobileBellMenu(!showMobileBellMenu); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    padding: 0,
                    borderRadius: '8px',
                    transition: '0.15s all',
                    position: 'relative',
                    marginRight: '0px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  title="Group notifications"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {(() => {
                    const systemLogs = expenses.filter(e => String(e.gId) === String(selectedId) && e.paid === 'SYSTEM');
                    if (systemLogs.length > 0) {
                      return (
                        <span
                          style={{
                            position: 'absolute',
                            top: '1px',
                            right: '1px',
                            minWidth: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            background: '#FF4B4B',
                            color: '#FFFFFF',
                            fontSize: '8px',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 2px',
                            border: '1px solid #FDFBF7',
                            boxSizing: 'border-box',
                            lineHeight: 1,
                          }}
                        >
                          {systemLogs.length}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </button>

                {/* Mobile Group Notifications Dropdown */}
                {showMobileBellMenu && (() => {
                  const systemLogs = expenses.filter(e => String(e.gId) === String(selectedId) && e.paid === 'SYSTEM');
                  const getSystemTitle = (title: string) => {
                    const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                    const leftMatch = `${cleanMe} left`;
                    const removedMatch = `${cleanMe} was removed`;
                    const rejoinedMatch = `${cleanMe} rejoined`;
                    const lowerTitle = title.toLowerCase();

                    if (lowerTitle.startsWith(leftMatch)) return '🚪 You left';
                    if (lowerTitle.startsWith(removedMatch)) return '🚫 You were removed';
                    if (lowerTitle.startsWith(rejoinedMatch)) return '🎉 You rejoined';

                    if (lowerTitle.endsWith(' left')) return `🚪 ${title}`;
                    if (lowerTitle.endsWith(' was removed')) return `🚫 ${title}`;
                    if (lowerTitle.endsWith(' rejoined')) return `🎉 ${title}`;
                    return title;
                  };
                  const formatDateMobile = (dStr: string) => {
                    const parts = dStr.split('-');
                    if (parts.length === 3) {
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const day = parseInt(parts[2], 10);
                      const month = months[parseInt(parts[1], 10) - 1];
                      const year = parts[0];
                      return `${day} ${month} ${year}`;
                    }
                    return dStr;
                  };

                  return createPortal(
                    <div
                      onClick={() => setShowMobileBellMenu(false)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: '#FFFFFF',
                        zIndex: 100000,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'fadeSlideIn 0.2s ease-out',
                      }}
                    >
                      {/* Screen header */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '18px 18px 14px',
                          borderBottom: '1px solid #F1F5F9',
                          flexShrink: 0,
                        }}
                      >
                        <button
                          onClick={() => setShowMobileBellMenu(false)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            color: '#475569',
                          }}
                          aria-label="Back"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                        </button>
                        <h2 className="nunito" style={{ margin: 0, fontSize: '19px', fontWeight: 950, letterSpacing: '-0.3px', color: '#1E293B' }}>
                          Updates Log 🔔
                        </h2>
                      </div>

                      {/* Screen body */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', boxSizing: 'border-box' }}
                      >
                        {systemLogs.length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '80px 20px', color: '#94A3B8' }}>
                            <span style={{ fontSize: '38px' }}>🔔</span>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>No recent updates</p>
                            <p style={{ margin: 0, fontSize: '12px', textAlign: 'center' }}>Membership changes for this group will show up here.</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {systemLogs.slice().reverse().map((log, idx) => (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 14px', borderRadius: '14px', background: '#F8FAFC', border: '1px solid #F1F5F9', textAlign: 'left' }}>
                                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 800 }}>
                                  {getSystemTitle(log.title)}
                                </div>
                                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                                  {formatDateMobile(log.date)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>,
                    document.body
                  );
                })()}

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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
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
                    {(() => {
                      const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                      const isActiveMember = selectedGroup?.members?.some(m => {
                        const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                        return cleanM === cleanMe && !m.toLowerCase().endsWith(' (left)');
                      });
                      const isPastMember = selectedGroup?.members?.some(m => {
                        const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
                        return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
                      });
                      const activeMembersCount = (selectedGroup?.members || []).filter(m => !m.toLowerCase().endsWith(' (left)')).length;

                      const actionItems = [
                        ...(isPastMember ? [] : [{ emoji: '💱', label: 'Convert Currency', onClick: () => { setMobileShowGroupOptionsMenu(false); setShowConvertModalId(selectedId); } }]),
                        { emoji: '➕', label: 'Create New Group', onClick: () => { setMobileShowGroupOptionsMenu(false); onCreateGroup && onCreateGroup(); } },
                        { emoji: '📤', label: 'Export Data', onClick: () => { setMobileShowGroupOptionsMenu(false); handleMobileExportCSV(); } },
                        { emoji: '📊', label: 'Analytics', onClick: () => { setMobileShowGroupOptionsMenu(false); setAnalyticsGroupId(selectedId); setView('analytics'); } },
                        ...(isActiveMember && selectedId !== 'STANDALONE' ? [{ 
                          emoji: activeMembersCount > 1 ? '🚪' : '🗑️', 
                          label: activeMembersCount > 1 ? 'Leave Group' : 'Delete Group', 
                          onClick: () => { setMobileShowGroupOptionsMenu(false); handleDeleteGroup(selectedId || ''); }, 
                          danger: true 
                        }] : []),
                        ...(isPastMember && selectedId !== 'STANDALONE' ? [{ 
                           emoji: '🗑️', 
                           label: 'Delete Group for Me', 
                           onClick: () => { setMobileShowGroupOptionsMenu(false); handleDeleteGroup(selectedId || ''); }, 
                           danger: true 
                         }] : []),
                      ];

                      return actionItems.map((item) => (
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
                    ))})()}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', height: '100%' }}>
            {(view === 'profile' || view === 'gallery' || view === 'detail' || view === 'analytics') ? (
              <span
                onClick={() => {
                  if (view === 'gallery' || view === 'analytics') {
                    setView('detail');
                  } else if (view === 'detail' && groupDetailTab === 'balances') {
                    if (setGroupDetailTab) setGroupDetailTab('expenses');
                  } else {
                    if (setSelectedId) setSelectedId(null);
                    setView('summary');
                  }
                }}
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
              <h1
                className={`nunito ${isHomeStyle && view !== 'gallery' ? 'home-header-title' : ''}`}
                style={{
                  fontSize: '22px', fontWeight: 950, letterSpacing: '-0.5px', color: 'var(--t)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px',
                  ...(view === 'gallery' ? { position: 'absolute', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' } : {}),
                }}
              >
                <span>
                  {view === 'summary' && `Hi ${me}!`}
                  {view === 'groups' && 'Your Groups'}
                  {view === 'friends' && 'Settle All'}
                  {view === 'activity' && 'All Activities'}
                  {view === 'analytics' && 'Analytics'}
                  {view === 'profile' && 'Profile'}
                  {view === 'gallery' && 'Gallery'}
                </span>
                {view !== 'gallery' && (
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
                )}
              </h1>
            )}

            {isHomeStyle && (
              <div className="home-header-actions" aria-label="Home actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flex: 1, marginLeft: isHeaderSearchActive ? '40px' : '0px', minWidth: 0 }}>
                {isHeaderSearchActive && view === 'summary' && (
                  <input
                    type="search"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder="Search groups..."
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
                {view === 'summary' && (
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
                {view === 'friends' && (
                  <button
                    type="button"
                    className="home-header-icon"
                    aria-label="Convert currency"
                    title="Convert currency"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={(e) => { e.stopPropagation(); onOpenConvert(); }}
                  >
                    <span style={{ fontSize: '17px', lineHeight: 1 }}>💱</span>
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

      {selectedGroup && (
        <input
          ref={uploadInputRef}
          id="mobile-gallery-upload-input"
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      {/* Notifications full screen */}
      {showNotifPanel && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#FFFFFF',
            zIndex: 100000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeSlideIn 0.2s ease-out',
          }}
        >
          {/* Screen header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 18px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
            <button
              onClick={() => setShowNotifPanel(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#475569' }}
              aria-label="Back"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="nunito" style={{ margin: 0, fontSize: '19px', fontWeight: 950, letterSpacing: '-0.3px', color: '#1E293B', flex: 1 }}>
              Notifications
            </h2>
            {notifications.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Clear all notifications?')) {
                    onClearNotifications();
                  }
                }}
                title="Clear all notifications"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94A3B8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            )}
          </div>

          {/* Screen body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '90px 24px', textAlign: 'center', color: '#9C948B' }}>
                <div style={{ fontSize: '40px', marginBottom: '4px' }}>🔔</div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#475569' }}>You're all caught up</p>
                <p style={{ margin: 0, fontSize: '12px' }}>Invites, reminders and payment requests will show up here.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => n.type !== 'rename_request' && onNotificationClick(n)}
                  style={{
                    display: 'flex', gap: '12px', padding: '16px 18px', cursor: n.type === 'rename_request' ? 'default' : 'pointer',
                    borderBottom: '0.5px solid #F6F1EA', background: n.isRead ? '#FFFFFF' : '#FBF6EF',
                  }}
                >
                  {notifIcon(n.type)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#2E2A25' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: '13px', color: '#6B6259', marginTop: '2px', lineHeight: 1.4 }}>{n.body}</div>}
                    <div style={{ fontSize: '11px', color: '#B0A79C', marginTop: '4px' }}>{relTime(n.createdAt)} · {clockTime(n.createdAt)}</div>
                    {n.type === 'rename_request' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onAcceptRename(n); }}
                          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '10px', border: 'none', background: '#059669', color: '#fff', cursor: 'pointer' }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onRejectRename(n); }}
                          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '10px', border: '1.5px solid #FECACA', background: '#FFFFFF', color: '#EF4444', cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {!n.isRead && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669', flexShrink: 0, marginTop: '6px' }} />}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}


      {view === 'gallery' && selectedGroup && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-12px' }}>
          <span
            className="nunito"
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: '#64748B',
              letterSpacing: '0.3px',
              textTransform: 'capitalize',
            }}
          >
            {selectedGroup.name}
          </span>
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

      {showDecisionModal && selectedPhoto && createPortal(
        <div
          onClick={() => { setShowDecisionModal(false); setSelectedPhoto(null); }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '380px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E293B', fontFamily: 'Nunito', letterSpacing: '-0.3px' }}>
                Process Attachment
              </h3>
              <button
                onClick={() => { setShowDecisionModal(false); setSelectedPhoto(null); }}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#94A3B8',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Image Preview */}
            <div
              style={{
                width: '100%',
                maxHeight: '180px',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #F1F5F9',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
              }}
            >
              <img
                src={selectedPhoto}
                alt="Selected preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '180px',
                  objectFit: 'contain',
                }}
              />
            </div>

            {/* Optional Caption/Title input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 900, color: '#94A3B8', fontFamily: 'Nunito' }}>
                Caption (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Dinner receipt, Event photo..."
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #E2E8F0',
                  fontSize: '13px',
                  fontWeight: 700,
                  outline: 'none',
                  fontFamily: 'Nunito',
                  color: '#334155',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#10B981'}
                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={handleCreateSplitExpense}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                  transition: 'all 0.2s',
                }}
                className="hover-up-mini"
              >
                Split Expense
              </button>

              <button
                onClick={handleSaveToGalleryOnly}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  background: '#FFFFFF',
                  color: '#475569',
                  border: '1.5px solid #E2E8F0',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
                className="hover-up-mini"
              >
                Save to Gallery
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAttachMenu && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setShowAttachMenu(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
          }}
        >
          <div
            className="card shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '280px',
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '20px 16px',
              position: 'relative',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div
              onClick={() => setShowAttachMenu(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                color: '#94A3B8',
                opacity: 0.7,
                transition: '0.2s all',
              }}
            >
              ✕
            </div>
            <p style={{ fontSize: '11px', fontWeight: 900, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', margin: '4px 0 14px' }}>
              Add Attachment
            </p>
            
            <div
              onClick={() => {
                setShowAttachMenu(false);
                setShowCameraCapture(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              className="hover-bg"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#334155' }}>Camera</span>
            </div>

            <div
              onClick={() => {
                setShowAttachMenu(false);
                uploadInputRef.current?.click();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              className="hover-bg"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#334155' }}>Upload photo or file</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCameraCapture && createPortal(
        <CameraCaptureModal
          show={showCameraCapture}
          onClose={() => setShowCameraCapture(false)}
          onCapture={addAttachmentDataUrl}
        />,
        document.body
      )}
    </div>
  );
};
