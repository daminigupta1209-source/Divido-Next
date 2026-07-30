import React from 'react';
import { createPortal } from 'react-dom';
import { Group, Expense } from '../../lib/types';
import { getEmoji, formatDate } from '../../lib/utils';
import { CameraCaptureModal } from '../CameraCaptureModal';

interface GroupHeaderProps {
  selectedGroup: Group;
  selectedId: string | number | null;
  setView: (v: string) => void;
  isRenaming: boolean;
  setIsRenaming: (b: boolean) => void;
  newName: string;
  setNewName: (s: string) => void;
  nameError: string;
  setNameError: (s: string) => void;
  handleRename: () => void;
  handleCancel: () => void;
  showInfo: boolean;
  setShowInfo: (b: boolean) => void;
  setIsSidebarOpen: (open: boolean) => void;
  onShareShortcut?: () => void;
  showGroupOptionsMenu: boolean;
  setShowGroupOptionsMenu: (b: boolean) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  groups: Group[];
  setShowConvertModalId: (id: string | number | null) => void;
  setShowExportMenu: (b: boolean) => void;
  onOpenAnalytics?: (groupId: string | number) => void;
  setShowGroupSettleList: (b: boolean) => void;
  onDeleteGroup?: (id: string | number) => void;
  me: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setShowExpModal: (b: boolean) => void;
  setEditingExpense: (exp: Expense | null) => void;
}

export const GroupHeader: React.FC<GroupHeaderProps> = ({
  selectedGroup,
  selectedId,
  setView,
  isRenaming,
  setIsRenaming,
  newName,
  setNewName,
  nameError,
  setNameError,
  handleRename,
  handleCancel,
  showInfo,
  setShowInfo,
  setIsSidebarOpen,
  onShareShortcut,
  showGroupOptionsMenu,
  setShowGroupOptionsMenu,
  setGroups,
  groups,
  setShowConvertModalId,
  setShowExportMenu,
  onOpenAnalytics,
  setShowGroupSettleList,
  onDeleteGroup,
  me,
  expenses,
  setExpenses,
  setShowExpModal,
  setEditingExpense,
}) => {
  const [editingDate, setEditingDate] = React.useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = React.useState<string | null>(null);
  const [showDecisionModal, setShowDecisionModal] = React.useState(false);
  const [photoCaption, setPhotoCaption] = React.useState('');
  const [showAttachMenu, setShowAttachMenu] = React.useState(false);
  const [showCameraCapture, setShowCameraCapture] = React.useState(false);
  const [showBellMenu, setShowBellMenu] = React.useState(false);

  React.useEffect(() => {
    const handleGlobalClick = () => {
      setShowBellMenu(false);
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
    if (!selectedPhoto) return;
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
    if (!selectedPhoto) return;
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

  return (
    <>
      {isRenaming && selectedGroup.name === '' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
            width: '100%',
          }}
        >
          {/* Back arrow */}
          <span
            onClick={() => {
              setGroups(groups.filter((g) => g.id !== selectedId));
              setView('summary');
            }}
            style={{ fontSize: '22px', cursor: 'pointer', opacity: 0.7, lineHeight: 1, flexShrink: 0 }}
          >←</span>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              placeholder="Enter group name"
              style={{
                width: '100%',
                fontSize: '18px',
                fontWeight: 800,
                fontFamily: 'Nunito',
                background: 'var(--bg)',
                outline: 'none',
                color: 'var(--t)',
                padding: '12px 48px 12px 14px',
                borderRadius: '12px',
                border: '2.5px solid ' + (nameError ? '#EF4444' : '#E2E8F0'),
                transition: '0.3s all',
                boxSizing: 'border-box',
              }}
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); handleRename(); }}
              style={{
                position: 'absolute',
                right: '12px',
                background: 'none',
                border: 'none',
                fontSize: '22px',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              <span style={{ color: '#7C3AED', fontSize: '22px' }}>✔️</span>
            </button>
            {nameError && (
              <p style={{ position: 'absolute', bottom: '-20px', left: 0, fontSize: '12px', fontWeight: 900, color: '#EF4444', margin: 0 }}>
                {nameError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="group-detail-header-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative', minHeight: '44px' }}>



            {/* CENTER: Group title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: 'calc(100% - 72px)' }}>
              {isRenaming ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                  <label style={{ fontSize: '8px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '-4px' }}>Group Name</label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); handleCancel(); }
                    }}
                    style={{ fontSize: '22px', fontWeight: 950, fontFamily: 'Nunito', border: 'none', background: 'transparent', outline: 'none', color: nameError ? '#EF4444' : 'var(--t)', padding: 0, margin: 0, textAlign: 'center' }}
                  />
                  {nameError && <p style={{ fontSize: '10px', fontWeight: 900, color: '#EF4444' }}>{nameError}</p>}
                </div>
              ) : (
                <h1
                  className="nunito group-header-h1"
                  style={{
                    fontSize: '24px',
                    fontWeight: 950,
                    color: 'var(--t)',
                    letterSpacing: '-0.5px',
                    margin: 0,
                    cursor: selectedId === 'STANDALONE' ? 'default' : 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 1,
                  }}
                  onClick={() => { if (selectedId === 'STANDALONE') return; setNewName(selectedGroup.name || ''); setIsRenaming(true); }}
                >
                  {selectedGroup.name || 'Untitled Group 🏘️'}
                  {selectedId !== 'STANDALONE' && (
                    <span className="edit-pencil" style={{ fontSize: '14px', opacity: 0.45, flexShrink: 0 }}>✏️</span>
                  )}
                </h1>
              )}
            </div>

            {/* RIGHT: Horizontal ellipsis options button */}
            {selectedId !== 'STANDALONE' && (
              <div style={{ position: 'absolute', right: '-12px', display: 'inline-flex', alignItems: 'center' }}>
                {/* Attachment Paperclip Button */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => setShowAttachMenu(true)}
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
                    marginRight: '-6px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  title="Add attachment"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowBellMenu(!showBellMenu); }}
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
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  title="Group notifications"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}>
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
                            top: '4px',
                            right: '4px',
                            minWidth: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: '#FF4B4B',
                            color: '#FFFFFF',
                            fontSize: '9px',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 3px',
                            border: '1.5px solid #FFFFFF',
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

                {/* Group Notifications Dropdown */}
                {showBellMenu && (() => {
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

                  return (
                    <div
                      className="card shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        right: '40px',
                        top: 'calc(100% + 8px)',
                        padding: '12px',
                        borderRadius: '16px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                        zIndex: 200,
                        width: '240px',
                        maxHeight: '260px',
                        overflowY: 'auto',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px', textAlign: 'left' }}>
                        Updates Log 🔔
                      </div>
                      {systemLogs.length === 0 ? (
                        <div style={{ padding: '16px 8px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>
                          No recent updates
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {systemLogs.slice().reverse().map((log, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 8px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #F1F5F9', textAlign: 'left' }}>
                              <div style={{ fontSize: '11.5px', color: '#334155', fontWeight: 700 }}>
                                {getSystemTitle(log.title)}
                              </div>
                              <div style={{ fontSize: '9px', color: '#94A3B8', textAlign: 'right' }}>
                                {formatDate(log.date)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <button
                  onClick={(e) => { e.stopPropagation(); setShowGroupOptionsMenu(!showGroupOptionsMenu); }}
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  title="Group options"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
                    <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                </button>

                {showGroupOptionsMenu && (
                  <div
                    className="card"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: '0px',
                      top: 'calc(100% + 8px)',
                      padding: '8px',
                      borderRadius: '18px',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      minWidth: '240px',
                      boxShadow: '0 12px 28px -6px rgba(0,0,0,0.14), 0 6px 12px -4px rgba(0,0,0,0.08)',
                      zIndex: 9999,
                      animation: 'slideUp 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
                    }}
                  >
                    {/* Simplify Debts Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 900, color: '#111827', whiteSpace: 'nowrap' }}>Simplify Debts</span>
                        <span
                          style={{ fontSize: '12px', color: '#94A3B8', cursor: 'pointer', userSelect: 'none', padding: '0 4px' }}
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
                          width: '36px',
                          height: '20px',
                          borderRadius: '20px',
                          background: selectedGroup.simplifyDebts ? '#10B981' : '#CBD5E1',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            position: 'absolute',
                            top: '2px',
                            left: selectedGroup.simplifyDebts ? '18px' : '2px',
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }}
                        />
                      </div>
                    </div>

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
                        ...(selectedId !== 'STANDALONE' && isActiveMember ? [{ emoji: '🔗', label: 'Share Group Link', onClick: () => { setShowGroupOptionsMenu(false); onShareShortcut && onShareShortcut(); } }] : []),
                        { emoji: '💱', label: 'Convert Currency', onClick: () => { setShowGroupOptionsMenu(false); setShowConvertModalId(selectedId); } },
                        { emoji: '📤', label: 'Export Data', onClick: () => { setShowGroupOptionsMenu(false); setShowExportMenu(true); } },
                        { emoji: '📊', label: 'Analytics Breakdown', onClick: () => { setShowGroupOptionsMenu(false); onOpenAnalytics && onOpenAnalytics(selectedId || 'ALL'); } },
                        ...(isActiveMember && selectedId !== 'STANDALONE' ? [{ 
                          emoji: activeMembersCount > 1 ? '🚪' : '🗑️', 
                          label: activeMembersCount > 1 ? 'Leave Group' : 'Delete Group', 
                          onClick: () => { setShowGroupOptionsMenu(false); onDeleteGroup && onDeleteGroup(selectedId || ''); }, 
                          danger: true 
                        }] : []),
                        ...(isPastMember && selectedId !== 'STANDALONE' ? [{ emoji: '🗑️', label: 'Delete Group for Me', onClick: () => { setShowGroupOptionsMenu(false); onDeleteGroup && onDeleteGroup(selectedId || ''); }, danger: true }] : []),
                      ];
                      return actionItems.map((item) => (
                        <button
                          key={item.label}
                          onClick={item.onClick}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '9px 12px', 
                            border: 'none', 
                            background: 'none', 
                            width: '100%', 
                            textAlign: 'left', 
                            cursor: 'pointer', 
                            borderRadius: '10px', 
                            fontSize: '12px', 
                            fontWeight: 800, 
                            color: item.danger ? '#DC2626' : '#374151', 
                            transition: '0.15s all' 
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? '#FEF2F2' : '#F9FAFB'; e.currentTarget.style.color = item.danger ? '#B91C1C' : '#111827'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = item.danger ? '#DC2626' : '#374151'; }}
                        >
                          <span style={{ fontSize: '14px' }}>{item.emoji}</span> {item.label}
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Formed-on date, small and editable */}
          {selectedId !== 'STANDALONE' && !isRenaming && (
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
        </div>
      )}


      {showInfo && (
        <div style={{
          fontSize: '12px',
          color: 'var(--purple-text)',
          background: 'var(--nav-bg)',
          padding: '8px 16px',
          borderRadius: '12px',
          border: '1px solid var(--nav-hover)',
          fontWeight: 800,
          animation: 'fadeSlideIn 0.2s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: 'fit-content'
        }}>
          <span>ℹ️</span>
          <span>View members, track expenses, and settle debts for this group.</span>
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
    </>
  );
};
