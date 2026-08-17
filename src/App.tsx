import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Login } from './components/Login';
import { supabase } from './lib/supabaseClient';
import { Sidebar } from './components/Sidebar';
import { GroupDetail } from './components/GroupDetail';
import { GroupsView } from './components/GroupsView';
import { CreateGroupView } from './components/CreateGroupView';
// Lazy-loaded heavy screens/modals: only fetched when the user actually opens
// them, keeping the initial app bundle (and first paint) smaller.
const MasterSummary = React.lazy(() => import('./components/MasterSummary').then((m) => ({ default: m.MasterSummary })));
const FriendsView = React.lazy(() => import('./components/FriendsView').then((m) => ({ default: m.FriendsView })));
const Analytics = React.lazy(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const ActivityStudio = React.lazy(() => import('./components/ActivityStudio').then((m) => ({ default: m.ActivityStudio })));
const Profile = React.lazy(() => import('./components/Profile').then((m) => ({ default: m.Profile })));
const ExpenseModal = React.lazy(() => import('./components/ExpenseModal').then((m) => ({ default: m.ExpenseModal })));
// QR modals pull in the qrcode library — keep it out of the main bundle by
// loading these only when a user actually opens a payment/QR popup.
const UPIQRModal = React.lazy(() => import('./components/UPIQRModal').then((m) => ({ default: m.UPIQRModal })));
const NetReceivableModal = React.lazy(() => import('./components/NetReceivableModal').then((m) => ({ default: m.NetReceivableModal })));
import { CurrencyConverterModal } from './components/CurrencyConverterModal';
import { AddFriendModal } from './components/AddFriendModal';
import { MatchPromptModal } from './components/MatchPromptModal';
import { SearchableCurrencyPicker } from './components/SearchableCurrencyPicker';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PremiumConfirm } from './components/PremiumConfirm';
import { escManager } from './lib/escManager';
import { SettleModal } from './components/SettleModal';
import { NetPayableModal } from './components/NetPayableModal';
import { CurrencySetupModal } from './components/CurrencySetupModal';
import { GroupGallery } from './components/GroupGallery';
import { checkIfDemoMode } from './lib/demoMode';
import { ensureArray, ensureObject, isLegacyRenameLog } from './lib/utils';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import { useAppHotkeys } from './hooks/useAppHotkeys';
import { useUndoStack } from './hooks/useUndoStack';
import { MobileHeader } from './components/MobileHeader';
import { InstallPrompt } from './components/InstallPrompt';
import { useExportCSV } from './hooks/useExportCSV';

import { Group, Expense, PendingMatchPrompt } from './lib/types';
import { AppNotification, fetchNotifications, markAllNotificationsRead, subscribeNotifications, clearAllNotifications } from './lib/notifications';
import { calculateNextOccurrenceDate, simplifyMultiCurrencyDebts } from './lib/calculations';

const pageDescriptions: Record<string, string> = {
  summary: "Track net balances, scan bills, and quickly settle with friends.",
  groups: "View, rename, and manage your group ledgers.",
  friends: "See your total balances across all circles and settle up directly.",
  activity: "View a chronological log of all expenses and settlements.",
  analytics: "Analyze your spending breakdowns and monthly trends.",
  profile: "Manage your settings, currency preferences, and payment details.",
  detail: "View members, track expenses, and settle debts for this group."
};

function App() {
  const [theme, setTheme] = useState<'lavender' | 'sunset'>(() => {
    const saved = localStorage.getItem('divido_theme');
    return saved === 'lavender' || saved === 'sunset' ? saved : 'lavender';
  });
  const [view, setView] = useState<string>('summary');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | number | null>(null);
  const [groupDetailTab, setGroupDetailTab] = useState<'expenses' | 'balances' | 'photos'>('expenses');
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState<boolean>(false);
  const [showGalleryFilters, setShowGalleryFilters] = useState<boolean>(false);
  const [showCurrPickerId, setShowCurrPickerId] = useState<string | null>(null);
  const [showExpModal, setShowExpModal] = useState<boolean>(false);
  const [autoOpenScanner, setAutoOpenScanner] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(false);
  const [showFriendsList, setShowFriendsList] = useState<boolean>(false);
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
  const [showMembersHealth, setShowMembersHealth] = useState<boolean>(false);
  const [globalSettleData, setGlobalSettleData] = useState<{ name: string; gId?: string | number | null; identity?: string; groups?: string[]; balances?: any } | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [editingSettle, setEditingSettle] = useState<Expense | null>(null);
  const [localSettleEdits, setLocalSettleEdits] = useState<any[]>([]);
  const [qrModalData, setQrModalData] = useState<{ payee: string; amt: number; currency: string; requestFrom?: string } | null>(null);
  const [isGroupsExpanded, setIsGroupsExpanded] = useState<boolean>(false);
  const [showConvertModalId, setShowConvertModalId] = useState<string | number | null>(null);
  const [analyticsGroupId, setAnalyticsGroupId] = useState<string | number | null>(null);
  const [showGroupSettleList, setShowGroupSettleList] = useState(false);
  const [confirmState, setConfirmState] = useState<any>({
    show: false,
    title: '',
    desc: '',
    onConfirm: null,
    type: 'danger',
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
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
  const [submittingLinkRequest, setSubmittingLinkRequest] = useState<boolean>(false);
  // True while we resolve an invite link (fetch the group + members + session)
  // before deciding whether to show the claim card, admit the user, etc. Seeded
  // synchronously so the home feed never flashes behind the pending claim card.
  const [isResolvingInvite, setIsResolvingInvite] = useState<boolean>(() => {
    try {
      if (checkIfDemoMode()) return false;
      const param = new URLSearchParams(window.location.search).get('joinGroupId');
      if (param) {
        const n = parseInt(param, 10);
        if (!isNaN(n) && n <= 2147483647 && !param.includes('.')) return true;
      }
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
  useEffect(() => {
    if (selectedId && selectedId !== 'STANDALONE') {
      setGroupDetailTab('expenses');
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

  // Helper to get current UI state for history syncing
  const getUiState = () => ({
    view,
    selectedId,
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
      const st = e.state;
      if (st && st._divido && st.uiState) {
        isNavigatingHistory.current = true;
        const ui = st.uiState;
        
        setView(ui.view || 'summary');
        setSelectedId(ui.selectedId ?? null);
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
        setConfirmState({ show: false });
      } else {
        const currentUi = getUiState();
        window.history.pushState({ _divido: true, uiState: currentUi }, '');
      }
    };

    window.addEventListener('popstate', onPopState);

    // Seed initial state
    if (!window.history.state?._divido) {
      const initialUi = getUiState();
      window.history.replaceState({ _divido: true, uiState: initialUi }, '');
    }

    return () => window.removeEventListener('popstate', onPopState);
  }, [
    view, selectedId, showExpModal, showSettleModal, showAddFriendModal,
    showGroupSettleList, showMembersHealth, qrModalData, showConvertModalId,
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, confirmState
  ]);

  // 2. Watch for user changes and push states
  useEffect(() => {
    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }

    const cur = window.history.state;
    const currentUi = getUiState();

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
        JSON.stringify(prev.editingSettle) !== JSON.stringify(currentUi.editingSettle) ||
        JSON.stringify(prev.globalSettleData) !== JSON.stringify(currentUi.globalSettleData) ||
        JSON.stringify(prev.confirmState) !== JSON.stringify(currentUi.confirmState);

      if (!hasChanged) return;
    }

    window.history.pushState({ _divido: true, uiState: currentUi }, '');
  }, [
    view, selectedId, showExpModal, showSettleModal, showAddFriendModal,
    showGroupSettleList, showMembersHealth, qrModalData, showConvertModalId,
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, confirmState
  ]);

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
    try {
      // 1. Member row
      await supabase.from('group_members').update({ name: newName, pending_name: null }).eq('group_id', groupId).ilike('name', oldName);

      // 2. Historical expenses in this group (DB)
      const { data: exps } = await supabase.from('expenses').select('*').eq('group_id', groupId);
      for (const e of exps || []) {
        const paidNew = e.paid === oldName ? newName : e.paid;
        const splittersNew = Array.isArray(e.splitters) ? e.splitters.map((s: string) => (s === oldName ? newName : s)) : e.splitters;
        if (paidNew !== e.paid || JSON.stringify(splittersNew) !== JSON.stringify(e.splitters)) {
          await supabase.from('expenses').update({ paid: paidNew, splitters: splittersNew }).eq('id', e.id);
        }
      }

      // 3. Local state
      setExpenses((prev) => prev.map((e) => (String(e.gId) === String(groupId)
        ? { ...e, paid: e.paid === oldName ? newName : e.paid, splitters: (e.splitters || []).map((s) => (s === oldName ? newName : s)) }
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
        // If it's a valid DB ID, ensure it is unique
        if (typeof g.id === 'number' && g.id <= 2147483647) {
          if (seenIds.has(g.id)) return false;
          seenIds.add(g.id);
        }
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

    // Option 3: a profile-name change is account-only. It no longer reaches into
    // groups — each group keeps its own member name (set when you join/create it,
    // or changed by the group admin). This stops a profile rename from (a)
    // overwriting a custom per-group name, and (b) leaving old expenses pointing
    // at a stale name (ghosts). Your name INSIDE a group is resolved from that
    // group's own member row (see `me` and the divido_identity hydration on
    // load), so balances are unaffected by this change.
    setUserName(cleanNew);
    localStorage.setItem('divido_username', cleanNew);
  };

  // When a user signs in after having claimed a guest identity, adopt those
  // unlinked guest membership rows into their account so the groups load by email
  // (across reloads and devices). Idempotent: once linked, the rows have an email
  // and are skipped. Runs before setIsAuthenticated so the first load sees them.
  const linkGuestIdentities = async (email: string) => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('divido_identity_')) continue;
        const groupId = key.replace('divido_identity_', '');
        const claimedName = localStorage.getItem(key);
        if (!groupId || groupId === 'STANDALONE' || !claimedName) continue;
        const { data: rows } = await supabase
          .from('group_members')
          .select('id, user_email')
          .eq('group_id', groupId)
          .ilike('name', claimedName)
          .limit(1);
        if (rows && rows[0]) {
          const currentDbEmail = rows[0].user_email;
          if (!currentDbEmail || currentDbEmail.startsWith('guest-') || currentDbEmail.includes('@divido.app')) {
            await supabase
              .from('group_members')
              .update({ user_email: email, is_pending: false })
              .eq('id', rows[0].id);
          }
        }
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
      const m = globalSettleData.name;

      const allVirtualGroups = [
        { id: 'STANDALONE', name: 'Non-Group Expenses', members: [] as string[], currency: '₹' },
        ...groups,
      ].filter((g) => {
        if (globalSettleData.gId !== undefined && globalSettleData.gId !== null) {
          return String(g.id) === String(globalSettleData.gId);
        }
        return true;
      });

      allVirtualGroups.forEach((g) => {
        const isStandalone = g.id === 'STANDALONE';
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
          return (
            (e.paid === me && splitters.includes(m)) || (e.paid === m && splitters.includes(me))
          );
        });

        groupPlan.forEach((t) => {
          const involvesUs = (t.from === me && t.to === m) || (t.from === m && t.to === me);

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
        id: Date.now() + Math.random(),
        gId: it.gId,
        title: `🤝 Settlement: ${it.paidBy} paid ${it.receivedBy}`,
        amt: parseFloat(it.amt) || 0,
        paid: it.paidBy,
        splitters: [it.receivedBy],
        date: new Date().toISOString().split('T')[0],
        notes: '',
        currency: it.curr,
        category: '🤝',
        mode: 'Equally' as const,
        shares: {},
      }));
    setExpenses([...newSettlements, ...expenses]);

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

    const finalExpenses = expenses.map((e) => {
      if (e.isRecurring && e.recurrence && e.recurrence !== 'none' && e.nextOccurrence) {
        let currentNext = e.nextOccurrence;
        const localSpawned: Expense[] = [];

        // Loop as long as nextOccurrence is <= today
        while (currentNext <= todayStr) {
          const copy: Expense = {
            ...e,
            id: Date.now() + Math.random() + localSpawned.length,
            date: currentNext,
            isRecurring: false,
            recurrence: undefined,
            nextOccurrence: undefined,
          };
          localSpawned.push(copy);
          currentNext = calculateNextOccurrenceDate(currentNext, e.recurrence);
        }

        if (localSpawned.length > 0) {
          newSpawned.push(...localSpawned);
          templateUpdated = true;
          return {
            ...e,
            nextOccurrence: currentNext,
          };
        }
      }
      return e;
    });

    if (templateUpdated) {
      setExpenses([...newSpawned, ...finalExpenses]);
      setToastMsg(`Successfully generated ${newSpawned.length} recurring expense${newSpawned.length > 1 ? 's' : ''}! 🔄`);
      setTimeout(() => setToastMsg(null), 5000);
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
        return { ...g, id: Date.now() + Math.random() };
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

        const parsedGroupId = parseInt(String(joinGroupId), 10);
        const isValidDbId = !isNaN(parsedGroupId) && parsedGroupId <= 2147483647 && !String(joinGroupId).includes('.');
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
            m.name.toLowerCase() === (rejoinName + ' (Left)').toLowerCase() ||
            (m.name.toLowerCase() === rejoinName.toLowerCase() && m.is_pending)
          );
          if (matchLeftMember) {
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
  const handleDeleteGroup = (id: string | number) => {
    const isStandalone = String(id) === 'STANDALONE';
    const g = isStandalone
      ? { name: 'Non-Group Expenses', members: [] as string[] }
      : groups.find((x) => String(x.id) === String(id));
    if (!g) return;

    console.log('[DEBUG] handleDeleteGroup:', { id, me, members: g.members });
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

    setConfirmState({
      show: true,
      title: isStandalone ? 'Clear History?' : hasOthers ? 'Leave Group?' : 'Delete Group?',
      desc: isStandalone
        ? `Are you sure you want to clear all non-group expenses?`
        : hasOthers
        ? `Leave group? You won't see new updates.`
        : `Are you sure you want to delete this group permanently?`,
      type: 'danger',
      onConfirm: async () => {
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
      },
    });
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
        const amount = parseFloat(e.amt as any) || 0;
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
              ? parseFloat(e.shares?.[s] as any) || 0
              : (amount * (parseFloat(e.shares?.[s] as any) || 0)) / 100;
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
      const amount = parseFloat(e.amt as any) || 0;
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
            ? parseFloat(e.shares?.[s] as any) || 0
            : (amount * (parseFloat(e.shares?.[s] as any) || 0)) / 100;
        standaloneBalances[s][c] = (standaloneBalances[s][c] || 0) - share;
      });
    });

    map[standaloneId] = standaloneBalances;

    return map;
  }, [groups, expenses]);

  const getMemberBalance = React.useCallback((groupId: string | number | null, memberName: string) => {
    const gId = String(groupId || 'STANDALONE');
    return allGroupBalances[gId]?.[memberName] || {};
  }, [allGroupBalances]);

  // ── "Same person?" prompt (Step 4b) ────────────────────────────────────────
  // When a name being added already exists elsewhere, ask whether it's the same
  // person. "Same" links to that person's identity (via divido_person_link, which
  // the sync layer consumes on insert); "Different" gets a fresh id by default.
  const [samePersonPrompt, setSamePersonPrompt] = useState<null | {
    groupId: string | number;
    queue: { name: string; candidates: { identity: string; name: string; groups: string[] }[] }[];
    index: number;
    addNames: string[];
  }>(null);

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
    setGroups((prev) => prev.map((x) => {
      if (x.id != groupId) return x;
      const newMembers = Array.from(new Set([...x.members, ...names]));
      const newPending = Array.from(new Set([...(x.pendingMembers || []), ...names]));
      return { ...x, members: newMembers, pendingMembers: newPending };
    }));
    setNewlyAddedFriends(names);
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
    }
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      setSamePersonPrompt(null);
      commitAddMembers(groupId, addNames);
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

  const handleCreateGroup = (groupData: { name: string; currency: string; members: string[]; emoji: string; createdDate?: string }) => {
    const id = Date.now() + Math.random();
    const newGroup = {
      id,
      name: groupData.name,
      currency: groupData.currency,
      members: groupData.members,
      emoji: groupData.emoji,
      simplifyDebts: false,
      createdDate: groupData.createdDate || new Date().toISOString().split('T')[0],
    };
    setGroups([...groups, newGroup]);
    setSelectedId(id);
    setView('detail');
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

        // Fetch existing group members in DB
        const { data: existingMems, error: fetchErr } = await supabase
          .from('group_members')
          .select('user_email')
          .eq('group_id', groupId);

        if (fetchErr) {
          console.error('Failed to fetch existing members from Supabase:', fetchErr);
          return;
        }

        if (existingMems) {
          const existingEmails = new Set(existingMems.map(m => m.user_email.toLowerCase()));
          const targetEmails = groupData.members.map(m => m.toLowerCase());

          // Identify new members to insert
          const toAdd = groupData.members.filter(email => !existingEmails.has(email.toLowerCase()));
          if (toAdd.length > 0) {
            const memberInserts = toAdd.map(email => ({
              group_id: groupId,
              user_email: email,
              user_name: email.split('@')[0], // fallback name
              joined_at: new Date().toISOString()
            }));
            const { error: insertErr } = await supabase.from('group_members').insert(memberInserts);
            if (insertErr) console.error('Failed to insert new members:', insertErr);
          }

          // Identify members to remove
          const toRemove = Array.from(existingEmails).filter(email => !targetEmails.includes(email));
          if (toRemove.length > 0) {
            const { error: deleteErr } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', groupId)
              .in('user_email', toRemove);
            if (deleteErr) console.error('Failed to remove members:', deleteErr);
          }
        }
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
  if (!isInitialLoadDone && !bootLoaderExpired && groups.length === 0) {
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
              sessionStorage.setItem('divido_open_members', '1');
              setEditingGroupId(null);
              if (gid) setSelectedId(gid);
              setView('detail');
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
            onRemoveMember={async (memberName) => {
              if (!selectedId || selectedId === 'STANDALONE') return;
              const isPastMember = memberName.endsWith(' (Left)');
              // A pending invite is someone who never actually joined. Removing them
              // should delete the invite outright, not tombstone them as a past member.
              const currentGroup = groups.find((g) => String(g.id) === String(selectedId));
              const isPendingInvite = !isPastMember && !!currentGroup?.pendingMembers?.includes(memberName);
              if (!checkIfDemoMode() && isAuthenticated) {
                try {
                  if (isPastMember || isPendingInvite) {
                    // Permanently delete from group_members table
                    await supabase
                      .from('group_members')
                      .delete()
                      .eq('group_id', selectedId)
                      .ilike('name', memberName);
                  } else {
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
              // Update local state
              setGroups(
                groups.map((g) =>
                  String(g.id) === String(selectedId)
                    ? {
                        ...g,
                        members: (isPastMember || isPendingInvite)
                          ? g.members.filter((m) => m !== memberName)
                          : g.members.map((m) => (m === memberName ? memberName + ' (Left)' : m)),
                        pendingMembers: g.pendingMembers?.filter((m) => m !== memberName)
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

      {/* Floating "+ Group" button — home screen only. Orange so it stands apart
          from the green Add Expense actions; sits above the bottom nav. */}
      {view === 'summary' && !isPhotoViewerOpen && (
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
                 const id = Date.now() + Math.random();
                 setGroups([...groups, { id, name, members: [me, ...names], currency: myDefaultCurrency }]);
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
            onClick={() => resolvePersonChoice(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px', boxSizing: 'border-box' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '340px', padding: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', animation: 'fadeIn 0.2s ease-out' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </span>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E293B' }}>
                  {multiple ? `Which "${item.name}"?` : `You already have a "${item.name}"`}
                </div>
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
            }}
          >
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>
              Join {linkRequestGroup.name}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: '0 0 16px 0', lineHeight: 1.4 }}>
              Select your name to join.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
              {linkRequestPlaceholders.map((p) => (
                <button
                  key={p.id}
                  disabled={submittingLinkRequest}
                  onClick={async () => {
                    setSubmittingLinkRequest(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const myEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app' : null);

                      let activeEmail = myEmail;
                      if (!activeEmail) {
                        const joinAsGuest = confirm(
                          `How would you like to join "${linkRequestGroup.name}"?\n\n` +
                          `• Click "OK" to join instantly as a Guest (no account needed).\n` +
                          `• Click "Cancel" to sign in with Google (recommended, saves your data).`
                        );
                        if (joinAsGuest) {
                          let guestId = localStorage.getItem('divido_guest_id');
                          if (!guestId) {
                            guestId = 'guest-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
                            localStorage.setItem('divido_guest_id', guestId);
                          }
                          activeEmail = guestId + '@divido.app';
                          localStorage.setItem('divido_email', activeEmail);
                        } else {
                          // Remember which group/member we're claiming so the invite
                          // survives the Google sign-in round-trip — the ?joinGroupId=
                          // URL param gets wiped by the OAuth redirect, which would
                          // otherwise drop us on an empty home with no claim card.
                          // Restored by joinGroupFromQuery when we land back signed in.
                          try {
                            localStorage.setItem('divido_pending_join', JSON.stringify({
                              groupId: linkRequestGroup.id,
                              placeholderName: p.name,
                              ts: Date.now(),
                            }));
                          } catch { /* storage full — non-fatal */ }
                          {
                            const _join = new URL(window.location.href).searchParams.get('joinGroupId');
                            const cleanRedirect = window.location.origin + window.location.pathname + (_join ? `?joinGroupId=${_join}` : '');
                            await supabase.auth.signInWithOAuth({
                              provider: 'google',
                              options: {
                                redirectTo: cleanRedirect,
                                queryParams: { prompt: 'select_account' },
                              },
                            });
                          }
                          setSubmittingLinkRequest(false);
                          return;
                        }
                      }

                      const isRejoin = p.name.endsWith(' (Left)') ||
                        !!new URLSearchParams(window.location.search).get('rejoinName') ||
                        (localStorage.getItem('divido_username') && p.name.toLowerCase() === localStorage.getItem('divido_username')?.toLowerCase()) ||
                        (localStorage.getItem(`divido_identity_${linkRequestGroup.id}`) && p.name.toLowerCase() === localStorage.getItem(`divido_identity_${linkRequestGroup.id}`)?.toLowerCase());
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

                        // 2. Local identity setup
                        localStorage.setItem('divido_username', cleanName);
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, cleanName);
                        setUserName(cleanName);
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
                        
                        localStorage.setItem('divido_username', p.name);
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, p.name);
                        setUserName(p.name);
                        setIsAuthenticated(true);
                        if (activeEmail.startsWith('guest-')) {
                          setUserEmail(activeEmail);
                        }
                        
                        alert(`Welcome, ${p.name}! You have successfully joined the group. 🎉`);
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
                  {p.name.endsWith(' (Left)') ||
                  !!new URLSearchParams(window.location.search).get('rejoinName') ||
                  (localStorage.getItem('divido_username') && p.name.toLowerCase() === localStorage.getItem('divido_username')?.toLowerCase()) ||
                  (localStorage.getItem(`divido_identity_${linkRequestGroup.id}`) && p.name.toLowerCase() === localStorage.getItem(`divido_identity_${linkRequestGroup.id}`)?.toLowerCase()) ? `Rejoin as "${p.name.replace(' (Left)', '')}"` : `Claim "${p.name}"`}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                // Declining an invite you never accepted shouldn't leave the group
                // sitting in your feed. The claim card only shows when you're NOT an
                // active member, so it's safe to drop it locally here; the cloud sync
                // re-adds it only if you actually are a member. (Cloud data is never
                // deleted by this — groups are only removed via explicit "Leave/Delete".)
                const declinedId = linkRequestGroup?.id;
                setLinkRequestGroup(null);
                localStorage.removeItem('divido_pending_join');
                if (declinedId != null) {
                  setGroups(prev => prev.filter(g => String(g.id) !== String(declinedId)));
                }
                const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
              }}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                border: 'none',
                background: '#F1F5F9',
                color: '#64748B',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
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
            {/* Invisible decoy inputs to trick browser autofill heuristics */}
            <input type="text" name="username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
            <input type="password" name="password" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
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
                    key={idx}
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
                    </div>

                    {/* Right: Input and MAX button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '32px' }}>
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
                        <input
                          id={`global-settle-val-${idx}`}
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
                          value={typeof item.amt === 'number' ? Math.round(item.amt * 100) / 100 : item.amt}
                          disabled={!isSelected}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                              const cleanedVal = val.replace(/^0+(?=\d)/, '');
                              const newAmt = parseFloat(cleanedVal) || 0;
                              setLocalSettleEdits(
                                localSettleEdits.map((it, i) => (i === idx ? { ...it, amt: val === '' ? '' : newAmt } : it))
                              );
                            }
                          }}
                          style={{
                            width: '76px',
                            height: '32px',
                            padding: '0 8px 0 18px',
                            margin: 0,
                            borderRadius: '8px',
                            border: '1.5px solid #CBD5E1',
                            background: isSelected ? '#FFFFFF' : '#F1F5F9',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#1E293B',
                            outline: 'none',
                            textAlign: 'right',
                            boxSizing: 'border-box',
                          }}
                        />
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
                              {curr}{absoluteAmt.toFixed(2)}
                            </strong>
                          </span>
                        ) : (
                          <span>
                            You get back a net of{' '}
                            <strong style={{ color: '#10B981', fontSize: '14.5px', fontWeight: 700, marginRight: '2px' }}>
                              {curr}{absoluteAmt.toFixed(2)}
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
                isOwed = netVal < 0;

                if (isOwed) {
                  buttonText = `Settle All Net (Pay ${curr}{absoluteAmt.toFixed(2)})`;
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
            className={`b-nav-btn ${view === 'summary' || (view === 'detail' && groupDetailTab === 'expenses') ? 'active' : ''}`}
            onClick={() => {
              setSelectedId(null);
              setView('summary');
            }}
          >
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span>Groups</span>
          </div>
          {((view === 'detail' || view === 'gallery' || view === 'analytics') && selectedId) ? (
            <div className={`b-nav-btn ${view === 'detail' && groupDetailTab === 'balances' ? 'active' : ''}`} onClick={() => { setView('detail'); setGroupDetailTab('balances'); }}>
              <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                  <path d="M20 17H4" />
                  <path d="m8 21-4-4 4-4" />
                  <path d="M4 7h16" />
                  <path d="m16 3 4 4-4 4" />
                </svg>
              </span>
              <span>Settle</span>
            </div>
          ) : (
            <div className={`b-nav-btn ${view === 'friends' ? 'active' : ''}`} onClick={() => setView('friends')}>
              <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                  <path d="m11 17 2 2a1 1 0 1 0 3-3" />
                  <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
                  <path d="m21 3 1 11h-2" />
                  <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
                  <path d="M3 4h8" />
                </svg>
              </span>
              <span>Friends</span>
            </div>
          )}

          {/* Central Button — always "Add Expense", the single most-used action.
              Same icon, colour and position on every screen so it never shifts
              meaning. Create Group lives in the home header; photo upload lives
              in the group's Photos tab. */}
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
                background: '#10B981',
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

          {((view === 'detail' || view === 'gallery' || view === 'analytics') && selectedId) ? (
            <div className={`b-nav-btn ${view === 'analytics' ? 'active' : ''}`} onClick={() => { setAnalyticsGroupId(selectedId); setView('analytics'); }}>
              <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              <span>Analytics</span>
            </div>
          ) : (
            <div className={`b-nav-btn ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}>
              <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              <span>Activities</span>
            </div>
          )}
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
        title={confirmState.title}
        desc={confirmState.desc}
        type={confirmState.type}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState({ show: false })}
      />

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
                  if (feedback.trim()) {
                    console.log('User feedback note before deletion:', feedback);
                  }

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

      <SettleModal
        show={showSettleModal}
        onClose={() => {
          setShowSettleModal(false);
          setEditingSettle(null);
        }}
        editingSettle={editingSettle}
        setEditingSettle={setEditingSettle}
        selectedGroup={selectedGroup || { id: '', name: 'Default Group', members: [me], currency: '₹', emoji: '🏡', simplifyDebts: false } as any}
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
              {hasPendingRejoin ? 'Waiting for approval' : 'Rejoin this group?'}
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: '0 0 20px 0', lineHeight: 1.4 }}>
              {hasPendingRejoin
                ? <>Your request was sent to the group admin{adminLabel}. You'll get access once it's approved.</>
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
              Send request
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
