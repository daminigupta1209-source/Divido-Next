import React from 'react';
import { Group, Expense } from '../lib/types';
import { downscaleImageFile } from '../lib/imageUtils';
import { formatDate, GROUP_COLORS, formatCompactAmount } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
// Lazy-loaded: BillScanner pulls in tesseract.js (OCR), which is large. Loading
// it on demand (only when the user opens the scanner) keeps it out of the main
// bundle so the app opens faster for everyone else.
const BillScanner = React.lazy(() =>
  import('./expense-modal/BillScanner').then((m) => ({ default: m.BillScanner }))
);

import { RecurrenceSelector } from './expense-modal/RecurrenceSelector';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { StyledDropdown } from './StyledDropdown';
import { CameraCaptureModal } from './CameraCaptureModal';

// Borderless trigger — the wrapping div already provides the pill/border/shadow.
const emInlineBtnStyle: React.CSSProperties = { border: '1.5px solid #EAEFF4', background: 'var(--w, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', borderRadius: '19px', height: '38px', width: '100%', fontSize: '12px', fontWeight: 800, color: '#1E293B', padding: '0 16px' };

interface ExpenseModalProps {
  setShowExpModal: (show: boolean) => void;
  setEditingExpense: (expense: Expense | null) => void;
  editingExpense: Expense | null;
  selectedGroup: Group;
  selectedId: string | number | null;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setShowCurrPickerId: (id: string | null) => void;
  showCurrPickerId: string | null;
  me: string;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setShowAddFriendModal: (show: boolean) => void;
  setSelectedId: (id: string | number | null) => void;
  view: string;
  newlyAddedFriends: string[];
  setNewlyAddedFriends: (friends: string[]) => void;
  setActiveSplitters?: (splitters: string[]) => void;
  userName: string;
  defaultCurrency: string;
  autoOpenScanner?: boolean;
  setAutoOpenScanner?: (val: boolean) => void;
  onRequireSignIn?: () => boolean;
  deleteExpense?: (id: string | number) => void;
  onExpenseSaved?: (savedExpense: Expense, activeGroup?: Group) => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  setShowExpModal,
  setEditingExpense,
  editingExpense,
  selectedGroup,
  selectedId,
  expenses,
  setExpenses,
  setShowCurrPickerId,
  showCurrPickerId,
  me,
  groups,
  setGroups,
  setShowAddFriendModal,
  setSelectedId,
  view,
  newlyAddedFriends,
  setNewlyAddedFriends,
  setActiveSplitters,
  userName,
  defaultCurrency,
  autoOpenScanner = false,
  setAutoOpenScanner,
  onRequireSignIn,
  deleteExpense,
  onExpenseSaved,
}) => {
  const {
    localGId,
    setLocalGId,
    activeGroup,
    selectedSplitters,
    setSelectedSplitters,
    amt,
    setAmt,
    payer,
    setPayer,
    title,
    setTitle,
    overrideEmoji,
    showGroupDropdown,
    setShowGroupDropdown,
    showSuggestions,
    setShowSuggestions,
    date,
    setDate,
    splitMode,
    setSplitMode,
    shares,
    setShares,
    notes,
    setNotes,
    showNotesPopup,
    setShowNotesPopup,
    showDatePopup,
    setShowDatePopup,
    tempNotes,
    setTempNotes,
    recurrence,
    setRecurrence,
    showRecurrencePopup,
    setShowRecurrencePopup,
    recurrenceContainerRef,
    showSharesPopup,
    setShowSharesPopup,
    descriptionContainerRef,
    curr,
    setCurr,
    shouldShake,
    showScannerModal,
    setShowScannerModal,
    highlightAddFriend,
    setHighlightAddFriend,
    attachments,
    setAttachments,
    tagsInput,
    setTagsInput,
    showAttachmentsPreview,
    setShowAttachmentsPreview,
    activeAttachmentIndex,
    setActiveAttachmentIndex,
    showValidationErrorPopup,
    setShowValidationErrorPopup,
    showFriendPickerPopup,
    setShowFriendPickerPopup,
    friendPickerSearch,
    setFriendPickerSearch,
    apiError,
    openScanner,
    handleScanComplete,
    allKnownFriends,
    friendsToSelect,
    payerOptions,
    filteredSuggs,
    currentEmoji,
    handleShareChange,
    getShareAmt,
    isValid,
    handleSave,
    setManualEdits,
    triggerShake,
    blurTimeoutRef,
    setOverrideEmoji,
    isScanning,
    setSelIdx,
    selIdx,
    totalShares,
    manualEdits,
  } = useExpenseForm({
    setShowExpModal,
    setEditingExpense,
    editingExpense,
    selectedGroup,
    selectedId,
    expenses,
    setExpenses,
    setShowCurrPickerId,
    showCurrPickerId,
    me,
    groups,
    setGroups,
    setShowAddFriendModal,
    setSelectedId,
    view,
    newlyAddedFriends,
    setNewlyAddedFriends,
    setActiveSplitters,
    userName,
    defaultCurrency,
    autoOpenScanner,
    setAutoOpenScanner,
    onExpenseSaved,
  });

  const [shakingFriend, setShakingFriend] = React.useState<string | null>(null);

  // Header attachment button: save a photo/file as a receipt attachment (no OCR).
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  // Set true when a scan just filled the form. The scanner-close handler reads
  // title/amt from a stale render closure, so right after a successful scan they
  // still look empty; this flag tells the close handler not to discard the modal.
  const scanJustCompletedRef = React.useRef(false);
  const [showAttachMenu, setShowAttachMenu] = React.useState(false);
  const [showCameraCapture, setShowCameraCapture] = React.useState(false);
  const addAttachmentDataUrl = (dataUrl: string) => {
    const newIndex = attachments.length;
    setAttachments([...attachments, dataUrl]);
    setActiveAttachmentIndex(newIndex);
    setShowAttachmentsPreview(true);
  };
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = ''; // allow selecting the same file again
    // Downscale first — full-res native-camera photos otherwise crash lower-RAM
    // phones ("low memory") and bloat storage/sync.
    try {
      const dataUrl = await downscaleImageFile(file, 1280, 0.72);
      addAttachmentDataUrl(dataUrl);
    } catch (err) {
      console.error('Attachment processing failed:', err);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        setEditingExpense(null);
        setShowExpModal(false);
      }}
      style={{
        zIndex: 2000,
        background: '#F8FAFC',
        padding: 0,
        alignItems: 'stretch',
        overflowY: 'hidden',
      }}
    >
      <div
        className="expense-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100vw',
          height: '100dvh',
          borderRadius: 0,
          border: 'none',
          background: '#F8FAFC',
          boxShadow: 'none',
          boxSizing: 'border-box',
          maxHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Invisible decoy input to trick browser autofill heuristics.
            NOTE: no type="password" decoy — a password field (even hidden) makes
            mobile Chrome treat the modal as a login form and pop the
            password-manager bar over the real inputs. */}
        <input type="text" name="username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <div style={{
          padding: '16px 20px',
          animation: 'fadeIn 0.18s ease-out',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden'
        }}>
        <style>{`
          .modal-body-scroll::-webkit-scrollbar { width: 6px; }
          .modal-body-scroll::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.4); border-radius: 10px; }
          .modal-body-scroll::-webkit-scrollbar-track { background: transparent; }
          .splitter-scroll::-webkit-scrollbar { width: 0; }
          .splitter-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          
          .step-container {
            position: relative;
            padding: 10px 4px 6px 4px;
            margin: 4px 0;
            border-radius: 0;
            border: none;
            background: transparent;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            gap: 4px;
            box-shadow: none;
          }
          .step-container::after {
            display: none;
          }
          .step-container:focus-within {
            opacity: 1;
            background: transparent;
            box-shadow: none;
            z-index: 1;
          }
          .step-container label {
            transition: color 0.2s ease;
            margin-left: 0px;
          }
          .step-container:focus-within label {
            color: #10B981 !important;
          }
          
          .inline-icon-btn {
            width: 44px;
            height: 44px;
            min-width: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #F1F5F9;
            border-radius: 12px;
            border: none;
            cursor: pointer;
            outline: none;
            color: #64748B;
            transition: all 0.2s ease;
            padding: 0;
          }
          .inline-icon-btn:hover,
          .inline-icon-btn:focus {
            background: #FFFFFF;
            color: #10B981;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15), 0 1px 3px rgba(0,0,0,0.05);
            transform: translateY(-1.5px);
          }
          .inline-icon-btn.active-state {
            background: #D1FAE5;
            color: #059669;
          }
          .inline-icon-btn.active-state:hover,
          .inline-icon-btn.active-state:focus {
            background: #FFFFFF;
            color: #10B981;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15), 0 1px 3px rgba(0,0,0,0.05);
          }
          
          .premium-input-wrapper {
            position: relative;
            flex: 1;
            align-self: center;
            height: 40px;
            background: transparent;
            border: none;
            border-bottom: 1.5px solid #CBD5E1;
            border-radius: 0;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            overflow: visible;
          }
           .premium-input-wrapper:focus-within {
            background: transparent;
            border-bottom-color: #CBD5E1;
            box-shadow: none;
          }
          
          @keyframes iconBounce {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(0px); }
          }
          @keyframes scan-line {
            0% { top: 0%; opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
          .scan-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(16, 185, 129, 0.05);
            border-radius: 12px; pointer-events: none; overflow: hidden;
            border: 2px solid #10B981; animation: pulse-green 1s infinite alternate;
          }
          .scan-line {
            position: absolute; width: 100%; height: 4px;
            background: linear-gradient(to right, transparent, #10B981, transparent);
            box-shadow: 0 0 15px #10B981;
            animation: scan-line 1.5s infinite linear;
          }
          @keyframes pulse-green {
            from { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2); }
            to { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
          }

           /* Focus styling for input, select, and custom focusable elements */
          #payer-select:focus, #split-mode-select:focus, #shares-val-input:focus, #shares-split-mode-select:focus, .splitter-scroll input:focus {
            border-color: #CBD5E1 !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05) !important;
            outline: none !important;
          }
          #exp-title:focus, #val-entry:focus {
            border-color: #CBD5E1 !important;
            box-shadow: none !important;
            outline: none !important;
          }
          [id^="friend-pill-"]:focus, #add-friend-btn:focus, #expense-date-btn:focus, #expense-notes-btn:focus, #expense-scan-btn:focus, #expense-recurrence-btn:focus, #shares-done-btn:focus, [id^="attachment-btn-"]:focus, #save-expense-btn:focus {
            box-shadow: 0 0 0 2px #CBD5E1 !important;
            outline: none !important;
          }

          .dropzone {
            border: 2.5px dashed #CBD5E1;
            border-radius: 16px;
            background: #F8FAFC;
            padding: 30px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
          }
          .dropzone.dragging {
            border-color: #10B981;
            background: #ECFDF5;
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
          }
          .dropzone:hover {
            border-color: #10B981;
            background: #F0FDF4;
          }
          .scan-preview-container {
            position: relative;
            width: 100%;
            height: 220px;
            border-radius: 16px;
            overflow: hidden;
            background: #0F172A;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #E2E8F0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          }
          .scan-preview-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 80px',
            alignItems: 'center',
            background: '#F8FAFC',
            padding: '18px 16px',
            margin: '-16px -20px 12px -20px',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => { setEditingExpense(null); setShowExpModal(false); }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Back"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#475569' }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              {/* Invisible backdrop to close on outside click */}
              {showGroupDropdown && (
                <div onClick={() => setShowGroupDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 299 }} />
              )}
              {/* Trigger button */}
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowGroupDropdown((p) => !p); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px 10px 16px',
                  borderRadius: '24px',
                  border: '1.5px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '16px', fontWeight: 950, color: '#475569',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  whiteSpace: 'nowrap',
                  minWidth: '180px',
                  justifyContent: 'center',
                  letterSpacing: '-0.3px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: '#475569' }}>
                  <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="2"/>
                  <path d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M22 20c0-2.761-2.239-5-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {localGId === 'STANDALONE' ? 'Non-Group Split' : (activeGroup?.name || 'Select Group')}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '2px', transition: 'transform 0.2s', display: 'inline-block', transform: showGroupDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>

              {/* Custom dropdown panel */}
              {showGroupDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--w)', border: '1.5px solid #F1F5F9',
                  borderRadius: '16px', boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  zIndex: 300, minWidth: '200px', padding: '8px', overflow: 'hidden',
                }}>
                  {/* Non-group option */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setLocalGId('STANDALONE');
                      setSelectedSplitters([me]);
                      setShares({});
                      setManualEdits(new Set());
                      setPayer(me);
                      setShowGroupDropdown(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                      background: localGId === 'STANDALONE' ? '#F0FDF4' : 'transparent',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>👤</div>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--t)' }}>Non-Group Split</span>
                  </div>

                  {/* Scrollable groups list wrapper */}
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }} className="modal-body-scroll">
                    {groups
                      .filter((g) => {
                        if (g.id === 'STANDALONE') return false;
                        const hasName = g.name && g.name.trim() !== '';
                        if (hasName) return true;
                        const hasExpenses = expenses.some((e) => String(e.gId) === String(g.id));
                        const hasOtherMembers = g.members && g.members.length > 1;
                        return hasExpenses || hasOtherMembers;
                      })
                      .map((g) => {
                        const index = groups.findIndex((x) => String(x.id) === String(g.id));
                        const c = GROUP_COLORS[index !== -1 ? index % GROUP_COLORS.length : 0];
                        const initials = (g.emoji && (g.emoji.startsWith('data:image/') || g.emoji.startsWith('http'))) ? g.emoji : (g.name.charAt(0).toUpperCase() || '🏡');
                        
                        return (
                          <div
                            key={g.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setLocalGId(g.id);
                              setSelectedSplitters(g.members);
                              setShares({});
                              setManualEdits(new Set());
                              setPayer(me);
                              setCurr(g.currency || '₹');
                              setShowGroupDropdown(false);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                              background: localGId === g.id ? '#F0FDF4' : 'transparent',
                              marginBottom: '4px',
                            }}
                          >
                            <div style={{ 
                              width: '30px', 
                              height: '30px', 
                              borderRadius: '50%', 
                              background: c.bg, 
                              color: c.text, 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontSize: '12px', 
                              fontWeight: 900,
                              flexShrink: 0,
                              overflow: 'hidden',
                            }}>
                              {initials && (initials.startsWith('data:image/') || initials.startsWith('http')) ? (
                                <img src={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              ) : (
                                initials
                              )}
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--t)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {g.name}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  {/* Create group */}
                  <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '4px', paddingTop: '4px' }}>
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowGroupDropdown(false);
                        if (onRequireSignIn && !onRequireSignIn()) return;
                        const name = prompt('Ledger Name:', 'New Group 🏡');
                        if (name) {
                          if (groups.some((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())) {
                            alert('A group with that name already exists. Please pick a different name.');
                            return;
                          }
                          const id = Date.now() + Math.random();
                          const newG = { id, name, members: [me], currency: '₹' };
                          setGroups([...groups, newG]);
                          setLocalGId(id);
                          setSelectedSplitters([me]);
                          setCurr('₹');
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                        color: '#6366F1',
                      }}
                    >
                      <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>➕</div>
                      <span style={{ fontSize: '12px', fontWeight: 900 }}>Create New Group</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px' }}>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoCapture}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoCapture}
            />
            {showAttachMenu && (
              <div
                className="modal-overlay"
                onClick={() => setShowAttachMenu(false)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
              >
                <div
                  className="card shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '260px',
                    background: 'var(--w)',
                    borderRadius: '20px',
                    padding: '10px',
                    position: 'relative',
                    animation: 'pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    onClick={() => setShowAttachMenu(false)}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '12px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: 1,
                      color: 'var(--g)',
                      opacity: 0.3,
                      transition: '0.2s all',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
                  >
                    ✕
                  </div>
                  <p style={{ fontSize: '11px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', margin: '6px 0 10px' }}>
                    Add Attachment
                  </p>
                  <div
                    onClick={() => {
                      setShowAttachMenu(false);
                      cameraInputRef.current?.click();
                    }}
                    className="hover-bg"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '12px', cursor: 'pointer' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t)' }}>Camera</span>
                  </div>
                  <div
                    onClick={() => {
                      setShowAttachMenu(false);
                      uploadInputRef.current?.click();
                    }}
                    className="hover-bg"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '12px', cursor: 'pointer' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t)' }}>Upload photo or file</span>
                  </div>
                </div>
              </div>
            )}
            
            {editingExpense && editingExpense.id != null && !String(editingExpense.id).startsWith('temp-') && (
              <button
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                onClick={() => {
                  if (confirm('Delete this activity? This cannot be undone.')) {
                    deleteExpense && deleteExpense(editingExpense.id);
                    setShowExpModal(false);
                    setEditingExpense(null);
                  }
                }}
                title="Delete activity"
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}

            <button
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                color: 'var(--t)',
                opacity: 0.7,
              }}
              onClick={() => setShowAttachMenu(true)}
              title="Add attachment"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div
          className="modal-body-scroll"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            paddingRight: '6px',
            paddingBottom: '80px',
            margin: '4px 0',
          }}
        >
          {/* COMPACT REARRANGEMENT SECTION 1: SPLIT DETAILS & FRIENDS (Moved to the Top) */}
          {localGId === 'STANDALONE' && (
            <div className="step-container">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label
                  style={{
                    fontSize: '9px',
                    fontWeight: 950,
                    textTransform: 'uppercase',
                    letterSpacing: '1.2px',
                  }}
                >
                  Split with
                </label>
                {highlightAddFriend && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 900,
                      color: '#059669',
                      background: '#ECFDF5',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      border: '1px solid #A7F3D0',
                      animation: 'fadeSlideIn 0.3s ease-out',
                    }}
                  >
                    👉 Scanned! Select friends to split with
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', position: 'relative' }}>
                {/* You pill — always shown, non-interactive */}
                <div
                  style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1.5px solid #10B981',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#065F46',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src="/divido_laughing_cat_mascot_1778063273427.png"
                    style={{ width: '18px', height: '18px', borderRadius: '50%' }}
                    alt="cat avatar"
                  />
                  You ✓
                </div>

                {friendsToSelect.filter(f => f !== me).length === 0 ? (
                  /* No friends yet — show + Friend */
                  <button
                    type="button"
                    onClick={() => {
                      setShowFriendPickerPopup(false);
                      setSelectedId(localGId === 'STANDALONE' ? 'STANDALONE' : localGId);
                      setShowAddFriendModal(true);
                    }}
                    style={{
                      height: '34px',
                      padding: '0 16px',
                      borderRadius: '999px',
                      background: 'transparent',
                      border: '1.5px solid #059669',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#059669',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    + Friend
                  </button>
                ) : (
                  <>
                    {/* Group icon button with count badge */}
                    <button
                      id="add-friend-btn"
                      tabIndex={0}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFriendPickerPopup((prev) => !prev);
                        setHighlightAddFriend(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowFriendPickerPopup((prev) => !prev);
                          setHighlightAddFriend(false);
                        }
                      }}
                      style={{
                        height: '34px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        background: showFriendPickerPopup ? 'rgba(16, 185, 129, 0.1)' : 'var(--w)',
                        border: showFriendPickerPopup ? '1.5px solid #10B981' : highlightAddFriend ? '1.5px solid #10B981' : '1.5px dashed #CBD5E1',
                        fontSize: '13px',
                        fontWeight: 800,
                        color: showFriendPickerPopup ? '#065F46' : '#64748B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                      className={`hover-up-mini ${highlightAddFriend ? 'pulse-highlight' : ''}`}
                      title="Select friends to split with"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="2"/>
                        <path d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                        <path d="M22 20c0-2.761-2.239-5-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      {(() => {
                        const othersSelected = selectedSplitters.filter(s => s !== me).length;
                        const othersTotal = friendsToSelect.filter(f => f !== me).length;
                        return (
                          <span style={{ fontSize: '11px', fontWeight: 900 }}>
                            {othersSelected > 0 ? `${othersSelected}/${othersTotal}` : `+ ${othersTotal}`}
                          </span>
                        );
                      })()}
                      {selectedSplitters.filter(s => s !== me).length > 0 && (
                        <span style={{ fontSize: '10px', color: '#10B981' }}>✓</span>
                      )}
                    </button>

                    {/* + button to invite more */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowFriendPickerPopup(false);
                        setSelectedId(localGId === 'STANDALONE' ? 'STANDALONE' : localGId);
                        setShowAddFriendModal(true);
                        setHighlightAddFriend(false);
                      }}
                      style={{
                        width: '34px', height: '34px', borderRadius: '10px',
                        background: 'var(--w)', border: '1.5px dashed #CBD5E1',
                        fontSize: '18px', fontWeight: 900, color: '#94A3B8',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', outline: 'none', padding: 0, flexShrink: 0,
                      }}
                      className="hover-up-mini"
                      title="Invite Friend"
                    >
                      +
                    </button>
                  </>
                )}

                {/* Friends popup — centered overlay */}
                {showFriendPickerPopup && (
                  <>
                    {/* Backdrop */}
                    <div
                      onMouseDown={() => setShowFriendPickerPopup(false)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.35)',
                        zIndex: 200,
                      }}
                    />
                    {/* Card */}
                    <div
                      style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '300px',
                        background: 'var(--w)',
                        borderRadius: '20px',
                        boxShadow: '0 24px 48px -8px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.08)',
                        zIndex: 201,
                        overflow: 'hidden',
                        animation: 'friendsPopupIn 0.18s ease-out',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px 16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--t)' }}>
                          Who's splitting? 🤝
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowFriendPickerPopup(false)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            border: '1.5px solid #E2E8F0',
                            background: '#F8FAFC',
                            fontSize: '14px',
                            color: '#64748B',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Friends list */}
                      <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '0 8px 4px 8px' }}>
                        {friendsToSelect.filter(f => f !== me).map((friend) => {
                          const cleanFriend = friend.replace(' (Left)', '');
                          const isChecked = selectedSplitters.includes(cleanFriend);
                          return (
                            <div
                              key={friend}
                              onClick={() => {
                                setSelectedSplitters(
                                  isChecked
                                    ? selectedSplitters.filter((s) => s !== cleanFriend)
                                    : [...selectedSplitters, cleanFriend]
                                );
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 10px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease',
                                background: isChecked ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = isChecked ? 'rgba(16, 185, 129, 0.1)' : '#F8FAFC')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = isChecked ? 'rgba(16, 185, 129, 0.06)' : 'transparent')}
                            >
                              <div
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '6px',
                                  border: `2px solid ${isChecked ? '#10B981' : '#CBD5E1'}`,
                                  background: isChecked ? '#10B981' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {isChecked && <span style={{ color: 'white', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                              </div>
                              <div
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #E0F2FE, #DBEAFE)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px',
                                  fontWeight: 900,
                                  color: '#3B82F6',
                                  flexShrink: 0,
                                }}
                              >
                                {friend.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t)', flex: 1 }}>
                                {friend}
                              </span>
                            </div>
                          );
                        })}
                         {friendsToSelect.filter(f => f !== me).length === 0 && (
                          <div style={{ padding: '16px 10px', display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setShowFriendPickerPopup(false);
                                setSelectedId(localGId === 'STANDALONE' ? 'STANDALONE' : localGId);
                                setShowAddFriendModal(true);
                              }}
                              style={{
                                height: '34px',
                                padding: '0 16px',
                                borderRadius: '999px',
                                background: 'transparent',
                                border: '1.5px solid #059669',
                                fontSize: '12px',
                                fontWeight: 800,
                                color: '#059669',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              + Friend
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Bottom row: Confirm */}
                      <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 16px 16px 16px', display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1 }} />
                        <button
                          type="button"
                          onClick={() => setShowFriendPickerPopup(false)}
                          style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#10B981',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 0 #059669',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#059669'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#10B981'; }}
                        >
                          ✓ Confirm
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* COMPACT REARRANGEMENT SECTION 2: DESCRIPTION (Standalone Input) */}
          <div className="step-container">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', height: '48px' }} ref={descriptionContainerRef}>
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                  setShowSuggestions((prev) => !prev);
                }}
                style={{
                  flexShrink: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  userSelect: 'none',
                  background: 'transparent',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  width: '38px',
                  height: '34px',
                  alignSelf: 'center',
                }}
                title="Select Suggestion"
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{currentEmoji}</span>
                <span style={{ fontSize: '7px', color: '#94A3B8',
                  transition: 'transform 0.2s ease',
                  display: 'inline-block',
                  transform: showSuggestions ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>
              <div className="premium-input-wrapper" style={{ position: 'relative' }}>
                <input
                  id="exp-title"
                  value={title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTitle(v.length === 1 ? v.toUpperCase() : v);
                    setOverrideEmoji(null);
                  }}
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="e.g. Pizza 🍕"
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 90px 0 4px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '18px',
                    fontWeight: '700',
                    color: title ? '#0F172A' : 'var(--t)',
                    opacity: title ? 1 : 0.45,
                    outline: 'none',
                    boxSizing: 'border-box',
                    margin: 0,
                  }}
                />

                {/* Icons row — right side of description input */}
                <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {/* Scan icon */}
                  <span
                    id="expense-scan-btn"
                    onClick={openScanner}
                    title={isScanning ? 'Scanning...' : 'Scan Receipt'}
                    style={{ fontSize: '18px', cursor: 'pointer', opacity: isScanning ? 1 : 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}
                  >
                    {isScanning ? (
                      <span className="spin" style={{ fontSize: '15px' }}>🌐</span>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', display: 'block' }}>
                        <path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" />
                      </svg>
                    )}
                  </span>
                  {/* Notes icon */}
                  <span
                    onClick={() => { setTempNotes(notes); setShowNotesPopup(true); }}
                    style={{ opacity: notes ? 1 : 0.7, cursor: 'pointer', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '17px', height: '17px', display: 'block' }}>
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </span>
                </div>


                {showSuggestions && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '8px',
                      width: '200px',
                      background: 'var(--w)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                      border: '1.5px solid #F1F5F9',
                      marginTop: '4px',
                      zIndex: 100,
                      maxHeight: '180px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredSuggs.map((s, idx) => (
                      <div
                        key={s}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          const parts = s.split(' ');
                          const lastPart = parts[parts.length - 1];
                          const hasEmoji = /\p{Emoji}/u.test(lastPart) && parts.length > 1;
                          if (hasEmoji) {
                            setTitle(parts.slice(0, -1).join(' '));
                            setOverrideEmoji(lastPart);
                          } else {
                            setTitle(s);
                            setOverrideEmoji(null);
                          }
                          setShowSuggestions(false);
                          setSelIdx(-1);
                          setTimeout(() => {
                            document.getElementById('val-entry')?.focus();
                          }, 50);
                        }}
                        onMouseEnter={() => setSelIdx(idx)}
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          fontWeight: '800',
                          color: '#1E293B',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F8FAFC',
                          transition: 'background-color 0.1s',
                          background: idx === selIdx ? '#F1F5F9' : 'transparent',
                        }}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COMPACT REARRANGEMENT SECTION 3: AMOUNT (Standalone Input) */}
          <div className="step-container">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', height: '48px' }}>
              <div
                onClick={() => setShowCurrPickerId('expense')}
                style={{
                  flexShrink: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  userSelect: 'none',
                  background: 'transparent',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  width: curr.length > 1 ? '48px' : '38px',
                  height: '34px',
                  alignSelf: 'center',
                }}
              >
                <span style={{ fontSize: curr.length > 2 ? '11px' : curr.length > 1 ? '13px' : '16px', fontWeight: 800, color: '#1E3A5F' }}>{curr}</span>
                <span style={{ fontSize: '7px', color: '#94A3B8',
                  transition: 'transform 0.2s ease',
                  display: 'inline-block',
                  transform: showCurrPickerId === 'expense' ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>
              <div className="premium-input-wrapper">
                <input
                  id="val-entry"
                  type="search"
                  inputMode="decimal"
                  readOnly
                  onFocus={(e) => { e.currentTarget.readOnly = false; }}
                  onBlur={(e) => { e.currentTarget.readOnly = true; }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="0.00"
                  value={amt}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setAmt(val);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    paddingLeft: '6px',
                    paddingRight: '64px',
                    fontSize: amt.length > 12 ? '14px' : amt.length > 8 ? '16px' : '18px',
                    fontWeight: '700',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: amt ? '#0F172A' : undefined,
                    outline: 'none',
                    opacity: amt ? 1 : 0.45,
                    boxSizing: 'border-box',
                    margin: 0,
                  }}
                />
                <div style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    onClick={() => setShowDatePopup(true)}
                    style={{ opacity: 0.85, cursor: 'pointer', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Set Date"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '17px', height: '17px', display: 'block' }}>
                      <rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
                    </svg>
                  </span>
                <div ref={recurrenceContainerRef} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    id="expense-recurrence-btn"
                    tabIndex={0}
                    type="button"
                    onClick={() => setShowRecurrencePopup(!showRecurrencePopup)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      opacity: recurrence !== 'none' ? 1 : 0.85,
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      margin: 0,
                    }}
                    title={recurrence === 'none' ? 'Set Recurrence' : `Recurrence: ${recurrence}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke={recurrence !== 'none' ? '#059669' : '#64748B'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '17px', height: '17px', display: 'block' }}>
                      <path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                  <RecurrenceSelector
                    showRecurrencePopup={showRecurrencePopup}
                    setShowRecurrencePopup={setShowRecurrencePopup}
                    recurrence={recurrence}
                    setRecurrence={setRecurrence}
                  />
                </div>
                </div>
              </div>
            </div>
          </div>

          {/* COMPACT REARRANGEMENT SECTION 4: COMBINED PAID BY & SPLIT MODE */}
          <div className="step-container" style={{ flexDirection: 'row', gap: '16px' }}>
            {/* Paid By Selector */}
            <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '9px',
                  fontWeight: 950,
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                  color: '#94A3B8',
                }}
              >
                Paid by
              </label>
              <div style={{ marginTop: '2px' }}>
                <StyledDropdown
                  id="payer-select"
                  fullWidth
                  ariaLabel="Paid by"
                  value={payer}
                  onChange={(v) => setPayer(v)}
                  buttonStyle={emInlineBtnStyle}
                  options={payerOptions.map((option) => ({
                    value: option.replace(' (Left)', ''),
                    label: option === me ? (userName === 'You' ? 'You' : `You (${userName})`) : option,
                  }))}
                />
              </div>
            </div>

            {/* Split Mode Selector */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '9px',
                  fontWeight: 950,
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                  color: '#94A3B8',
                }}
              >
                Split Mode
              </label>
              <div style={{ marginTop: '2px' }}>
                <StyledDropdown
                  id="split-mode-select"
                  fullWidth
                  ariaLabel="Split mode"
                  value={splitMode}
                  onChange={(mode) => {
                    setSplitMode(mode);
                    setShares({});
                    setManualEdits(new Set());
                    if (mode !== 'Equally') {
                      setShowSharesPopup(true);
                      setTimeout(() => {
                        const el = document.getElementById('shares-val-input');
                        el?.focus();
                        (el as HTMLInputElement).select?.();
                      }, 50);
                    }
                  }}
                  buttonStyle={emInlineBtnStyle}
                  options={[
                    { value: 'Equally', label: 'Equally' },
                    { value: 'Unequally', label: 'Unequally' },
                    { value: 'Percentage', label: 'Percentage' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* MEMBER LIST WITH TICK/UNTICK */}
          {friendsToSelect.length > 0 && (
            <div className="step-container" style={{ gap: '6px' }}>
              {(() => {
                const cleanedMembers = friendsToSelect.map((m) => m.replace(' (Left)', ''));
                const allSelected =
                  cleanedMembers.length > 0 && cleanedMembers.every((m) => selectedSplitters.includes(m));
                return (
                  <div
                    onClick={() =>
                      setSelectedSplitters(allSelected ? [] : Array.from(new Set(cleanedMembers)))
                    }
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '5px',
                      background: allSelected ? '#16A34A' : '#fff',
                      border: `2px solid ${allSelected ? '#16A34A' : '#CBD5E1'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {allSelected && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                    </div>
                    <label
                      style={{
                        fontSize: '9px',
                        fontWeight: 950,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: '1.2px',
                        cursor: 'pointer',
                      }}
                    >
                      Paid For
                    </label>
                  </div>
                );
              })()}
              <style>{`
                /* Disable spin buttons */
                .inline-share-input::-webkit-outer-spin-button,
                .inline-share-input::-webkit-inner-spin-button {
                  -webkit-appearance: none;
                  margin: 0;
                }
                .inline-share-input {
                  -webkit-appearance: none !important;
                  -moz-appearance: textfield !important;
                  appearance: none !important;
                  border-top: none !important;
                  border-left: none !important;
                  border-right: none !important;
                  border-radius: 0 !important;
                  border-bottom: 1.5px solid #CBD5E1 !important;
                  box-shadow: none !important;
                  background: transparent !important;
                  transition: border-color 0.2s;
                }
                .inline-share-input:focus {
                  border-bottom-color: #10B981 !important;
                }
                .inline-share-input::placeholder {
                  color: #94A3B8 !important;
                  opacity: 0.7 !important;
                  font-size: 13px !important;
                }
              `}</style>
              {friendsToSelect.map((member) => {
                const cleanMember = member.replace(' (Left)', '');
                const isSelected = selectedSplitters.includes(cleanMember);
                const share = splitMode === 'Equally'
                  ? selectedSplitters.length > 0 ? (parseFloat(amt) || 0) / selectedSplitters.length : 0
                  : splitMode === 'Percentage'
                  ? ((parseFloat(amt) || 0) * (shares[cleanMember] || 0)) / 100
                  : shares[cleanMember] || 0;
                const displayName = member === me ? (userName === 'You' ? 'You' : `You (${userName})`) : member;
                return (
                  <div
                    key={member}
                    onClick={() => {
                      if (isSelected) {
                        if (selectedSplitters.length > 1) setSelectedSplitters(selectedSplitters.filter(m => m !== cleanMember));
                      } else {
                        setSelectedSplitters([...selectedSplitters, cleanMember]);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#FFFFFF',
                      border: `1.5px solid ${isSelected ? '#86EFAC' : '#E2E8F0'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '6px',
                        background: isSelected ? '#16A34A' : '#fff',
                        border: `2px solid ${isSelected ? '#16A34A' : '#CBD5E1'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{displayName}</span>
                    </div>
                    {isSelected && amt && (
                      splitMode === 'Equally' ? (
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A', whiteSpace: 'nowrap' }}>
                          {curr}{share >= 1000000 ? formatCompactAmount(share) : share.toFixed(2)}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                          {splitMode === 'Percentage' && (
                             <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                               {curr}{share >= 1000000 ? formatCompactAmount(share) : (share % 1 === 0 ? share.toString() : share.toFixed(2))}
                             </span>
                          )}
                          <div
                            className={shakingFriend === cleanMember ? 'shake' : ''}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0',
                              height: '28px',
                              width: splitMode === 'Percentage' ? '45px' : '85px',
                              justifyContent: 'flex-start',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {splitMode === 'Unequally' && (
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', opacity: 0.7, marginRight: '6px', userSelect: 'none' }}>{curr}</span>
                            )}
                            <input
                              type="text"
                              inputMode="decimal"
                              className="inline-share-input"
                              value={shares[cleanMember] === undefined ? '' : shares[cleanMember]}
                              onChange={(e) => {
                                const inputVal = e.target.value;
                                // Allow intermediate typing states like "" or "."
                                if (inputVal !== '' && !/^\d*\.?\d*$/.test(inputVal)) return;
                                
                                const numVal = parseFloat(inputVal) || 0;
                                
                                if (splitMode === 'Unequally') {
                                  const totalAmt = parseFloat(amt) || 0;
                                  const otherManualSum = selectedSplitters
                                    .filter((m) => m !== cleanMember && manualEdits.has(m))
                                    .reduce((sum, m) => sum + (shares[m] || 0), 0);
                                  const maxAllowed = totalAmt - otherManualSum;
                                  if (numVal > maxAllowed) {
                                    setShakingFriend(cleanMember);
                                    setTimeout(() => setShakingFriend(null), 500);
                                    return;
                                  }
                                }
                                
                                if (splitMode === 'Percentage') {
                                  const otherManualSum = selectedSplitters
                                    .filter((m) => m !== cleanMember && manualEdits.has(m))
                                    .reduce((sum, m) => sum + (shares[m] || 0), 0);
                                  const maxAllowed = 100 - otherManualSum;
                                  if (numVal > maxAllowed) {
                                    setShakingFriend(cleanMember);
                                    setTimeout(() => setShakingFriend(null), 500);
                                    return;
                                  }
                                }
                                
                                handleShareChange(cleanMember, inputVal);
                              }}
                              placeholder="0"
                              style={{
                                width: '100%',
                                height: '100%',
                                lineHeight: 'normal',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                fontSize: '15px',
                                fontWeight: 800,
                                color: '#0F172A',
                                padding: 0,
                                margin: 0,
                                textAlign: 'left',
                                caretColor: '#0F172A'
                              }}
                            />
                            {splitMode === 'Percentage' && (
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', opacity: 0.7, marginLeft: '4px', userSelect: 'none' }}>%</span>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Conditional Splitter Shares Details Summary Banner */}
          {selectedSplitters.length > 0 && splitMode !== 'Equally' && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background:
                  splitMode === 'Unequally'
                    ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                      ? '#EFF6FF'
                      : '#FFF1F2'
                    : Math.abs(totalShares - 100) < 0.01
                    ? '#EFF6FF'
                    : '#FFF1F2',
                border:
                  splitMode === 'Unequally'
                    ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                      ? '1.5px solid #BFDBFE'
                      : '1.5px solid #FECDD3'
                    : Math.abs(totalShares - 100) < 0.01
                    ? '1.5px solid #BFDBFE'
                    : '1.5px solid #FECDD3',
                borderRadius: '14px',
                marginTop: '4px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 900,
                    color:
                      splitMode === 'Unequally'
                        ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                          ? '#1E40AF'
                          : '#9F1239'
                        : Math.abs(totalShares - 100) < 0.01
                        ? '#1E40AF'
                        : '#9F1239',
                  }}
                >
                  ⚖️ Split Shares Details ({splitMode})
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color:
                      splitMode === 'Unequally'
                        ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                          ? '#2563EB'
                          : '#B91C1C'
                        : Math.abs(totalShares - 100) < 0.01
                        ? '#2563EB'
                        : '#B91C1C',
                    fontWeight: 800,
                  }}
                >
                  {selectedSplitters.length} friends •{' '}
                  {splitMode === 'Unequally' ? (
                    Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01 ? (
                      `Perfect split of ${curr}${totalShares.toFixed(2)}.`
                    ) : (
                      `Split: ${curr}${totalShares.toFixed(2)} of ${curr}${(parseFloat(amt) || 0).toFixed(2)} (${
                        totalShares > (parseFloat(amt) || 0)
                          ? `over by ${curr}${Math.abs(totalShares - (parseFloat(amt) || 0)).toFixed(2)}`
                          : `short by ${curr}${Math.abs(totalShares - (parseFloat(amt) || 0)).toFixed(2)}`
                      })`
                    )
                  ) : (
                    Math.abs(totalShares - 100) < 0.01 ? (
                      'Perfect split of 100%.'
                    ) : (
                      `Split: ${totalShares.toFixed(1)}% of 100% (${
                        totalShares > 100 ? `over by ${(totalShares - 100).toFixed(1)}%` : `short by ${(100 - totalShares).toFixed(1)}%`
                      })`
                    )
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Scanner floating button + attachments */}
          <div style={{ position: 'relative' }}>


            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {attachments.map((att, idx) => {
                  const isDataUrl = att.startsWith('data:');
                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '60px',
                        height: '60px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1.5px solid #E2E8F0',
                        cursor: 'pointer',
                        background: '#F8FAFC',
                        animation: 'fadeSlideIn 0.3s ease-out',
                      }}
                      onClick={() => {
                        setActiveAttachmentIndex(idx);
                        setShowAttachmentsPreview(true);
                      }}
                    >
                      {isDataUrl ? (
                        <img src={att} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Attachment" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: '#64748B' }}>
                          📄 File
                        </div>
                      )}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to remove this receipt attachment? 🗑️')) {
                            const newAttachments = attachments.filter((_, i) => i !== idx);
                            setAttachments(newAttachments);
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'rgba(239, 68, 68, 0.9)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s',
                          zIndex: 10,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#EF4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)')}
                      >
                        ✕
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>


        </div>

        {/* Action Error / Validation Display (as a popup card) */}
        {showValidationErrorPopup && (!isValid || !title) && (
          <div
            onClick={() => setShowValidationErrorPopup(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3000,
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={shouldShake ? 'shake' : ''}
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '20px 24px',
                width: '320px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1.5px solid #F1F5F9',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'center',
                animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
              }}
            >
              <button onClick={() => setShowValidationErrorPopup(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}>✕</button>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#FFF1F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  color: '#EF4444',
                }}
              >
                🛑
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 900,
                    color: '#9F1239',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  Action Required
                </span>
                <span style={{ fontSize: '13px', color: '#475569', fontWeight: 800, lineHeight: '1.4' }}>
                  {!title
                    ? 'Please enter a description for this expense.'
                    : parseFloat(amt) <= 0
                    ? 'Wait, the amount must be greater than zero!'
                    : splitMode === 'Unequally'
                    ? `The total of all shares must equal ${curr}${amt}. You are currently ${
                        totalShares > (parseFloat(amt) || 0) ? 'over' : 'short'
                      } by ${curr}${Math.abs(totalShares - (parseFloat(amt) || 0)).toFixed(2)}.`
                    : splitMode === 'Percentage'
                    ? `The total percentage must be exactly 100%. You are currently at ${totalShares.toFixed(
                        1
                      )}%.`
                    : 'Please select at least one person to split this with.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationErrorPopup(false)}
                className="btn-green hover-up-mini"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 900,
                  marginTop: '6px',
                }}
              >
                Got it
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', position: 'relative' }}>
          {/* Floating Add Attachment button — sits at the bottom-right, above the submit button */}

          {/* Modal Footer Submit Button */}
          <button
            id="save-expense-btn"
            className="btn-green animate-all"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              opacity: !isValid || !title ? 0.6 : 1,
              cursor: !isValid || !title ? 'not-allowed' : 'pointer',
              borderRadius: '14px',
            }}
            onClick={() => {
              if (isValid && title) {
                handleSave();
              } else {
                setShowValidationErrorPopup(true);
                triggerShake();
              }
            }}
          >
            {editingExpense && editingExpense.id && !String(editingExpense.id).startsWith('temp-') ? 'Save Changes' : 'Record Expense'}
          </button>
        </div>
      </div>

      {/* Currency Picker Modal */}
      <SearchableCurrencyPicker
        show={showCurrPickerId === 'expense'}
        onClose={() => setShowCurrPickerId(null)}
        onSelect={(selectedCurrency) => {
          setCurr(selectedCurrency);
          localStorage.setItem('divido_last_used_currency', selectedCurrency);
          if (localGId) {
            localStorage.setItem(`divido_last_used_currency_${localGId}`, selectedCurrency);
          }
          setShowCurrPickerId(null);
        }}
        current={curr}
      />



      {/* Notes Textarea Popup */}
      {showDatePopup && (
        <div
          onClick={() => setShowDatePopup(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '20px', padding: '28px 24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
              minWidth: '260px', position: 'relative',
            }}
          >
            <button onClick={() => setShowDatePopup(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}>✕</button>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: '#1E293B' }}>📅 Pick a Date</p>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setShowDatePopup(false); }}
              style={{
                fontSize: '16px', padding: '10px 16px', borderRadius: '12px',
                border: '1.5px solid #CBD5E1', outline: 'none', cursor: 'pointer',
                fontWeight: 700, color: '#1E293B',
              }}
            />
            <button
              onClick={() => setShowDatePopup(false)}
              style={{
                background: '#16A34A', color: '#fff', border: 'none',
                borderRadius: '10px', padding: '8px 24px', fontWeight: 800,
                fontSize: '13px', cursor: 'pointer',
              }}
            >Done</button>
          </div>
        </div>
      )}

      {showNotesPopup && (
        <div
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
            zIndex: 2100,
          }}
          onClick={() => setShowNotesPopup(false)}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1.5px solid rgba(255, 255, 255, 0.7)',
              borderRadius: '24px',
              width: '90%',
              maxWidth: '400px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 950, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📝 Notes & Details
              </span>
              <button
                type="button"
                onClick={() => setShowNotesPopup(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#64748B',
                  fontWeight: 'bold',
                }}
              >
                ✕
              </button>
            </div>
            <textarea
              value={tempNotes}
              onChange={(e) => setTempNotes(e.target.value)}
              placeholder="Add details, links, or multi-line notes..."
              rows={5}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  setNotes(tempNotes);
                  setShowNotesPopup(false);
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '13px',
                fontWeight: 800,
                borderRadius: '16px',
                border: '2.5px solid #F1F5F9',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowNotesPopup(false)}
                style={{
                  padding: '8px 14px',
                  background: 'var(--bg)',
                  color: '#64748B',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up-mini"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotes(tempNotes);
                  setShowNotesPopup(false);
                }}
                style={{
                  padding: '8px 14px',
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up-mini"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Receipt Scanner Modal — mounted only when opened so its heavy
          OCR bundle loads on demand rather than at app startup. */}
      {showScannerModal && (
        <React.Suspense fallback={
          <div style={{
            position: 'fixed',
            inset: 0,
            background: '#F8FAFC',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <div className="scanner-fallback-spinner" style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              border: '3px solid #E2E8F0',
              borderTopColor: '#10B981',
              animation: 'scannerSpin 0.7s linear infinite',
              marginBottom: '16px',
            }} />
            <h3 className="nunito" style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>
              Launching Smart Scanner...
            </h3>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', margin: 0 }}>
              Preparing OCR engine & camera
            </p>
            <style>{`
              @keyframes scannerSpin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        }>
          <BillScanner
            showScannerModal={showScannerModal}
            setShowScannerModal={(show) => {
              setShowScannerModal(show);
              if (!show) {
                // A successful scan just populated the form — keep the modal open
                // even though title/amt still read empty in this stale closure.
                if (scanJustCompletedRef.current) {
                  scanJustCompletedRef.current = false;
                  return;
                }
                const hasNoData = !title.trim() && (!amt || parseFloat(amt.toString()) === 0);
                // A freshly-created expense carries a 'temp-' id, so treat that as
                // new too — otherwise cancelling the scanner leaves an empty
                // expense card open behind it.
                const isNew = !editingExpense || !editingExpense.id || String(editingExpense.id).startsWith('temp-');
                if (hasNoData && isNew) {
                  setShowExpModal(false);
                }
              }
            }}
            curr={curr}
            onScanComplete={(data) => {
              scanJustCompletedRef.current = true;
              handleScanComplete(data);
            }}
          />
        </React.Suspense>
      )}

      <CameraCaptureModal
        show={showCameraCapture}
        onClose={() => setShowCameraCapture(false)}
        onCapture={addAttachmentDataUrl}
      />

      {/* Attachments Preview Modal */}
      {showAttachmentsPreview && attachments.length > 0 && (
        <div
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
            zIndex: 2500,
          }}
          onClick={() => setShowAttachmentsPreview(false)}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.98)',
              border: '1.5px solid rgba(255, 255, 255, 0.7)',
              borderRadius: '24px',
              width: '90%',
              maxWidth: '420px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 950, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📎 Attached Receipt
              </span>
              <button
                type="button"
                onClick={() => setShowAttachmentsPreview(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#64748B',
                  fontWeight: 'bold',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '300px',
                borderRadius: '16px',
                border: '1.5px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#F8FAFC',
                overflow: 'hidden',
              }}
            >
              {attachments[activeAttachmentIndex] && attachments[activeAttachmentIndex].startsWith('data:') ? (
                <img
                  src={attachments[activeAttachmentIndex]}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  alt={`Receipt ${activeAttachmentIndex + 1}`}
                />
              ) : (
                <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#64748B' }}>
                  <span style={{ fontSize: '48px' }}>📄</span>
                  <span style={{ fontSize: '12px', fontWeight: 900, textAlign: 'center', wordBreak: 'break-all' }}>
                    {attachments[activeAttachmentIndex]}
                  </span>
                </div>
              )}

              {/* Delete this photo — top-right overlay */}
              <button
                type="button"
                title="Delete this photo"
                onClick={() => {
                  if (confirm('Remove this photo?')) {
                    const newList = attachments.filter((_, idx) => idx !== activeAttachmentIndex);
                    setAttachments(newList);
                    if (newList.length === 0) {
                      setShowAttachmentsPreview(false);
                    } else {
                      setActiveAttachmentIndex(Math.max(0, activeAttachmentIndex - 1));
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.92)',
                  border: '1px solid #FECACA',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  zIndex: 3,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>

              {attachments.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveAttachmentIndex((prev) => (prev === 0 ? attachments.length - 1 : prev - 1))
                    }
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.9)',
                      border: '1px solid #E2E8F0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveAttachmentIndex((prev) => (prev === attachments.length - 1 ? 0 : prev + 1))
                    }
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.9)',
                      border: '1px solid #E2E8F0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  >
                    ▶
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowAttachMenu(true)}
                title="Attach another photo"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 14px',
                  background: 'var(--w)',
                  color: '#475569',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up-mini"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add more
              </button>
              <button
                type="button"
                onClick={() => setShowAttachmentsPreview(false)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up-mini"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
