import React, { useState, useEffect, useRef } from 'react';
import { Login } from './components/Login';
import { supabase } from './lib/supabaseClient';
import { Sidebar } from './components/Sidebar';
import { MasterSummary } from './components/MasterSummary';
import { FriendsView } from './components/FriendsView';
import { Analytics } from './components/Analytics';
import { ActivityStudio } from './components/ActivityStudio';
import { Profile } from './components/Profile';
import { GroupDetail } from './components/GroupDetail';
import { GroupsView } from './components/GroupsView';
import { ExpenseModal } from './components/ExpenseModal';
import { CurrencyConverterModal } from './components/CurrencyConverterModal';
import { AddFriendModal } from './components/AddFriendModal';
import { MatchPromptModal } from './components/MatchPromptModal';
import { SearchableCurrencyPicker } from './components/SearchableCurrencyPicker';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PremiumConfirm } from './components/PremiumConfirm';
import { escManager } from './lib/escManager';
import { UPIQRModal } from './components/UPIQRModal';
import { SettleModal } from './components/SettleModal';
import { NetPayableModal } from './components/NetPayableModal';
import { NetReceivableModal } from './components/NetReceivableModal';
import { checkIfDemoMode } from './lib/demoMode';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import { useAppHotkeys } from './hooks/useAppHotkeys';
import { useUndoStack } from './hooks/useUndoStack';
import { MobileHeader } from './components/MobileHeader';
import { FloatingAddMenu } from './components/FloatingAddMenu';
import { useExportCSV } from './hooks/useExportCSV';
import QRCode from 'qrcode';

import { Group, Expense, PendingMatchPrompt } from './lib/types';
import { AppNotification, fetchNotifications, markAllNotificationsRead, subscribeNotifications } from './lib/notifications';
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
  const [showCurrPickerId, setShowCurrPickerId] = useState<string | null>(null);
  const [showExpModal, setShowExpModal] = useState<boolean>(false);
  const [autoOpenScanner, setAutoOpenScanner] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(false);
  const [matchPrompt, setMatchPrompt] = useState<PendingMatchPrompt | null>(null);
  const [showMembersHealth, setShowMembersHealth] = useState<boolean>(false);
  const [globalSettleData, setGlobalSettleData] = useState<{ name: string; gId?: string | number | null } | null>(null);
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
  const [userEmail, setUserEmail] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  
  // Link request modal state
  const [linkRequestGroup, setLinkRequestGroup] = useState<any | null>(null);
  const [linkRequestPlaceholders, setLinkRequestPlaceholders] = useState<any[]>([]);
  const [submittingLinkRequest, setSubmittingLinkRequest] = useState<boolean>(false);
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
  const [showGlobalAddMenu, setShowGlobalAddMenu] = useState(false);
  const [activeReminderName, setActiveReminderName] = useState<string | null>(null);
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

  // Always reveal the header when switching pages.
  useEffect(() => { setHeaderHidden(false); }, [view]);

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
      await supabase.from('group_members').update({ name: newName, pending_name: null }).eq('group_id', groupId).eq('name', oldName);

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
      if (localStorage.getItem(`divido_identity_${groupId}`) === oldName) {
        localStorage.setItem(`divido_identity_${groupId}`, newName);
      }
      if (userName.split(' ')[0] === oldName) {
        localStorage.setItem('divido_username', newName);
        setUserName(newName);
      }

      // 5. Audit note in the group activity
      await supabase.from('expenses').insert({
        group_id: groupId,
        title: `📝 "${oldName}" is now "${newName}"`,
        amt: 0,
        paid: newName,
        date: new Date().toISOString().split('T')[0],
        category: 'System note',
        mode: 'Equally',
        splitters: [newName],
      });

      // 6. Let the other joined members know
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
  // On first use, auto-detect from browser locale (e.g. en-AE → AED, en-NG → NGN)
  const myDefaultCurrency = (() => {
    const saved = userMetadata[me]?.defaultCurrency;
    if (saved) return saved;
    // Auto-detect from browser locale on first launch
    try {
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

  const handleOpenPayablePopup = (friendName: string, amt: number, curr: string) => {
    setNetPayablePopup({ friendName, amt, curr });
  };

  const handleOpenReceivablePopup = (friendName: string, amt: number, curr: string) => {
    setNetReceivablePopup({ friendName, amt, curr });
    // Send an in-app reminder to the friend (if they've joined)
    notifyFriend(friendName, {
      type: 'reminder',
      title: `${userName} sent you a reminder`,
      body: `Please settle ${curr}${amt.toFixed(0)}`,
      amount: amt,
      currency: curr,
    });
  };

  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const saved = localStorage.getItem('divido_groups');
      const savedName = localStorage.getItem('divido_username');
      const dName = savedName && savedName !== 'undefined' ? savedName : 'You';
      const myFirstName = dName.split(' ')[0];
      const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
      return parsed.map((g: any) => {
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
      return parsed.map((e: any) => {
        const splitters = Array.isArray(e.splitters) ? e.splitters : [e.paid || me];
        return { ...e, splitters, amt: parseFloat(e.amt) || 0 };
      });
    } catch (e) {
      return [];
    }
  });
  
  const { handleMobileExportCSV } = useExportCSV({ groups, expenses, selectedId });
  const { undoStack, deleteExpense, performUndo } = useUndoStack({ expenses, setExpenses });
  const [newlyAddedFriends, setNewlyAddedFriends] = useState<string[]>([]);
  const [activeSplitters, setActiveSplitters] = useState<string[]>([]);

  const updateUserName = (newName: string) => {
    const cleanNew = newName.trim();
    if (!cleanNew) return;

    const oldFirstName = userName.split(' ')[0];
    const newFirstName = cleanNew.split(' ')[0];

    if (oldFirstName !== newFirstName) {
      // Update groups
      const updatedGroups = groups.map((g) => {
        const newMembers = g.members.map((m) => (m === oldFirstName ? newFirstName : m));
        return { ...g, members: newMembers };
      });
      setGroups(updatedGroups);

      // Update expenses
      const updatedExpenses = expenses.map((e) => {
        const newPaid = e.paid === oldFirstName ? newFirstName : e.paid;
        const newSplitters = e.splitters
          ? e.splitters.map((m) => (m === oldFirstName ? newFirstName : m))
          : [];

        let newShares = e.shares;
        if (e.shares && e.shares[oldFirstName] !== undefined) {
          newShares = { ...e.shares };
          newShares[newFirstName] = newShares[oldFirstName];
          delete newShares[oldFirstName];
        }

        return {
          ...e,
          paid: newPaid,
          splitters: newSplitters,
          shares: newShares,
        } as Expense;
      });
      setExpenses(updatedExpenses);
    }

    setUserName(cleanNew);
    localStorage.setItem('divido_username', cleanNew);
  };

  useEffect(() => {
    // Listen to changes in auth state from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setIsAuthenticated(true);
        localStorage.setItem('divido_authenticated', 'true');
        setUserEmail(session.user?.email || '');
        const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
        updateUserName(userFullName);
      } else {
        setIsAuthenticated(false);
        setUserEmail('');
        localStorage.removeItem('divido_authenticated');
      }
    });

    // Check current session once on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);
        localStorage.setItem('divido_authenticated', 'true');
        setUserEmail(session.user?.email || '');
        const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
        updateUserName(userFullName);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
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
                const key = `${s}-${e.paid}`;
                if (!pairDebts[key]) pairDebts[key] = {};
                pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
              }
            }
          });
        });

        const rawTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
        const processedPairs = new Set<string>();

        Object.keys(pairDebts).forEach((key) => {
          const [from, to] = key.split('-');
          const reverseKey = `${to}-${from}`;
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

  useEffect(() => {
    localStorage.setItem('divido_usermetadata', JSON.stringify(userMetadata));
  }, [userMetadata]);
  useEffect(() => {
    localStorage.setItem('divido_username', userName);
  }, [userName]);
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('divido_theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('divido_groups', JSON.stringify(groups));
  }, [groups]);
  useEffect(() => {
    localStorage.setItem('divido_expenses', JSON.stringify(expenses));
  }, [expenses]);

  const { syncStatus } = useSupabaseSync({
    groups,
    setGroups,
    expenses,
    setExpenses,
    selectedId,
    setSelectedId,
    isAuthenticated,
    me,
    setMatchPrompt,
  });

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
    if (checkIfDemoMode()) return;
    const joinGroupFromQuery = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const joinGroupId = urlParams.get('joinGroupId');
        if (!joinGroupId) return;

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
        if (rejoinName) {
          const matchLeftMember = existingMembers.find((m: any) => m.name === rejoinName + ' (Left)');
          if (matchLeftMember) {
            const { data: { session } } = await supabase.auth.getSession();
            const myEmail = session?.user?.email || null;

            // 1. Reactivate the left member row
            await supabase
              .from('group_members')
              .update({
                name: rejoinName,
                user_email: myEmail,
                is_pending: false
              })
              .eq('id', matchLeftMember.id);

            // 2. Insert system notification of rejoin
            await supabase
              .from('expenses')
              .insert({
                group_id: joinGroupId,
                title: `🚪 ${rejoinName} rejoined the group`,
                amt: 0,
                paid: 'SYSTEM',
                date: new Date().toISOString().split('T')[0],
                mode: 'Equally',
                splitters: []
              });

            setSelectedId(joinGroupId);
            setView('group');

            // Clean URL parameters
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            return;
          }
        }

        // If user is logged in, check if they are already an active member
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          const alreadyMember = existingMembers.some((m: any) => m.user_email === session.user.email);
          if (alreadyMember) {
            setSelectedId(joinGroupId);
            setView('group');
            // Clean URL parameters
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
      }
    };

    joinGroupFromQuery();
  }, [groups]);
  const handleDeleteGroup = (id: string | number) => {
    const isStandalone = String(id) === 'STANDALONE';
    const g = isStandalone
      ? { name: 'Non-Group Expenses ⚡', members: [] }
      : groups.find((x) => String(x.id) === String(id));
    if (!g) return;

    const hasOthers = !isStandalone && g.members && g.members.length > 1;

    setConfirmState({
      show: true,
      title: isStandalone ? 'Clear Non-Group History?' : hasOthers ? 'Leave Group?' : 'Delete Group?',
      desc: isStandalone
        ? `Permanently clear "${g.name}" activity and balances?`
        : hasOthers
        ? `Leave "${g.name}"? Other members will keep history.`
        : `Delete "${g.name}" permanently?`,
      type: 'danger',
      onConfirm: async () => {
        if (!isStandalone) {
          if (hasOthers) {
            const bal = getMemberBalance(id, me);
            const hasOutstanding = Object.values(bal).some((val) => Math.abs(val) > 0.01);
            if (hasOutstanding) {
              alert("You cannot leave this group because you still have outstanding balances. Please settle up first! 💳");
              setConfirmState({ show: false });
              return;
            }
          }

          if (!checkIfDemoMode() && isAuthenticated) {
            try {
              if (hasOthers) {
                // 1. Rename membership row to preserve history, remove email so it disappears for leaving user
                await supabase
                  .from('group_members')
                  .update({
                    name: me + ' (Left)',
                    user_email: null
                  })
                  .eq('group_id', id)
                  .eq('name', me);

                // 2. Insert system notification of departure
                await supabase
                  .from('expenses')
                  .insert({
                    group_id: id,
                    title: `🚪 ${me} left the group`,
                    amt: 0,
                    paid: 'SYSTEM',
                    date: new Date().toISOString().split('T')[0],
                    mode: 'Equally',
                    splitters: []
                  });
              } else {
                // 3. Delete group globally since no other members are left
                await supabase.from('groups').delete().eq('id', id);
              }
            } catch (err) {
              console.error('Failed to leave/delete group on Supabase:', err);
            }
          }
          // Remove from local groups state
          setGroups(
            groups
              .map((x) =>
                String(x.id) === String(id)
                  ? { ...x, members: x.members.map((m) => (m === me ? me + ' (Left)' : m)) }
                  : x
              )
              .filter((x) => String(x.id) !== String(id))
          );
        } else {
          setExpenses(expenses.filter((e) => String(e.gId) !== String(id)));
        }
        if (String(selectedId) === String(id)) setView('summary');
        setConfirmState({ show: false });
      },
    });
  };

  const handleLogout = () => {
    setConfirmState({
      show: true,
      title: 'Logout?',
      desc: 'Are you sure you want to log out? Your groups and expenses will remain saved safely on this device.',
      type: 'logout',
      onConfirm: async () => {
        await supabase.auth.signOut();
        localStorage.setItem('divido_authenticated', 'false');
        setIsAuthenticated(false);
        setConfirmState({ show: false });
      },
    });
  };

  const handleRenameGroup = (id: string | number) => {
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

  const getMemberBalance = (groupId: string | number | null, memberName: string) => {
    const isStandalone = String(groupId) === 'STANDALONE';
    const g = isStandalone
      ? { id: 'STANDALONE', name: 'Non-Group Expenses', members: [] as string[], currency: '₹' }
      : groups.find((x) => String(x.id) === String(groupId));
    if (!g) return {};

    const groupExps = expenses.filter((e) => String(e.gId) === String(groupId));
    const balances: Record<string, number> = {};
    groupExps.forEach((e) => {
      const c = e.currency || g.currency || '₹';
      if (!balances[c]) balances[c] = 0;

      const amount = parseFloat(e.amt as any) || 0;
      const splitters = e.splitters || (isStandalone ? [] : g.members) || [];

      if (e.paid === memberName) balances[c] += amount;

      if (splitters.includes(memberName)) {
        const share =
          !e.mode || e.mode === 'Equally'
            ? amount / splitters.length
            : e.mode === 'Unequally'
            ? parseFloat(e.shares?.[memberName] as any) || 0
            : (amount * (parseFloat(e.shares?.[memberName] as any) || 0)) / 100;
        balances[c] -= share;
      }
    });
    return balances;
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

  useEffect(() => {
    if (selectedGroup) {
      setHeaderNewName(selectedGroup?.name || '');
      setHeaderRenaming(false);
      setHeaderNameError('');
    }
  }, [selectedId, groups]);

  const handleHeaderRename = () => {
    const trimmed = headerNewName.trim();
    if (!trimmed) {
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




  const handleOnboard = () => {
    const enteredName = tempName.trim();
    if (!enteredName) return;

    updateUserName(enteredName);
    setIsAuthenticated(true);
    localStorage.setItem('divido_authenticated', 'true');
  };

  const urlParams = new URLSearchParams(window.location.search);
  const joinGroupIdParam = urlParams.get('joinGroupId');

  if (!isAuthenticated && !joinGroupIdParam) {
    return <Login onLoginSuccess={(name) => { updateUserName(name); setIsAuthenticated(true); }} currentTheme={theme} />;
  }

  return (
    <div className="app-container">
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
      />

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
      )}

      <main ref={mainContentRef} className="main-content" style={{ background: (view === 'summary' || view === 'friends') ? '#FAF4EC' : undefined }}>
        <MobileHeader
          headerHidden={headerHidden}
          view={view}
          selectedId={selectedId}
          selectedGroup={selectedGroup}
          me={me}
          groups={groups}
          setGroups={setGroups}
          setIsSidebarOpen={setIsSidebarOpen}
          setView={setView}
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
          onNotificationClick={handleNotificationClick}
          onHeaderSearch={() => { setView('summary'); setHomeSearchNonce((n) => n + 1); }}
          onAcceptRename={handleAcceptRename}
          onRejectRename={handleRejectRename}
          searchQuery={globalSearchQuery}
          setSearchQuery={setGlobalSearchQuery}
          isHeaderSearchActive={isHeaderSearchActive}
          setIsHeaderSearchActive={setIsHeaderSearchActive}
        />

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
            setShowExpModal={setShowExpModal}
            setEditingExpense={setEditingExpense}
            globalSettleData={globalSettleData}
            setGlobalSettleData={setGlobalSettleData}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            onShowQR={(payee, amt, curr) => setQrModalData({ payee, amt, currency: curr })}
            searchNonce={homeSearchNonce}
            searchQuery={globalSearchQuery}
            setSearchQuery={setGlobalSearchQuery}
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
            setEditingExpense={setEditingExpense}
            setShowExpModal={setShowExpModal}
            setEditingSettle={setEditingSettle}
            setShowSettleModal={setShowSettleModal}
            me={me}
            setShowConvertModalId={setShowConvertModalId}
            setGroups={setGroups}
            deleteExpense={deleteExpense}
            setSelectedId={setSelectedId}
            setView={setView}
          />
        ) : view === 'profile' ? (
          <Profile
            groups={groups}
            expenses={expenses}
            handleHardReset={() => {
              if (confirm('Hard Reset?')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
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
        ) : (
          <GroupDetail
            selectedId={selectedId}
            groups={groups}
            expenses={expenses}
            getMemberBalance={getMemberBalance}
            setView={setView}
            setGroups={setGroups}
            setShowExpModal={setShowExpModal}
            setEditingExpense={setEditingExpense}
            setExpenses={setExpenses}
            setShowAddFriendModal={setShowAddFriendModal}
            setShowMembersHealth={setShowMembersHealth}
            setShowCurrPickerId={setShowCurrPickerId}
            showCurrPickerId={showCurrPickerId}
            me={me}
            setShowConvertModalId={setShowConvertModalId}
            userMetadata={userMetadata}
            setUserMetadata={setUserMetadata}
            deleteExpense={deleteExpense}
            onDeleteGroup={handleDeleteGroup}
            onShowQR={(payee, amt, curr) => setQrModalData({ payee, amt, currency: curr })}
            setGlobalSettleData={setGlobalSettleData}
            showSettleModal={showSettleModal}
            setShowSettleModal={setShowSettleModal}
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
                  // If it's a request to link with a placeholder
                  if (mem.user_email === null) {
                    await supabase
                      .from('group_members')
                      .update({
                        user_email: mem.link_request_email,
                        name: mem.link_request_name || mem.name,
                        is_pending: false,
                        link_request_email: null,
                        link_request_name: null,
                      })
                      .eq('id', memberRecordId);
                  }
                  
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
                  // Trigger reload
                  setGroups((prev) => [...prev]);
                }
              } catch (err) {
                console.error(err);
              }
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
                  setGroups((prev) => [...prev]);
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
            onRemindMember={(memberName) => {
              // Set active reminder name target
              setActiveReminderName(memberName);
              // Open AddFriendModal directly to invite sharing slide
              setShowAddFriendModal(true);
              // Also send an in-app reminder notification if this friend has joined
              notifyFriend(memberName, {
                type: 'reminder',
                title: `${userName} sent you a reminder`,
                body: selectedGroup && selectedId !== 'STANDALONE' ? `Settle up in ${selectedGroup.name}` : 'You have a pending balance to settle',
                groupId: selectedId,
              });
            }}
            onRemoveMember={async (memberName) => {
              if (!selectedId || selectedId === 'STANDALONE') return;
              if (!checkIfDemoMode() && isAuthenticated) {
                try {
                  // 1. Rename membership row to preserve history, remove email so it disappears for leaving user
                  await supabase
                    .from('group_members')
                    .update({
                      name: memberName + ' (Left)',
                      user_email: null
                    })
                    .eq('group_id', selectedId)
                    .eq('name', memberName);

                  // 2. Insert system notification of departure
                  await supabase
                    .from('expenses')
                    .insert({
                      group_id: selectedId,
                      title: `🚪 ${memberName} left the group`,
                      amt: 0,
                      paid: 'SYSTEM',
                      date: new Date().toISOString().split('T')[0],
                      mode: 'Equally',
                      splitters: []
                    });
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
                        members: g.members.map((m) => (m === memberName ? memberName + ' (Left)' : m)),
                        pendingMembers: g.pendingMembers?.filter((m) => m !== memberName)
                      }
                    : g
                )
              );
            }}
          />
        )}
      </main>


      {view !== 'detail' && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: 0,
          width: '100px',
          height: '125px',
          background: 'linear-gradient(to top left, var(--bg) 40%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
          zIndex: 999,
          opacity: 0.9,
          backdropFilter: 'blur(4px)',
          maskImage: 'linear-gradient(to top left, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top left, black 40%, transparent 100%)'
        }} />
      )}

      {/* Unified Floating Action Button (FAB) Menu */}
      <FloatingAddMenu
        showGlobalAddMenu={showGlobalAddMenu}
        setShowGlobalAddMenu={setShowGlobalAddMenu}
        view={view}
        setView={setView}
        setSelectedId={setSelectedId}
        setEditingExpense={setEditingExpense}
        setAutoOpenScanner={setAutoOpenScanner}
        setShowExpModal={setShowExpModal}
        groups={groups}
        setGroups={setGroups}
        me={me}
        myDefaultCurrency={myDefaultCurrency}
      />



      {showExpModal && (
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
        />
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
          onAdd={(names) => {
            if (selectedId === 'STANDALONE') {
              setNewlyAddedFriends(names);
            } else if (selectedId) {
              const g = groups.find((x) => x.id == selectedId);
              if (g) {
                const newMembers = Array.from(new Set([...g.members, ...names]));
                const newPending = Array.from(new Set([...(g.pendingMembers || []), ...names]));
                setGroups(groups.map((x) => (x.id == selectedId ? { ...x, members: newMembers, pendingMembers: newPending } : x)));
              }
              setNewlyAddedFriends(names);
            } else {
              const name = prompt('Ledger Name:', 'Quick Splits ⚡');
              if (name) {
                const id = Date.now();
                setGroups([...groups, { id, name, members: [me, ...names], currency: myDefaultCurrency }]);
                setSelectedId(id);
              }
            }
          }}
          setShowAddFriendModal={(show) => {
            setShowAddFriendModal(show);
            if (!show) {
              setActiveReminderName(null);
            }
          }}
        />
      )}

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
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏘️</div>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>
              Join {linkRequestGroup.name}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: '0 0 16px 0', lineHeight: 1.4 }}>
              Who are you in this group? Claim your nickname to view your balance and split expenses.
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
                      if (session?.user?.email) {
                        // User is signed in: Request linking from the admin
                        await supabase
                          .from('group_members')
                          .update({
                            link_request_email: session.user.email,
                            link_request_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                          })
                          .eq('id', p.id);
                        alert(`Join request sent! Waiting for group admin approval. ⏳`);
                      } else {
                        // Guest/Cookie claim (Tricount-style)
                        // 1. Mark as locally active in Supabase so others see they have joined
                        await supabase
                          .from('group_members')
                          .update({ is_pending: false })
                          .eq('id', p.id);

                        // 2. Save settings locally
                        localStorage.setItem('divido_username', p.name);
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, p.name);
                        setUserName(p.name);
                        setIsAuthenticated(true);
                        
                        alert(`Welcome, ${p.name}! You have successfully claimed this profile. 🎉`);
                      }
                      
                      setSelectedId(linkRequestGroup.id);
                      setView('group');
                      setLinkRequestGroup(null);
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
                    textAlign: 'left',
                  }}
                >
                  🎭 Claim "{p.name}"
                </button>
              ))}

              <button
                disabled={submittingLinkRequest}
                onClick={async () => {
                  setSubmittingLinkRequest(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user?.email) {
                      // Request as new member
                      await supabase.from('group_members').insert({
                        group_id: linkRequestGroup.id,
                        name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                        user_email: null,
                        is_pending: true,
                        link_request_email: session.user.email,
                        link_request_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                      });
                      alert(`Request to join as a new member sent! Waiting for group admin approval. ⏳`);
                    } else {
                      // Guest new member
                      const customName = prompt("Enter your name:", "Guest");
                      if (customName) {
                        const trimmed = customName.trim();
                        // 1. Add to group_members in Supabase (fully active)
                        await supabase.from('group_members').insert({
                          group_id: linkRequestGroup.id,
                          name: trimmed,
                          is_pending: false
                        });

                        // 2. Save settings locally
                        localStorage.setItem('divido_username', trimmed);
                        localStorage.setItem('divido_authenticated', 'true');
                        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, trimmed);
                        setUserName(trimmed);
                        setIsAuthenticated(true);
                        
                        alert(`Welcome, ${trimmed}! You have joined the group. 🎉`);
                      }
                    }
                    setSelectedId(linkRequestGroup.id);
                    setView('group');
                    setLinkRequestGroup(null);
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
                  border: '1.5px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#64748B',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: '0.2s all',
                  textAlign: 'left',
                }}
              >
                ➕ Join as a New Member
              </button>
            </div>

            <button
              onClick={() => {
                setLinkRequestGroup(null);
                const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
              }}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                border: 'none',
                background: '#EF4444',
                color: 'white',
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
          style={{ zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setGlobalSettleData(null)}
        >
          <div
            className="card shadow-xl"
            style={{
              width: '90%',
              maxWidth: '400px',
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
              onClick={() => setGlobalSettleData(null)}
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
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
                          id={`global-settle-amt-${idx}`}
                          type="number"
                          value={typeof item.amt === 'number' ? Math.round(item.amt * 100) / 100 : item.amt}
                          disabled={!isSelected}
                          onChange={(e) => {
                            const val = e.target.value.replace(/^0+(?=\d)/, '');
                            const newAmt = parseFloat(val) || 0;
                            setLocalSettleEdits(
                              localSettleEdits.map((it, i) => (i === idx ? { ...it, amt: val === '' ? '' : newAmt } : it))
                            );
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
                          color: isSelected ? '#0D9488' : '#94A3B8',
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
                    className="hover-up"
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
                      transition: '0.2s all',
                    }}
                    onClick={handleFinalGlobalSettle}
                  >
                    Mark as Settled
                  </button>
                  <button
                    id="global-settle-submit-btn"
                    className="hover-up"
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
                      transition: '0.2s all',
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

      <nav className="bottom-nav">
          <div className={`b-nav-btn ${view === 'summary' ? 'active' : ''}`} onClick={() => setView('summary')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M9.5 20v-6h5v6" />
              </svg>
            </span>
            <span>Home</span>
          </div>
          <div className={`b-nav-btn ${view === 'friends' ? 'active' : ''}`} onClick={() => setView('friends')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M4 8h13" />
                <path d="m14 5 3 3-3 3" />
                <path d="M20 16H7" />
                <path d="m10 13-3 3 3 3" />
              </svg>
            </span>
            <span>Settle</span>
          </div>
          
          {/* Central Circular Add Expense Button */}
          <div
            onClick={() => {
              setEditingExpense(null);
              if (view !== 'detail') setSelectedId('STANDALONE');
              setShowExpModal(true);
            }}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '70px',
              cursor: 'pointer',
            }}
            title="Add Expense"
          >
            <div
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '2px solid #10B981',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
                fontSize: '28px',
                fontWeight: 500,
                zIndex: 1600,
                transform: 'translateY(-18px)',
                transition: 'all 0.15s ease-in-out',
                lineHeight: 1,
              }}
              className="hover-up"
            >
              +
            </div>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#475569',
              transform: 'translateY(-10px)',
            }}>
              Expense
            </span>
          </div>

          <div className={`b-nav-btn ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}>
            <span className="b-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}>
                <path d="M12 8v4l2.5 2" />
                <path d="M3.5 9a9 9 0 1 1-.5 5" />
                <path d="M3 5v4h4" />
              </svg>
            </span>
            <span>Activities</span>
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

      <PremiumConfirm
        show={confirmState.show}
        title={confirmState.title}
        desc={confirmState.desc}
        type={confirmState.type}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState({ show: false })}
      />

      {qrModalData && (
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
      )}

      <NetPayableModal
        popupData={netPayablePopup}
        onClose={() => setNetPayablePopup(null)}
        userMetadata={userMetadata}
        setUserMetadata={setUserMetadata}
        onFinalSettle={handleFinalGlobalSettle}
      />

      <NetReceivableModal
        popupData={netReceivablePopup}
        onClose={() => setNetReceivablePopup(null)}
        me={me}
        userMetadata={userMetadata}
        setUserMetadata={setUserMetadata}
        onFinalSettle={handleFinalGlobalSettle}
      />

      {showDeleteAccountModal && (
        <div
          className="modal-overlay"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={() => setShowDeleteAccountModal(false)}
        >
          <div
            className="card shadow-xl"
            style={{ width: '400px', padding: '32px', position: 'relative', animation: 'slideUp 0.3s ease-out', textAlign: 'center', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🥺</div>
            <h3 className="nunito" style={{ fontSize: '22px', fontWeight: 950, color: '#1F2937', marginBottom: '12px' }}>
              Improve me, don't leave me
            </h3>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--g)', marginBottom: '20px', lineHeight: 1.5 }}>
              We're sad to see you go. If there's something we can improve, please let us know below.
            </p>
            <textarea
              id="delete-feedback-textarea"
              placeholder="How can we make Divido better for you?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              style={{
                width: '100%',
                height: '100px',
                padding: '12px 16px',
                borderRadius: '16px',
                border: '2px solid #E2E8F0',
                background: 'var(--bg)',
                fontFamily: 'inherit',
                fontSize: '14px',
                outline: 'none',
                resize: 'none',
                marginBottom: '24px',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <button
                id="delete-cancel-btn"
                onClick={() => {
                  setShowDeleteAccountModal(false);
                  setFeedback('');
                }}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple-text) 100%)',
                  color: 'white',
                  fontWeight: 950,
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(219, 39, 119, 0.2)',
                  transition: '0.2s all',
                }}
                className="hover-up"
              >
                Nevermind, I'll stay!
              </button>
              <button
                id="delete-confirm-btn"
                onClick={() => {
                  if (feedback.trim()) {
                    console.log('User feedback note before deletion:', feedback);
                  }
                  localStorage.clear();

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
                  color: '#94A3B8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#EF4444')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#94A3B8')}
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
            background: '#1E293B',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            zIndex: 10000,
            animation: 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🗑️</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 900 }}>Entry Deleted</span>
              <span
                style={{
                  fontSize: '10px',
                  opacity: 0.6,
                  maxWidth: '120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {undoStack[0].item.title}
              </span>
            </div>
          </div>
          <button
            onClick={performUndo}
            style={{
              background: '#FCD34D',
              color: '#92400E',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '12px',
              fontWeight: 950,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            UNDO ↩️
          </button>
        </div>
      )}

      {toastMsg && (
        <div
          onClick={() => setToastMsg(null)}
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            color: 'white',
            padding: '14px 24px',
            borderRadius: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            zIndex: 10000,
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            animation: 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <span style={{ fontSize: '20px' }}>🔁</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', fontWeight: 900 }}>Recurring Expenses Auto-Logged</span>
            <span style={{ fontSize: '10px', opacity: 0.8 }}>{toastMsg}</span>
          </div>
          <span style={{ fontSize: '10px', marginLeft: '12px', opacity: 0.5 }}>✕</span>
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
    </div>
  );
}

export default App;
