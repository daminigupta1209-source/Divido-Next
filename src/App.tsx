import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Login } from './components/Login';
import { supabase } from './lib/supabaseClient';
import { Sidebar } from './components/Sidebar';
import { GroupDetail } from './components/GroupDetail';
import { GroupsView } from './components/GroupsView';
import { CreateGroupView } from './components/CreateGroupView';
function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return React.lazy(() =>
    factory().catch((err) => {
      console.error('[Divido] Lazy chunk load failed:', err);
      const msg = err?.message || '';
      const isChunkError =
        msg.includes('dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch');

      if (isChunkError && typeof window !== 'undefined') {
        const reloaded = sessionStorage.getItem('divido_chunk_reloaded');
        if (!reloaded) {
          sessionStorage.setItem('divido_chunk_reloaded', '1');
          window.location.reload();
          return new Promise<never>(() => {});
        }
      }
      throw err;
    })
  );
}

// Lazy-loaded heavy screens/modals: only fetched when the user actually opens
// them, keeping the initial app bundle (and first paint) smaller.
const MasterSummary = safeLazy(() => import('./components/MasterSummary').then((m) => ({ default: m.MasterSummary })));
const FriendsView = safeLazy(() => import('./components/FriendsView').then((m) => ({ default: m.FriendsView })));
const Analytics = safeLazy(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const ActivityStudio = safeLazy(() => import('./components/ActivityStudio').then((m) => ({ default: m.ActivityStudio })));
const Profile = safeLazy(() => import('./components/Profile').then((m) => ({ default: m.Profile })));
const ExpenseModal = safeLazy(() => import('./components/ExpenseModal').then((m) => ({ default: m.ExpenseModal })));
// QR modals pull in the qrcode library — keep it out of the main bundle by
// loading these only when a user actually opens a payment/QR popup.
const UPIQRModal = safeLazy(() => import('./components/UPIQRModal').then((m) => ({ default: m.UPIQRModal })));
const NetReceivableModal = safeLazy(() => import('./components/NetReceivableModal').then((m) => ({ default: m.NetReceivableModal })));
import { Group, Expense, PendingMatchPrompt, GlobalSettleData, ConfirmState } from './lib/types';
import { CurrencyConverterModal } from './components/CurrencyConverterModal';
import { AddFriendModal } from './components/AddFriendModal';
import { MatchPromptModal } from './components/MatchPromptModal';
import { PostExpenseShareSheet, getUnregisteredParticipantShares } from './components/PostExpenseShareSheet';
import { SearchableCurrencyPicker } from './components/SearchableCurrencyPicker';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PremiumConfirm } from './components/PremiumConfirm';
import { escManager } from './lib/escManager';
import { SettleModal } from './components/SettleModal';
import { NetPayableModal } from './components/NetPayableModal';
import { CurrencySetupModal } from './components/CurrencySetupModal';
import { GroupGallery } from './components/GroupGallery';
import { checkIfDemoMode } from './lib/demoMode';
import { ensureArray, ensureObject, isLegacyRenameLog, formatCompactAmount, genGroupId, genExpenseId, titleCaseName } from './lib/utils';
import { getPersonKey } from './lib/identity';
import { useSupabaseSync, getGidRemap } from './hooks/useSupabaseSync';
import { BalanceActionCard } from './components/BalanceActionCard';
import { useAppHotkeys } from './hooks/useAppHotkeys';
import { useUndoStack } from './hooks/useUndoStack';
import { MobileHeader } from './components/MobileHeader';
import { InstallPrompt } from './components/InstallPrompt';
import { useExportCSV } from './hooks/useExportCSV';
import { AppNotification, fetchNotifications, markAllNotificationsRead, subscribeNotifications, clearAllNotifications } from './lib/notifications';
import { calculateNextOccurrenceDate, simplifyMultiCurrencyDebts, computeRawPairwiseTransactions } from './lib/calculations';

const pageDescriptions: Record<string, string> = {
  summary: "Track net balances, scan bills, and quickly settle with friends.",
  groups: "View, rename, and manage your group ledgers.",
  friends: "See your total balances across all circles and settle up directly.",
  activity: "View a chronological log of all expenses and settlements.",
  analytics: "Analyze your spending breakdowns and monthly trends.",
  profile: "Manage your settings, currency preferences, and payment details.",
  detail: "View members, track expenses, and settle debts for this group."
};

// Editable amount box for the settle view. Owns its own text state so typing is
// smooth (no cursor jumps, no cross-row edits from parent re-renders). Commits
// the raw text to the parent for calculations; enforces the max on blur.
const SettleAmountInput: React.FC<{
  inputId: string;
  amount: number | string;
  maxAmt: number;
  disabled: boolean;
  shake: boolean;
  currency?: string;
  onCommit: (v: number | string) => void;
  onExceed: () => void;
}> = ({ inputId, amount, maxAmt, disabled, shake, currency, onCommit, onExceed }) => {
  const toStr = (a: number | string) =>
    a === '' || a == null ? '' : String(typeof a === 'number' ? Math.round(a * 100) / 100 : a);
  const ref = React.useRef<HTMLInputElement>(null);
  const lastTyped = React.useRef<string>(toStr(amount));
  // Show the amount as plain text until tapped; only then mount the real input.
  // No live input on screen = no keypad and no OS autofill bar just from the
  // settle sheet appearing. Tapping enters edit mode (a user gesture, so the
  // keypad opens); blurring returns to text.
  const [editing, setEditing] = React.useState(false);
  // UNCONTROLLED input: the browser owns the text and caret, so no React
  // re-render can ever move the cursor or clear/cross-wire the field while you
  // type. We only push the DOM value from the prop when it changed externally
  // (e.g. the Max button) AND the field isn't focused — never mid-type.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const s = toStr(amount);
    if (s !== lastTyped.current && el.value !== s) {
      el.value = s;
      lastTyped.current = s;
    }
  }, [amount]);

  const currStr = currency || '';
  const paddingLeft = Math.max(20, currStr.length * 8 + 12);
  const valLen = Math.max(toStr(amount).length, 4);
  const inputWidth = Math.max(90, paddingLeft + valLen * 8 + 14);

  const boxStyle: React.CSSProperties = {
    width: `${inputWidth}px`,
    maxWidth: '135px',
    height: '32px',
    padding: `0 8px 0 ${paddingLeft}px`,
    margin: 0,
    borderRadius: '8px',
    border: `1.5px solid ${shake ? '#EF4444' : '#CBD5E1'}`,
    background: disabled ? '#F1F5F9' : '#FFFFFF',
    fontSize: '13px',
    fontWeight: 700,
    color: '#1E293B',
    outline: 'none',
    textAlign: 'left',
    boxSizing: 'border-box',
    transition: 'width 0.15s ease, padding 0.15s ease',
  };

  // Plain-text display until tapped — this is what keeps the keypad and the
  // OS autofill bar from appearing merely because the settle sheet opened.
  if (!editing) {
    return (
      <div
        onClick={() => { if (!disabled) setEditing(true); }}
        style={{ ...boxStyle, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'text' }}
      >
        {toStr(amount) || '0'}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      id={inputId}
      type="search"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck="false"
      data-1p-ignore
      data-lpignore="true"
      autoFocus
      defaultValue={toStr(amount)}
      disabled={disabled}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const v = e.target.value;
        // Reject invalid characters — revert to the last good value.
        if (!(v === '' || /^\d*\.?\d*$/.test(v))) {
          e.target.value = lastTyped.current;
          return;
        }
        const cleaned = v.replace(/^0+(?=\d)/, '');
        const num = parseFloat(cleaned) || 0;
        // Block going above the owed amount immediately (shake for feedback).
        // Reducing (backspace) is always allowed since it can't exceed the max.
        if (num > maxAmt) {
          e.target.value = lastTyped.current;
          onExceed();
          return;
        }
        if (cleaned !== v) e.target.value = cleaned;
        lastTyped.current = cleaned;
        onCommit(cleaned);
      }}
      style={boxStyle}
    />
  );
};

const getSavedUiState = () => {
  try {
    const st = window.history.state;
    if (st && st._divido && st.uiState) {
      return st.uiState;
    }
    const saved = sessionStorage.getItem('divido_ui_state');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return null;
};

function App() {
  const initialSavedState = React.useMemo(() => getSavedUiState(), []);

  const [theme, setTheme] = useState<'lavender' | 'sunset'>(() => {
    const saved = localStorage.getItem('divido_theme');
    return saved === 'lavender' || saved === 'sunset' ? saved : 'lavender';
  });
  const [view, setView] = useState<string>(() => initialSavedState?.view || 'summary');
  const [selectedId, setSelectedId] = useState<string | number | null>(() => initialSavedState?.selectedId ?? null);
  const [editingGroupId, setEditingGroupId] = useState<string | number | null>(null);
  const [groupDetailTab, setGroupDetailTab] = useState<'expenses' | 'balances' | 'photos'>(() => initialSavedState?.groupDetailTab || 'expenses');
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState<boolean>(false);
  const [showGalleryFilters, setShowGalleryFilters] = useState<boolean>(false);
  const [showCurrPickerId, setShowCurrPickerId] = useState<string | null>(null);
  const [showExpModal, setShowExpModal] = useState<boolean>(() => !!initialSavedState?.showExpModal);
  const [autoOpenScanner, setAutoOpenScanner] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(() => !!initialSavedState?.showAddFriendModal);
  const [showFriendsList, setShowFriendsList] = useState<boolean>(() => !!initialSavedState?.showFriendsList);
  const [addFriendShareOnly, setAddFriendShareOnly] = useState<boolean>(false);
  // Prefer the phone's native share sheet (all apps open directly). Only fall
  // back to the in-app share popup when the device has no Web Share (desktop).
  const openGroupShareLink = async () => {
    const link = `${window.location.origin}/?joinGroupId=${selectedId || 'STANDALONE'}`;
    const grp = groups.find((g) => String(g.id) === String(selectedId));
    const grpName = grp?.name;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: grpName ? `Join "${grpName}" on Divido` : 'Join my group on Divido',
          text: `Hey! Join ${grpName ? `"${grpName}"` : 'my group'} on Divido to split expenses 💸`,
          url: link,
        });
        return;
      } catch {
        // User dismissed the share sheet (or it failed) — do nothing.
        return;
      }
    }
    setAddFriendShareOnly(true);
    setShowAddFriendModal(true);
  };
  const [matchPrompt, setMatchPrompt] = useState<PendingMatchPrompt | null>(null);
  const [showMembersHealth, setShowMembersHealth] = useState<boolean>(() => !!initialSavedState?.showMembersHealth);
  const [globalSettleData, setGlobalSettleData] = useState<GlobalSettleData | null>(() => initialSavedState?.globalSettleData || null);
  const [showSettleModal, setShowSettleModal] = useState<boolean>(() => !!initialSavedState?.showSettleModal);
  const [editingSettle, setEditingSettle] = useState<Expense | null>(() => initialSavedState?.editingSettle || null);
  const [localSettleEdits, setLocalSettleEdits] = useState<any[]>([]);
  // Row index whose amount box should shake (user tried to exceed the max).
  const [settleShakeIdx, setSettleShakeIdx] = useState<number | null>(null);
  const [qrModalData, setQrModalData] = useState<{ payee: string; amt: number; currency: string; requestFrom?: string } | null>(() => initialSavedState?.qrModalData || null);
  const [isGroupsExpanded, setIsGroupsExpanded] = useState<boolean>(false);
  const [showConvertModalId, setShowConvertModalId] = useState<string | number | null>(() => initialSavedState?.showConvertModalId || null);
  const [analyticsGroupId, setAnalyticsGroupId] = useState<string | number | null>(() => initialSavedState?.analyticsGroupId ?? null);
  const [showGroupSettleList, setShowGroupSettleList] = useState<boolean>(() => !!initialSavedState?.showGroupSettleList);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    show: false,
    title: '',
    desc: '',
    onConfirm: null,
    type: 'danger',
  });
  // Drives the bespoke leave / remove / write-off card (BalanceActionCard).
  const [balanceCard, setBalanceCard] = useState<null | {
    title: string;
    desc: string;
    primaryLabel: string;
    primaryColor: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  }>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [postExpenseShareData, setPostExpenseShareData] = useState<{
    expense: Expense;
    group: Group;
    unregisteredShares: { name: string; shareAmount: number }[];
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const [showRejoinRequestModal, setShowRejoinRequestModal] = useState(false);
  const [adminRejoinRequest, setAdminRejoinRequest] = useState<{
    id: string;
    groupId: string | number;
    groupName: string;
    placeholderName: string;
    requestName: string;
    requestEmail: string;
  } | null>(null);

  const checkPastMemberAndShowRejoin = (showModal = true) => {
    if (view === 'detail' && selectedId && selectedId !== 'STANDALONE') {
      const selectedGroup = groups.find((g) => String(g.id) === String(selectedId));
      const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      const isPastMember = selectedGroup?.members?.some(m => {
        const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
        return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
      });
      if (isPastMember) {
        if (showModal) setShowRejoinRequestModal(true);
        return true;
      }
    }
    return false;
  };

  const setGlobalSettleDataSecure = (data: { name: string; gId?: string | number | null } | null) => {
    if (data && checkPastMemberAndShowRejoin(true)) return;
    setGlobalSettleData(data);
  };

  const setShowExpModalSecure = (show: boolean) => {
    if (show && checkPastMemberAndShowRejoin(true)) return;
    const hasClaimedIdentity = selectedId && localStorage.getItem(`divido_identity_${selectedId}`);
    if (show && !userEmail && !hasClaimedIdentity) {
      alert('Secure Google Sign-In is required to add or edit expenses. Redirecting you to the Profile page to sign in securely!');
      sessionStorage.setItem('divido_highlight_signin', 'true');
      setView('profile');
      return;
    }
    setShowExpModal(show);
  };

  const setEditingExpenseSecure = (exp: Expense | null) => {
    if (exp && checkPastMemberAndShowRejoin(true)) return;
    const hasClaimedIdentity = selectedId && localStorage.getItem(`divido_identity_${selectedId}`);
    if (exp && !userEmail && !hasClaimedIdentity) {
      alert('Secure Google Sign-In is required to add or edit expenses. Redirecting you to the Profile page to sign in securely!');
      sessionStorage.setItem('divido_highlight_signin', 'true');
      setView('profile');
      return;
    }
    setEditingExpense(exp);
  };

  // Past members are view-only: opening the Add Friend modal nudges them to rejoin.
  const setShowAddFriendModalSecure = (show: boolean) => {
    if (show && checkPastMemberAndShowRejoin(true)) return;
    setShowAddFriendModal(show);
  };

  const setShowSettleModalSecure = (show: boolean) => {
    if (show && checkPastMemberAndShowRejoin(true)) return;
    setShowSettleModal(show);
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const savedAuth = localStorage.getItem('divido_authenticated');
    if (savedAuth === 'true') return true;
    const savedName = localStorage.getItem('divido_username');
    if (savedName && savedName !== 'You' && savedName !== 'undefined') {
      localStorage.setItem('divido_authenticated', 'true');
      return true;
    }
    return false;
  });
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>(() => {
    if (localStorage.getItem('divido_e2e_testing') === 'true' && localStorage.getItem('divido_force_logged_out') !== 'true') {
      return localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app';
    }
    return localStorage.getItem('divido_email') || '';
  });
  const [feedback, setFeedback] = useState<string>('');
  
  // Link request modal state
  const [linkRequestGroup, setLinkRequestGroup] = useState<any | null>(null);
  const [linkRequestPlaceholders, setLinkRequestPlaceholders] = useState<any[]>([]);
  // True when the claim card is shown because THIS user's email is already a
  // (past) member of the group — i.e. a rejoin. In that case we hide the "join
  // as a new member" option (the app already knows who they are).
  const [linkRequestRejoinMode, setLinkRequestRejoinMode] = useState<boolean>(false);
  const [submittingLinkRequest, setSubmittingLinkRequest] = useState<boolean>(false);
  // Name the invitee types when they aren't in the invite list and want to join
  // as a brand-new member (the claim card would otherwise dead-end on Cancel).
  const [joinNewName, setJoinNewName] = useState<string>('');
  // True while we resolve an invite link (fetch the group + members + session)
  // before deciding whether to show the claim card, admit the user, etc. Seeded
  // synchronously so the home feed never flashes behind the pending claim card.
  const [isResolvingInvite, setIsResolvingInvite] = useState<boolean>(() => {
    try {
      if (checkIfDemoMode()) return false;
      const param = new URLSearchParams(window.location.search).get('joinGroupId');
      // A group id is now a permanent UUID string; any non-empty, non-STANDALONE
      // value is a real invite target (no more numeric/temp-float validation).
      if (param && param !== 'STANDALONE') return true;
      const savedRaw = localStorage.getItem('divido_pending_join');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved?.groupId && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) return true;
      }
    } catch { /* fall through to no-gate */ }
    return false;
  });
  const [tempName, setTempName] = useState<string>(() => {
    const saved = localStorage.getItem('divido_username');
    return saved && saved !== 'You' && saved !== 'undefined' ? saved : '';
  });

  const [userMetadata, setUserMetadata] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem('divido_usermetadata');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : {};
  });
  const [userName, setUserName] = useState<string>(() => {
    const saved = localStorage.getItem('divido_username');
    return saved && saved !== 'undefined' ? saved : 'You';
  });
  // Logged-in user's Supabase auth id + a gate that blocks profile-saving until
  // the server profile has been loaded (so a fresh device doesn't overwrite the
  // account's real profile with its empty local defaults on first login).
  const [userId, setUserId] = useState<string | null>(null);
  const profileSyncReady = useRef(false);

  // Dynamically resolve active identity (me) for the selected group (Tricount cookie fallback)
  const me = (() => {
    if (selectedId && selectedId !== 'STANDALONE') {
      const activeClaim = localStorage.getItem(`divido_identity_${selectedId}`);
      if (activeClaim) return activeClaim;
    }
    return userName.split(' ')[0];
  })();

  const [headerRenaming, setHeaderRenaming] = useState(false);
  const [headerNewName, setHeaderNewName] = useState('');
  const [headerNameError, setHeaderNameError] = useState('');

  const [showInfo, setShowInfo] = useState(false);
  const [activeReminderName, setActiveReminderName] = useState<string | null>(null);
  const [activeRejoinLink, setActiveRejoinLink] = useState<string | null>(null);
  const [mobileShowGroupOptionsMenu, setMobileShowGroupOptionsMenu] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [homeSearchNonce, setHomeSearchNonce] = useState(0);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isHeaderSearchActive, setIsHeaderSearchActive] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    if (view !== 'analytics') {
      setAnalyticsGroupId(null);
    }
    setShowInfo(false);
  }, [view, selectedId]);

  // Entering a group always defaults to the Activities tab. Keyed on selectedId
  // only (not view), so tapping "Settle" — which changes the tab but not the
  // selected group — is left alone; but leaving to home and re-entering the
  // group resets it, instead of re-showing the Settle page.
  const prevSelectedIdRef = React.useRef(selectedId);
  useEffect(() => {
    if (prevSelectedIdRef.current !== selectedId) {
      prevSelectedIdRef.current = selectedId;
      if (selectedId && selectedId !== 'STANDALONE') {
        setGroupDetailTab('expenses');
      }
    }
  }, [selectedId]);

  // Hide the header on scroll-down, reveal it the moment you scroll up (MakeMyTrip-style).
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const cur = el.scrollTop;
      if (cur < 12) setHeaderHidden(false);          // always show at the very top
      else if (cur > last + 5) setHeaderHidden(true);  // scrolling down → hide
      else if (cur < last - 5) setHeaderHidden(false); // scrolling up a little → reveal
      last = cur;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isAuthenticated]);

  // Always reveal the header and reset scroll position when switching pages or groups.
  useEffect(() => {
    setHeaderHidden(false);
    window.scrollTo(0, 0);
    const scrollEl = document.querySelector('.main-content');
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [view, selectedId]);

  const isNavigatingHistory = React.useRef(false);

  // When a name being added already exists elsewhere, ask whether it's the same
  // person. "Same" links to that person's identity (via divido_person_link, which
  // the sync layer consumes on insert); "Different" gets a fresh id by default.
  // Declared here (above the history effects) so the back-gesture system can
  // register it and dismiss the prompt on a back-swipe.
  const [samePersonPrompt, setSamePersonPrompt] = useState<null | {
    groupId: string | number;
    queue: { name: string; candidates: { identity: string; name: string; groups: string[] }[] }[];
    index: number;
    addNames: string[];
  }>(null);

  // Helper to get current UI state for history syncing
  const getUiState = () => ({
    view,
    selectedId,
    // groupDetailTab is intentionally NOT tracked in history: switching tabs
    // (Activities/Settle/Photos) is not "navigation", so it must not add back
    // entries — otherwise the OS back-swipe walks through the tabs instead of
    // leaving the group. Tabs are switched by tap or the content swipe; back
    // exits the group in one go.
    showExpModal,
    showSettleModal,
    showAddFriendModal,
    showGroupSettleList,
    showMembersHealth,
    qrModalData,
    showConvertModalId,
    showNotifPanel,
    mobileShowGroupOptionsMenu,
    editingSettle,
    globalSettleData,
    showFriendsList,
    // samePersonPrompt is intentionally NOT tracked in history: it's a transient
    // prompt, and tracking it made dismissing it push a state so a back-swipe
    // reopened it (an endless popup on every swipe). Back always just closes it.
    analyticsGroupId,
    confirmState: {
      show: confirmState?.show || false,
      title: confirmState?.title || '',
      desc: confirmState?.desc || '',
      type: confirmState?.type || '',
    },
  });

  // 1. Listen for browser popstate and apply to React states
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // If any overlay (modal / panel / sheet / prompt) is open, a back-swipe
      // must close THAT first — never take the top-level shortcut below, or the
      // back would skip past the open modal (the "needs 2 swipes" bug: from
      // Balances, quick-expense modal open, first swipe jumped to Home instead
      // of closing the modal).
      const anyOverlayOpen =
        showExpModal || showSettleModal || showAddFriendModal || showGroupSettleList ||
        showMembersHealth || showNotifPanel || mobileShowGroupOptionsMenu ||
        !!qrModalData || !!showConvertModalId || !!editingSettle || !!globalSettleData ||
        !!(confirmState && confirmState.show) || !!samePersonPrompt;
      // A back-swipe from a top-level bottom-nav screen (All balances, All
      // Activities, Global Analytics, Profile) goes to the Home screen (groups),
      // not to whatever screen happened to be underneath.
      const onTopLevelScreen =
        !anyOverlayOpen && (
          view === 'friends' || view === 'activity' || view === 'profile' ||
          (view === 'analytics' && (analyticsGroupId === null || analyticsGroupId === 'ALL')));
      if (onTopLevelScreen) {
        isNavigatingHistory.current = true;
        setView('summary');
        setSelectedId(null);
        try {
          sessionStorage.setItem('divido_ui_state', JSON.stringify({ ...getUiState(), view: 'summary', selectedId: null }));
        } catch {}
        return;
      }
      const st = e.state;
      if (st && st._divido && st.uiState) {
        isNavigatingHistory.current = true;
        const ui = st.uiState;
        
        setView(ui.view || 'summary');
        setSelectedId(ui.selectedId ?? null);
        if (ui.groupDetailTab) setGroupDetailTab(ui.groupDetailTab);
        setShowExpModal(!!ui.showExpModal);
        setShowSettleModal(!!ui.showSettleModal);
        setShowAddFriendModal(!!ui.showAddFriendModal);
        setShowGroupSettleList(!!ui.showGroupSettleList);
        setShowMembersHealth(!!ui.showMembersHealth);
        setQrModalData(ui.qrModalData || null);
        setShowConvertModalId(ui.showConvertModalId || null);
        setShowNotifPanel(!!ui.showNotifPanel);
        setMobileShowGroupOptionsMenu(!!ui.mobileShowGroupOptionsMenu);
        setEditingSettle(ui.editingSettle || null);
        setGlobalSettleData(ui.globalSettleData || null);
        setShowFriendsList(!!ui.showFriendsList);
        // Back always dismisses the transient same-person prompt (never restores it).
        setSamePersonPrompt(null);
        if (ui.analyticsGroupId !== undefined) setAnalyticsGroupId(ui.analyticsGroupId);
        setConfirmState({ show: false });

        try {
          sessionStorage.setItem('divido_ui_state', JSON.stringify(ui));
        } catch {}
      } else {
        const currentUi = getUiState();
        window.history.pushState({ _divido: true, uiState: currentUi }, '');
        try {
          sessionStorage.setItem('divido_ui_state', JSON.stringify(currentUi));
        } catch {}
      }
    };

    window.addEventListener('popstate', onPopState);

    // Seed initial state
    if (!window.history.state?._divido) {
      const initialUi = getUiState();
      window.history.replaceState({ _divido: true, uiState: initialUi }, '');
      try {
        sessionStorage.setItem('divido_ui_state', JSON.stringify(initialUi));
      } catch {}
    }

    return () => window.removeEventListener('popstate', onPopState);
  }, [
    view, selectedId, groupDetailTab, showExpModal, showSettleModal, showAddFriendModal,
    showGroupSettleList, showMembersHealth, qrModalData, showConvertModalId,
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, samePersonPrompt, analyticsGroupId, confirmState
  ]);

  // 2. Watch for user changes and push states
  useEffect(() => {
    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }

    const cur = window.history.state;
    const currentUi = getUiState();

    // Count how many overlays (modals / panels / sheets) are open in a UI snapshot.
    // Used to detect a "pure close" so we can consume the modal's history entry
    // instead of pushing a new one (which a back-swipe would restore = reopen).
    const overlayCount = (ui: any) => [
      ui.showExpModal, ui.showSettleModal, ui.showAddFriendModal, ui.showGroupSettleList,
      ui.showMembersHealth, ui.showNotifPanel, ui.mobileShowGroupOptionsMenu,
      !!ui.qrModalData, !!ui.showConvertModalId, !!ui.editingSettle, !!ui.globalSettleData,
      !!(ui.confirmState && ui.confirmState.show),
    ].filter(Boolean).length;

    if (cur?._divido && cur.uiState) {
      const prev = cur.uiState;
      const isSameId = (a: any, b: any) => {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        return String(a) === String(b);
      };

      const hasChanged =
        prev.view !== currentUi.view ||
        !isSameId(prev.selectedId, currentUi.selectedId) ||
        prev.showExpModal !== currentUi.showExpModal ||
        prev.showSettleModal !== currentUi.showSettleModal ||
        prev.showAddFriendModal !== currentUi.showAddFriendModal ||
        prev.showGroupSettleList !== currentUi.showGroupSettleList ||
        prev.showMembersHealth !== currentUi.showMembersHealth ||
        JSON.stringify(prev.qrModalData) !== JSON.stringify(currentUi.qrModalData) ||
        prev.showConvertModalId !== currentUi.showConvertModalId ||
        prev.showNotifPanel !== currentUi.showNotifPanel ||
        prev.mobileShowGroupOptionsMenu !== currentUi.mobileShowGroupOptionsMenu ||
        prev.showFriendsList !== currentUi.showFriendsList ||
        !isSameId(prev.analyticsGroupId, currentUi.analyticsGroupId) ||
        JSON.stringify(prev.editingSettle) !== JSON.stringify(currentUi.editingSettle) ||
        JSON.stringify(prev.globalSettleData) !== JSON.stringify(currentUi.globalSettleData) ||
        JSON.stringify(prev.confirmState) !== JSON.stringify(currentUi.confirmState);

      if (!hasChanged) return;

      // A "pure close": still on the same screen, but fewer overlays are open
      // than the entry we're sitting on. Rather than push a forward state (which
      // a back-swipe would restore, reopening the just-closed modal), step BACK
      // to consume that modal's history entry. This is what makes back-swipe
      // feel normal across the whole app.
      const sameScreen =
        prev.view === currentUi.view &&
        isSameId(prev.selectedId, currentUi.selectedId) &&
        prev.showFriendsList === currentUi.showFriendsList &&
        isSameId(prev.analyticsGroupId, currentUi.analyticsGroupId);
      if (sameScreen && overlayCount(currentUi) < overlayCount(prev)) {
        window.history.back();
        return;
      }
    }

    window.history.pushState({ _divido: true, uiState: currentUi }, '');
    try {
      sessionStorage.setItem('divido_ui_state', JSON.stringify(currentUi));
    } catch {}
  }, [
    view, selectedId, groupDetailTab, showExpModal, showSettleModal, showAddFriendModal,
    showGroupSettleList, showMembersHealth, qrModalData, showConvertModalId,
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, samePersonPrompt, analyticsGroupId, confirmState
  ]);

  // Keep the focused input visible above the on-screen keyboard. On mobile the
  // keyboard covers the lower part of the screen, hiding fields like "Add friend"
  // so you can't see what you're typing. When any input/textarea gains focus,
  // scroll it into the middle of the visible area after the keyboard has opened.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
      // Wait for the keyboard's open animation, then bring the field into view.
      window.setTimeout(() => {
        try {
          if (document.activeElement === el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        } catch { /* older browsers */ }
      }, 300);
    };
    window.addEventListener('focusin', onFocusIn);
    return () => window.removeEventListener('focusin', onFocusIn);
  }, []);

  // Header search should never linger — close it when leaving the home / settle pages.
  useEffect(() => {
    if (view !== 'summary' && view !== 'friends' && isHeaderSearchActive) {
      setIsHeaderSearchActive(false);
      setGlobalSearchQuery('');
    }
  }, [view, isHeaderSearchActive]);

  // Close the header search when tapping anywhere outside it.
  useEffect(() => {
    if (!isHeaderSearchActive) return;
    const close = () => { setIsHeaderSearchActive(false); setGlobalSearchQuery(''); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [isHeaderSearchActive]);

  // Load notifications for the signed-in user and keep them live.
  useEffect(() => {
    if (!userEmail) {
      setNotifications([]);
      return;
    }
    fetchNotifications(userEmail).then(setNotifications);
    const unsub = subscribeNotifications(userEmail, (n) => {
      setNotifications((prev) => (prev.some((p) => String(p.id) === String(n.id)) ? prev : [n, ...prev]));
    });
    return unsub;
  }, [userEmail]);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenNotifications = () => {
    setShowNotifPanel(true);
    if (unreadNotifCount > 0 && userEmail) {
      markAllNotificationsRead(userEmail);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
  };

  const handleClearNotifications = async () => {
    if (userEmail) {
      await clearAllNotifications(userEmail);
      setNotifications([]);
    }
  };


  const handleNotificationClick = (n: AppNotification) => {
    setShowNotifPanel(false);
    if (n.groupId && n.groupId !== 'STANDALONE') {
      setSelectedId(n.groupId);
      setView('detail');
    } else if (n.type === 'reminder' || n.type === 'payment_request') {
      setView('friends');
    }
  };

  // Resolve a friend's login email (if they've joined) from their membership rows,
  // then send them an in-app notification. Best-effort — silently no-ops if unknown.
  const notifyFriend = async (
    friendName: string,
    payload: { type: 'reminder' | 'payment_request'; title: string; body?: string; amount?: number | null; currency?: string | null; groupId?: string | number | null }
  ) => {
    if (checkIfDemoMode() || !friendName) return;
    try {
      const { pushNotification } = await import('./lib/notifications');
      const { data } = await supabase
        .from('group_members')
        .select('user_email')
        .eq('name', friendName)
        .not('user_email', 'is', null)
        .limit(1);
      const recipientEmail = data?.[0]?.user_email;
      if (!recipientEmail) return;
      await pushNotification({
        recipientEmail,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        fromName: userName,
        fromEmail: userEmail,
        groupId: payload.groupId ?? null,
        amount: payload.amount ?? null,
        currency: payload.currency ?? null,
      });
    } catch (err) {
      console.error('notifyFriend failed:', err);
    }
  };

  // Apply a confirmed name change everywhere: member row, all historical expenses
  // (paid + splitters), local identity, and let the other members know.
  const applyRename = async (groupId: string | number, oldName: string, newName: string) => {
    if (!oldName || !newName || oldName === newName) return;
    // Rename a member's key inside a shares/origShares map (used by Unequally /
    // Percentage splits). Previously these were NOT rewritten on rename, so the
    // renamed person's share got orphaned and their balance broke.
    const renameShareKey = (obj: Record<string, number> | undefined | null, oldN: string, newN: string) => {
      if (!obj || !(oldN in obj)) return obj;
      const next: Record<string, number> = {};
      for (const k of Object.keys(obj)) next[k === oldN ? newN : k] = obj[k];
      return next;
    };
    try {
      // 1. Member row
      await supabase.from('group_members').update({ name: newName, pending_name: null }).eq('group_id', groupId).ilike('name', oldName);

      // 2. Historical expenses in this group (DB) — paid, splitters AND shares
      const { data: exps } = await supabase.from('expenses').select('*').eq('group_id', groupId);
      for (const e of exps || []) {
        const paidNew = e.paid === oldName ? newName : e.paid;
        const splittersNew = Array.isArray(e.splitters) ? e.splitters.map((s: string) => (s === oldName ? newName : s)) : e.splitters;
        const sharesNew = renameShareKey(e.shares, oldName, newName);
        if (
          paidNew !== e.paid ||
          JSON.stringify(splittersNew) !== JSON.stringify(e.splitters) ||
          JSON.stringify(sharesNew) !== JSON.stringify(e.shares)
        ) {
          await supabase.from('expenses').update({ paid: paidNew, splitters: splittersNew, shares: sharesNew }).eq('id', e.id);
        }
      }

      // 3. Local state (paid, splitters, shares, origShares)
      setExpenses((prev) => prev.map((e) => (String(e.gId) === String(groupId)
        ? {
            ...e,
            paid: e.paid === oldName ? newName : e.paid,
            splitters: (e.splitters || []).map((s) => (s === oldName ? newName : s)),
            shares: renameShareKey(e.shares, oldName, newName) as any,
            origShares: renameShareKey(e.origShares, oldName, newName) as any,
          }
        : e)));
      setGroups((prev) => prev.map((g) => (String(g.id) === String(groupId)
        ? { ...g, members: (g.members || []).map((m) => (m === oldName ? newName : m)) }
        : g)));

      // 4. Local identity (if this device is the renamed person)
      const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      const cleanOld = oldName.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      if (cleanOld === cleanMe || localStorage.getItem(`divido_identity_${groupId}`) === oldName) {
        localStorage.setItem(`divido_identity_${groupId}`, newName);
        localStorage.setItem('divido_username', newName);
        setUserName(newName);
      }

      // 5. Let the other joined members know (via notification only — a name
      // change should not clutter the group's expense/activity feed).
      try {
        const { pushNotification } = await import('./lib/notifications');
        const grp = groups.find((g) => String(g.id) === String(groupId));
        const { data: mems } = await supabase
          .from('group_members')
          .select('user_email, name')
          .eq('group_id', groupId)
          .not('user_email', 'is', null);
        for (const m of mems || []) {
          if (m.user_email === userEmail || m.name === newName) continue;
          await pushNotification({
            recipientEmail: m.user_email,
            type: 'group_add',
            title: `${oldName} is now ${newName}`,
            body: `Name updated in ${grp?.name || 'your group'}`,
            groupId,
          });
        }
      } catch (e) {
        console.error('rename broadcast failed:', e);
      }

      setGroups((prev) => [...prev]);
    } catch (err) {
      console.error('applyRename failed:', err);
    }
  };

  // The renamed user accepts the admin's proposed name.
  const handleAcceptRename = async (notif: AppNotification) => {
    if (!notif.groupId || !userEmail) return;
    const { data } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', notif.groupId)
      .eq('user_email', userEmail)
      .limit(1);
    const row = data?.[0];
    if (row?.pending_name) {
      await applyRename(notif.groupId, row.name, row.pending_name);
    }
    setNotifications((prev) => prev.filter((x) => String(x.id) !== String(notif.id)));
    setShowNotifPanel(false);
  };

  // The renamed user rejects — keep the old name, just clear the proposal.
  const handleRejectRename = async (notif: AppNotification) => {
    if (notif.groupId && userEmail) {
      await supabase
        .from('group_members')
        .update({ pending_name: null })
        .eq('group_id', notif.groupId)
        .eq('user_email', userEmail);
    }
    setNotifications((prev) => prev.filter((x) => String(x.id) !== String(notif.id)));
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setMobileShowGroupOptionsMenu(false);
    };
    window.addEventListener('click', handleGlobalClick);
  }, []);

  // Derive the user's preferred default currency from their metadata
  // On first use, auto-detect from timezone or browser locale (e.g. en-AE → AED, en-NG → NGN)
  const myDefaultCurrency = (() => {
    const saved = userMetadata[me]?.defaultCurrency;
    if (saved) return saved;
    // Auto-detect on first launch
    try {
      // 1. Timezone detection (high confidence for India)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && (tz.toLowerCase().includes('kolkata') || tz.toLowerCase().includes('calcutta') || tz.toLowerCase().includes('india'))) {
        return '₹';
      }

      // 2. Fallback to browser locale
      const locale = navigator.language || navigator.languages?.[0] || 'en-IN';
      const region = locale.split('-')[1]?.toUpperCase() || 'IN';
      const regionToCurrency: Record<string, string> = {
        IN: '₹',  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KD', BH: 'BD', OM: 'RO',
        US: '$',  CA: 'CA$', AU: 'A$', NZ: 'NZ$', SG: 'S$', HK: 'HK$',
        GB: '£',  EU: '€', DE: '€', FR: '€', IT: '€', ES: '€', NL: '€',
        JP: '¥',  CN: 'CN¥', KR: '₩',
        NG: '₦',  GH: 'GH₵', KE: 'KSh', ZA: 'R',  EG: '£',  MA: 'MAD',
        PK: '₨',  BD: '৳',  LK: 'Rs',  NP: 'Rs',
        MX: 'MX$', BR: 'R$', AR: '$', CO: '$',
        TH: '฿',  VN: '₫', ID: 'Rp', PH: '₱', MY: 'RM',
        RU: '₽',  TR: '₺', CH: 'CHF', SE: 'kr', NO: 'kr', DK: 'kr',
      };
      return regionToCurrency[region] || '₹';
    } catch {
      return '₹';
    }
  })();

  // Popups for net settlements from global settle modal
  const [netPayablePopup, setNetPayablePopup] = useState<{ friendName: string; amt: number; curr: string } | null>(null);
  const [netReceivablePopup, setNetReceivablePopup] = useState<{ friendName: string; amt: number; curr: string } | null>(null);

  // First-run currency setup (Rec 1): ask once, then persist so we never guess.
  const [currencySetupDismissed, setCurrencySetupDismissed] = useState(false);
  // Convert-currency modal on the Settle All page, triggered from the header icon.
  const [showFriendsConvert, setShowFriendsConvert] = useState(false);

  const handleOpenPayablePopup = (friendName: string, amt: number, curr: string) => {
    setNetPayablePopup({ friendName, amt, curr });
  };

  const handleOpenReceivablePopup = (friendName: string, amt: number, curr: string) => {
    // Build the reminder message (+ a tappable UPI pay link when it's an INR
    // debt and a UPI id is set — UPI is INR-only, so skip the link otherwise).
    const myUpi = localStorage.getItem('divido_global_upi_id') || userMetadata[me]?.upiId || '';
    const isINR = curr === '₹';
    const baseMsg = `Hey ${friendName}, just a quick reminder to settle our net balance of ${curr}${amt.toFixed(2)} on Divido.${myUpi ? ` Pay me at UPI: ${myUpi}` : ''} Thank you!`;
    const upiLink = (myUpi && isINR)
      ? `upi://pay?pa=${myUpi.trim()}&pn=${encodeURIComponent(me)}&am=${amt.toFixed(2)}&cu=INR&tn=Divido Settle`
      : '';
    const shareMessage = upiLink ? `${baseMsg}\n\nPay instantly: ${upiLink}` : baseMsg;

    const nativeShare = typeof navigator !== 'undefined' && (navigator as any).share;

    // Keep the mobile keyboard from popping up over the modal. After the share
    // sheet closes the browser tries to refocus the last settle amount input,
    // which re-opens the keyboard. Blur now, and for a short window afterwards
    // immediately blur anything that grabs focus (a one-shot focus guard).
    try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch {}
    const focusGuard = (ev: FocusEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        try { t.blur(); } catch {}
      }
    };
    document.addEventListener('focusin', focusGuard, true);
    window.setTimeout(() => document.removeEventListener('focusin', focusGuard, true), 1200);

    // Mobile: open the phone's own share sheet FIRST — before any other work —
    // so nothing consumes the tap's user-activation (that caused the first tap
    // to no-op and only the second to work).
    if (nativeShare) {
      try {
        (navigator as any).share({ title: 'Divido reminder', text: shareMessage }).catch(() => {});
      } catch { /* older browsers */ }
    }

    // In-app reminder notification (fire-and-forget) after the share is launched.
    notifyFriend(friendName, {
      type: 'reminder',
      title: `${userName} sent you a reminder`,
      body: `Please settle ${curr}${amt.toFixed(0)}`,
      amount: amt,
      currency: curr,
    });

    // Desktop / no native share: fall back to the in-app reminder card (with QR).
    if (!nativeShare) {
      setNetReceivablePopup({ friendName, amt, curr });
    }
  };

  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const saved = localStorage.getItem('divido_groups');
      const savedName = localStorage.getItem('divido_username');
      const dName = savedName && savedName !== 'undefined' ? savedName : 'You';
      const myFirstName = dName.split(' ')[0];
      const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
      const seenIds = new Set<any>();
      const uniqueParsed = parsed.filter((g: any) => {
        if (!g.id) return false;
        // Group ids are permanent and unique — dedupe by id regardless of type.
        if (seenIds.has(String(g.id))) return false;
        seenIds.add(String(g.id));
        return true;
      });
      return uniqueParsed.map((g: any) => {
        const members = Array.isArray(g.members) ? Array.from(new Set(g.members)) : [myFirstName || 'You'];
        return { 
          ...g, 
          members, 
          currency: g.currency || '₹',
          simplifyDebts: g.simplifyDebts !== undefined ? g.simplifyDebts : false
        };
      });
    } catch (e) {
      return [];
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem('divido_expenses');
      const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
      return parsed.filter((e: any) => !isLegacyRenameLog(e)).map((e: any) => {
        const splitters = ensureArray(e.splitters);
        const shares = ensureObject(e.shares);
        return { ...e, splitters, shares, amt: parseFloat(e.amt) || 0 };
      });
    } catch (e) {
      return [];
    }
  });
  
  // Always-current mirror of `groups` so deferred callbacks (e.g. the delayed
  // remove-sweep) can read the latest state instead of a stale closure.
  const groupsRef = useRef(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // Live heal: when a group's temporary id is remapped to a permanent Supabase id,
  // re-link any expense still carrying the old temp id (e.g. one saved during the
  // remap window). Without this it stays stranded until a reload — unmatched by its
  // group and skipped for cloud insert. Runs on group changes; no-ops when nothing
  // needs remapping, so it can't loop.
  useEffect(() => {
    const gidMap = getGidRemap();
    if (!gidMap || Object.keys(gidMap).length === 0) return;
    setExpenses((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        const mapped = gidMap[String(e.gId)];
        if (mapped != null && String(mapped) !== String(e.gId)) {
          changed = true;
          return { ...e, gId: mapped };
        }
        return e;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const { handleMobileExportCSV } = useExportCSV({ groups, expenses, selectedId });
  const { undoStack, deleteExpense, performUndo } = useUndoStack({ expenses, setExpenses });
  const deleteExpenseSecure = (id: string | number) => {
    if (checkPastMemberAndShowRejoin(true)) return;
    deleteExpense(id);
  };
  const [newlyAddedFriends, setNewlyAddedFriends] = useState<string[]>([]);
  const [activeSplitters, setActiveSplitters] = useState<string[]>([]);

  const updateUserName = async (newName: string) => {
    const cleanNew = newName.trim();
    if (!cleanNew) return;

    // Update the account display name immediately.
    setUserName(cleanNew);
    localStorage.setItem('divido_username', cleanNew);

    // Propagate: your profile name is your identity, so rename YOUR OWN entry in
    // every group you belong to — member row AND your references in past
    // expenses (paid/splitters/shares) — then sync, so everyone sees the new
    // name. applyRename does the balance-safe rewrite; we only ever touch our
    // own name. (Reverses the old account-only "Option 3": names now flow from
    // the profile, per the agreed profile-name-is-identity design.)
    const myEmail = (userEmail || '').toLowerCase();
    const clashedGroups: string[] = [];
    for (const g of groups) {
      if (!g || g.id === 'STANDALONE') continue;
      // This device's current name in the group: the per-group claimed identity,
      // else the member whose hidden identity resolves to my email.
      let oldName = '';
      try { oldName = localStorage.getItem(`divido_identity_${g.id}`) || ''; } catch { /* ignore */ }
      if (!oldName && myEmail) {
        const mi = g.memberIdentities || {};
        const match = (g.members || []).find((m) => (mi[m] || '').toLowerCase() === myEmail);
        if (match) oldName = match.replace(/\s*\(Left\)$/i, '');
      }
      if (!oldName) continue;
      if (oldName.toLowerCase() === cleanNew.toLowerCase()) continue; // no real change
      // Never collide with a DIFFERENT existing member in this group.
      const clash = (g.members || []).some((m) => {
        const cm = m.replace(/\s*\(Left\)$/i, '');
        return cm.toLowerCase() === cleanNew.toLowerCase() && cm.toLowerCase() !== oldName.toLowerCase();
      });
      if (clash) {
        clashedGroups.push(g.name);
        continue;
      }
      await applyRename(g.id, oldName, cleanNew);
    }
    // Tell the user if the name couldn't be applied in some groups because
    // someone there already uses it — otherwise the skip is silently confusing.
    if (clashedGroups.length > 0) {
      alert(
        `Your name was updated, but not in ${clashedGroups.length === 1 ? 'this group' : 'these groups'} because "${cleanNew}" is already a member there:\n\n` +
        clashedGroups.join(', ') +
        `\n\nUse a slightly different name, or ask that member to rename.`
      );
    }
  };

  const guestIdentitiesLinkedRef = useRef<string | null>(null);

  // When a user signs in after having claimed a guest identity, adopt those
  // unlinked guest membership rows into their account so the groups load by email
  // (across reloads and devices). Idempotent: once linked, the rows have an email
  // and are skipped. Runs before setIsAuthenticated so the first load sees them.
  const linkGuestIdentities = async (email: string) => {
    if (!email || guestIdentitiesLinkedRef.current === email) return;
    guestIdentitiesLinkedRef.current = email;
    try {
      const items: { groupId: string; claimedName: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('divido_identity_')) continue;
        const groupId = key.replace('divido_identity_', '');
        const claimedName = localStorage.getItem(key);
        if (groupId && groupId !== 'STANDALONE' && claimedName) {
          items.push({ groupId, claimedName });
        }
      }
      if (items.length === 0) return;

      const groupIds = Array.from(new Set(items.map((it) => it.groupId)));
      const { data: rows } = await supabase
        .from('group_members')
        .select('id, group_id, name, user_email')
        .in('group_id', groupIds);

      if (!rows || rows.length === 0) return;

      const toUpdateIds: number[] = [];
      for (const item of items) {
        const matched = rows.find(
          (r: any) =>
            String(r.group_id) === String(item.groupId) &&
            r.name.trim().toLowerCase() === item.claimedName.trim().toLowerCase()
        );
        if (matched) {
          const currentDbEmail = matched.user_email;
          if (!currentDbEmail || currentDbEmail.startsWith('guest-') || currentDbEmail.includes('@divido.app')) {
            toUpdateIds.push(matched.id);
          }
        }
      }

      if (toUpdateIds.length > 0) {
        await supabase
          .from('group_members')
          .update({ user_email: email, is_pending: false })
          .in('id', toUpdateIds);
      }
    } catch (e) {
      console.error('Failed to link guest identities to account:', e);
    }
  };

  // Load the account-level profile (name, UPI, currency, photo, budgets) from
  // Supabase so it is consistent across every device the user signs in on.
  const loadProfileFromSupabase = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, upi_id, default_currency, profile_photo, budgets')
        .eq('id', uid)
        .maybeSingle();
      if (!error && data) {
        if (data.full_name) {
          setUserName(data.full_name);
          localStorage.setItem('divido_username', data.full_name);
        }
        const key = (data.full_name || userName).split(' ')[0];
        if (data.upi_id) localStorage.setItem('divido_global_upi_id', data.upi_id);
        setUserMetadata((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            ...(data.upi_id ? { upiId: data.upi_id } : {}),
            ...(data.default_currency ? { defaultCurrency: data.default_currency } : {}),
            ...(data.profile_photo ? { profilePhoto: data.profile_photo } : {}),
            ...(data.budgets ? { budgets: data.budgets } : {}),
          },
        }));
      }
    } catch (e) {
      console.error('Failed to load profile from Supabase:', e);
    } finally {
      // Allow the save-effect to run only after we've attempted a load.
      profileSyncReady.current = true;
    }
  };

  useEffect(() => {
    try { sessionStorage.removeItem('divido_chunk_reloaded'); } catch {}
  }, []);

  useEffect(() => {
    // Listen to changes in auth state from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUserEmail(session.user?.email || '');
        const saved = localStorage.getItem('divido_username');
        if (!saved || saved === 'You' || saved === 'undefined' || saved === 'Guest') {
          const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
          updateUserName(userFullName);
        }
        // Await background linking so database has user_email set before sync fetches
        if (session.user?.email) {
          await linkGuestIdentities(session.user.email);
        }
        if (session.user?.id) {
          setUserId(session.user.id);
          await loadProfileFromSupabase(session.user.id);
        }
        setIsAuthenticated(true);
        localStorage.setItem('divido_authenticated', 'true');
      } else {
        if (localStorage.getItem('divido_e2e_testing') === 'true' && localStorage.getItem('divido_force_logged_out') !== 'true') {
          setIsAuthenticated(true);
          setUserEmail(localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app');
        } else {
          const guestEmail = localStorage.getItem('divido_email');
          if (guestEmail && guestEmail.startsWith('guest-')) {
            setIsAuthenticated(true);
            setUserEmail(guestEmail);
          } else {
            setIsAuthenticated(false);
            localStorage.removeItem('divido_authenticated');
            setUserEmail('');
          }
        }
      }
    });

    // Check current session once on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUserEmail(session.user?.email || '');
        const saved = localStorage.getItem('divido_username');
        if (!saved || saved === 'You' || saved === 'undefined' || saved === 'Guest') {
          const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
          updateUserName(userFullName);
        }
        // Await background linking so database has user_email set before sync fetches
        if (session.user?.email) {
          await linkGuestIdentities(session.user.email);
        }
        if (session.user?.id) {
          setUserId(session.user.id);
          await loadProfileFromSupabase(session.user.id);
        }
        setIsAuthenticated(true);
        localStorage.setItem('divido_authenticated', 'true');
      } else if (localStorage.getItem('divido_e2e_testing') === 'true' && localStorage.getItem('divido_force_logged_out') !== 'true') {
        setIsAuthenticated(true);
        setUserEmail(localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app');
      } else {
        const guestEmail = localStorage.getItem('divido_email');
        if (guestEmail && guestEmail.startsWith('guest-')) {
          setIsAuthenticated(true);
          setUserEmail(guestEmail);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // useLayoutEffect so the settle items populate BEFORE the modal paints —
  // otherwise the footer briefly shows one button then flips to two once items
  // load, making the reminder button visibly jump.
  useLayoutEffect(() => {
    if (globalSettleData) {
      const initial: any[] = [];
      const baseName = globalSettleData.name;

      // When opened from the Friends list, globalSettleData carries the tapped
      // person's identity and their specific groups (by name). Two people who
      // share a name (e.g. two "Didi" in different groups) are distinct identities
      // with distinct group lists — so restrict the breakdown to THIS person's
      // groups instead of merging every same-named member across all groups.
      const targetGroupNames: string[] | null =
        Array.isArray(globalSettleData.groups) && globalSettleData.groups.length > 0
          ? globalSettleData.groups.map((n: string) => String(n))
          : null;

      const allVirtualGroups = [
        { id: 'STANDALONE', name: 'Non-Group Expenses', members: [] as string[], currency: '₹' },
        ...groups,
      ].filter((g) => {
        if (globalSettleData.gId !== undefined && globalSettleData.gId !== null) {
          return String(g.id) === String(globalSettleData.gId);
        }
        if (targetGroupNames) {
          return targetGroupNames.includes(String(g.name));
        }
        return true;
      });

      allVirtualGroups.forEach((g) => {
        const isStandalone = g.id === 'STANDALONE';
        // Resolve THIS group's member name for the tapped identity. A merged
        // person can appear under a different name in each group, so matching a
        // single name would miss some groups (e.g. showing only Denmark and
        // dropping Zilo). Fall back to the tapped name when no identity match.
        const resolveId = (nm: string) => getPersonKey(g, nm);
        const m = (globalSettleData.identity && !isStandalone
          ? (g.members || []).find((nm) => resolveId(nm) === globalSettleData.identity)
          : null) || baseName;
        // Resolve BOTH sides by identity key so the "involves us" match works even
        // when the user's own name in this group differs from the flat home-screen
        // `me` (per-group claimed identity), or names differ only by case. Without
        // this, the settle sheet found no items and rendered empty.
        let myG = me;
        try { const claim = localStorage.getItem(`divido_identity_${g.id}`); if (claim) myG = claim; } catch { /* ignore */ }
        const myKey = getPersonKey(g, myG);
        const mKey = (globalSettleData.identity && !isStandalone) ? globalSettleData.identity : getPersonKey(g, m);
        const groupExps = expenses.filter((e) => String(e.gId) === String(g.id));
        const members = isStandalone
          ? Array.from(new Set([
              me,
              ...expenses
                .filter((e) => e && String(e.gId) === 'STANDALONE')
                .reduce((acc, e) => {
                  if (e.paid) acc.add(e.paid);
                  if (Array.isArray(e.splitters)) {
                    e.splitters.forEach((s) => acc.add(s));
                  }
                  return acc;
                }, new Set<string>())
            ]))
          : g.members || [];

        // 1. Calculate payback plan for this group
        const pairDebts: Record<string, Record<string, number>> = {};
        groupExps.forEach((e) => {
          const splitters = e.splitters || members;
          const c = e.currency || g.currency || '₹';
          splitters.forEach((s) => {
            if (s !== e.paid) {
              const amtVal =
                !e.mode || e.mode === 'Equally'
                  ? e.amt / (splitters.length || 1)
                  : e.mode === 'Unequally'
                  ? parseFloat(e.shares?.[s]?.toString() || '0')
                  : (e.amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
              if (amtVal > 0.01) {
                // \x1f delimiter so member names containing '-' (e.g. "Jean-Paul")
                // survive the split below. Matches calculations.ts.
                const key = `${s}\x1f${e.paid}`;
                if (!pairDebts[key]) pairDebts[key] = {};
                pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
              }
            }
          });
        });

        const rawTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
        const processedPairs = new Set<string>();

        Object.keys(pairDebts).forEach((key) => {
          const [from, to] = key.split('\x1f');
          const reverseKey = `${to}\x1f${from}`;
          if (processedPairs.has(key)) return;
          const currencies = new Set([
            ...Object.keys(pairDebts[key] || {}),
            ...Object.keys(pairDebts[reverseKey] || {}),
          ]);

          const balances: Record<string, number> = {};
          currencies.forEach((c) => {
            const debt = pairDebts[key]?.[c] || 0;
            const credit = pairDebts[reverseKey]?.[c] || 0;
            const net = debt - credit;
            if (Math.abs(net) > 0.01) {
              balances[c] = net;
            }
          });

          if (Object.keys(balances).length > 0) {
            const hasOwed = Object.values(balances).some((v) => v > 0.01);
            const hasOwe = Object.values(balances).some((v) => v < -0.01);

            if (hasOwed && !hasOwe) {
              rawTransactions.push({ from, to, balances });
            } else if (hasOwe && !hasOwed) {
              const inverted: Record<string, number> = {};
              Object.entries(balances).forEach(([k, v]) => {
                inverted[k] = -v;
              });
              rawTransactions.push({ from: to, to: from, balances: inverted });
            } else if (hasOwed && hasOwe) {
              rawTransactions.push({ from, to, balances });
            }
          }
          processedPairs.add(key);
          processedPairs.add(reverseKey);
        });

        const useSimplify = g.id !== 'STANDALONE' && !!g.simplifyDebts;
        const groupPlan = useSimplify
          ? simplifyMultiCurrencyDebts(members, groupExps, g.currency || '₹')
          : rawTransactions;

        // 2. Find transactions involving me and m
        const relevantExps = groupExps.filter((e) => {
          const splitters =
            e.splitters ||
            (isStandalone ? Array.from(new Set(e.splitters || [])) : g.members) ||
            [];
          const paidKey = getPersonKey(g, e.paid);
          const splitterKeys = splitters.map((s) => getPersonKey(g, s));
          return (
            (paidKey === myKey && splitterKeys.includes(mKey)) ||
            (paidKey === mKey && splitterKeys.includes(myKey))
          );
        });

        groupPlan.forEach((t) => {
          const fromKey = getPersonKey(g, t.from);
          const toKey = getPersonKey(g, t.to);
          const involvesUs = (fromKey === myKey && toKey === mKey) || (fromKey === mKey && toKey === myKey);

          if (involvesUs) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              const absVal = Math.abs(val);
              if (absVal > 0.01) {
                // val > 0: money flows t.from -> t.to; val < 0: the reverse direction for this currency
                const payer = val > 0 ? t.from : t.to;
                const receiver = val > 0 ? t.to : t.from;

                const currencyExps = relevantExps.filter(
                  (e) => (e.currency || g.currency || '₹') === curr
                );
                const lastExp = currencyExps[currencyExps.length - 1] || relevantExps[relevantExps.length - 1];
                const summary = lastExp
                  ? `Last: ${lastExp.title} (${curr}${lastExp.amt})`
                  : 'Ongoing balance';

                initial.push({
                  gId: g.id,
                  gName: g.name,
                  curr: curr,
                  amt: Math.round(absVal * 100) / 100,
                  maxAmt: Math.round(absVal * 100) / 100,
                  paidBy: payer,
                  receivedBy: receiver,
                  selected: true,
                  summary: `${currencyExps.length || relevantExps.length} activities • ${summary}`,
                });
              }
            });
          }
        });
      });
      setLocalSettleEdits(initial);
    } else {
      setLocalSettleEdits([]);
    }
  }, [globalSettleData, groups, expenses, me]);



  const handleFinalGlobalSettle = () => {
    const newSettlements = localSettleEdits
      .filter((it) => it.selected && it.amt > 0)
      .map((it) => ({
        // Deterministic id so two devices (or a double-tap) recording the SAME
        // settlement — same pair, currency, amount, day — converge to ONE row
        // instead of two cancelling entries that double-reverse the balance
        // (mirrors performWriteOff). The amount is part of the key, so two
        // genuinely-different payments to the same person on the same day stay
        // distinct; only exact duplicates collapse.
        id: `settle-${String(it.gId)}-${it.paidBy}-${it.receivedBy}-${it.curr}-${Math.round((parseFloat(it.amt) || 0) * 100)}-${new Date().toISOString().split('T')[0]}`,
        gId: it.gId,
        title: `✅ Settlement: ${it.paidBy} paid ${it.receivedBy}`,
        amt: parseFloat(it.amt) || 0,
        paid: it.paidBy,
        splitters: [it.receivedBy],
        date: new Date().toISOString().split('T')[0],
        notes: '',
        currency: it.curr,
        category: '✅',
        mode: 'Equally' as const,
        shares: {},
      }));
    // Functional update: never write a stale `expenses` array here — a realtime
    // reload from the other device may have changed it since render, and the
    // spread-of-stale form would drop those changes.
    setExpenses((prev) => [...newSettlements, ...prev]);

    // Notify the other person that a settlement was recorded with them
    if (newSettlements.length > 0 && globalSettleData?.name) {
      const totals: Record<string, number> = {};
      newSettlements.forEach((s) => { totals[s.currency] = (totals[s.currency] || 0) + s.amt; });
      const amtStr = Object.entries(totals).map(([c, v]) => `${c}${v.toFixed(0)}`).join(', ');
      notifyFriend(globalSettleData.name, {
        type: 'payment_request',
        title: `${userName} settled up with you`,
        body: `Recorded a settlement of ${amtStr}`,
        groupId: newSettlements[0].gId,
      });
    }

    setGlobalSettleData(null);
  };



  const isModalOpen = !!(
    showExpModal ||
    showAddFriendModal ||
    showMembersHealth ||
    globalSettleData ||
    showCurrPickerId ||
    undoStack.length > 0
  );
  useEffect(() => {
    if (isModalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
  }, [isModalOpen]);

  // Startup Auto-Log Engine for Recurring Expenses
  const hasAutoLoggedRef = useRef(false);
  useEffect(() => {
    if (hasAutoLoggedRef.current) return;
    hasAutoLoggedRef.current = true;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const newSpawned: Expense[] = [];
    let templateUpdated = false;
    // Ids that already exist anywhere, so a given occurrence is spawned at most
    // once. Each occurrence gets a DETERMINISTIC id (template id + its date), so
    // if two devices spawn the same month they collapse to one row (same id)
    // instead of duplicating the charge.
    const existingIds = new Set(expenses.map((x) => String(x.id)));

    const finalExpenses = expenses.map((e) => {
      if (e.isRecurring && e.recurrence && e.recurrence !== 'none' && e.nextOccurrence) {
        let currentNext = e.nextOccurrence;
        const startNext = currentNext;

        // Loop as long as nextOccurrence is <= today
        while (currentNext <= todayStr) {
          const occId = `recur-${e.id}-${currentNext}`;
          if (!existingIds.has(occId)) {
            newSpawned.push({
              ...e,
              id: occId,
              date: currentNext,
              isRecurring: false,
              recurrence: undefined,
              nextOccurrence: undefined,
            });
            existingIds.add(occId);
          }
          currentNext = calculateNextOccurrenceDate(currentNext, e.recurrence);
        }

        // Advance the template past everything processed, even if nothing new
        // was spawned (occurrences already existed) — otherwise it retries forever.
        if (currentNext !== startNext) {
          templateUpdated = true;
          return { ...e, nextOccurrence: currentNext };
        }
      }
      return e;
    });

    if (templateUpdated) {
      setExpenses([...newSpawned, ...finalExpenses]);
      if (newSpawned.length > 0) {
        setToastMsg(`Successfully generated ${newSpawned.length} recurring expense${newSpawned.length > 1 ? 's' : ''}! 🔄`);
        setTimeout(() => setToastMsg(null), 5000);
      }
    }
  }, [expenses]);

  useEffect(() => {
    const unnamedWithActivity = groups.filter((g) => {
      if (g.id === 'STANDALONE') return false;
      const hasName = g.name && g.name.trim() !== '';
      if (hasName) return false;

      const hasExpenses = expenses.some((e) => String(e.gId) === String(g.id));
      const hasOtherMembers = g.members && g.members.length > 1;
      return hasExpenses || hasOtherMembers;
    });

    if (unnamedWithActivity.length > 0) {
      let hasChanged = false;
      const assignedNames = new Set(groups.map((x) => x.name.trim().toLowerCase()).filter(Boolean));
      const updated = groups.map((g) => {
        if (g.id !== 'STANDALONE' && (!g.name || g.name.trim() === '')) {
          const hasExpenses = expenses.some((e) => String(e.gId) === String(g.id));
          const hasOtherMembers = g.members && g.members.length > 1;
          if (hasExpenses || hasOtherMembers) {
            let candidateName = 'Untitled Group';
            if (assignedNames.has(candidateName.toLowerCase())) {
              let counter = 1;
              while (assignedNames.has(`untitled group ${counter}`)) {
                counter++;
              }
              candidateName = `Untitled Group ${counter}`;
            }
            assignedNames.add(candidateName.toLowerCase());
            hasChanged = true;
            return { ...g, name: candidateName };
          }
        }
        return g;
      });

      if (hasChanged) {
        setGroups(updated);
      }
    }
  }, [groups, expenses]);

  // Repair duplicate group IDs. If two groups share the same id, the app can't tell
  // them apart, so renaming/deleting one would affect both. Give later duplicates a
  // fresh unique id so every group is independent again.
  useEffect(() => {
    const seen = new Set<string>();
    let changed = false;
    const repaired = groups.map((g) => {
      const key = String(g.id);
      if (g.id !== 'STANDALONE' && seen.has(key)) {
        changed = true;
        return { ...g, id: genGroupId(), pendingSync: true };
      }
      seen.add(key);
      return g;
    });
    if (changed) setGroups(repaired);
  }, [groups]);

  useEffect(() => {
    // Find a pending rejoin request in groups where the current user is the Admin
    for (const g of groups) {
      if (g.id === 'STANDALONE') continue;
      const activeMembers = (g.members || []).filter((m) => !m.endsWith(' (Left)'));
      const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      const isPastMemberOfG = (g.members || []).some(m => {
        const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
        return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
      });
      const isAdminOfGroup = !isPastMemberOfG && (activeMembers[0] === me || activeMembers[0] === 'You');
      if (isAdminOfGroup && g.pendingLinkRequests && g.pendingLinkRequests.length > 0) {
        // Find one where placeholderName ends with ' (Left)'
        const rejoinReq = g.pendingLinkRequests.find(r => r.placeholderName.endsWith(' (Left)'));
        if (rejoinReq) {
          setAdminRejoinRequest({
            id: String(rejoinReq.id),
            groupId: g.id,
            groupName: g.name,
            placeholderName: rejoinReq.placeholderName,
            requestName: rejoinReq.requestName,
            requestEmail: rejoinReq.requestEmail,
          });
          break; // Show one at a time
        }
      }
    }
  }, [groups, me]);

  useEffect(() => {
    localStorage.setItem('divido_usermetadata', JSON.stringify(userMetadata));
  }, [userMetadata]);
  useEffect(() => {
    localStorage.setItem('divido_username', userName);
  }, [userName]);

  // Save the account-level profile back to Supabase (debounced) whenever the
  // name, UPI, currency, photo, or budgets change — so all devices stay in sync.
  // Gated on profileSyncReady so we never push empty local defaults before the
  // server profile has loaded on a fresh device.
  useEffect(() => {
    // Only write the profile when actually signed in. Without the isAuthenticated
    // gate, a lingering userId (from a prior session) fires this on the login
    // screen and the DB rejects it (401 / RLS) — noisy and pointless.
    if (!isAuthenticated || !userId || !profileSyncReady.current) return;
    const key = userName.split(' ')[0];
    const md = userMetadata[key] || {};
    const upi = md.upiId || localStorage.getItem('divido_global_upi_id') || null;
    const payload = {
      id: userId,
      full_name: userName || null,
      upi_id: upi,
      default_currency: md.defaultCurrency || null,
      profile_photo: md.profilePhoto || null,
      budgets: md.budgets || null,
      updated_at: new Date().toISOString(),
    };
    const t = window.setTimeout(() => {
      supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('Failed to save profile to Supabase:', error);
        });
    }, 800);
    return () => clearTimeout(t);
  }, [isAuthenticated, userId, userName, userMetadata]);
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('divido_theme', theme);
  }, [theme]);

  // Automatically configure default currency on onboarding to remove barriers
  useEffect(() => {
    if (isAuthenticated && me && userMetadata[me] && !userMetadata[me].defaultCurrency) {
      setUserMetadata((prev) => ({
        ...prev,
        [me]: { ...prev[me], defaultCurrency: myDefaultCurrency }
      }));
      localStorage.setItem('divido_currency_setup_seen_' + me, '1');
    }
  }, [isAuthenticated, me, userMetadata[me]?.defaultCurrency, myDefaultCurrency]);
  useEffect(() => {
    localStorage.setItem('divido_groups', JSON.stringify(groups));
  }, [groups]);
  useEffect(() => {
    localStorage.setItem('divido_expenses', JSON.stringify(expenses));
  }, [expenses]);

  const { syncStatus, isInitialLoadDone } = useSupabaseSync({
    groups,
    setGroups,
    expenses,
    setExpenses,
    selectedId,
    setSelectedId,
    isAuthenticated,
    me,
    setMatchPrompt,
    userEmail,
  });

  // One-time auto-repair for expenses left behind by the old hard-delete bug:
  // a member who was in an expense could be removed from the group entirely,
  // leaving their name inside the expense (paid/splitters/shares) with no
  // matching member — a "phantom" that shows a leftover share nobody can see or
  // fix (e.g. "Hot Bath" showing ₹5 for a member who vanished). Here we scan
  // each group's expenses and re-add any referenced name that isn't a current
  // member (case-insensitively), with its EXACT stored spelling, so the expense
  // reconnects and the balance is whole again. Runs once per load; no-ops when
  // there's nothing to repair, and never touches names already present.
  // One-time heal for legacy write-off entries created before the label change:
  // strip the old "🧾 Written off: X → Y" title / leftover notes / category so
  // they show a single clean "Written off" line (no emoji, no duplicate chip).
  const writeOffHealDoneRef = useRef(false);
  useEffect(() => {
    if (!isInitialLoadDone || writeOffHealDoneRef.current) return;
    writeOffHealDoneRef.current = true;
    setExpenses((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        const t = typeof e.title === 'string' ? e.title : '';
        const isWriteOff = t.startsWith('🧾 Written off') || t === 'Written off';
        const needsHeal = isWriteOff && (t !== 'Written off' || !!e.notes || !!e.category);
        if (needsHeal) {
          changed = true;
          return { ...e, title: 'Written off', notes: '', category: '' };
        }
        return e;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialLoadDone]);

  const phantomRepairDoneRef = useRef(false);
  useEffect(() => {
    if (!isInitialLoadDone || phantomRepairDoneRef.current) return;
    phantomRepairDoneRef.current = true;
    const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    const norm = (n: string) => n.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    setGroups((prevGroups) => {
      let changed = false;
      const next = prevGroups.map((g) => {
        if (!g || g.id === 'STANDALONE') return g;
        const known = new Set([meClean, ...(g.members || []).map(norm)]);
        const missing: string[] = [];
        const seenMissing = new Set<string>();
        expenses.forEach((e) => {
          if (String(e.gId) !== String(g.id)) return;
          const consider = (raw?: string) => {
            if (!raw || raw === 'SYSTEM' || raw === 'STANDALONE') return;
            const key = norm(raw);
            if (known.has(key) || seenMissing.has(key)) return;
            seenMissing.add(key);
            missing.push(raw);
          };
          consider(e.paid);
          if (Array.isArray(e.splitters)) e.splitters.forEach(consider);
          if (e.shares) Object.keys(e.shares).forEach(consider);
        });
        if (missing.length === 0) return g;
        changed = true;
        // A name found ONLY in expenses (not on the roster) is historical — a
        // participant who was removed but whose expenses remain. Surface them in
        // Past Members (tombstoned "(Left)"), never as a fresh pending invite you
        // would think you still need to chase. This keeps balances correct
        // without resurrecting removed people into the active/pending list.
        const missingLeft = missing.map((n) => `${n.replace(/\s*\(Left\)$/i, '').trim()} (Left)`);
        return {
          ...g,
          members: [...(g.members || []), ...missingLeft],
        };
      });
      return changed ? next : prevGroups;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialLoadDone]);

  // Safety net: never keep the branded splash up forever. If the first cloud
  // load stalls, hide it after 5s and show whatever we have.
  const [bootLoaderExpired, setBootLoaderExpired] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setBootLoaderExpired(true), 5000);
    return () => window.clearTimeout(t);
  }, []);

  useAppHotkeys({
    groups,
    showMembersHealth,
    setShowMembersHealth,
    showDeleteAccountModal,
    setShowDeleteAccountModal,
    setFeedback,
    globalSettleData,
    setGlobalSettleData,
    localSettleEdits,
    me,
  });

  const handleMatch = async (newMemberRecordId: string, placeholderId: string | null) => {
    if (!matchPrompt) return;
    if (placeholderId) {
      await supabase.from('group_members').update({
        user_email: matchPrompt.newMemberEmail,
        name: matchPrompt.newMemberName,
        is_pending: false,
      }).eq('id', placeholderId);
      await supabase.from('group_members').delete().eq('id', newMemberRecordId);
    }
    setMatchPrompt(null);
    setGroups((prev) => [...prev]);
  };

  // Safe Account Linking Invite Landing
  useEffect(() => {
    if (checkIfDemoMode()) { setIsResolvingInvite(false); return; }
    const joinGroupFromQuery = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        let joinGroupId = urlParams.get('joinGroupId');
        const fromUrl = !!joinGroupId;

        // Resume an invite that was interrupted by the Google sign-in redirect:
        // the ?joinGroupId= param is lost across OAuth, so we fall back to the
        // intent we saved when the invite link was opened. Expires after 15 min
        // so a stale claim card can never resurface on unrelated future visits.
        if (!joinGroupId) {
          try {
            const savedRaw = localStorage.getItem('divido_pending_join');
            if (savedRaw) {
              const saved = JSON.parse(savedRaw);
              if (saved?.groupId && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) {
                joinGroupId = String(saved.groupId);
              } else {
                localStorage.removeItem('divido_pending_join');
              }
            }
          } catch { localStorage.removeItem('divido_pending_join'); }
        }

        if (!joinGroupId) return;

        // Group ids are permanent UUID strings now — any non-empty, non-STANDALONE
        // value is a valid join target.
        const isValidDbId = !!joinGroupId && String(joinGroupId) !== 'STANDALONE';
        if (!isValidDbId) return;

        // Persist the invite the moment the link is opened, BEFORE any sign-in.
        // This makes the claim survive a Google round-trip no matter how the
        // user signs in (not only via the claim-card button). Cleared below in
        // the direct-admit branches, and on claim/cancel.
        if (fromUrl) {
          try {
            localStorage.setItem('divido_pending_join', JSON.stringify({ groupId: joinGroupId, ts: Date.now() }));
          } catch { /* storage full — non-fatal */ }
        }

        // Fetch group
        const { data: groupData, error: groupErr } = await supabase
          .from('groups')
          .select('*')
          .eq('id', joinGroupId)
          .single();

        if (groupErr || !groupData) return;

        // Fetch members of the group
        const { data: existingMembers } = await supabase
          .from('group_members')
          .select('*')
          .eq('group_id', joinGroupId);

        if (!existingMembers) return;

        const rejoinName = urlParams.get('rejoinName');
        const { data: { session } } = await supabase.auth.getSession();
        const myEmail = session?.user?.email || userEmail;

        if (rejoinName && myEmail) {
          const matchLeftMember = existingMembers.find((m: any) =>
            m.name.toLowerCase() === (rejoinName + ' (Left)').toLowerCase()
          );
          if (matchLeftMember) {
            setLinkRequestRejoinMode(true);
            setLinkRequestGroup(groupData);
            setLinkRequestPlaceholders([matchLeftMember]);
            return;
          }
        }

        // Check if this logged-in user is a past member of this group (rejoin fallback)
        if (myEmail) {
          const leftMemberRow = existingMembers.find((m: any) => 
            m.user_email === myEmail && m.name.toLowerCase().endsWith(' (left)')
          );
          if (leftMemberRow) {
            setLinkRequestRejoinMode(true);
            setLinkRequestGroup(groupData);
            setLinkRequestPlaceholders([leftMemberRow]);
            return;
          }

          // If they are already an active member, direct them straight in
          const alreadyMember = existingMembers.some((m: any) => m.user_email === myEmail);
          if (alreadyMember) {
            localStorage.removeItem('divido_pending_join');
            setSelectedId(joinGroupId);
            setView('detail');
            // Clean URL parameters
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            return;
          }
        }

        // If this device has already claimed an identity in this group, don't show
        // the claim list again — just open the group as that identity. Prevents a
        // guest from re-opening the invite link and claiming someone else's name.
        const claimedIdentity = localStorage.getItem(`divido_identity_${joinGroupId}`);
        if (claimedIdentity) {
          const stillActive = existingMembers.some(
            (m: any) => m.name.toLowerCase() === claimedIdentity.toLowerCase() && !m.is_pending
          );
          if (stillActive) {
            localStorage.removeItem('divido_pending_join');
            setSelectedId(joinGroupId);
            setView('detail');
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            return;
          }
        }

        // Show selection list of unlinked pending members (placeholders)
        const placeholders = existingMembers.filter((m: any) => m.is_pending && !m.user_email && !m.link_request_email);
        // Prefill the "join as new member" name with the Google profile name, so
        // a signed-in invitee doesn't have to type it (they can still edit it).
        const rawGoogleName = (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '').trim();
        // Google names often arrive ALL CAPS ("VANDANA GUPTA"); normalize to
        // Title Case so they don't look shouty next to normally-cased names.
        const googleName = rawGoogleName.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
        if (googleName) setJoinNewName(googleName);
        setLinkRequestRejoinMode(false);
        setLinkRequestGroup(groupData);
        setLinkRequestPlaceholders(placeholders);
      } catch (err) {
        console.error('Landing error:', err);
      } finally {
        // Resolution finished (claim card shown, admitted, or nothing to do) —
        // drop the loading gate so the app renders its normal view.
        setIsResolvingInvite(false);
      }
    };

    joinGroupFromQuery();
  }, [groups]);

  // Safety net: never trap a friend on the invite loader if the round-trip
  // stalls (slow network, an early return). Fall through after a few seconds.
  useEffect(() => {
    if (!isResolvingInvite) return;
    const t = setTimeout(() => setIsResolvingInvite(false), 5000);
    return () => clearTimeout(t);
  }, [isResolvingInvite]);
  // Write off a past member's outstanding balance: record settlement-style
  // entries that cancel every pairwise amount they still have to pay/collect, so
  // their balance closes to zero (recorded as "written off", not silently
  // deleted). Reuses the app's pairwise math so the group's books stay balanced.
  const performWriteOff = (groupId: string | number, memberRow: string) => {
    const g = groups.find((x) => String(x.id) === String(groupId));
    if (!g) return;
    const cleanName = memberRow.replace(/\s*\(Left\)$/i, '');
    const groupExps = expenses.filter((e) => String(e.gId) === String(groupId));
    const members = Array.from(new Set((g.members || []).map((x) => x.replace(/\s*\(Left\)$/i, ''))));
    const txs = computeRawPairwiseTransactions(members, groupExps, g.currency || '₹');
    const today = new Date().toISOString().split('T')[0];
    const writeOffs: any[] = [];
    txs.forEach((t: any) => {
      if (t.from !== cleanName && t.to !== cleanName) return;
      Object.entries(t.balances as Record<string, number>).forEach(([curr, val]) => {
        const absVal = Math.abs(val);
        if (absVal <= 0.01) return;
        const payer = val > 0 ? t.from : t.to;
        const receiver = val > 0 ? t.to : t.from;
        writeOffs.push({
          // Deterministic id so two devices (or a double-tap) writing off the
          // SAME person/currency on the same day converge to ONE row instead of
          // creating duplicate cancelling entries that double-reverse the balance.
          id: `writeoff-${String(groupId)}-${payer}-${receiver}-${curr}-${today}`,
          timestamp: Date.now(),
          gId: groupId,
          title: 'Written off',
          amt: Math.round(absVal * 100) / 100,
          paid: payer,
          splitters: [receiver],
          date: today,
          notes: '',
          currency: curr,
          category: '',
          mode: 'Equally' as const,
          shares: {},
        });
      });
    });
    if (writeOffs.length === 0) return;
    setExpenses((prev) => [...writeOffs, ...prev]);
  };

  const handleDeleteGroup = (id: string | number) => {
    const isStandalone = String(id) === 'STANDALONE';
    const g = isStandalone
      ? { name: 'Non-Group Expenses', members: [] as string[] }
      : groups.find((x) => String(x.id) === String(id));
    if (!g) return;

    const isActiveMember = !isStandalone && g.members.some(m => m.toLowerCase() === me.toLowerCase());
    const cleanMe = me.replace(/\s*\(Left\)$/i, '').toLowerCase();
    const isPastMember = !isStandalone && !isActiveMember && g.members.some(m => {
      const cleanM = m.replace(/\s*\(Left\)$/i, '').toLowerCase();
      return (cleanM === cleanMe || cleanM.startsWith(cleanMe) || cleanMe.startsWith(cleanM)) && m.toLowerCase().endsWith(' (left)');
    });
    const hasOthers = !isStandalone && g.members && g.members.length > 1;

    if (isPastMember) {
      setConfirmState({
        show: true,
        title: 'Delete group?',
        desc: 'Delete group? You will lose access.',
        type: 'danger',
        onConfirm: async () => {
          if (!checkIfDemoMode() && isAuthenticated) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const myEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app' : null);
              if (myEmail) {
                await supabase
                  .from('group_members')
                  .update({ user_email: null })
                  .eq('group_id', id)
                  .eq('user_email', myEmail);
              }
            } catch (err) {
              console.error('Failed to unlink user membership on Supabase:', err);
            }
          }
          setGroups(groups.filter((x) => String(x.id) !== String(id)));
          if (String(selectedId) === String(id)) setView('summary');
          setConfirmState({ show: false });
        }
      });
      return;
    }

    // Warn (don't block) if you still have money to pay/collect here.
    // Lists every currency you have an outstanding amount in.
    let leaveBalLine = '';
    if (!isStandalone && hasOthers) {
      const myBal = getMemberBalance(id, me);
      const parts: string[] = [];
      for (const [cur, amt] of Object.entries(myBal)) {
        if (Math.abs(amt as number) >= 0.5) {
          parts.push(`${cur}${Math.abs(amt as number).toFixed(0)} to ${(amt as number) < 0 ? 'pay' : 'collect'}`);
        }
      }
      if (parts.length) leaveBalLine = ` You still have ${parts.join(', ')} here. It stays saved.`;
    }
    // Extracted so both the plain confirm (delete/standalone) and the bespoke
    // leave card run the exact same leave/delete logic.
    const performLeaveDelete = async () => {
        if (!isStandalone) {
          // Leaving is always allowed, even with an outstanding balance. The
          // member's row is kept as "(Left)" so their expenses/balances stay
          // intact for everyone, and they can be re-invited or request to rejoin.

          if (!checkIfDemoMode() && isAuthenticated) {
            try {
              if (hasOthers) {
                // 1. Rename membership row to preserve history, keep email, set is_pending = true
                await supabase
                  .from('group_members')
                  .update({
                    name: me + ' (Left)',
                    is_pending: true
                  })
                  .eq('group_id', id)
                  .eq('name', me);

                // Send push notification to Admin with only a single text line
                const activeMembers = (g.members || []).filter((m) => !m.endsWith(' (Left)'));
                const adminName = activeMembers.find(m => m !== me);
                if (adminName) {
                  const { data: adminRows } = await supabase
                    .from('group_members')
                    .select('user_email')
                    .eq('group_id', id)
                    .eq('name', adminName)
                    .not('user_email', 'is', null)
                    .limit(1);
                  const adminEmail = adminRows?.[0]?.user_email;
                  if (adminEmail) {
                    const { pushNotification } = await import('./lib/notifications');
                    await pushNotification({
                      recipientEmail: adminEmail,
                      type: 'admin_transfer',
                      title: `${me} left ${g.name}`,
                      groupId: id,
                    });
                  }
                }

                // 3. Admin handoff: the next active member becomes admin (admin is
                // the first non-left member). If the leaver was the admin, let the
                // new admin know they've been promoted.
                const iWasAdmin = activeMembers[0] === me || activeMembers[0] === 'You';
                const newAdminName = activeMembers.find((m) => m !== me);
                if (iWasAdmin && newAdminName) {
                  try {
                    const { data: rows } = await supabase
                      .from('group_members')
                      .select('user_email')
                      .eq('group_id', id)
                      .eq('name', newAdminName)
                      .not('user_email', 'is', null)
                      .limit(1);
                    const newAdminEmail = rows?.[0]?.user_email;
                    if (newAdminEmail) {
                      const { pushNotification } = await import('./lib/notifications');
                      await pushNotification({
                        recipientEmail: newAdminEmail,
                        type: 'admin_transfer',
                        title: `You're now the admin of ${g.name}`,
                        body: `${me} left the group, so you're the new group admin. You can invite members and approve rejoin requests.`,
                        fromName: me,
                        groupId: id,
                      });
                    }
                  } catch (err) {
                    console.error('Failed to notify new admin of handoff:', err);
                  }
                }
              } else {
                // 3. Delete group globally since no other members are left
                await supabase.from('groups').delete().eq('id', id);
              }
            } catch (err) {
              console.error('Failed to leave/delete group on Supabase:', err);
            }
          }
          // Update local groups state
          setGroups(
            groups
              .map((x) =>
                String(x.id) === String(id)
                  ? { ...x, members: x.members.map((m) => (m === me ? me + ' (Left)' : m)) }
                  : x
              )
              // Only filter it out if we actually deleted it globally because no other members were in it
              .filter((x) => hasOthers || String(x.id) !== String(id))
          );
        } else {
          setExpenses(expenses.filter((e) => String(e.gId) !== String(id)));
        }
        // Only leave the group's screen when the group is actually gone — a
        // standalone history clear, or a delete because no other members
        // remained. When we leave a group that others are still in, it lives
        // on as past history: keep the user inside it so they see the "You
        // left this group. Showing past history." banner and the Rejoin
        // action, instead of being bounced out to the groups list.
        if (String(selectedId) === String(id) && (isStandalone || !hasOthers)) {
          setSelectedId(null);
          setView('summary');
        }
      setConfirmState({ show: false });
      setBalanceCard(null);
    };

    if (!isStandalone && hasOthers) {
      // Bespoke leave card (pay/collect aware): Settle up when there's a balance,
      // otherwise a plain Leave. ✕ cancels.
      setBalanceCard(leaveBalLine
        ? {
            title: `Leave "${g.name}"?`,
            desc: leaveBalLine.trim(),
            primaryLabel: 'Settle up →',
            primaryColor: '#10B981',
            onPrimary: () => { setBalanceCard(null); setGlobalSettleDataSecure({ name: me, gId: id }); },
            secondaryLabel: 'Leave anyway',
            onSecondary: () => { performLeaveDelete(); },
          }
        : {
            title: `Leave "${g.name}"?`,
            desc: "You won't see new updates.",
            primaryLabel: 'Leave',
            primaryColor: '#F97316',
            onPrimary: () => { performLeaveDelete(); },
          });
    } else {
      setConfirmState({
        show: true,
        title: isStandalone ? 'Clear History?' : 'Delete Group?',
        desc: isStandalone
          ? `Are you sure you want to clear all non-group expenses?`
          : `Are you sure you want to delete this group permanently?`,
        type: 'danger',
        onConfirm: performLeaveDelete,
      });
    }
  };

  const handleLogout = () => {
    setConfirmState({
      show: true,
      title: 'Logout?',
      desc: 'Are you sure you want to sign out?',
      type: 'logout',
      onConfirm: async () => {
        await supabase.auth.signOut();
        // Clear local storage completely for app data
        localStorage.removeItem('divido_guest_mode');
        localStorage.removeItem('divido_authenticated');
        localStorage.removeItem('divido_email');
        localStorage.removeItem('divido_username');
        localStorage.removeItem('divido_usermetadata');
        localStorage.removeItem('divido_groups');
        localStorage.removeItem('divido_expenses');
        localStorage.removeItem('divido_last_synced_groups');
        localStorage.removeItem('divido_last_synced_expenses');
        
        // Remove all group identity claims keys
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('divido_identity_')) {
            localStorage.removeItem(key);
          }
        }

        // Reset React state to clean slate
        setUserName('You');
        setGroups([]);
        setExpenses([]);
        setIsAuthenticated(false);
        setConfirmState({ show: false });
      },
    });
  };

  const handleRenameGroup = (id: string | number) => {
    if (checkPastMemberAndShowRejoin(true)) return;
    if (id === 'STANDALONE') {
      alert(
        'Non-Group Expenses is a permanent category and cannot be renamed, but you can clear its history using the delete icon! ⚡'
      );
      return;
    }
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    const newN = prompt('Rename "' + g.name + '" to:', g.name);
    if (newN && newN.trim()) {
      setGroups(groups.map((x) => (x.id === id ? { ...x, name: newN.trim() } : x)));
    }
  };

  const allGroupBalances = React.useMemo(() => {
    const map: Record<string, Record<string, Record<string, number>>> = {};

    // Pre-group expenses by their gId to avoid filtering inside inner loops
    const expensesByGroup: Record<string, Expense[]> = {};
    expenses.forEach((e) => {
      if (!e) return;
      const gId = String(e.gId);
      if (!expensesByGroup[gId]) expensesByGroup[gId] = [];
      expensesByGroup[gId].push(e);
    });

    // Populate balances for all groups (including groups with no expenses yet)
    groups.forEach((g) => {
      if (!g) return;
      const gId = String(g.id);
      const groupExps = expensesByGroup[gId] || [];
      const gMembers = g.members || [];
      const defaultCurr = g.currency || '₹';

      const balances: Record<string, Record<string, number>> = {};
      
      // Initialize balance records for each member
      gMembers.forEach((m) => {
        balances[m] = {};
      });

      groupExps.forEach((e) => {
        const c = e.currency || defaultCurr;
        const amount = Number(e.amt) || 0;
        const splitters = e.splitters || gMembers || [];

        // Add payment to payer
        const payer = e.paid;
        if (payer) {
          if (!balances[payer]) balances[payer] = {};
          balances[payer][c] = (balances[payer][c] || 0) + amount;
        }

        // Deduct split shares
        splitters.forEach((s) => {
          if (!balances[s]) balances[s] = {};
          const share =
            !e.mode || e.mode === 'Equally'
              ? amount / (splitters.length || 1)
              : e.mode === 'Unequally'
              ? Number(e.shares?.[s]) || 0
              : (amount * (Number(e.shares?.[s]) || 0)) / 100;
          balances[s][c] = (balances[s][c] || 0) - share;
        });
      });

      map[gId] = balances;
    });

    // Handle STANDALONE (Non-Group Expenses)
    const standaloneId = 'STANDALONE';
    const standaloneExps = expensesByGroup[standaloneId] || [];
    const standaloneBalances: Record<string, Record<string, number>> = {};

    standaloneExps.forEach((e) => {
      const c = e.currency || '₹';
      const amount = Number(e.amt) || 0;
      const splitters = e.splitters || [];

      // Payer gets credit
      const payer = e.paid;
      if (payer) {
        if (!standaloneBalances[payer]) standaloneBalances[payer] = {};
        standaloneBalances[payer][c] = (standaloneBalances[payer][c] || 0) + amount;
      }

      // Splitters get debits
      splitters.forEach((s) => {
        if (!standaloneBalances[s]) standaloneBalances[s] = {};
        const share =
          !e.mode || e.mode === 'Equally'
            ? amount / (splitters.length || 1)
            : e.mode === 'Unequally'
            ? Number(e.shares?.[s]) || 0
            : (amount * (Number(e.shares?.[s]) || 0)) / 100;
        standaloneBalances[s][c] = (standaloneBalances[s][c] || 0) - share;
      });
    });

    map[standaloneId] = standaloneBalances;

    return map;
  }, [groups, expenses]);

  const getMemberBalance = React.useCallback((groupId: string | number | null, memberName: string) => {
    const gId = String(groupId || 'STANDALONE');
    const groupBals = allGroupBalances[gId];
    if (!groupBals) return {};

    // Standalone has no per-group roster/identities — keep the plain name lookup.
    const g = gId === 'STANDALONE' ? null : groups.find((x) => String(x.id) === gId);
    if (!g) return groupBals[memberName] || {};

    // Identity-aware read: a person can appear under more than one display name
    // in the same group — most commonly their live name in expenses ("Ram") and
    // a "(Left)" roster entry ("Ram (Left)"). Those are stored as separate
    // name-buckets, but they are ONE person. Sum every bucket whose stable key
    // matches the requested member's key. This is non-destructive (the numbers
    // are computed exactly as before; we only merge at read time) and falls back
    // to today's behaviour when no identity links the names — each expense
    // attributes to exactly one name-bucket, so nothing is double-counted.
    const targetKey = getPersonKey(g, memberName);
    const out: Record<string, number> = {};
    let matched = false;
    Object.entries(groupBals).forEach(([nm, byCurr]) => {
      if (getPersonKey(g, nm) !== targetKey) return;
      matched = true;
      Object.entries(byCurr).forEach(([c, v]) => { out[c] = (out[c] || 0) + v; });
    });
    return matched ? out : (groupBals[memberName] || {});
  }, [allGroupBalances, groups]);

  // ── "Same person?" prompt (Step 4b) ────────────────────────────────────────
  const findPersonCandidates = (name: string, excludeGroupId: string | number) => {
    const clean = name.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    if (!clean) return [];
    const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    const byId: Record<string, { identity: string; name: string; groups: Set<string> }> = {};
    groups.forEach((g) => {
      (g.members || []).forEach((mName) => {
        const mc = mName.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
        if (mc !== clean || mc === meClean) return;
        // Skip the exact member we're re-adding into the same group.
        if (String(g.id) === String(excludeGroupId)) return;
        const identity = g.memberIdentities?.[mName] || mName.replace(/\s*\(Left\)$/i, '');
        if (!byId[identity]) byId[identity] = { identity, name: mName.replace(/\s*\(Left\)$/i, ''), groups: new Set() };
        byId[identity].groups.add(g.name);
      });
    });
    return Object.values(byId).map((c) => ({ identity: c.identity, name: c.name, groups: Array.from(c.groups) }));
  };

  const commitAddMembers = (groupId: string | number, names: string[]) => {
    // Enforce "no duplicate names in a group" — case-insensitively, and against
    // EVERY existing state (joined, pending, and "(Left)" past members). A plain
    // Set only de-dupes exact strings, so "didi" would slip past an existing
    // "Didi". Block the duplicates and tell the admin (a left member should be
    // brought back via "Invite again", not re-added as a second person).
    const g = groups.find((x) => String(x.id) === String(groupId));
    const norm = (n: string) => n.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    const existing = new Set((g?.members || []).map(norm));
    const seen = new Set<string>();
    const toAdd: string[] = [];
    const skipped: string[] = [];
    names.forEach((n) => {
      const key = norm(n);
      if (!key) return;
      if (existing.has(key) || seen.has(key)) { skipped.push(n); return; }
      seen.add(key);
      toAdd.push(n);
    });
    if (skipped.length > 0) {
      alert(`"${skipped.join('", "')}" ${skipped.length > 1 ? 'are' : 'is'} already in this group. If they left, use "Invite again" in Past Members.`);
    }
    if (toAdd.length === 0) return;
    setGroups((prev) => prev.map((x) => {
      if (String(x.id) !== String(groupId)) return x;
      const newMembers = Array.from(new Set([...x.members, ...toAdd]));
      const newPending = Array.from(new Set([...(x.pendingMembers || []), ...toAdd]));
      return { ...x, members: newMembers, pendingMembers: newPending };
    }));
    setNewlyAddedFriends(toAdd);
  };

  const resolvePersonChoice = (identity: string | null) => {
    if (!samePersonPrompt) return;
    const { groupId, queue, index, addNames } = samePersonPrompt;
    const item = queue[index];
    if (identity) {
      try {
        const raw = localStorage.getItem('divido_person_link');
        const map = raw ? JSON.parse(raw) : {};
        map[`${groupId}::${item.name}`] = identity;
        localStorage.setItem('divido_person_link', JSON.stringify(map));
      } catch { /* ignore */ }
      // Merge immediately in local state so the two same-named people bucket as
      // ONE person right away (no waiting for a reload).
      setGroups((prev) => prev.map((g) =>
        String(g.id) === String(groupId)
          ? { ...g, memberIdentities: { ...(g.memberIdentities || {}), [item.name]: identity } }
          : g
      ));
      // Persist to the member row if it already exists (covers the case where
      // the create/add sync already inserted it with a fresh id — the
      // divido_person_link above only helps the not-yet-inserted case).
      if (!checkIfDemoMode() && isAuthenticated) {
        supabase
          .from('group_members')
          .update({ person_id: identity })
          .eq('group_id', groupId)
          .ilike('name', item.name)
          .then(({ error }) => { if (error) console.error('Failed to link person identity:', error); });
      }
    }
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      setSamePersonPrompt(null);
      if (addNames && addNames.length > 0) commitAddMembers(groupId, addNames);
    } else {
      setSamePersonPrompt({ ...samePersonPrompt, index: nextIndex });
    }
  };

  const selectedGroup = selectedId === 'STANDALONE'
    ? {
        id: 'STANDALONE',
        name: 'Non-Group Expenses',
        members: Array.from(new Set([
          me,
          ...expenses
            .filter((e) => e && String(e.gId) === 'STANDALONE')
            .reduce((acc, e) => {
              if (e.paid) acc.add(e.paid);
              if (Array.isArray(e.splitters)) {
                e.splitters.forEach((s) => acc.add(s));
              }
              return acc;
            }, new Set<string>())
        ])),
        currency: myDefaultCurrency,
        emoji: '👤',
        simplifyDebts: false,
      }
    : (groups.find((g) => String(g.id) === String(selectedId)) || groups.find((g) => g.id === selectedId) || groups[0]);

  const lastSelectedIdRef = useRef(selectedId);
  useEffect(() => {
    if (selectedGroup) {
      const idChanged = lastSelectedIdRef.current !== selectedId;
      lastSelectedIdRef.current = selectedId;

      if (idChanged || !headerRenaming) {
        setHeaderNewName(selectedGroup?.name || '');
      }
      setHeaderNameError('');
      if (selectedGroup.name === '') {
        setHeaderRenaming(true);
      } else if (idChanged) {
        setHeaderRenaming(false);
      }
    }
  }, [selectedId, groups]);

  const handleHeaderRename = () => {
    if (checkPastMemberAndShowRejoin(true)) { setHeaderRenaming(false); return; }
    const trimmed = headerNewName.trim();
    if (!trimmed) {
      if (selectedGroup && selectedGroup.name === '') {
        // Do not exit renaming mode if it's a new untitled group on blur/sync
        return;
      }
      setHeaderRenaming(false);
      return;
    }
    const isDuplicate = groups.some(
      (g) => String(g.id) !== String(selectedId) && g.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setHeaderNameError('Name already exists!');
      return;
    }
    setGroups(groups.map((g) => (String(g.id) === String(selectedId) ? { ...g, name: trimmed } : g)));
    setHeaderRenaming(false);
  };

  // Account-first: only signed-in users can create groups. Guests get nudged to sign in.
  const isSignedIn = !!userEmail;
  const requireSignInToCreate = (): boolean => {
    if (isSignedIn) return true;
    alert('Please sign in to create a group and split with friends.');
    setView('profile');
    return false;
  };

  const createGroupSecure = () => {
    if (!requireSignInToCreate()) return;
    setView('create_group');
  };

  // Unified "Add Expense" entry used by the center of the bottom nav. Same action
  // everywhere: standalone expense on the home screens, group expense when inside
  // a group. Scanner stays off — it lives as a small icon inside the expense screen.
  const addExpenseFromNav = (scan: boolean = false) => {
    if (!requireSignInToCreate()) return;
    const insideGroup = (view === 'detail' || view === 'gallery' || view === 'analytics') && selectedId;
    const gId = insideGroup ? selectedId : 'STANDALONE';
    setAutoOpenScanner(scan);
    // A new expense needs a temp- id so the save path treats it as an ADD, not
    // an edit of an existing row (id: null made saves silently do nothing).
    setEditingExpenseSecure({ id: 'temp-' + Date.now(), gId, title: '', amt: 0, date: new Date().toISOString().split('T')[0], splitters: [], paid: me } as any);
    setShowExpModalSecure(true);
  };

  // Quick "add expense with a friend" from the Balances list — opens the expense
  // form prefilled as a Non-Group (standalone) expense split between me + friend,
  // so there's no group/typing step.
  const quickAddExpenseWithFriend = (friendName: string) => {
    if (!requireSignInToCreate()) return;
    const clean = friendName.replace(/\s*\(Left\)$/i, '').trim();
    if (!clean) return;
    setAutoOpenScanner(false);
    setEditingExpenseSecure({
      id: 'temp-' + Date.now(),
      gId: 'STANDALONE',
      title: '',
      amt: 0,
      date: new Date().toISOString().split('T')[0],
      splitters: [me, clean],
      paid: me,
    } as any);
    setShowExpModalSecure(true);
  };

  const handleCreateGroup = (groupData: { name: string; currency: string; members: string[]; emoji: string; createdDate?: string }) => {
    const id = genGroupId();
    // Everyone added at creation except me is a not-yet-claimed invitee, so they
    // must start as pending. The member list buckets Joined vs Pending purely on
    // this array — omitting it made fresh invitees (e.g. Ram) show as Joined
    // immediately, before they ever claimed their name via the join link.
    const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    const pendingMembers = groupData.members.filter((m) => m.toLowerCase() !== meClean);
    const newGroup = {
      id,
      name: groupData.name,
      currency: groupData.currency,
      members: groupData.members,
      emoji: groupData.emoji,
      simplifyDebts: false,
      createdDate: groupData.createdDate || new Date().toISOString().split('T')[0],
      pendingMembers,
      pendingSync: true,
    };
    setGroups([...groups, newGroup]);
    setSelectedId(id);
    setView('detail');

    // Same-person check for members added AT CREATION (previously only the
    // add-to-existing-group path did this). Without it, adding "Abhishek" to a
    // new group when an Abhishek already exists elsewhere silently created a
    // second, separate person — two Abhisheks in the cross-group balances.
    const clashing = pendingMembers
      .map((n) => ({ name: n, candidates: findPersonCandidates(n, id) }))
      .filter((x) => x.candidates.length > 0);
    if (clashing.length > 0) {
      setSamePersonPrompt({ groupId: id, queue: clashing, index: 0, addNames: [] });
    }
  };

  const handleUpdateGroup = async (groupId: string | number, groupData: { name: string; currency: string; members: string[]; emoji: string; createdDate?: string }) => {
    // 1. Update local groups state. Names added during the edit are brand-new
    // invitees, so mark them pending so they show under "Pending Invites".
    setGroups(groups.map(g => {
      if (String(g.id) !== String(groupId)) return g;
      const prevMembers = g.members || [];
      const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      const newlyAdded = groupData.members.filter(m => !prevMembers.includes(m) && m.toLowerCase() !== meClean);
      const pendingMembers = Array.from(new Set([...(g.pendingMembers || []), ...newlyAdded]));
      return { ...g, ...groupData, pendingMembers };
    }));
    
    // Reset editing state and return to detail view
    setEditingGroupId(null);
    setView('detail');

    // 2. If cloud session is active, sync database changes
    if (userEmail) {
      try {
        // Update group details in Supabase
        const { error: groupErr } = await supabase
          .from('groups')
          .update({
            name: groupData.name,
            currency: groupData.currency,
            emoji: groupData.emoji,
            created_date: groupData.createdDate,
          })
          .eq('id', groupId);
        
        if (groupErr) console.error('Failed to update group table in Supabase:', groupErr);

        // NOTE: member add/removal is intentionally NOT handled here. The old
        // code in this spot compared member NAMES against email addresses, which
        // could compute "remove everyone" and delete all member rows on a simple
        // rename (data loss). Member inserts are handled correctly by the sync
        // engine (useSupabaseSync diffs new members and inserts them with the
        // right columns / is_pending / person_id); member removal goes through
        // the member-list ✕ (onRemoveMember), which tombstones instead of
        // orphaning. This function now only updates the group's own fields.
      } catch (err) {
        console.error('Failed to sync group edits to Supabase:', err);
      }
    }
  };




  const handleOnboard = () => {
    const enteredName = tempName.trim();
    if (!enteredName) return;

    updateUserName(enteredName);
    setIsAuthenticated(true);
    localStorage.setItem('divido_authenticated', 'true');
  };

  const urlParams = new URLSearchParams(window.location.search);
  const joinGroupIdParam = urlParams.get('joinGroupId');

  if (!isAuthenticated) {
    return (
      <>
        <Login
          onLoginSuccess={(name) => {
            updateUserName(name);
            setIsAuthenticated(true);
          }}
          currentTheme={theme}
        />
        <InstallPrompt />
      </>
    );
  }

  // While an invite link is being resolved, show a lightweight loader instead of
  // the home feed — otherwise the home screen flashes for a beat before the
  // claim card appears once the Supabase round-trip completes.
  if (isResolvingInvite) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '18px',
        background: 'var(--bg)', color: 'var(--t)', zIndex: 10000,
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          border: '4px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366F1',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ fontSize: '14px', fontWeight: 700, opacity: 0.7 }}>Opening your invite…</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Fresh sign-in with no cached data yet: show a friendly branded splash (the
  // Divido cat) until the first cloud load finishes — so users never see an
  // empty "Your Groups" and get scared. Returning users with cached groups skip
  // this entirely (groups.length > 0). 5s safety timeout so it can't hang.
  if (!isInitialLoadDone && !bootLoaderExpired && groups.length === 0 && isAuthenticated && !!userEmail) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '18px',
        background: 'var(--bg)', zIndex: 10000,
      }}>
        <div style={{
          width: '96px', height: '96px', borderRadius: '24px', overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
          animation: 'divido-splash-pulse 1.4s ease-in-out infinite',
        }}>
          <img src="/divido_laughing_cat_mascot_1778063273427.png" alt="Divido" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--t)', letterSpacing: '-0.3px' }}>Divido</div>
        <style>{`@keyframes divido-splash-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }`}</style>
      </div>
    );
  }


  return (
    <div className="app-container">
      <InstallPrompt />
      <Sidebar
        view={view}
        setView={setView}
        userName={userName}
        me={me}
        groups={groups}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        expenses={expenses}
        isGroupsExpanded={isGroupsExpanded}
        setIsGroupsExpanded={setIsGroupsExpanded}
        handleRenameGroup={handleRenameGroup}
        handleDeleteGroup={handleDeleteGroup}
        setGroups={setGroups}
        setConfirmState={setConfirmState}
        setIsAuthenticated={setIsAuthenticated}
        defaultCurrency={myDefaultCurrency}
        handleLogout={handleLogout}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        syncStatus={syncStatus}
        profilePhoto={userMetadata[me]?.profilePhoto}
        onRequireSignIn={requireSignInToCreate}
        onAddExpense={addExpenseFromNav}
        setAnalyticsGroupId={setAnalyticsGroupId}
      />

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
      )}

      <main ref={mainContentRef} className="main-content">
        {view !== 'create_group' && (
          <MobileHeader
            headerHidden={headerHidden}
            onRequestRejoin={() => setShowRejoinRequestModal(true)}
            view={view}
            selectedId={selectedId}
            selectedGroup={selectedGroup}
            me={me}
            groups={groups}
            expenses={expenses}
            setGroups={setGroups}
            setIsSidebarOpen={setIsSidebarOpen}
            onEditGroup={(id) => {
              setEditingGroupId(id);
              setView('create_group');
            }}
            setView={setView}
            setSelectedId={setSelectedId}
            groupDetailTab={groupDetailTab}
            setGroupDetailTab={setGroupDetailTab}
            showGalleryFilters={showGalleryFilters}
            onToggleGalleryFilters={() => setShowGalleryFilters(prev => !prev)}
            headerRenaming={headerRenaming}
            setHeaderRenaming={setHeaderRenaming}
            headerNewName={headerNewName}
            setHeaderNewName={setHeaderNewName}
            headerNameError={headerNameError}
            setHeaderNameError={setHeaderNameError}
            handleHeaderRename={handleHeaderRename}
            showInfo={showInfo}
            setShowInfo={setShowInfo}
            mobileShowGroupOptionsMenu={mobileShowGroupOptionsMenu}
            setMobileShowGroupOptionsMenu={setMobileShowGroupOptionsMenu}
            setShowConvertModalId={setShowConvertModalId}
            handleMobileExportCSV={handleMobileExportCSV}
            analyticsGroupId={analyticsGroupId}
            setAnalyticsGroupId={setAnalyticsGroupId}
            handleDeleteGroup={handleDeleteGroup}
            pageDescriptions={pageDescriptions}
            notifications={notifications}
            unreadNotifCount={unreadNotifCount}
            showNotifPanel={showNotifPanel}
            setShowNotifPanel={setShowNotifPanel}
            onOpenNotifications={handleOpenNotifications}
            onClearNotifications={handleClearNotifications}
            onNotificationClick={handleNotificationClick}
            onHeaderSearch={() => { setView('summary'); setHomeSearchNonce((n) => n + 1); }}
            onAcceptRename={handleAcceptRename}
            onRejectRename={handleRejectRename}
            onInviteFriend={openGroupShareLink}
            searchQuery={globalSearchQuery}
            setSearchQuery={setGlobalSearchQuery}
            isHeaderSearchActive={isHeaderSearchActive}
            setIsHeaderSearchActive={setIsHeaderSearchActive}
            onOpenConvert={() => setShowFriendsConvert(true)}
            setExpenses={setExpenses}
            setShowExpModal={setShowExpModalSecure}
            setEditingExpense={setEditingExpenseSecure}
            onCreateGroup={createGroupSecure}
            onScan={() => addExpenseFromNav(true)}
            userMetadata={userMetadata}
          />
        )}

        <React.Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '60px 0' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366F1', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
        {view === 'summary' ? (
          <MasterSummary
            groups={groups}
            expenses={expenses}
            getMemberBalance={getMemberBalance}
            setSelectedId={setSelectedId}
            setView={setView}
            setGroups={setGroups}
            setExpenses={setExpenses}
            setShowCurrPickerId={setShowCurrPickerId}
            showCurrPickerId={showCurrPickerId}
            handleRenameGroup={handleRenameGroup}
            handleDeleteGroup={handleDeleteGroup}
            me={me}
            setShowExpModal={setShowExpModalSecure}
            setEditingExpense={setEditingExpenseSecure}
            globalSettleData={globalSettleData}
            setGlobalSettleData={setGlobalSettleData}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            onShowQR={(payee, amt, curr) => setQrModalData({ payee, amt, currency: curr })}
            searchNonce={homeSearchNonce}
            searchQuery={globalSearchQuery}
            setSearchQuery={setGlobalSearchQuery}
            onCreateGroup={createGroupSecure}
            loading={!isInitialLoadDone && groups.length === 0}
            setEditingSettle={setEditingSettle}
            setShowSettleModal={setShowSettleModalSecure}
            deleteExpense={deleteExpenseSecure}
            setShowConvertModalId={setShowConvertModalId}
          />
        ) : view === 'groups' ? (
          <GroupsView
            groups={groups}
            expenses={expenses}
            getMemberBalance={getMemberBalance}
            setSelectedId={setSelectedId}
            setView={setView}
            setGroups={setGroups}
            handleRenameGroup={handleRenameGroup}
            handleDeleteGroup={handleDeleteGroup}
            me={me}
          />
        ) : view === 'friends' ? (
          <FriendsView
            groups={groups}
            expenses={expenses}
            me={me}
            setView={setView}
            setSelectedId={setSelectedId}
            setGlobalSettleData={setGlobalSettleData}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            searchQuery={globalSearchQuery}
            showConvertModal={showFriendsConvert}
            setShowConvertModal={setShowFriendsConvert}
            onQuickAddExpense={quickAddExpenseWithFriend}
          />
        ) : view === 'analytics' ? (
          <Analytics
            expenses={expenses}
            groups={groups}
            me={me}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            initialGroupId={analyticsGroupId}
            onBack={() => {
              if (analyticsGroupId) {
                setSelectedId(analyticsGroupId);
                setView('detail');
              } else {
                setView('summary');
              }
            }}
          />
        ) : view === 'activity' ? (
          <ActivityStudio
            expenses={expenses}
            groups={groups}
            setExpenses={setExpenses}
            setEditingExpense={setEditingExpenseSecure}
            setShowExpModal={setShowExpModalSecure}
            setEditingSettle={setEditingSettle}
            setShowSettleModal={setShowSettleModalSecure}
            me={me}
            setShowConvertModalId={setShowConvertModalId}
            setGroups={setGroups}
            deleteExpense={deleteExpenseSecure}
            setSelectedId={setSelectedId}
            setView={setView}
          />
        ) : view === 'profile' ? (
          <Profile
            groups={groups}
            expenses={expenses}
            currentTheme={theme}
            onThemeChange={setTheme}
            userName={userName}
            setUserName={updateUserName}
            me={me}
            setShowDeleteAccountModal={setShowDeleteAccountModal}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            handleLogout={handleLogout}
            userEmail={userEmail}
          />
        ) : view === 'gallery' ? (
          <GroupGallery
            selectedId={selectedId}
            groups={groups}
            expenses={expenses}
            me={me}
            setView={setView}
            setEditingExpense={setEditingExpenseSecure}
            setShowExpModal={setShowExpModalSecure}
            setEditingSettle={setEditingSettle}
            setShowSettleModal={setShowSettleModalSecure}
            onPhotoViewerChange={setIsPhotoViewerOpen}
            searchQuery={globalSearchQuery}
            showFilters={showGalleryFilters}
            setShowFilters={setShowGalleryFilters}
          />
        ) : view === 'create_group' ? (
          <CreateGroupView
            me={me}
            myDefaultCurrency={myDefaultCurrency}
            onCancel={() => {
              setView(editingGroupId ? 'detail' : 'summary');
              setEditingGroupId(null);
            }}
            onCreateGroup={(groupData) => {
              if (editingGroupId) {
                handleUpdateGroup(editingGroupId, groupData);
              } else {
                handleCreateGroup(groupData);
              }
            }}
            groups={groups}
            userName={userName}
            editingGroup={editingGroupId ? groups.find(g => String(g.id) === String(editingGroupId)) : undefined}
            onManageMembers={() => {
              const gid = editingGroupId;
              setEditingGroupId(null);
              if (gid) setSelectedId(gid);
              setView('detail');
              setShowFriendsList(true);
            }}
          />
        ) : (
          <GroupDetail
            activeTab={groupDetailTab}
            setActiveTab={setGroupDetailTab}
            showFriendsList={showFriendsList}
            setShowFriendsList={setShowFriendsList}
            onPhotoViewerChange={setIsPhotoViewerOpen}
            onShareGroupLink={openGroupShareLink}
            selectedId={selectedId}
            groups={groups}
            expenses={expenses}
            getMemberBalance={getMemberBalance}
            setView={setView}
            setGroups={setGroups}
            setShowExpModal={setShowExpModalSecure}
            setEditingExpense={setEditingExpenseSecure}
            setExpenses={setExpenses}
            setShowAddFriendModal={setShowAddFriendModalSecure}
            setShowMembersHealth={setShowMembersHealth}
            setShowCurrPickerId={setShowCurrPickerId}
            showCurrPickerId={showCurrPickerId}
            me={me}
            setShowConvertModalId={setShowConvertModalId}
            wasRemovedByAdmin={notifications.some((n) => n.type === 'removed' && String(n.groupId) === String(selectedId))}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            deleteExpense={deleteExpenseSecure}
            onDeleteGroup={handleDeleteGroup}
            onShowQR={(payee, amt, curr) => setQrModalData({ payee, amt, currency: curr })}
            setGlobalSettleData={setGlobalSettleDataSecure}
            showSettleModal={showSettleModal}
            setShowSettleModal={setShowSettleModalSecure}
            editingSettle={editingSettle}
            setEditingSettle={setEditingSettle}
            onOpenAnalytics={(gId) => {
              setAnalyticsGroupId(gId);
              setView('analytics');
            }}
            showGroupSettleList={showGroupSettleList}
            setShowGroupSettleList={setShowGroupSettleList}
            setIsSidebarOpen={setIsSidebarOpen}
            onApproveLinkRequest={async (memberRecordId) => {
              try {
                // Fetch the record details to get email & name
                const { data: mem } = await supabase
                  .from('group_members')
                  .select('*')
                  .eq('id', memberRecordId)
                  .single();

                if (mem && mem.link_request_email) {
                  // Link/Reactivate the member
                  const cleanName = mem.name.replace(/\s*\(Left\)$/i, '');
                  await supabase
                    .from('group_members')
                    .update({
                      user_email: mem.link_request_email,
                      name: cleanName,
                      is_pending: false,
                      link_request_email: null,
                      link_request_name: null,
                    })
                    .eq('id', memberRecordId);
                  
                  // Notify the newly-approved member that they were added
                  try {
                    const { pushNotification } = await import('./lib/notifications');
                    const grp = groups.find((g) => String(g.id) === String(mem.group_id));
                    await pushNotification({
                      recipientEmail: mem.link_request_email,
                      type: 'group_add',
                      title: `You were added to ${grp?.name || 'a group'}`,
                      body: `${userName} approved you to join. You can now split expenses together.`,
                      fromName: userName,
                      fromEmail: userEmail,
                      groupId: mem.group_id,
                    });
                  } catch (e) {
                    console.error('group_add notify failed:', e);
                  }

                  alert('Member successfully approved and linked! 🎉');
                  // Drop the handled request from local state immediately so the
                  // approve control can't be re-triggered before the cloud sync
                  // reconciles (same double-action cause as the rejoin modal).
                  setGroups((prev) => prev.map((g) =>
                    String(g.id) === String(mem.group_id)
                      ? { ...g, pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => String(r.id) !== String(memberRecordId)) }
                      : g
                  ));
                }
              } catch (err) {
                console.error(err);
              }
            }}
            onRequestRejoin={async () => {
              setShowRejoinRequestModal(true);
            }}
            onDeclineLinkRequest={async (memberRecordId) => {
              try {
                const { data: mem } = await supabase
                  .from('group_members')
                  .select('*')
                  .eq('id', memberRecordId)
                  .single();

                if (mem) {
                  // If declined a new user request, delete it entirely
                  if (mem.user_email === null && mem.name === mem.link_request_name) {
                    await supabase
                      .from('group_members')
                      .delete()
                      .eq('id', memberRecordId);
                  } else {
                    // Just clear the request columns to let another user request link
                    await supabase
                      .from('group_members')
                      .update({
                        link_request_email: null,
                        link_request_name: null,
                      })
                      .eq('id', memberRecordId);
                  }
                  
                  alert('Link request declined.');
                  setGroups((prev) => prev.map((g) =>
                    String(g.id) === String(mem.group_id)
                      ? { ...g, pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => String(r.id) !== String(memberRecordId)) }
                      : g
                  ));
                }
              } catch (err) {
                console.error(err);
              }
            }}
            onRenameMember={async (oldName, newName) => {
              try {
                if (!selectedId || selectedId === 'STANDALONE') return;
                if (!newName.trim() || oldName === newName) return;

                const { data: mems } = await supabase
                  .from('group_members')
                  .select('*')
                  .eq('group_id', selectedId);
                if (!mems) return;

                const target = mems.find((m) => m.name === oldName);
                if (!target) return;

                const isJoinedOther = !!target.user_email && oldName !== me;

                if (isJoinedOther) {
                  // Don't change another person's identity unilaterally — propose it.
                  await supabase.from('group_members').update({ pending_name: newName }).eq('id', target.id);
                  const grp = groups.find((g) => String(g.id) === String(selectedId));
                  const { pushNotification } = await import('./lib/notifications');
                  await pushNotification({
                    recipientEmail: target.user_email,
                    type: 'rename_request',
                    title: `${userName} wants to rename you to "${newName}"`,
                    body: `In ${grp?.name || 'your group'}. Accept to update your name everywhere, or reject to keep "${oldName}".`,
                    fromName: userName,
                    fromEmail: userEmail,
                    groupId: selectedId,
                  });
                  alert(`Rename proposed. ${oldName} will be asked to accept "${newName}". ⏳`);
                } else {
                  // Placeholder (not joined) or renaming yourself — apply immediately.
                  await applyRename(selectedId, oldName, newName);
                  alert(`Name changed to "${newName}"! 🎉`);
                }
              } catch (err) {
                console.error('Rename failed:', err);
              }
            }}
            onRemindMember={async (memberName) => {
              // Fire the in-app reminder notification (fire-and-forget so it
              // doesn't consume the tap's user-activation before navigator.share).
              notifyFriend(memberName, {
                type: 'reminder',
                title: `${userName} sent you a reminder`,
                body: selectedGroup && selectedId !== 'STANDALONE' ? `Settle up in ${selectedGroup.name}` : 'You have a pending balance to settle',
                groupId: selectedId,
              });

              const grpName = selectedGroup?.name;
              const inviteLink = `${window.location.origin}/?joinGroupId=${selectedId}`;
              const shareText = `Hey ${memberName}! Join ${grpName ? `"${grpName}"` : 'my group'} on Divido to split expenses 💸`;

              // Mobile: open the phone's own share sheet directly (all apps),
              // no in-app card. Runs inside the tap, so the browser permits it.
              if (typeof navigator !== 'undefined' && (navigator as any).share) {
                try {
                  await (navigator as any).share({
                    title: grpName ? `Join "${grpName}" on Divido` : 'Join my group on Divido',
                    text: shareText,
                    url: inviteLink,
                  });
                } catch {
                  /* user dismissed the share sheet — nothing to do */
                }
                return;
              }

              // Desktop / no native share: fall back to our in-app share card.
              setActiveReminderName(memberName);
              setShowAddFriendModal(true);
            }}
            onReinviteMember={async (memberName, inviteUrl) => {
              const grpName = selectedGroup?.name;
              const shareText = `Hey ${memberName}! Rejoin ${grpName ? `"${grpName}"` : 'our group'} on Divido 💸`;
              const nativeShare = typeof navigator !== 'undefined' && (navigator as any).share;

              // Fire the phone's own share sheet FIRST — the awaited DB
              // reactivation below would otherwise consume the tap's activation.
              if (nativeShare) {
                try {
                  await (navigator as any).share({
                    title: grpName ? `Rejoin "${grpName}" on Divido` : 'Rejoin my group on Divido',
                    text: shareText,
                    url: inviteUrl,
                  });
                } catch {
                  /* user dismissed the share sheet — nothing to do */
                }
              }

              if (selectedId && selectedId !== 'STANDALONE') {
                try {
                  const searchName = memberName + ' (Left)';
                  const { data: matched } = await supabase
                    .from('group_members')
                    .select('id')
                    .eq('group_id', selectedId)
                    .ilike('name', searchName)
                    .maybeSingle();

                  if (matched) {
                    await supabase
                      .from('group_members')
                      .update({
                        name: memberName,
                        is_pending: true,
                        // Detach their old email so they're a genuine pending
                        // invite — otherwise the sync treats the still-linked
                        // email as "joined" and snaps them back into Joined
                        // Members before they ever accept. Re-attached when they
                        // actually rejoin via the invite link.
                        user_email: null
                      })
                      .eq('id', matched.id);
                  }
                } catch (err) {
                  console.error('Failed to shift member to pending:', err);
                }
              }
              // Update local state to reflect reinvite immediately
              setGroups(
                groups.map((g) =>
                  String(g.id) === String(selectedId)
                    ? {
                        ...g,
                        members: g.members.map((m) => {
                          const cleanM = m.replace(/\s*\(Left\)$/i, '');
                          return cleanM.toLowerCase() === memberName.toLowerCase() ? memberName : m;
                        }),
                        pendingMembers: Array.from(new Set([...(g.pendingMembers || []), memberName]))
                      }
                    : g
                )
              );

              if (!nativeShare) {
                setActiveReminderName(memberName);
                setActiveRejoinLink(inviteUrl);
                setShowAddFriendModal(true);
              }
            }}
            onRemindAllPending={async (pendingNames) => {
              if (!selectedId || selectedId === 'STANDALONE') return;
              pendingNames.forEach((name) => {
                notifyFriend(name, {
                  type: 'reminder',
                  title: `${userName} sent you a reminder`,
                  body: selectedGroup && selectedId !== 'STANDALONE' ? `Settle up in ${selectedGroup.name}` : 'You have a pending balance to settle',
                  groupId: selectedId,
                });
              });

              const grpName = selectedGroup?.name;
              const inviteLink = `${window.location.origin}/?joinGroupId=${selectedId}`;
              const shareText = `Hey! Join ${grpName ? `"${grpName}"` : 'our group'} on Divido to split expenses 💸`;

              if (typeof navigator !== 'undefined' && (navigator as any).share) {
                try {
                  await (navigator as any).share({
                    title: grpName ? `Join "${grpName}" on Divido` : 'Join my group on Divido',
                    text: shareText,
                    url: inviteLink,
                  });
                } catch {
                  /* user dismissed the share sheet */
                }
                return;
              }

              setActiveReminderName(null);
              setActiveRejoinLink(null);
              setShowAddFriendModal(true);
            }}
            onWriteOff={(memberName: string) => { if (selectedId && selectedId !== 'STANDALONE') performWriteOff(selectedId, memberName); }}
            onLeaveGroup={() => { if (selectedId && selectedId !== 'STANDALONE') handleDeleteGroup(selectedId); }}
            onRemoveMember={async (memberName) => {
              if (!selectedId || selectedId === 'STANDALONE') return;
              const isPastMember = memberName.endsWith(' (Left)');
              // Expenses store a member's CLEAN name ("didi"), never the "(Left)"
              // tombstone label. So when removing a past member we must check
              // history against the clean name — otherwise every past member looks
              // history-less and gets wrongly hard-deleted, orphaning their
              // expenses and (worse) resurrecting a clean-named pending row.
              const cleanName = memberName.replace(/\s*\(Left\)$/i, '').trim();
              // Orphan guard: a member referenced by ANY expense (as payer or splitter)
              // must never be hard-deleted. Removing their row leaves their name dangling
              // in those expenses, and the balance engine then renders the leftover shares
              // as a phantom person. Tombstone them as "(Left)" instead — the same path an
              // active member takes on leaving — so history is preserved and they stay
              // rejoinable.
              const hasExpenseHistory = expenses.some((e) => {
                const names = [cleanName, memberName];
                const referencesMember =
                  names.includes(e.paid) ||
                  (Array.isArray(e.splitters) && e.splitters.some((s) => names.includes(s)));
                if (!referencesMember) return false;
                if (String(e.gId) === String(selectedId)) return true;
                // Safety net: an expense may be stranded on a temporary (pre-sync)
                // group id after the group was reassigned a permanent DB id. Its gId
                // then won't equal selectedId, but it still references this member —
                // treat that as history so removal never orphans it. Temp ids are
                // Date.now()-based floats, far above any real DB id.
                return Number(e.gId) > 2147483647;
              });

              // Removing a PAST member who still has expense history is an explicit
              // "Write off & remove" action (confirmed on the member-list card): we
              // settle any outstanding balance first — so their expenses net to zero
              // and no phantom debt is left behind — then hard-delete every row
              // variant below. This replaces the old behaviour that wrongly
              // resurrected them as an active pending invite.
              const purgePastWithHistory = isPastMember && hasExpenseHistory;
              if (purgePastWithHistory) {
                performWriteOff(selectedId, cleanName);
              }

              // Anyone with NO expense footprint has no history to protect — a pending
              // invite that was never used, or a fully-joined member who was never in a
              // single expense. Delete them outright rather than leaving a "(Left)"
              // tombstone that just clutters Past Members. Balance need not be checked
              // separately: a non-zero balance can only come from an expense, so it is
              // already implied by hasExpenseHistory.
              const hardDelete = !hasExpenseHistory || purgePastWithHistory;
              // Delete EVERY row-name variant for this person so no stray row (e.g.
              // a clean-named pending row left over from an incomplete tombstone)
              // survives to reload as an active member. De-duplicated.
              const deleteNames = Array.from(new Set([cleanName, memberName, `${cleanName} (Left)`]));
              if (!checkIfDemoMode() && isAuthenticated) {
                try {
                  if (hardDelete) {
                    // Permanently delete every name-variant row for this person.
                    await supabase
                      .from('group_members')
                      .delete()
                      .eq('group_id', selectedId)
                      .in('name', deleteNames);
                    // Race guard: a just-added pending member may not have been
                    // flushed to group_members yet when ✕ is clicked, so the delete
                    // above matches zero rows. The deferred add-sync then inserts the
                    // row and realtime reads it back — the member "reappears" until a
                    // later delete finally catches it (the "works after 2-3 refreshes"
                    // symptom). Re-run the delete once the add-sync would have flushed,
                    // but only if they're still meant to be gone locally (guards against
                    // a same-name re-add in the meantime).
                    const sweepGroupId = selectedId;
                    const sweepNames = deleteNames;
                    setTimeout(async () => {
                      const g = groupsRef.current.find((gg) => String(gg.id) === String(sweepGroupId));
                      const stillGone = !g || sweepNames.every((n) => !g.members.includes(n) && !(g.pendingMembers || []).includes(n));
                      if (stillGone) {
                        await supabase
                          .from('group_members')
                          .delete()
                          .eq('group_id', sweepGroupId)
                          .in('name', sweepNames);
                      }
                    }, 1500);
                  } else if (!isPastMember) {
                    // Active member OR a pending invite that still has expense history.
                    // 1. Rename membership row to preserve history, keep email, set is_pending: true
                    const { data: memRows } = await supabase
                      .from('group_members')
                      .select('id, user_email')
                      .eq('group_id', selectedId)
                      .ilike('name', memberName);

                    if (memRows && memRows.length > 0) {
                      await supabase
                        .from('group_members')
                        .update({
                          name: memberName + ' (Left)',
                          is_pending: true
                        })
                        .eq('id', memRows[0].id);

                      // Tell the removed member it was an admin removal (not a
                      // voluntary leave), so their app shows the correct banner.
                      const removedEmail = memRows[0].user_email;
                      if (removedEmail && removedEmail !== userEmail) {
                        try {
                          const grpName = groups.find((g) => String(g.id) === String(selectedId))?.name || 'the group';
                          const { pushNotification } = await import('./lib/notifications');
                          await pushNotification({
                            recipientEmail: removedEmail,
                            type: 'removed',
                            title: `You were removed from ${grpName}`,
                            body: `The group admin removed you from ${grpName}. You can view past history and request to rejoin.`,
                            fromName: me,
                            fromEmail: userEmail,
                            groupId: selectedId,
                          });
                        } catch (notifErr) {
                          console.error('Failed to notify removed member:', notifErr);
                        }
                      }
                    }

                    // 2. Insert system notification of departure
                    await supabase
                      .from('expenses')
                      .insert({
                        group_id: selectedId,
                        timestamp: Date.now(),
                        title: `${memberName} was removed`,
                        amt: 0,
                        paid: 'SYSTEM',
                        date: new Date().toISOString().split('T')[0],
                        mode: 'Equally',
                        splitters: []
                      });
                  }
                } catch (err) {
                  console.error('Failed to remove member on Supabase:', err);
                }
              }
              // Update local state (functional form — never map over a stale
              // `groups` closure, or an interleaved add/remove can clobber each other)
              setGroups((prev) =>
                prev.map((g) =>
                  String(g.id) === String(selectedId)
                    ? {
                        ...g,
                        members: hardDelete
                          ? g.members.filter((m) => !deleteNames.includes(m))
                          : isPastMember
                            ? g.members
                            : g.members.map((m) => (m === memberName ? memberName + ' (Left)' : m)),
                        pendingMembers: g.pendingMembers?.filter((m) => !deleteNames.includes(m))
                      }
                    : g
                )
              );

              // If I removed myself, the group still exists as past history —
              // keep me inside it so I see the "You left this group. Showing
              // past history." banner and the Rejoin action, rather than being
              // bounced out to the groups list. (Removing someone else never
              // navigated away, so this only changes the self-removal case.)
            }}
            onAddMembers={(names) => {
              if (selectedId && selectedId !== 'STANDALONE') {
                const clashing = names
                  .map((n) => ({ name: n, candidates: findPersonCandidates(n, selectedId) }))
                  .filter((x) => x.candidates.length > 0);
                if (clashing.length > 0) {
                  setSamePersonPrompt({ groupId: selectedId, queue: clashing, index: 0, addNames: names });
                } else {
                  commitAddMembers(selectedId, names);
                }
              }
            }}
            onCreateGroup={createGroupSecure}
          />
        )}
        </React.Suspense>
      </main>




      {/* Floating Scan / + Expense pills removed — the bottom-nav centre button
          now handles Add Expense everywhere, and scanning lives inside the
          expense screen. */}

      {/* Floating "+ Group" button — on all screens (except inside specific group detail views where Scan appears). */}
      {view !== 'create_group' && !((view === 'detail' || view === 'gallery' || view === 'analytics') && selectedId) && !isPhotoViewerOpen && (
        <button
          onClick={createGroupSecure}
          aria-label="New group"
          style={{
            position: 'fixed',
            bottom: '100px',
            right: '20px',
            zIndex: 1000,
            height: '38px',
            padding: '0 18px',
            borderRadius: '19px',
            background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
            border: 'none',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(249, 115, 22, 0.35)',
            transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', display: 'block', flexShrink: 0 }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1, display: 'block' }}>Group</span>
        </button>
      )}

      {/* Floating Scan button — inside a group only. Squarish, orange (distinct
          from the green + Expense), with an animated scan line. */}
      {((view === 'detail' || view === 'gallery' || view === 'analytics') && selectedId) && !isPhotoViewerOpen && (
        <button
          onClick={() => addExpenseFromNav(true)}
          aria-label="Scan receipt"
          style={{
            position: 'fixed',
            bottom: '100px',
            right: '20px',
            zIndex: 1000,
            width: '48px',
            height: '48px',
            borderRadius: '15px',
            background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(249, 115, 22, 0.35)',
            transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <style>{`@keyframes divido-scanline{0%{transform:translateY(0)}50%{transform:translateY(14px)}100%{transform:translateY(0)}}`}</style>
          <span style={{ position: 'relative', width: '24px', height: '24px', display: 'block' }}>
            {/* Viewfinder corner brackets */}
            <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px', display: 'block' }}>
              <path d="M4 8V6a2 2 0 0 1 2-2h2" />
              <path d="M16 4h2a2 2 0 0 1 2 2v2" />
              <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
              <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
            </svg>
            {/* Animated scan line sweeping up and down */}
            <span
              style={{
                position: 'absolute',
                left: '3px',
                right: '3px',
                top: '5px',
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #FFFFFF, transparent)',
                borderRadius: '2px',
                animation: 'divido-scanline 1.5s ease-in-out infinite',
              }}
            />
          </span>
        </button>
      )}



      {showExpModal && (
        <React.Suspense fallback={null}>
        <ExpenseModal
          setShowExpModal={setShowExpModal}
          setEditingExpense={setEditingExpense}
          editingExpense={editingExpense}
          selectedGroup={selectedGroup}
          selectedId={selectedId}
          expenses={expenses}
          setExpenses={setExpenses}
          setShowCurrPickerId={setShowCurrPickerId}
          showCurrPickerId={showCurrPickerId}
          me={me}
          groups={groups}
          setGroups={setGroups}
          setShowAddFriendModal={setShowAddFriendModal}
          setSelectedId={setSelectedId}
          view={view}
          newlyAddedFriends={newlyAddedFriends}
          setNewlyAddedFriends={setNewlyAddedFriends}
          setActiveSplitters={setActiveSplitters}
          userName={userName}
          defaultCurrency={myDefaultCurrency}
          autoOpenScanner={autoOpenScanner}
          setAutoOpenScanner={setAutoOpenScanner}
          onRequireSignIn={requireSignInToCreate}
          deleteExpense={deleteExpenseSecure}
          onExpenseSaved={(savedExp, activeGrp) => {
            const targetGroup = activeGrp || groups.find(g => String(g.id) === String(savedExp.gId)) || {
              id: savedExp.gId || 'STANDALONE',
              name: 'Non-Group Expenses',
              members: savedExp.splitters || [],
              currency: savedExp.currency || myDefaultCurrency || '₹',
            };
            const unregisteredShares = getUnregisteredParticipantShares(savedExp, targetGroup, me);
            /* Temporarily disabled per user request
            if (unregisteredShares.length > 0) {
              setPostExpenseShareData({
                expense: savedExp,
                group: targetGroup,
                unregisteredShares,
              });
            }
            */
          }}
        />
        </React.Suspense>
      )}

      {showConvertModalId && (
        <CurrencyConverterModal
          setShowConvertModalId={setShowConvertModalId}
          group={groups.find((g) => String(g.id) === String(showConvertModalId))!}
          setGroups={setGroups}
          groups={groups}
          expenses={expenses}
          setExpenses={setExpenses}
          me={me}
        />
      )}

      {showAddFriendModal && (
        <AddFriendModal
          selectedGroup={selectedGroup}
          setGroups={setGroups}
          groups={groups}
          selectedId={selectedId}
          me={me}
          setSelectedId={setSelectedId}
          currentSplitters={activeSplitters}
          userMetadata={userMetadata}
          setUserMetadata={setUserMetadata}
           targetReminderName={activeReminderName}
           customRejoinLink={activeRejoinLink}
           shareOnly={addFriendShareOnly}
           onAdd={(names) => {
             if (selectedId === 'STANDALONE') {
               setNewlyAddedFriends(names);
             } else if (selectedId) {
               // If any added name already exists elsewhere, ask "same person?".
               const clashing = names
                 .map((n) => ({ name: n, candidates: findPersonCandidates(n, selectedId) }))
                 .filter((x) => x.candidates.length > 0);
               if (clashing.length > 0) {
                 setSamePersonPrompt({ groupId: selectedId, queue: clashing, index: 0, addNames: names });
               } else {
                 commitAddMembers(selectedId, names);
               }
             } else {
               if (!requireSignInToCreate()) return;
               const name = prompt('Ledger Name:', 'Quick Splits ⚡');
               if (name) {
                 if (groups.some((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())) {
                   alert('A group with that name already exists. Please pick a different name.');
                   return;
                 }
                 const id = genGroupId();
                 setGroups([...groups, { id, name, members: [me, ...names], currency: myDefaultCurrency, pendingMembers: names, pendingSync: true }]);
                 setSelectedId(id);
               }
             }
           }}
           setShowAddFriendModal={(show) => {
             setShowAddFriendModal(show);
             if (!show) {
               setActiveReminderName(null);
               setActiveRejoinLink(null);
               setAddFriendShareOnly(false);
             }
           }}
        />
      )}

      {samePersonPrompt && (() => {
        const item = samePersonPrompt.queue[samePersonPrompt.index];
        const multiple = samePersonPrompt.queue.length > 1;
        return (
          <div
            onClick={() => setSamePersonPrompt(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px', boxSizing: 'border-box' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '340px', padding: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', animation: 'fadeIn 0.2s ease-out' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
                <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </span>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E293B', flex: 1, minWidth: 0 }}>
                  {multiple ? `Which "${item.name}"?` : `You already have a "${item.name}"`}
                </div>
                <button
                  onClick={() => setSamePersonPrompt(null)}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', margin: '-2px -4px 0 0', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.5 }}>
                Is this the same person, or someone different who happens to share the name?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {item.candidates.map((c) => (
                  <button
                    key={c.identity}
                    onClick={() => resolvePersonChoice(c.identity)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#EEF2FF', color: '#4338CA', fontSize: '12px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>Same as {c.name}</span>
                      {c.groups.length > 0 && (
                        <span style={{ display: 'block', fontSize: '11px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.groups.join(', ')}</span>
                      )}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => resolvePersonChoice(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px dashed #CBD5E1', background: '#F8FAFC', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>A new, different person</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {matchPrompt && (
        <MatchPromptModal
          prompt={matchPrompt}
          onMatch={handleMatch}
          onDismiss={() => setMatchPrompt(null)}
        />
      )}
      {linkRequestGroup && (
        <div className="modal-overlay" style={{ zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '360px',
              padding: '24px 20px',
              borderRadius: '24px',
              animation: 'slideUp 0.3s ease-out',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.05)',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <button
              aria-label="Close"
              onClick={() => {
                const declinedId = linkRequestGroup?.id;
                setLinkRequestGroup(null);
                setJoinNewName('');
                localStorage.removeItem('divido_pending_join');
                if (declinedId != null) {
                  setGroups(prev => prev.filter(g => String(g.id) !== String(declinedId)));
                }
                const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
              }}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: 'none',
                background: '#F1F5F9',
                color: '#64748B',
                fontSize: '18px',
                fontWeight: 700,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>
              Join Group "{linkRequestGroup.name}"
            </h3>
            {linkRequestPlaceholders.length > 0 && (
              <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: '0 0 16px 0', lineHeight: 1.4 }}>
                Select your name to join.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
              {linkRequestPlaceholders.map((p) => (
                <button
                  key={p.id}
                  disabled={submittingLinkRequest}
                  onClick={async () => {
                    // Guard against claiming the wrong name. This binds the claimer's
                    // email to this member row permanently, so a fat-finger tap on the
                    // wrong row silently hijacks someone else's identity. One confirm()
                    // on the claimer's own screen catches the common accidental case.
                    const claimTarget = titleCaseName(p.name.replace(' (Left)', ''));
                    if (!confirm(`Join "${linkRequestGroup.name}" as "${claimTarget}"?\n\nThis is how the group will see you. Only continue if you are ${claimTarget}.`)) {
                      return;
                    }
                    setSubmittingLinkRequest(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const myEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app' : null);

                      const activeEmail = myEmail;
                      if (!activeEmail) {
                        // Google-first: no guest accounts (guests can't sync under
                        // the group's row-level-security rules). Persist the pending
                        // claim so it survives the OAuth round-trip, then send them to
                        // Google sign-in. Restored by joinGroupFromQuery on return.
                        try {
                          localStorage.setItem('divido_pending_join', JSON.stringify({
                            groupId: linkRequestGroup.id,
                            placeholderName: p.name,
                            ts: Date.now(),
                          }));
                        } catch { /* storage full — non-fatal */ }
                        const _join = new URL(window.location.href).searchParams.get('joinGroupId');
                        const cleanRedirect = window.location.origin + window.location.pathname + (_join ? `?joinGroupId=${_join}` : '');
                        await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: {
                            redirectTo: cleanRedirect,
                            queryParams: { prompt: 'select_account' },
                          },
                        });
                        setSubmittingLinkRequest(false);
                        return;
                      }

                      // A row is a "rejoin" ONLY when it reflects real past-member
                      // state: the name carries the " (Left)" suffix, or the invite
                      // link explicitly targets THIS name via ?rejoinName=. Never
                      // classify a fresh pending member as a rejoin just because its
                      // name happens to match this device's stale saved identity.
                      const rejoinParam = new URLSearchParams(window.location.search).get('rejoinName');
                      const isRejoin = p.name.endsWith(' (Left)') ||
                        (!!rejoinParam && rejoinParam.toLowerCase() === p.name.replace(' (Left)', '').toLowerCase());
                      const cleanName = isRejoin ? p.name.replace(' (Left)', '') : p.name;

                      if (isRejoin) {
                        // 1. Reactivate the left member row
                        await supabase
                          .from('group_members')
                          .update({
                            name: cleanName,
                            user_email: activeEmail,
                            is_pending: false
                          })
                          .eq('id', p.id);

                        // 2. Local identity setup — per-group name only; don't clobber
                        // an existing account profile name (Option-3 rule).
                        {
                          const existing = localStorage.getItem('divido_username');
                          const hasRealName = !!existing && !['You', 'Guest', 'undefined', ''].includes(existing.trim());
                          if (!hasRealName) { localStorage.setItem('divido_username', cleanName); setUserName(cleanName); }
                        }
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, cleanName);
                        setIsAuthenticated(true);
                        if (activeEmail.startsWith('guest-')) {
                          setUserEmail(activeEmail);
                        }

                        // Notify other members
                        try {
                          const { data: activeMems } = await supabase
                            .from('group_members')
                            .select('user_email')
                            .eq('group_id', linkRequestGroup.id)
                            .not('user_email', 'is', null);
                          
                          if (activeMems && activeMems.length > 0) {
                            const { pushNotification } = await import('./lib/notifications');
                            for (const mem of activeMems) {
                              if (mem.user_email && mem.user_email !== activeEmail) {
                                await pushNotification({
                                  recipientEmail: mem.user_email,
                                  type: 'join',
                                  title: `${cleanName} rejoined ${linkRequestGroup.name}`,
                                  body: `${cleanName} is back in the group.`,
                                  fromName: cleanName,
                                  groupId: linkRequestGroup.id,
                                });
                              }
                            }
                          }
                        } catch (e) {
                          console.error('Rejoin notification push failed:', e);
                        }

                        // 3. Insert system notification of rejoin
                        await supabase
                          .from('expenses')
                          .insert({
                            group_id: linkRequestGroup.id,
                            timestamp: Date.now(),
                            title: `${cleanName} rejoined`,
                            amt: 0,
                            paid: 'SYSTEM',
                            date: new Date().toISOString().split('T')[0],
                            mode: 'Equally',
                            splitters: []
                          });

                        alert(`Welcome back to "${linkRequestGroup.name}"! You have successfully rejoined as "${cleanName}". 🎉`);
                      } else {
                        // Normal claim flow
                        await supabase
                          .from('group_members')
                          .update({
                            user_email: activeEmail,
                            is_pending: false,
                          })
                          .eq('id', p.id);
                        
                        // Claiming sets your name INSIDE this group only — it must
                        // not overwrite your account profile name (Option-3 rule:
                        // profile and per-group names are independent). Only seed the
                        // profile name if you don't already have a real one.
                        {
                          const existing = localStorage.getItem('divido_username');
                          const hasRealName = !!existing && !['You', 'Guest', 'undefined', ''].includes(existing.trim());
                          if (!hasRealName) { localStorage.setItem('divido_username', p.name); setUserName(p.name); }
                        }
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, p.name);
                        setIsAuthenticated(true);
                        if (activeEmail.startsWith('guest-')) {
                          setUserEmail(activeEmail);
                        }

                        // No blocking alert — landing in the group is the confirmation.
                      }
                      
                      // Fetch the real member roster right now so the joiner sees
                      // everyone immediately. linkRequestGroup comes from the `groups`
                      // table and has no members array, so without this the group
                      // renders empty until the background cloud-load catches up
                      // (the 5-20s delay a new joiner would otherwise see).
                      let freshMembers: string[] = [];
                      let freshPending: string[] = [];
                      try {
                        const { data: gm } = await supabase
                          .from('group_members')
                          .select('*')
                          .eq('group_id', linkRequestGroup.id)
                          .order('id', { ascending: true });
                        if (gm) {
                          const activeMems = gm.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)'));
                          freshMembers = Array.from(new Set(activeMems.map((m: any) => m.name)));
                          freshPending = Array.from(new Set(activeMems
                            .filter((m: any) => m.is_pending && !m.user_email && !m.name.endsWith(' (Left)'))
                            .map((m: any) => m.name)));
                        }
                      } catch { /* fall back to background cloud-load below */ }

                       const updatedGroup = {
                        ...linkRequestGroup,
                        members: freshMembers.length
                          ? freshMembers
                          : (linkRequestGroup.members || []).map((m: string) =>
                              m.toLowerCase() === (cleanName + ' (Left)').toLowerCase() ? cleanName : m
                            ),
                        pendingMembers: freshPending,
                      };
                      setGroups(prev => {
                        const exists = prev.some(g => g.id === updatedGroup.id);
                        if (exists) {
                          return prev.map(g => g.id === updatedGroup.id ? updatedGroup : g);
                        }
                        return [...prev, updatedGroup];
                      });

                      setSelectedId(linkRequestGroup.id);
                      setView('detail');
                      setLinkRequestGroup(null);
                      localStorage.removeItem('divido_pending_join');
                    } catch (err) {
                      console.error(err);
                    } finally {
                      setSubmittingLinkRequest(false);
                      const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                      window.history.replaceState({}, document.title, cleanUrl);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1.5px solid #C4B5FD',
                    background: '#F5F3FF',
                    color: '#7C3AED',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: '0.2s all',
                    textAlign: 'center',
                  }}
                >
                  {(() => {
                    const rejoinParam = new URLSearchParams(window.location.search).get('rejoinName');
                    const isRejoinLabel = p.name.endsWith(' (Left)') ||
                      (!!rejoinParam && rejoinParam.toLowerCase() === p.name.replace(' (Left)', '').toLowerCase());
                    return isRejoinLabel ? `Rejoin as "${titleCaseName(p.name.replace(' (Left)', ''))}"` : `Claim "${titleCaseName(p.name)}"`;
                  })()}
                </button>
              ))}
            </div>

            {!linkRequestRejoinMode && (
            <div style={{ borderTop: linkRequestPlaceholders.length > 0 ? '1px solid #F1F5F9' : 'none', margin: '4px 0 12px', paddingTop: linkRequestPlaceholders.length > 0 ? '14px' : '4px' }}>
              {linkRequestPlaceholders.length > 0 && (
                <p style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, margin: '0 0 8px 0' }}>
                  Not listed? Join as a new member.
                </p>
              )}
              <input
                type="search"
                value={joinNewName}
                onChange={(e) => setJoinNewName(e.target.value)}
                placeholder="Your name"
                disabled={submittingLinkRequest}
                style={{ width: '100%', padding: '11px 12px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '14px', fontWeight: 600, marginBottom: '8px', boxSizing: 'border-box', textAlign: 'center' }}
              />
              <button
                disabled={submittingLinkRequest || !joinNewName.trim()}
                onClick={async () => {
                  const typed = joinNewName.trim();
                  if (!typed) return;
                  setSubmittingLinkRequest(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const myEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app' : null);
                    if (!myEmail) {
                      // Not signed in yet — save the invite intent and go to Google.
                      // On return the claim card reappears so they can join as new.
                      try {
                        localStorage.setItem('divido_pending_join', JSON.stringify({ groupId: linkRequestGroup.id, ts: Date.now() }));
                      } catch { /* storage full — non-fatal */ }
                      const _join = new URL(window.location.href).searchParams.get('joinGroupId');
                      const cleanRedirect = window.location.origin + window.location.pathname + (_join ? `?joinGroupId=${_join}` : '');
                      await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: cleanRedirect, queryParams: { prompt: 'select_account' } },
                      });
                      setSubmittingLinkRequest(false);
                      return;
                    }
                    // Fetch the roster: block a duplicate name, and adopt an
                    // existing row if this email already belongs to the group.
                    const { data: gm } = await supabase
                      .from('group_members')
                      .select('*')
                      .eq('group_id', linkRequestGroup.id)
                      .order('id', { ascending: true });
                    const roster = gm || [];
                    const norm = (n: string) => n.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
                    const mine = roster.find((m: any) => m.user_email && String(m.user_email).toLowerCase() === myEmail.toLowerCase());
                    if (!mine) {
                      if (roster.some((m: any) => norm(m.name) === norm(typed))) {
                        alert(`"${typed}" is already in this group. Add a surname or pick a different name.`);
                        setSubmittingLinkRequest(false);
                        return;
                      }
                      // New member identified by email (person_id null, like the
                      // group creator). is_pending false — they've actively joined.
                      const { error: insErr } = await supabase.from('group_members').insert({
                        group_id: linkRequestGroup.id,
                        name: typed,
                        user_email: myEmail,
                        is_pending: false,
                        person_id: null,
                      });
                      if (insErr) throw insErr;
                    }
                    const myName = mine ? String(mine.name).replace(/\s*\(Left\)$/i, '') : typed;
                    {
                      const existing = localStorage.getItem('divido_username');
                      const hasRealName = !!existing && !['You', 'Guest', 'undefined', ''].includes(existing.trim());
                      if (!hasRealName) { localStorage.setItem('divido_username', myName); setUserName(myName); }
                    }
                    localStorage.setItem('divido_authenticated', 'true');
                    localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, myName);
                    setIsAuthenticated(true);
                    // Re-fetch so the joiner sees the full roster (incl. their new row).
                    let freshMembers: string[] = [];
                    let freshPending: string[] = [];
                    try {
                      const { data: gm2 } = await supabase
                        .from('group_members')
                        .select('*')
                        .eq('group_id', linkRequestGroup.id)
                        .order('id', { ascending: true });
                      if (gm2) {
                        const activeMems = gm2.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)'));
                        freshMembers = Array.from(new Set(activeMems.map((m: any) => m.name)));
                        freshPending = Array.from(new Set(activeMems
                          .filter((m: any) => m.is_pending && !m.user_email && !m.name.endsWith(' (Left)'))
                          .map((m: any) => m.name)));
                      }
                    } catch { /* background cloud-load will catch up */ }
                    const updatedGroup = {
                      ...linkRequestGroup,
                      members: freshMembers.length ? freshMembers : [...(linkRequestGroup.members || []), myName],
                      pendingMembers: freshPending,
                    };
                    setGroups(prev => prev.some(g => g.id === updatedGroup.id)
                      ? prev.map(g => g.id === updatedGroup.id ? updatedGroup : g)
                      : [...prev, updatedGroup]);
                    setSelectedId(linkRequestGroup.id);
                    setView('detail');
                    setLinkRequestGroup(null);
                    setJoinNewName('');
                    localStorage.removeItem('divido_pending_join');
                    // No blocking alert — landing in the group is the confirmation.
                  } catch (err) {
                    console.error('Join as new member failed:', err);
                    alert('Could not join right now. Please try again.');
                  } finally {
                    setSubmittingLinkRequest(false);
                    const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                    window.history.replaceState({}, document.title, cleanUrl);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: joinNewName.trim() ? '#6366F1' : '#CBD5E1',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: joinNewName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Join as new member
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {showMembersHealth && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowMembersHealth(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 className="nunito" style={{ marginBottom: '32px' }}>
              Members Health 👥
            </h2>
            {selectedGroup.members.map((m) => {
              const mBalance = getMemberBalance(selectedId, m);
              return (
                <div
                  key={m}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '16px',
                    background: 'var(--bg)',
                    borderRadius: '18px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>
                    {m} {m === me && '(You)'}
                  </div>
                  <BalanceDisplay
                    balances={mBalance}
                    style={{ fontWeight: 900, color: '#000000', textAlign: 'right' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SearchableCurrencyPicker
        show={!!showCurrPickerId && showCurrPickerId !== 'expense' && showCurrPickerId !== 'settle'}
        onClose={() => setShowCurrPickerId(null)}
        onSelect={(s) =>
          setGroups(
            groups.map((g) => (String(g.id) === String(showCurrPickerId) ? { ...g, currency: s } : g))
          )
        }
        current={groups.find((g) => String(g.id) === String(showCurrPickerId))?.currency || '₹'}
      />

      {globalSettleData && (
        <div
          className="modal-overlay"
          style={{ zIndex: 4000, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', padding: 0 }}
          onClick={() => setGlobalSettleData(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              margin: '0 auto',
              height: '100%',
              padding: 'calc(20px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))',
              borderRadius: 0,
              position: 'relative',
              animation: 'slideUp 0.28s ease-out',
              background: '#FFFFFF',
              border: 'none',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Invisible decoy input to trick browser autofill heuristics.
                NOTE: no type="password" decoy — a password field (even hidden)
                makes mobile Chrome treat the modal as a login form and pop the
                password-manager bar over the real inputs. */}
            <input type="text" name="username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
            <div
              onClick={() => setGlobalSettleData(null)}
              style={{
                position: 'fixed',
                top: 'calc(14px + env(safe-area-inset-top))',
                right: '16px',
                zIndex: 4100,
                cursor: 'pointer',
                fontSize: '18px',
                color: '#475569',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'rgba(241,245,249,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              ✕
            </div>
            <h3 className="nunito" style={{
              fontSize: '20px',
              fontWeight: 800,
              color: '#1E293B',
              marginBottom: '4px',
              textAlign: 'center'
            }}>
              Settle with {globalSettleData.name}
            </h3>
            {globalSettleData.identity && String(globalSettleData.identity).includes('@') && (
              <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '12px', fontWeight: 500, marginBottom: '4px', wordBreak: 'break-all' }}>
                {globalSettleData.identity}
              </p>
            )}
            <p style={{
              textAlign: 'center',
              color: '#64748B',
              fontSize: '9.5px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '16px'
            }}>
              {globalSettleData.gId ? `Breakdown for ${
                globalSettleData.gId === 'STANDALONE'
                  ? 'Non-Group Expenses'
                  : groups.find((g) => String(g.id) === String(globalSettleData.gId))?.name || 'group'
              }` : 'Breakdown across all shared groups'}
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '300px',
                overflowY: 'auto',
                paddingRight: '4px',
                marginBottom: '16px',
              }}
            >
              {localSettleEdits.map((item, idx) => {
                const isPayable = item.paidBy === me;
                const isSelected = item.selected;

                return (
                  <div
                    key={item.gId != null ? String(item.gId) : idx}
                    style={{
                      background: isSelected ? '#F8FAFC' : '#FFFFFF',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1.5px solid ' + (
                        isSelected
                          ? (isPayable ? '#FECDD3' : '#A7F3D0')
                          : '#E2E8F0'
                      ),
                      opacity: isSelected ? 1 : 0.5,
                      transition: '0.2s all',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    {/* Left: Checkbox, Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <div
                        id={`global-settle-check-${idx}`}
                        tabIndex={0}
                        onClick={() =>
                          setLocalSettleEdits(
                            localSettleEdits.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it))
                          )
                        }
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: '2px solid ' + (isSelected ? '#10B981' : '#CBD5E1'),
                          background: isSelected ? '#10B981' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && '✓'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.gId) {
                              setSelectedId(item.gId === 'STANDALONE' ? 'STANDALONE' : item.gId);
                              setView('detail');
                              setGlobalSettleData(null);
                            }
                          }}
                          className="clickable-group-name"
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#2563EB',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          title={`Go to ${item.gName}`}
                        >
                          {item.gName}
                        </span>
                        {/* Direction of this row, so a mixed net (you pay in one
                            group, collect in another) reads correctly. */}
                        <span style={{ fontSize: '10px', fontWeight: 800, marginTop: '1px', color: item.paidBy === me ? '#DB2777' : '#10B981' }}>
                          {item.paidBy === me ? 'You are Paying' : 'You are Collecting'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Input and MAX button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '32px', animation: settleShakeIdx === idx ? 'divido-shake 0.4s ease-in-out' : undefined }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: '8px',
                            top: 0,
                            bottom: 0,
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#64748B',
                            pointerEvents: 'none',
                          }}
                        >
                          {item.curr}
                        </span>
                        <SettleAmountInput
                          inputId={`global-settle-val-${idx}`}
                          amount={item.amt}
                          maxAmt={typeof item.maxAmt === 'number' ? item.maxAmt : Number.POSITIVE_INFINITY}
                          disabled={!isSelected}
                          shake={settleShakeIdx === idx}
                          currency={item.curr}
                          onCommit={(v) =>
                            setLocalSettleEdits((prev) => prev.map((it, i) => (i === idx ? { ...it, amt: v } : it)))
                          }
                          onExceed={() => {
                            setSettleShakeIdx(idx);
                            window.setTimeout(() => setSettleShakeIdx((cur) => (cur === idx ? null : cur)), 450);
                          }}
                        />
                        <style>{`@keyframes divido-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}`}</style>
                      </div>
                      <button
                        id={`global-settle-max-${idx}`}
                        disabled={!isSelected}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: !isSelected ? '#94A3B8' : (isPayable ? '#E11D48' : '#0D9488'),
                          textDecoration: 'underline',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: isSelected ? 'pointer' : 'not-allowed',
                          padding: '0 4px',
                          transition: '0.2s all',
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                        onClick={() => {
                          setLocalSettleEdits(
                            localSettleEdits.map((it, i) => (i === idx ? { ...it, amt: it.maxAmt } : it))
                          );
                        }}
                      >
                        max
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {(() => {
              const netBalances: Record<string, number> = {};
              localSettleEdits.forEach((item) => {
                if (!item.selected) return;
                const amt = parseFloat(item.amt) || 0;
                if (!netBalances[item.curr]) netBalances[item.curr] = 0;
                if (item.paidBy === me) {
                  netBalances[item.curr] -= amt;
                } else {
                  netBalances[item.curr] += amt;
                }
              });

              const hasActiveBalances = Object.values(netBalances).some((b) => Math.abs(b) >= 0.01);
              const friendName = globalSettleData.name;

              return (
                <div style={{ marginBottom: '16px' }}>
                  {hasActiveBalances && Object.entries(netBalances).map(([curr, netVal]) => {
                    if (Math.abs(netVal) < 0.01) return null;
                    const isOwed = netVal < 0;
                    const absoluteAmt = Math.abs(netVal);

                    return (
                      <div
                        key={curr}
                        style={{
                          textAlign: 'center',
                          padding: '4px 0px',
                          fontSize: '12.5px',
                          fontWeight: 500,
                          color: '#475569',
                          fontStyle: 'italic',
                        }}
                      >
                        {isOwed ? (
                          <span>
                            You pay <strong>{friendName}</strong> a net of{' '}
                            <strong style={{ color: '#E11D48', fontSize: '14.5px', fontWeight: 700, marginLeft: '2px' }}>
                              {curr}{absoluteAmt >= 1000000 ? formatCompactAmount(absoluteAmt) : absoluteAmt.toFixed(2)}
                            </strong>
                          </span>
                        ) : (
                          <span>
                            You get back a net of{' '}
                            <strong style={{ color: '#10B981', fontSize: '14.5px', fontWeight: 700, marginRight: '2px' }}>
                              {curr}{absoluteAmt >= 1000000 ? formatCompactAmount(absoluteAmt) : absoluteAmt.toFixed(2)}
                            </strong>{' '}
                            from <strong>{friendName}</strong>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {(() => {
              const netBalances: Record<string, number> = {};
              localSettleEdits.forEach((item) => {
                if (!item.selected) return;
                const amt = parseFloat(item.amt) || 0;
                if (!netBalances[item.curr]) netBalances[item.curr] = 0;
                if (item.paidBy === me) {
                  netBalances[item.curr] -= amt;
                } else {
                  netBalances[item.curr] += amt;
                }
              });

              const selectedCount = localSettleEdits.filter((it) => it.selected).length;
              const hasActiveBalances = Object.values(netBalances).some((b) => Math.abs(b) >= 0.01);
              const friendName = globalSettleData.name;

              let buttonText = `Settle ${selectedCount} Items`;
              let clickHandler = handleFinalGlobalSettle;
              let isOwed = false;

              if (selectedCount === 0) {
                buttonText = 'Select items to settle';
              } else if (hasActiveBalances) {
                const curr = Object.keys(netBalances)[0] || '₹';
                const netVal = netBalances[curr] || 0;
                const absoluteAmt = Math.abs(netVal);
                const displayAmtStr = absoluteAmt >= 1000000 ? formatCompactAmount(absoluteAmt) : absoluteAmt.toFixed(2);
                isOwed = netVal < 0;

                if (isOwed) {
                  buttonText = `Settle All Net (Pay ${curr}${displayAmtStr})`;
                  clickHandler = () => handleOpenPayablePopup(friendName, absoluteAmt, curr);
                } else {
                  buttonText = `Settle All Net (Send Reminder)`;
                  clickHandler = () => handleOpenReceivablePopup(friendName, absoluteAmt, curr);
                }
              }

              if (selectedCount === 0) {
                return (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      className="btn-green"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '14px',
                        opacity: 0.5,
                        border: 'none',
                        cursor: 'not-allowed',
                      }}
                      disabled
                    >
                      Select items to settle
                    </button>
                  </div>
                );
              }

              if (!hasActiveBalances) {
                return (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      className="btn-green hover-up"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '14px',
                        border: 'none',
                      }}
                      onClick={handleFinalGlobalSettle}
                    >
                      Mark as Settled
                    </button>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '14px',
                      background: '#F8FAFC',
                      color: '#475569',
                      border: '1.5px solid #E2E8F0',
                      cursor: 'pointer',
                    }}
                    onClick={handleFinalGlobalSettle}
                  >
                    Mark as Settled
                  </button>
                  <button
                    type="button"
                    id="global-settle-submit-btn"
                    style={{
                      flex: 1.2,
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '14px',
                      background: '#0D9488',
                      color: '#FFFFFF',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(13, 148, 136, 0.1)',
                    }}
                    onClick={clickHandler}
                  >
                    {isOwed ? 'Pay Now' : 'Send Reminder'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}



      {view !== 'create_group' && !isPhotoViewerOpen && (
        <nav className="bottom-nav">
          <div
            className={`b-nav-btn ${view === 'summary' || view === 'detail' ? 'active' : ''}`}
            onClick={() => {
              setSelectedId(null);
              setView('summary');
            }}
          >
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M3 10.5L12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M9.5 20v-6h5v6" />
              </svg>
            </span>
            <span>Home</span>
          </div>

          <div
            className={`b-nav-btn ${view === 'friends' ? 'active' : ''}`}
            onClick={() => {
              setSelectedId(null);
              setView('friends');
            }}
          >
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span>Friends</span>
          </div>

          {/* Central Button — always "Add Expense", the single most-used action. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              top: '-16px',
              flex: 1,
              height: '68px',
              zIndex: 10
            }}
          >
            <button
              onClick={() => addExpenseFromNav()}
              className="pulse-button"
              aria-label="Add expense"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#059669',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                transition: 'all 0.2s',
                padding: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px', color: '#FFFFFF' }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--g)',
                marginTop: '2px',
                whiteSpace: 'nowrap'
              }}
            >
              Expense
            </span>
          </div>

          <div className={`b-nav-btn ${view === 'analytics' ? 'active' : ''}`} onClick={() => {
            if (view === 'detail' && selectedId) {
              setAnalyticsGroupId(selectedId);
            } else {
              setAnalyticsGroupId(null);
            }
            setView('analytics');
          }}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M3 3v18h18" />
                <path d="m7 14 4-4 3 3 5-6" />
              </svg>
            </span>
            <span>Analytics</span>
          </div>

          <div className={`b-nav-btn ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span>Profile</span>
          </div>
        </nav>
      )}

      <PremiumConfirm
        show={confirmState.show}
        title={confirmState.title || ''}
        desc={confirmState.desc || ''}
        type={confirmState.type}
        onConfirm={confirmState.onConfirm || (() => {})}
        onCancel={() => setConfirmState({ show: false })}
      />

      {balanceCard && (
        <BalanceActionCard
          title={balanceCard.title}
          desc={balanceCard.desc}
          primaryLabel={balanceCard.primaryLabel}
          primaryColor={balanceCard.primaryColor}
          onPrimary={balanceCard.onPrimary}
          secondaryLabel={balanceCard.secondaryLabel}
          onSecondary={balanceCard.onSecondary}
          onClose={() => setBalanceCard(null)}
        />
      )}

      {qrModalData && (
        <React.Suspense fallback={null}>
          <UPIQRModal
            show={!!qrModalData}
            onClose={() => setQrModalData(null)}
            payeeName={qrModalData.payee}
            upiId={userMetadata[qrModalData.payee]?.upiId || ''}
            amount={qrModalData.amt}
            currency={qrModalData.currency}
            requestFrom={qrModalData.requestFrom}
            onSaveUpi={(newUpi) => {
              setUserMetadata((prev) => ({
                ...prev,
                [qrModalData.payee]: {
                  ...prev[qrModalData.payee],
                  upiId: newUpi,
                },
              }));
            }}
          />
        </React.Suspense>
      )}

      <CurrencySetupModal
        show={false}
        suggested={myDefaultCurrency}
        onConfirm={(symbol) => {
          setUserMetadata({
            ...userMetadata,
            [me]: { ...userMetadata[me], defaultCurrency: symbol },
          });
          localStorage.setItem('divido_currency_setup_seen_' + me, '1');
          setCurrencySetupDismissed(true);
        }}
        onSkip={() => {
          localStorage.setItem('divido_currency_setup_seen_' + me, '1');
          setCurrencySetupDismissed(true);
        }}
      />

      <NetPayableModal
        popupData={netPayablePopup}
        onClose={() => setNetPayablePopup(null)}
        me={me}
        userMetadata={userMetadata}
        setUserMetadata={setUserMetadata}
        onFinalSettle={handleFinalGlobalSettle}
      />

      {netReceivablePopup && (
        <React.Suspense fallback={null}>
          <NetReceivableModal
            popupData={netReceivablePopup}
            onClose={() => setNetReceivablePopup(null)}
            me={me}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            onFinalSettle={handleFinalGlobalSettle}
          />
        </React.Suspense>
      )}

      {showDeleteAccountModal && (
        <div
          className="modal-overlay"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={() => setShowDeleteAccountModal(false)}
        >
          <div
            className="card shadow-xl"
            style={{ width: '340px', padding: '24px', position: 'relative', animation: 'slideUp 0.3s ease-out', textAlign: 'center', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onClick={() => {
                setShowDeleteAccountModal(false);
                setFeedback('');
              }}
              style={{
                position: 'absolute',
                top: '14px',
                right: '16px',
                cursor: 'pointer',
                fontSize: '20px',
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
            <div style={{ fontSize: '34px', marginBottom: '8px' }}>🥺</div>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 950, color: '#1F2937', marginBottom: '14px' }}>
              Sorry to see you go
            </h3>
            <textarea
              id="delete-feedback-textarea"
              placeholder="Anything we could do better? (optional)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              style={{
                width: '100%',
                height: '64px',
                padding: '10px 14px',
                borderRadius: '14px',
                border: '2px solid #E2E8F0',
                background: 'var(--bg)',
                fontFamily: 'inherit',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
                marginBottom: '16px',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <button
                id="delete-cancel-btn"
                onClick={() => {
                  setShowDeleteAccountModal(false);
                  setFeedback('');
                }}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
                  color: 'white',
                  fontWeight: 950,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(5, 150, 105, 0.2)',
                  transition: '0.2s all',
                }}
                className="hover-up"
              >
                I'll stay!
              </button>
              <button
                id="delete-confirm-btn"
                onClick={async () => {
                  if (userEmail) {
                    try {
                      // 1. Find all group memberships linked to this email
                      const { data: memberships } = await supabase
                        .from('group_members')
                        .select('id, name, group_id')
                        .eq('user_email', userEmail);
                      
                      if (memberships && memberships.length > 0) {
                        for (const m of memberships) {
                          const cleanName = m.name.replace(' (Left)', '');
                          // 2. Mark them as past members and unlink email
                          await supabase
                            .from('group_members')
                            .update({
                              name: cleanName + ' (Left)',
                              user_email: null,
                              is_pending: true
                            })
                            .eq('id', m.id);
                        }
                      }
                    } catch (e) {
                      console.error('Failed to unlink user memberships on deletion:', e);
                    }

                    // 3. Clear this email's notifications. They're keyed by email,
                    //    not by account — so without this, signing up again with the
                    //    same Google email would resurface old pre-deletion notifications.
                    try {
                      await clearAllNotifications(userEmail);
                    } catch (e) {
                      console.error('Failed to clear notifications on deletion:', e);
                    }

                    // 4. Permanently delete the auth identity via the server-side
                    //    Edge Function (the client cannot do this itself). Must run
                    //    while the session is still valid, before signOut below.
                    //    If the function isn't deployed / fails, we still fall
                    //    through to signOut + local wipe (soft delete) as a safety net.
                    try {
                      const { error: fnErr } = await supabase.functions.invoke('delete-account');
                      if (fnErr) console.error('Account deletion function returned an error:', fnErr);
                    } catch (e) {
                      console.error('Account deletion function failed (falling back to sign-out):', e);
                    }
                  }

                  // 5. Terminate active session
                  try {
                    await supabase.auth.signOut();
                  } catch (e) {
                    console.error('Sign out error on account deletion:', e);
                  }

                  // 6. Clear local cache
                  localStorage.clear();

                  // 7. Reset React states
                  setGroups([]);
                  setExpenses([]);
                  setUserName('You');
                  setUserMetadata({});
                  setIsAuthenticated(false);
                  setTempName('');
                  setView('summary');
                  setTheme('lavender');

                  setShowDeleteAccountModal(false);
                  setFeedback('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#B91C1C')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#EF4444')}
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {undoStack.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#FFFFFF',
            color: '#1E293B',
            padding: '12px 14px 14px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: '290px',
            maxWidth: 'calc(100vw - 32px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            border: '0.5px solid #E2E8F0',
            overflow: 'hidden',
            zIndex: 10000,
            animation: 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>Entry deleted</div>
            <div
              style={{
                fontSize: '11px',
                color: '#94A3B8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {undoStack[0].item.title}
            </div>
          </div>
          <button
            onClick={performUndo}
            style={{
              background: '#10B981',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
            Undo
          </button>
          <div
            key={undoStack[0].timestamp}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: '3px',
              width: '100%',
              background: '#10B981',
              transformOrigin: 'left',
              animation: 'undoBarDeplete 6s linear forwards',
            }}
          />
        </div>
      )}

      {toastMsg && (
        <div
          onClick={() => setToastMsg(null)}
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#B45309',
            padding: '8px 14px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            zIndex: 10000,
            cursor: 'pointer',
            animation: 'toastPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            boxSizing: 'border-box',
            width: 'max-content',
            maxWidth: '90%',
          }}
        >
          <style>{`
            @keyframes toastPopIn {
              0% { transform: translate(-50%, 20px) scale(0.9); opacity: 0; }
              100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
            }
          `}</style>
          
          <span style={{
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.2px',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {toastMsg}
          </span>
          
          <span style={{ 
            fontSize: '11px', 
            color: '#D97706', 
            marginLeft: '6px', 
            opacity: 0.8,
            fontWeight: 'bold',
            transition: 'color 0.2s' 
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#B45309'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#D97706'; }}
          >✕</span>
        </div>
      )}

      {postExpenseShareData && (
        <PostExpenseShareSheet
          expense={postExpenseShareData.expense}
          group={postExpenseShareData.group}
          unregisteredShares={postExpenseShareData.unregisteredShares}
          onClose={() => setPostExpenseShareData(null)}
        />
      )}

      <SettleModal
        show={showSettleModal}
        onClose={() => {
          setShowSettleModal(false);
          setEditingSettle(null);
        }}
        editingSettle={editingSettle}
        setEditingSettle={setEditingSettle}
        selectedGroup={selectedGroup || { id: '', name: 'Default Group', members: [me], currency: '₹', emoji: '🏡', simplifyDebts: false }}
        selectedId={selectedId}
        expenses={expenses}
        setExpenses={setExpenses}
        groups={groups}
        me={me}
        userMetadata={userMetadata}
        setUserMetadata={setUserMetadata}
        showCurrPickerId={showCurrPickerId}
        setShowCurrPickerId={setShowCurrPickerId}
        onShowQR={(payee, amt, curr) => setQrModalData({ payee, amt, currency: curr })}
      />

      {showRejoinRequestModal && (() => {
        const adminRaw = (selectedGroup?.members || []).filter((m) => !m.toLowerCase().endsWith(' (left)'))[0] || '';
        const adminName = adminRaw.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim();
        const showAdminName = adminName && adminName.toLowerCase() !== 'you';
        const adminLabel = showAdminName ? <> (<span style={{ color: '#0F172A', fontWeight: 800 }}>{adminName}</span>)</> : null;
        const cleanMeName = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
        const currentGroup = groups.find((g) => String(g.id) === String(selectedId));
        // No active (non-left) member => dormant group. Rejoin self-approves
        // (no admin to ask), so the copy/CTA must not promise "approval".
        const noActiveAdmin = !adminRaw;
        const pendingReqs = currentGroup?.pendingLinkRequests || [];
        const hasPendingRejoin = !!pendingReqs.find((req: any) =>
          (req.placeholderName || '').replace(/\s*\(Left\)$/i, '').toLowerCase() === cleanMeName ||
          (req.requestName || '').toLowerCase() === cleanMeName
        );
        return (
        <div className="modal-overlay" style={{ zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '340px',
              padding: '24px 20px',
              borderRadius: '24px',
              position: 'relative',
              animation: 'slideUp 0.3s ease-out',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.05)',
              textAlign: 'center',
            }}
          >
            <button
              onClick={() => setShowRejoinRequestModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '18px',
                border: 'none',
                background: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#64748B',
                opacity: 0.6,
              }}
            >
              ✕
            </button>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: hasPendingRejoin ? '#FEF3C7' : '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              {hasPendingRejoin ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a4 4 0 0 1 0 8h-1" /></svg>
              )}
            </div>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
              {hasPendingRejoin ? 'Waiting for approval' : noActiveAdmin ? 'Rejoin instantly?' : 'Rejoin this group?'}
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: '0 0 20px 0', lineHeight: 1.4 }}>
              {hasPendingRejoin
                ? <>Your request was sent to the group admin{adminLabel}. You'll get access once it's approved.</>
                : noActiveAdmin
                ? <>No one's active in this group right now, so you'll rejoin straight away and become the admin.</>
                : <>The group admin{adminLabel} needs to approve.</>}
            </p>
            {hasPendingRejoin ? (
              <button
                onClick={() => setShowRejoinRequestModal(false)}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
              >
                Got it
              </button>
            ) : (
            <button
              onClick={async () => {
                setShowRejoinRequestModal(false);
                if (selectedId && selectedId !== 'STANDALONE') {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const myEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app' : null);

                    const searchName = me + ' (Left)';
                    const { data: matched } = await supabase
                      .from('group_members')
                      .select('id, name')
                      .eq('group_id', selectedId)
                      .eq('name', searchName)
                      .maybeSingle();

                    if (matched) {
                      // Dormant group with NO active member/admin to approve a
                      // rejoin request: reactivate directly instead of sending a
                      // request nobody can ever approve. The rejoiner becomes the
                      // sole active member (and thus the new admin), reviving the
                      // group. Safe — it's their own identity, and there's no one to
                      // gate it against.
                      const grpForRejoin = groups.find((g) => String(g.id) === String(selectedId));
                      const activeMems = (grpForRejoin?.members || []).filter((m) => !m.endsWith(' (Left)'));
                      if (activeMems.length === 0) {
                        const cleanName = me.replace(/\s*\(Left\)$/i, '');
                        await supabase
                          .from('group_members')
                          .update({
                            name: cleanName,
                            user_email: myEmail,
                            is_pending: false,
                            link_request_email: null,
                            link_request_name: null,
                          })
                          .eq('id', matched.id);
                        {
                          const existing = localStorage.getItem('divido_username');
                          const hasRealName = !!existing && !['You', 'Guest', 'undefined', ''].includes(existing.trim());
                          if (!hasRealName) { localStorage.setItem('divido_username', cleanName); setUserName(cleanName); }
                        }
                        localStorage.setItem(`divido_identity_${selectedId}`, cleanName);
                        setGroups(groups.map((g) =>
                          String(g.id) === String(selectedId)
                            ? {
                                ...g,
                                members: g.members.map((m) => (m === searchName ? cleanName : m)),
                                pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => r.requestEmail !== myEmail),
                              }
                            : g
                        ));
                        setToastMsg(`Welcome back! You rejoined ${grpForRejoin?.name || 'the group'}.`);
                        setTimeout(() => setToastMsg(null), 3000);
                        return;
                      }

                      await supabase
                        .from('group_members')
                        .update({
                          is_pending: true,
                          link_request_email: myEmail,
                          link_request_name: me
                        })
                        .eq('id', matched.id);

                      // Find Admin to notify
                      let targetAdminName = 'Admin';
                      const selectedGroup = groups.find((g) => String(g.id) === String(selectedId));
                      if (selectedGroup) {
                        const activeMembers = (selectedGroup.members || []).filter((m) => !m.endsWith(' (Left)'));
                        const adminName = activeMembers[0];
                        if (adminName) {
                          targetAdminName = adminName.replace(/\s*\(me\)$/i, '');
                          const { data: adminRows } = await supabase
                            .from('group_members')
                            .select('user_email')
                            .eq('group_id', selectedId)
                            .eq('name', adminName)
                            .not('user_email', 'is', null)
                            .limit(1);
                          const adminEmail = adminRows?.[0]?.user_email;
                          if (adminEmail) {
                            const { pushNotification } = await import('./lib/notifications');
                            await pushNotification({
                              recipientEmail: adminEmail,
                              type: 'link_request',
                              title: `${me} wants to rejoin ${selectedGroup.name}`,
                              groupId: selectedId,
                            });
                          }
                        }
                      }

                      setToastMsg(`Request Sent to Admin (${targetAdminName})`);
                      setTimeout(() => setToastMsg(null), 3000);
                      
                      setGroups(groups.map((g) => {
                        if (String(g.id) === String(selectedId)) {
                          const existingRequests = g.pendingLinkRequests || [];
                          const updatedRequests = [
                            ...existingRequests.filter(r => r.requestEmail !== myEmail),
                            {
                              id: String(matched.id),
                              placeholderName: searchName,
                              requestName: me,
                              requestEmail: myEmail || '',
                            }
                          ];
                          return {
                            ...g,
                            pendingLinkRequests: updatedRequests
                          };
                        }
                        return g;
                      }));
                    }
                  } catch (err) {
                    console.error('Failed to request rejoin:', err);
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: '#059669',
                color: 'white',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                transition: '0.2s all',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)',
              }}
            >
              {noActiveAdmin ? 'Rejoin now' : 'Send request'}
            </button>
            )}
          </div>
        </div>
        );
      })()}

      {adminRejoinRequest && (
        <div className="modal-overlay" style={{ zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '360px',
              padding: '24px 20px',
              borderRadius: '24px',
              position: 'relative',
              animation: 'slideUp 0.3s ease-out',
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.05)',
              textAlign: 'center',
            }}
          >
            <button
              onClick={() => setAdminRejoinRequest(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '18px',
                border: 'none',
                background: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#64748B',
                opacity: 0.6,
              }}
            >
              ✕
            </button>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0' }}>
              Rejoin Request
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 650, margin: '0 0 20px 0', lineHeight: 1.4 }}>
              {adminRejoinRequest.requestName} wants to rejoin {adminRejoinRequest.groupName}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  if (!adminRejoinRequest) return;
                  try {
                    await supabase
                      .from('group_members')
                      .update({
                        link_request_email: null,
                        link_request_name: null,
                      })
                      .eq('id', adminRejoinRequest.id);

                    alert('Rejoin request declined.');
                    // Remove the handled request from local state so the
                    // auto-open effect (keyed on groups) doesn't immediately
                    // re-open this modal — that was the "needs 2 clicks" bug.
                    setGroups((prev) => prev.map((g) =>
                      String(g.id) === String(adminRejoinRequest.groupId)
                        ? { ...g, pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => String(r.id) !== String(adminRejoinRequest.id)) }
                        : g
                    ));
                    setAdminRejoinRequest(null);
                  } catch (err) {
                    console.error('Failed to decline rejoin request:', err);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#64748B',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: '0.2s all',
                }}
              >
                Decline
              </button>
              <button
                onClick={async () => {
                  if (!adminRejoinRequest) return;
                  try {
                    const cleanName = adminRejoinRequest.placeholderName.replace(/\s*\(Left\)$/i, '');
                    await supabase
                      .from('group_members')
                      .update({
                        name: cleanName,
                        user_email: adminRejoinRequest.requestEmail,
                        is_pending: false,
                        link_request_email: null,
                        link_request_name: null,
                      })
                      .eq('id', adminRejoinRequest.id);

                    try {
                      await supabase
                        .from('expenses')
                        .insert({
                          group_id: adminRejoinRequest.groupId,
                          timestamp: Date.now(),
                          title: `${cleanName} rejoined`,
                          amt: 0,
                          paid: 'SYSTEM',
                          date: new Date().toISOString().split('T')[0],
                          mode: 'Equally',
                          splitters: []
                        });
                    } catch (e) {
                      console.error('Rejoin activity log failed:', e);
                    }

                    alert('Rejoin request approved! 🎉');
                    // Remove the handled request from local state so the
                    // auto-open effect (keyed on groups) doesn't immediately
                    // re-open this modal — that was the "needs 2 clicks" bug.
                    // The full member state is reconciled on the next cloud sync.
                    setGroups((prev) => prev.map((g) =>
                      String(g.id) === String(adminRejoinRequest.groupId)
                        ? { ...g, pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => String(r.id) !== String(adminRejoinRequest.id)) }
                        : g
                    ));
                    setAdminRejoinRequest(null);
                  } catch (err) {
                    console.error('Failed to approve rejoin request:', err);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#059669',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: '0.2s all',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)',
                }}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
