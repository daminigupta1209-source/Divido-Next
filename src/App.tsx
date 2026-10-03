import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Login } from './components/Login';
import { supabase } from './lib/supabaseClient';
import { Sidebar } from './components/Sidebar';
import { GroupDetail } from './components/GroupDetail';
import { NonGroupView } from './components/NonGroupView';
import { GroupsView } from './components/GroupsView';
import { CreateGroupView } from './components/CreateGroupView';
import { SettleAmountInput } from './components/SettleAmountInput';
import { MembersHealthModal } from './components/MembersHealthModal';
import { BootSplash } from './pages/BootSplash';
import { InviteLoader } from './pages/InviteLoader';
import { RejoinRequestModal, type AdminRejoinRequest } from './components/RejoinRequestModal';
import { RejoinSelfModal } from './components/RejoinSelfModal';
import { useThemeStore } from './store/themeStore';
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
const SplitwiseImportModal = safeLazy(() => import('./components/SplitwiseImportModal').then((m) => ({ default: m.SplitwiseImportModal })));

// Warm every lazy screen into memory shortly after start-up. A deploy removes
// the old build's files, so an app left open would otherwise fail ("New
// version available" / reload) the first time it opened a not-yet-loaded
// screen. Once imported, a module stays in the page's memory for good.
if (typeof window !== 'undefined') {
  const warm = () => {
    [
      () => import('./components/MasterSummary'),
      () => import('./components/FriendsView'),
      () => import('./components/Analytics'),
      () => import('./components/ActivityStudio'),
      () => import('./components/Profile'),
      () => import('./components/ExpenseModal'),
      () => import('./components/UPIQRModal'),
      () => import('./components/NetReceivableModal'),
      () => import('./components/SplitwiseImportModal'),
      () => import('./components/expense-modal/BillScanner'),
      () => import('./lib/gemini'),
      () => import('./lib/imageUtils'),
    ].forEach((load) => { load().catch(() => { /* offline / blocked — load on demand later */ }); });
  };
  window.setTimeout(() => {
    const ric = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined;
    if (ric) ric(warm); else warm();
  }, 4000);
}
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
import { getPersonKey, toIdentitySpace, pickCanonicalIdentity, findDuplicateGroups, type DuplicateEntry, setSyncedDismissedPeople, buildNameEmailResolver, upiFor, fillPartyKeys, uniqueProfileName, dropShadowedLeftRows } from './lib/identity';
import { groupActivityTimestamp } from './lib/joinProgress';
import { parseInviteParam, buildPersonInviteLink, personInviteMessage, groupInviteMessage, type InviteSpot } from './lib/inviteLink';
import {
  buildInviteLandingModel,
  defaultSelectedGroupIds,
  claimInviteSpot,
  type InviteLandingEntry,
  type InviteGroupRow as InviteClaimGroupRow,
  type InviteMemberRow as InviteClaimMemberRow,
  type SupabaseLike as InviteSupabaseLike,
} from './lib/inviteClaim';
import { InviteLandingCard, type InviteGroupRow as InviteUiRow } from './components/InviteLandingCard';
import { computeClaimRenamePatches } from './lib/claimRename';
import { useSupabaseSync, getGidRemap } from './hooks/useSupabaseSync';
import { BalanceActionCard } from './components/BalanceActionCard';
import { asyncBatchNetBalances } from './lib/workerHelper';
import { useAppHotkeys } from './hooks/useAppHotkeys';
import { useUndoStack } from './hooks/useUndoStack';
import { MobileHeader } from './components/MobileHeader';
import { InstallPrompt } from './components/InstallPrompt';
import { useExportCSV } from './hooks/useExportCSV';
import { AppNotification, fetchNotifications, markAllNotificationsRead, subscribeNotifications, clearAllNotifications, pushNotification } from './lib/notifications';
import { calculateNextOccurrenceDate, simplifyMultiCurrencyDebts, computeRawPairwiseTransactions, memberNetBalances } from './lib/calculations';
import {
  consumeOAuthState,
  parseCallback,
  isNativeBounce,
  buildNativeBounceUrl,
  subscribeNativeCallback,
} from './lib/splitwiseAuth';

// claimInviteSpot only calls the handful of PostgREST query-builder methods
// declared on `SupabaseLike`; the real client's generic (untyped, no
// `Database` schema) `from()` return type doesn't structurally match that
// narrower interface, so this cast is a local, behaviour-neutral adaptation.
const inviteSupabase = supabase as unknown as InviteSupabaseLike;

// Who the invite resolver should treat as signed in: the real Supabase session
// only. The `userEmail` state is seeded from localStorage `divido_email`, which
// outlives an expired session — trusting it sent signed-out visitors into the
// signed-in path, where RLS-denied reads looked like a deleted group and wiped
// the invite before Google sign-in. The e2e mock login (no real session) is
// the one deliberate exception.
const sessionEmailForInvite = (session: { user?: { email?: string | null } | null } | null): string => {
  const email = session?.user?.email || '';
  if (email) return email;
  try {
    if (localStorage.getItem('divido_e2e_testing') === 'true' && localStorage.getItem('divido_force_logged_out') !== 'true') {
      return localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app';
    }
  } catch { /* storage unavailable */ }
  return '';
};

const pageDescriptions: Record<string, string> = {
  summary: "Track net balances, scan bills, and quickly settle with friends.",
  groups: "View, rename, and manage your group ledgers.",
  friends: "See your total balances across all circles and settle up directly.",
  activity: "View a chronological log of all expenses and settlements.",
  analytics: "Analyze your spending breakdowns and monthly trends.",
  profile: "Manage your settings, currency preferences, and payment details.",
  detail: "View members, track expenses, and settle debts for this group."
};

const getSavedUiState = () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const param = urlParams.get('joinGroupId');
    if (param && param !== 'STANDALONE') {
      const storedGroups = localStorage.getItem('divido_groups');
      const myEmail = localStorage.getItem('divido_email')?.toLowerCase() || null;
      let me = localStorage.getItem('divido_me') || 'Me';
      if (storedGroups) {
        const parsed = JSON.parse(storedGroups);
        const localMatch = parsed.find((g: any) => String(g.id) === String(param));
        const amActive = localMatch && localMatch.members.some((m: string) =>
          m.toLowerCase() === myEmail || m.toLowerCase() === me.toLowerCase()
        );
        if (localMatch && amActive) {
          // Instantly land in the group if we are already a known member!
          return { view: 'detail', selectedId: param };
        }
      }
    }
    // A pending multi-group `?invite=` link (or its saved intent surviving an
    // OAuth round-trip) always lands on the home screen with the landing card
    // on top — never resume a stale cached detail view underneath it.
    if (urlParams.get('invite')) return { view: 'summary', selectedId: null };
    try {
      const savedRaw = localStorage.getItem('divido_pending_join');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved?.invite && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) {
          return { view: 'summary', selectedId: null };
        }
      }
    } catch { /* malformed saved intent — fall through */ }
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

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
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
  const [netPayablePopup, setNetPayablePopup] = useState<{ friendName: string; amt: number; curr: string } | null>(() => initialSavedState?.netPayablePopup || null);
  const [netReceivablePopup, setNetReceivablePopup] = useState<{ friendName: string; amt: number; curr: string } | null>(() => initialSavedState?.netReceivablePopup || null);
  const [isGroupsExpanded, setIsGroupsExpanded] = useState<boolean>(false);

  // "Pending UPI payment" — when the user taps Proceed to Pay we launch the UPI
  // app but can't know if the payment actually went through. If they never come
  // back to answer the in-popup confirm (e.g. they close the app from the UPI
  // screen), we surface a gentle prompt on the NEXT open so the settle isn't lost.
  // Persisted so it survives an app kill; ignored if older than 24h.
  const PENDING_PAY_KEY = 'divido_pending_pay';
  type PendingPay = { name: string; gId: string | number | null; curr: string; amt: number; ts: number };
  const clearPendingPay = () => {
    try { localStorage.removeItem(PENDING_PAY_KEY); } catch { /* ignore */ }
  };
  const [pendingPayPrompt, setPendingPayPrompt] = useState<PendingPay | null>(() => {
    try {
      const raw = localStorage.getItem(PENDING_PAY_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as PendingPay;
      // Stale (older than 24h) → discard silently.
      if (!p || typeof p.ts !== 'number' || Date.now() - p.ts > 24 * 60 * 60 * 1000) {
        try { localStorage.removeItem(PENDING_PAY_KEY); } catch { /* ignore */ }
        return null;
      }
      return p;
    } catch {
      return null;
    }
  });
  const [showConvertModalId, setShowConvertModalId] = useState<string | number | null>(() => initialSavedState?.showConvertModalId || null);
  const [analyticsGroupId, setAnalyticsGroupId] = useState<string | number | null>(() => initialSavedState?.analyticsGroupId ?? null);
  const [showGroupSettleList, setShowGroupSettleList] = useState<boolean>(() => !!initialSavedState?.showGroupSettleList);
  const [showSplitwiseImport, setShowSplitwiseImport] = useState<boolean>(() => !!initialSavedState?.showSplitwiseImport);
  // OAuth code/error for the in-progress Splitwise connect flow. Not tracked in
  // browser history (like samePersonPrompt below): they're single-use artifacts
  // of one OAuth round-trip, not something a back-swipe should ever restore.
  const [swOauthCode, setSwOauthCode] = useState<string | null>(null);
  const [swOauthError, setSwOauthError] = useState<string | null>(null);
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
  const [adminRejoinRequest, setAdminRejoinRequest] = useState<AdminRejoinRequest | null>(null);

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
  // The placeholder row a user tapped on the claim card, pending an in-app
  // "are you sure" confirmation (replaces a native browser confirm() with a
  // styled step so the safety check doesn't look like an OS alert).
  const [claimConfirmTarget, setClaimConfirmTarget] = useState<any | null>(null);
  // True when the confirm card was opened by an email match (not a manual pick).
  const [claimConfirmAuto, setClaimConfirmAuto] = useState(false);
  // True while we resolve an invite link (fetch the group + members + session)
  // before deciding whether to show the claim card, admit the user, etc. Seeded
  // synchronously so the home feed never flashes behind the pending claim card.
  const [isResolvingInvite, setIsResolvingInvite] = useState<boolean>(() => {
    try {
      if (checkIfDemoMode()) return false;
      const urlParams = new URLSearchParams(window.location.search);
      const param = urlParams.get('joinGroupId');
      // A group id is now a permanent UUID string; any non-empty, non-STANDALONE
      // value is a real invite target (no more numeric/temp-float validation).
      if (param && param !== 'STANDALONE') return true;
      // A multi-group `?invite=` link is also a real invite target.
      if (urlParams.get('invite')) return true;
      const savedRaw = localStorage.getItem('divido_pending_join');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved?.groupId && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) return true;
        if (saved?.invite && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) return true;
      }
    } catch { /* fall through to no-gate */ }
    return false;
  });
  // Serializes the invite-resolution effect so overlapping runs (it re-fires on
  // every groups update) don't race into a half-loaded/empty group screen.
  const joinInFlightRef = useRef(false);
  // Set while a claim is being written / after it succeeds, so the invite
  // resolver (which re-runs on every groups update) can't re-show the claim
  // list over the group the user was just taken into.
  const claimInProgressRef = useRef(false);
  const lastClaimedGroupRef = useRef<string | null>(null);
  // ---- Multi-group `?invite=` landing (see src/lib/inviteLink.ts / inviteClaim.ts) ----
  // Declared above the `!isAuthenticated` early return so the card (and the
  // user's checkbox selection) survives the sign-out → OAuth → sign-in
  // transition triggered by its own "Continue with Google" button.
  // The raw `invite` param this state was built for; null hides the card.
  const [inviteLandingRaw, setInviteLandingRaw] = useState<string | null>(null);
  const [inviteLandingMode, setInviteLandingMode] = useState<'signedOut' | 'signedIn'>('signedOut');
  const [inviteLandingSpots, setInviteLandingSpots] = useState<Required<InviteSpot>[]>([]);
  const [inviteLandingRows, setInviteLandingRows] = useState<InviteUiRow[]>([]);
  // Signed-in only: the raw entries (carrying each spot's target group_members
  // row) driving onJoinSelected's per-spot claim, plus the group/member rows
  // claimInviteSpot needs as `groupRow` / `existingMembers`.
  const [inviteLandingEntries, setInviteLandingEntries] = useState<InviteLandingEntry[]>([]);
  const [inviteLandingGroupRows, setInviteLandingGroupRows] = useState<InviteClaimGroupRow[]>([]);
  const [inviteLandingMemberRows, setInviteLandingMemberRows] = useState<InviteClaimMemberRow[]>([]);
  const [inviteLandingSelectedIds, setInviteLandingSelectedIds] = useState<string[]>([]);
  const [inviteLandingBusy, setInviteLandingBusy] = useState<boolean>(false);
  const [inviteLandingJoiningId, setInviteLandingJoiningId] = useState<string | null>(null);
  const [inviteLandingRowErrors, setInviteLandingRowErrors] = useState<Record<string, string>>({});
  // The invite resolver found a real Supabase session. Back from the Google
  // round-trip, `isAuthenticated` only flips after the auth listener finishes
  // its profile/identity work; until then this lets the app (and its join
  // card) render instead of the Login screen, so the invite opens right away.
  const [inviteSessionReady, setInviteSessionReady] = useState<boolean>(false);
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
  // Last UPI we pushed onto our own group_members rows, so co-members can read it
  // and autofill it when paying us. Guards against re-running the update on every
  // profile-sync tick when nothing changed.
  const lastMemberUpiPushed = useRef<string | null>(null);
  // Shared member display pictures, keyed by lowercased email → image URL.
  // Populated from the member_avatars table so group members can see each
  // other's Google (or uploaded) photo. See loadMemberAvatars / saveMyAvatar.
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  // Cloud backup of my non-group (STANDALONE) expenses. They are local-only, so
  // this private per-user snapshot is what makes them recoverable on a new device
  // or after an accidental wipe. Never merged live into group sync.
  const [nonGroupBackup, setNonGroupBackup] = useState<Expense[]>([]);
  const everHadLocalStandaloneRef = useRef(false);
  // The expenses from the most recently committed Splitwise import, so tapping
  // a "needs review" row (which fires in the same tick as the commit, before
  // the setExpenses state update above has flushed) can still look the exact
  // expense object up to open it in the editor.
  const lastSplitwiseImportExpensesRef = useRef<Expense[]>([]);

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
  // Non-Group screen's own header search (null = closed).
  const [nonGroupSearch, setNonGroupSearch] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId !== 'STANDALONE' || view !== 'detail') setNonGroupSearch(null);
  }, [selectedId, view]);
  const mainContentRef = useRef<HTMLElement>(null);
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    if (view !== 'analytics') {
      setAnalyticsGroupId(null);
    }
    setShowInfo(false);
  }, [view, selectedId]);

  // Keep identity.ts in sync with cloud preferences for dismissed people
  useEffect(() => {
    const key = me ? me.split(' ')[0] : 'me';
    const prefs = userMetadata[key]?.preferences || {};
    setSyncedDismissedPeople(prefs.dismissedPeople || []);
  }, [userMetadata, me]);

  // Listen for dismissals from UI components (via identity.ts) to persist them to the cloud
  useEffect(() => {
    const handler = (e: any) => {
      const key = me ? me.split(' ')[0] : 'me';
      setUserMetadata((prev) => {
        const p = prev[key] || {};
        const prefs = p.preferences || {};
        return {
          ...prev,
          [key]: {
            ...p,
            preferences: { 
              ...prefs, 
              dismissedPeople: Array.from(new Set([...(prefs.dismissedPeople || []), e.detail])) 
            }
          }
        };
      });
    };
    window.addEventListener('divido-dismiss-person', handler);
    return () => window.removeEventListener('divido-dismiss-person', handler);
  }, [me]);

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
  const [homeTabResetNonce, setHomeTabResetNonce] = useState(0);

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
    addEmails?: Record<string, string>;
    addIdentities?: Record<string, string>;
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
    netPayablePopup,
    netReceivablePopup,
    showConvertModalId,
    showNotifPanel,
    mobileShowGroupOptionsMenu,
    editingSettle,
    globalSettleData,
    showFriendsList,
    showSplitwiseImport,
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
        showMembersHealth || showNotifPanel || mobileShowGroupOptionsMenu || showSplitwiseImport ||
        !!qrModalData || !!netPayablePopup || !!netReceivablePopup || !!showConvertModalId || !!editingSettle || !!globalSettleData ||
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
        setNetPayablePopup(ui.netPayablePopup || null);
        setNetReceivablePopup(ui.netReceivablePopup || null);
        setShowConvertModalId(ui.showConvertModalId || null);
        setShowNotifPanel(!!ui.showNotifPanel);
        setMobileShowGroupOptionsMenu(!!ui.mobileShowGroupOptionsMenu);
        setEditingSettle(ui.editingSettle || null);
        setGlobalSettleData(ui.globalSettleData || null);
        setShowFriendsList(!!ui.showFriendsList);
        setShowSplitwiseImport(!!ui.showSplitwiseImport);
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
    showGroupSettleList, showMembersHealth, qrModalData, netPayablePopup, netReceivablePopup, showConvertModalId,
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, showSplitwiseImport, samePersonPrompt, analyticsGroupId, confirmState
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
      !!ui.qrModalData, !!ui.netPayablePopup, !!ui.netReceivablePopup, !!ui.showConvertModalId, !!ui.editingSettle, !!ui.globalSettleData,
      !!(ui.confirmState && ui.confirmState.show),
      ui.showFriendsList, ui.showSplitwiseImport,
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
        JSON.stringify(prev.netPayablePopup) !== JSON.stringify(currentUi.netPayablePopup) ||
        JSON.stringify(prev.netReceivablePopup) !== JSON.stringify(currentUi.netReceivablePopup) ||
        prev.showConvertModalId !== currentUi.showConvertModalId ||
        prev.showNotifPanel !== currentUi.showNotifPanel ||
        prev.mobileShowGroupOptionsMenu !== currentUi.mobileShowGroupOptionsMenu ||
        prev.showFriendsList !== currentUi.showFriendsList ||
        prev.showSplitwiseImport !== currentUi.showSplitwiseImport ||
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
        isSameId(prev.analyticsGroupId, currentUi.analyticsGroupId);
      if (sameScreen && overlayCount(currentUi) < overlayCount(prev)) {
        window.history.back();
        return;
      }

      // An overlay SWAP: same screen, same number of overlays open, but a
      // different set (e.g. the group options sheet closed AND the currency
      // converter opened in one step). Pushing here would leave the old overlay's
      // entry in the back-stack, so closing the NEW overlay would step back and
      // reopen the OLD one (the "settings sheet reopens after converting" bug).
      // Replace the current entry instead, so closing the new overlay returns to
      // the clean screen.
      if (sameScreen && overlayCount(currentUi) > 0 && overlayCount(currentUi) === overlayCount(prev)) {
        window.history.replaceState({ _divido: true, uiState: currentUi }, '');
        try { sessionStorage.setItem('divido_ui_state', JSON.stringify(currentUi)); } catch {}
        return;
      }

      // Top level tab navigation (bottom nav): replace state instead of pushing!
      // This prevents the history stack from growing endlessly.
      const isTopLevel = (v: string, aId: any, selId: any) =>
        selId == null && (v === 'summary' || v === 'friends' || v === 'activity' || v === 'profile' || (v === 'analytics' && (aId === null || aId === 'ALL')));

      if (
        isTopLevel(prev.view, prev.analyticsGroupId, prev.selectedId) &&
        isTopLevel(currentUi.view, currentUi.analyticsGroupId, currentUi.selectedId) &&
        overlayCount(currentUi) === 0 && overlayCount(prev) === 0
      ) {
        window.history.replaceState({ _divido: true, uiState: currentUi }, '');
        try { sessionStorage.setItem('divido_ui_state', JSON.stringify(currentUi)); } catch {}
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
    showNotifPanel, mobileShowGroupOptionsMenu, editingSettle, globalSettleData, showFriendsList, showSplitwiseImport, samePersonPrompt, analyticsGroupId, confirmState
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

  // Load my non-group cloud backup on sign-in (so a restore banner can appear).
  useEffect(() => {
    if (!userEmail) { setNonGroupBackup([]); everHadLocalStandaloneRef.current = false; return; }
    loadNonGroupBackup(userEmail);
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
  // A one-line entry in the group's own activity/bell feed (paid: 'SYSTEM'),
  // e.g. "Ravi joined" / "Ravi left". Best-effort: never blocks the action.
  const logGroupEvent = async (groupId: string | number, title: string) => {
    if (!groupId || groupId === 'STANDALONE' || checkIfDemoMode()) return;
    try {
      const { error } = await supabase.from('expenses').insert({
        id: genExpenseId(),
        group_id: groupId,
        title,
        amt: 0,
        paid: 'SYSTEM',
        date: new Date().toISOString().split('T')[0],
        mode: 'Equally',
        splitters: [],
      });
      if (error) console.error('Group activity log failed:', error);
    } catch (e) {
      console.error('Group activity log failed:', e);
    }
  };

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
      // 1+2. Member row + every expense reference, in ONE database transaction
      // (api/rename_member.sql) so a dropped connection can't leave a balance
      // split between the old and new name. Until that SQL is run, fall back to
      // the old step-by-step rename below.
      const { error: rpcErr } = await supabase.rpc('rename_member', {
        p_group_id: String(groupId), p_old: oldName, p_new: newName,
      });
      if (rpcErr) {
        console.warn('rename_member RPC unavailable, using step-by-step rename:', rpcErr.message);
      await supabase.from('group_members').update({ name: newName, pending_name: null }).eq('group_id', groupId).ilike('name', oldName);
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
  
  // A "direct" group is a shared non-group card (isDirect). Its expenses are
  // presented as Non-Group Expenses, and the group itself is hidden from the
  // Groups list. This predicate is the single source of truth for "does this
  // expense belong under Non-Group Expenses?".
  const directGroupIdSet = new Set(groups.filter((g) => g.isDirect).map((g) => String(g.id)));
  const isNonGroupExpense = (e: Expense) => String(e.gId) === 'STANDALONE' || directGroupIdSet.has(String(e.gId));

  // Back-fill: older shared threads were created before the `isDirect` flag
  // existed (or the flag failed to round-trip), so they leak into the Groups
  // list as "Damini & Abhishek" cards the user never made. Our generator always
  // names a direct thread exactly `${members[0]} & ${members[1]}`, so any
  // 2-member group matching that signature is really a direct thread — mark it
  // (locally and in the cloud) so every isDirect filter hides it.
  useEffect(() => {
    const orphans = groups.filter(
      (g) =>
        !g.isDirect &&
        String(g.id) !== 'STANDALONE' &&
        Array.isArray(g.members) &&
        g.members.length === 2 &&
        (g.name || '').trim() === `${g.members[0]} & ${g.members[1]}`
    );
    if (orphans.length === 0) return;
    const ids = new Set(orphans.map((g) => String(g.id)));
    setGroups((prev) => prev.map((g) => (ids.has(String(g.id)) ? { ...g, isDirect: true } : g)));
    orphans.forEach((g) => {
      supabase.from('groups').update({ is_direct: true }).eq('id', g.id).then(() => {});
    });
  }, [groups]);

  // Debounced cloud backup of my non-group expenses whenever they change. Guard
  // against clobbering a good cloud backup with an empty set on a fresh device:
  // only write an empty snapshot once the user has actually had non-group
  // expenses this session (a genuine local clear), never before a restore.
  useEffect(() => {
    if (!userEmail || checkIfDemoMode()) return;
    const standalone = expenses.filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted);
    if (standalone.length > 0) everHadLocalStandaloneRef.current = true;
    if (standalone.length === 0 && !everHadLocalStandaloneRef.current) return;
    const t = setTimeout(() => { saveNonGroupBackup(userEmail, standalone); }, 2000);
    return () => clearTimeout(t);
  }, [expenses, userEmail]);

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
      // If a DIFFERENT member already has this name, people are told apart by
      // email: store it with a short email tag (hidden on screen) instead of
      // refusing the rename.
      const taken = new Set((g.members || [])
        .map((m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase())
        .filter((n) => n !== oldName.toLowerCase()));
      const target = uniqueProfileName(cleanNew, myEmail, taken);
      if (oldName.toLowerCase() === target.toLowerCase()) continue; // no real change
      await applyRename(g.id, oldName, target);
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
        .select('full_name, upi_id, default_currency, profile_photo, budgets, preferences')
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
            ...(data.preferences ? { preferences: data.preferences } : {}),
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

  // Save my own display picture to the shared member_avatars table so other
  // group members can see it. Called at sign-in (with the Google photo) and
  // whenever I change my profile photo. Only my own row is writable (RLS).
  const saveMyAvatar = async (email: string, avatarUrl: string) => {
    const em = (email || '').trim().toLowerCase();
    if (!em || !avatarUrl) return;
    try {
      await supabase
        .from('member_avatars')
        .upsert({ email: em, avatar_url: avatarUrl, updated_at: new Date().toISOString() }, { onConflict: 'email' });
      setMemberAvatars((prev) => ({ ...prev, [em]: avatarUrl }));
    } catch (e) {
      console.error('Failed to save avatar:', e);
    }
  };

  // Fetch avatars for a set of emails and merge them into state.
  const loadMemberAvatars = async (emails: string[]) => {
    const list = Array.from(new Set(emails.map((e) => (e || '').trim().toLowerCase()).filter((e) => e.includes('@'))));
    if (list.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('member_avatars')
        .select('email, avatar_url')
        .in('email', list);
      if (!error && data) {
        setMemberAvatars((prev) => {
          const next = { ...prev };
          data.forEach((row: { email: string; avatar_url: string | null }) => {
            if (row.avatar_url) next[row.email.toLowerCase()] = row.avatar_url;
          });
          return next;
        });
      }
    } catch (e) {
      console.error('Failed to load avatars:', e);
    }
  };

  // ── Non-group cloud backup ──────────────────────────────────────────────────
  const saveNonGroupBackup = async (email: string, exps: Expense[]) => {
    const em = (email || '').trim().toLowerCase();
    if (!em || checkIfDemoMode()) return;
    try {
      await supabase
        .from('nongroup_backups')
        .upsert({ user_email: em, data: exps, updated_at: new Date().toISOString() }, { onConflict: 'user_email' });
    } catch (e) {
      console.error('Failed to save non-group backup:', e);
    }
  };

  const loadNonGroupBackup = async (email: string) => {
    const em = (email || '').trim().toLowerCase();
    if (!em) return;
    try {
      const { data, error } = await supabase
        .from('nongroup_backups')
        .select('data')
        .eq('user_email', em)
        .maybeSingle();
      if (!error && data && Array.isArray((data as any).data)) {
        setNonGroupBackup((data as any).data as Expense[]);
      }
    } catch (e) {
      console.error('Failed to load non-group backup:', e);
    }
  };

  // Restore any backed-up non-group expenses that aren't already present locally.
  const restoreNonGroupBackup = () => {
    setExpenses((prev) => {
      const ids = new Set(prev.map((e) => String(e.id)));
      const missing = nonGroupBackup.filter(
        (e) => e && String(e.gId) === 'STANDALONE' && !ids.has(String(e.id))
      );
      if (missing.length === 0) return prev;
      return [...missing, ...prev];
    });
  };

  // [BETA] Share a person's non-group expenses: promote them into a hidden
  // 2-person "direct" thread written to the cloud immediately, then open the
  // invite link. Identity-first (email-keyed) so balances/names resolve on both
  // sides and the friend auto-claims by email.
  const sharePersonNonGroupBeta = async (personName: string, otherEmail: string) => {
    if (!requireSignInToCreate()) return;
    const clean = (personName || '').replace(/\s*\(Left\)$/i, '').trim();
    if (!clean) return;
    // Normalize: trim, lowercase, strip trailing dots/spaces (a stray "." after
    // .com silently broke the invite-email match).
    const em = (otherEmail || '').trim().toLowerCase().replace(/[\s.]+$/, '');
    const cl = clean.toLowerCase();
    const involves = (e: Expense) =>
      (e.paid || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === cl ||
      (e.splitters || []).some((s) => (s || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === cl);
    let gid: string | number | undefined = groups.find(
      (g) => g.isDirect && (g.members || []).some((m) => (m || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === cl)
    )?.id;
    if (!gid) {
      // No email needed: the private link's single open spot is claimed by whoever
      // opens it. If an email IS known, we still set it (nicer auto-match).
      const emValid = em.includes('@') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em);
      gid = genGroupId();
      const theirs = expenses.filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted && involves(e));
      const currency = theirs[0]?.currency || myDefaultCurrency || '₹';
      const memberIdentities: Record<string, string> = {};
      if (userEmail) memberIdentities[me] = userEmail.toLowerCase();
      if (emValid) memberIdentities[clean] = em;
      const newGroup = {
        id: gid, name: `${me} & ${clean}`, currency, members: [me, clean], simplifyDebts: false,
        createdDate: new Date().toISOString().split('T')[0], pendingMembers: [clean], memberIdentities,
        isDirect: true, pendingSync: false,
      } as Group;
      const targetGid = gid;
      setGroups((prev) => [...prev, newGroup]);
      setExpenses((prev) => prev.map((e) => (String(e.gId) === 'STANDALONE' && involves(e) ? { ...e, gId: targetGid } : e)));
      if (!checkIfDemoMode()) {
        // supabase-js returns { error } instead of throwing — check each one.
        const gRes = await supabase.from('groups').insert({ id: gid, name: newGroup.name, currency, emoji: '👤', simplify_debts: false, created_date: newGroup.createdDate, is_direct: true });
        if (gRes.error) { alert("Couldn't start the share. Check your connection and try again."); return; }
        const mRes = await supabase.from('group_members').insert([
          { group_id: gid, name: me, user_email: (userEmail || '').toLowerCase() || null, is_pending: false, invite_email: null, person_id: null },
          { group_id: gid, name: clean, user_email: null, is_pending: true, invite_email: emValid ? em : null, person_id: null },
        ]);
        if (mRes.error) { alert("Couldn't start the share. Check your connection and try again."); return; }
        for (const e of theirs) {
          const eRes = await supabase.from('expenses').upsert({ id: String(e.id), group_id: gid, title: e.title, amt: e.amt, paid: e.paid, date: e.date, mode: e.mode || 'Equally', splitters: e.splitters || [], shares: e.shares, category: e.category, currency: e.currency, notes: e.notes, attachments: e.attachments || [], is_deleted: false, is_recurring: false, recurrence: 'none' }, { onConflict: 'id' });
          if (eRes.error) { alert("Couldn't upload an expense to the share. Try again."); return; }
        }
      }
    }
    const link = `${window.location.origin}/?joinGroupId=${gid}`;
    const shareText = `Open our shared expenses on Divido 💸`;
    // Prefer the phone's native share sheet (WhatsApp, etc.) with the FULL link.
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'Divido — shared expenses', text: shareText, url: link });
        return;
      } catch { /* user dismissed, or share unavailable — fall through to copy */ }
    }
    // Desktop / no share support: copy the link and show it.
    try { await navigator.clipboard.writeText(link); alert('Invite link copied:\n\n' + link); } catch { alert(link); }
  };

  // Delete a whole non-group thread with one person: all STANDALONE expenses
  // involving them, plus their leftover shared "direct" thread (local + cloud).
  const deletePersonNonGroup = async (personName: string, directGroupId?: string) => {
    const cl = (personName || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    if (!cl) return;
    const involves = (e: Expense) =>
      (e.paid || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === cl ||
      (e.splitters || []).some((s) => (s || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === cl);
    setExpenses((prev) => prev.filter((e) => {
      if (String(e.gId) === 'STANDALONE' && involves(e)) return false;
      if (directGroupId && String(e.gId) === String(directGroupId)) return false;
      return true;
    }));
    everHadLocalStandaloneRef.current = true; // let the backup snapshot update
    if (directGroupId) {
      setGroups((prev) => prev.filter((g) => String(g.id) !== String(directGroupId)));
      try {
        if (!checkIfDemoMode()) {
          await supabase.from('expenses').delete().eq('group_id', directGroupId);
          await supabase.from('group_members').delete().eq('group_id', directGroupId);
          await supabase.from('groups').delete().eq('id', directGroupId);
        }
      } catch (e) {
        console.error('deletePersonNonGroup cloud cleanup failed:', e);
      }
    }
  };

  // Wipe ALL non-group data for a fresh start: local STANDALONE expenses, any
  // leftover shared "direct" threads (local + cloud), and the cloud backup.
  const clearAllNonGroup = async () => {
    if (!window.confirm('Delete ALL non-group expenses?\n\nThis clears them from this device, removes shared threads, and empties your cloud backup. This cannot be undone.')) return;
    const directIds = groups.filter((g) => g.isDirect).map((g) => String(g.id));
    const directIdSet = new Set(directIds);
    setExpenses((prev) => prev.filter((e) => !(String(e.gId) === 'STANDALONE' || directIdSet.has(String(e.gId)))));
    setGroups((prev) => prev.filter((g) => !g.isDirect));
    everHadLocalStandaloneRef.current = true; // let the empty snapshot overwrite the backup
    try {
      if (!checkIfDemoMode() && userEmail) {
        await supabase
          .from('nongroup_backups')
          .upsert({ user_email: userEmail.toLowerCase(), data: [], updated_at: new Date().toISOString() }, { onConflict: 'user_email' });
        setNonGroupBackup([]);
        for (const gid of directIds) {
          await supabase.from('expenses').delete().eq('group_id', gid);
          await supabase.from('group_members').delete().eq('group_id', gid);
          await supabase.from('groups').delete().eq('id', gid);
        }
      }
    } catch (e) {
      console.error('clearAllNonGroup cloud cleanup failed:', e);
    }
  };

  // Duplicate groups the user probably created twice (same name AND same member
  // set). Never auto-merged — surfaced as a prompt the user confirms.
  const duplicateGroups = React.useMemo(() => findDuplicateGroups(groups), [groups]);
  // Name -> email resolver so pay/QR screens read the RIGHT person's synced UPI
  // (money — never key UPI by raw display name).
  const nameToEmailUpi = React.useMemo(() => buildNameEmailResolver(groups), [groups]);

  // Merge one accidental duplicate group into another: move the dropped group's
  // expenses onto the kept group, union members/identities, then delete the
  // dropped group (local + cloud). Only ever called after user confirmation.
  const mergeGroups = async (keepId: string | number, dropId: string | number) => {
    if (String(keepId) === String(dropId)) return;
    const keep = groups.find((g) => String(g.id) === String(keepId));
    const drop = groups.find((g) => String(g.id) === String(dropId));
    if (!keep || !drop) return;

    // Move the dropped group's expenses onto the kept group locally.
    setExpenses((prev) => prev.map((e) => (String(e.gId) === String(dropId) ? { ...e, gId: keepId } : e)));

    // Union members (dedup by clean lower-case name) + merge identities (keep wins).
    const cleanLower = (m: string) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    const seen = new Set((keep.members || []).map(cleanLower));
    const mergedMembers = [...(keep.members || [])];
    (drop.members || []).forEach((m) => { if (!seen.has(cleanLower(m))) { seen.add(cleanLower(m)); mergedMembers.push(m); } });
    const mergedIdentities = { ...(drop.memberIdentities || {}), ...(keep.memberIdentities || {}) };

    setGroups((prev) =>
      prev
        .map((g) => (String(g.id) === String(keepId) ? { ...g, members: mergedMembers, memberIdentities: mergedIdentities } : g))
        .filter((g) => String(g.id) !== String(dropId))
    );

    if (!checkIfDemoMode()) {
      try {
        await supabase.from('expenses').update({ group_id: keepId }).eq('group_id', dropId);
        await supabase.from('group_members').delete().eq('group_id', dropId);
        await supabase.from('groups').delete().eq('id', dropId);
      } catch (err) {
        console.error('mergeGroups cloud cleanup failed:', err);
      }
    }
    if (String(selectedId) === String(dropId)) setSelectedId(keepId);
  };

  // Remove only EMPTY shared threads — direct (isDirect) groups that carry no
  // non-deleted expenses. These are the leftover "X & Y" cards created during
  // sharing/testing that clutter the list but hold no data, so it's always safe
  // to drop them (local + cloud). Returns the count removed.
  const cleanupEmptyThreads = async (): Promise<number> => {
    const empties = groups.filter(
      (g) =>
        g.isDirect &&
        !expenses.some((e) => String(e.gId) === String(g.id) && !e.isDeleted)
    );
    if (empties.length === 0) {
      window.alert('No empty threads to clean up.');
      return 0;
    }
    if (!window.confirm(`Remove ${empties.length} empty ${empties.length === 1 ? 'thread' : 'threads'} (no expenses)?\n\nThis only deletes threads with nothing in them. It cannot be undone.`)) return 0;
    const ids = new Set(empties.map((g) => String(g.id)));
    setGroups((prev) => prev.filter((g) => !ids.has(String(g.id))));
    try {
      if (!checkIfDemoMode()) {
        for (const gid of ids) {
          await supabase.from('expenses').delete().eq('group_id', gid);
          await supabase.from('group_members').delete().eq('group_id', gid);
          await supabase.from('groups').delete().eq('id', gid);
        }
      }
    } catch (e) {
      console.error('cleanupEmptyThreads cloud cleanup failed:', e);
    }
    window.alert(`Removed ${empties.length} empty ${empties.length === 1 ? 'thread' : 'threads'}.`);
    return empties.length;
  };

  // Merge several roster entries that are the SAME person (usually fragmented
  // after an account deletion dropped their email) into one shared identity, so
  // they collapse to a single person in balances/suggestions everywhere.
  // Writes a shared key onto each row (invite_email when the canonical is an
  // email, else the hidden person_id) and mirrors it into local memberIdentities.
  // Attach an email to a pending invite so the joiner auto-claims by email (no
  // "pick your name" step, and no same-name mix-up). Sets invite_email in the
  // cloud + the member's local identity.
  const setMemberInviteEmail = async (memberName: string, email: string) => {
    const em = (email || '').trim().toLowerCase();
    if (!selectedId || selectedId === 'STANDALONE' || !em.includes('@')) return;
    const gid = selectedId;
    const group = groups.find((g) => String(g.id) === String(gid));
    const oldId = (group as any)?.memberIdentities?.[memberName];
    const applyLocal = (val: string | undefined) => setGroups((prev) => prev.map((g) => {
      if (String(g.id) !== String(gid)) return g;
      const mi = { ...((g as any).memberIdentities || {}) };
      if (val === undefined) delete mi[memberName]; else mi[memberName] = val;
      return { ...g, memberIdentities: mi } as typeof g;
    }));
    applyLocal(em);
    if (!checkIfDemoMode() && isAuthenticated) {
      // Target the exact row: permanent member_key when known, else the name
      // (case-insensitive, exact — not a wildcard pattern). Check the result:
      // the update used to fail silently and the old email came back on reload.
      const memberKey = (group as any)?.memberKeys?.[memberName];
      const cleanName = memberName.replace(/\s*\(Left\)$/i, '').trim();
      let q = supabase.from('group_members').update({ invite_email: em }).eq('group_id', gid);
      q = memberKey ? q.eq('member_key', memberKey) : q.ilike('name', cleanName.replace(/[\\%_]/g, (c) => '\\' + c));
      const { data, error } = await q.select('id');
      if (error || !data || data.length === 0) {
        console.error('setMemberInviteEmail failed:', error || 'no row updated');
        applyLocal(oldId);
        alert(error
          ? `Couldn't save the email: ${error.message}`
          : `Couldn't save the email: ${cleanName}'s spot wasn't found in the cloud. Pull down to refresh and try again.`);
      }
    }
  };

  // Auto-link pending spots that have no email to the ONE email that name has
  // in your other groups (e.g. "Chirag Gupta" pending in Raipur, joined in
  // Spain ka vada pav), so the same person shows once and can auto-join.
  // Ambiguous names (2+ emails) and your own name are never touched.
  const autoLinkTried = React.useRef(new Set<string>());
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;
    const resolve = buildNameEmailResolver(groups);
    const mine = (userEmail || '').toLowerCase();
    const fixes: { gid: string | number; name: string; key?: string; email: string }[] = [];
    groups.forEach((g) => {
      if (!g || g.id === 'STANDALONE') return;
      const mi = (g as any).memberIdentities || {};
      (g.pendingMembers || []).forEach((name) => {
        const cur = String(mi[name] || '');
        if (cur.includes('@')) return;
        const em = resolve(name);
        if (!em || em === mine) return;
        const tag = `${g.id}|${name}`;
        if (autoLinkTried.current.has(tag)) return;
        autoLinkTried.current.add(tag);
        fixes.push({ gid: g.id, name, key: (g as any).memberKeys?.[name], email: em });
      });
    });
    if (fixes.length === 0) return;
    setGroups((prev) => prev.map((g) => {
      const fs = fixes.filter((f) => String(f.gid) === String(g.id));
      if (fs.length === 0) return g;
      const mi = { ...((g as any).memberIdentities || {}) };
      fs.forEach((f) => { mi[f.name] = f.email; });
      return { ...g, memberIdentities: mi } as typeof g;
    }));
    fixes.forEach(async (f) => {
      try {
        let q = supabase.from('group_members').update({ invite_email: f.email })
          .eq('group_id', f.gid).eq('is_pending', true).is('invite_email', null).is('user_email', null);
        q = f.key ? q.eq('member_key', f.key) : q.eq('name', f.name);
        await q;
      } catch (err) { console.error('auto-link pending email failed:', err); }
    });
  }, [groups, isAuthenticated, userEmail]);

  const mergePeople = async (entries: DuplicateEntry[], canonicalOverride?: string) => {
    if (!entries || entries.length < 2) return;
    // The user can choose the primary email to merge everyone into; otherwise
    // fall back to the automatic pick (existing email > person_id).
    const canonical = (canonicalOverride && canonicalOverride.trim())
      ? canonicalOverride.trim().toLowerCase()
      : pickCanonicalIdentity(entries);
    const isEmail = canonical.includes('@');
    if (!checkIfDemoMode() && isAuthenticated) {
      for (const e of entries) {
        const upd: Record<string, unknown> = isEmail
          ? { invite_email: canonical }
          : { person_id: canonical };
        try {
          await supabase
            .from('group_members')
            .update(upd)
            .eq('group_id', e.groupId)
            .eq('name', e.memberName);
        } catch (err) {
          console.error('Failed to merge member on Supabase:', err);
        }
      }
    }
    // Reflect immediately in local state so the UI consolidates without a reload.
    setGroups((prev) => prev.map((g) => {
      const es = entries.filter((e) => String(e.groupId) === String(g.id));
      if (es.length === 0) return g;
      const mi = { ...((g as any).memberIdentities || {}) };
      es.forEach((e) => { mi[e.memberName] = canonical; });
      return { ...g, memberIdentities: mi } as typeof g;
    }));
  };

  useEffect(() => {
    try { sessionStorage.removeItem('divido_chunk_reloaded'); } catch {}
  }, []);

  // Whenever groups change, refresh avatars for everyone in them (plus me).
  useEffect(() => {
    if (!isAuthenticated) return;
    const emails: string[] = [];
    if (userEmail) emails.push(userEmail);
    groups.forEach((g) => {
      const ids = (g as any).memberIdentities || {};
      Object.values(ids).forEach((v) => { if (typeof v === 'string' && v.includes('@')) emails.push(v); });
    });
    if (emails.length) loadMemberAvatars(emails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, isAuthenticated, userEmail]);

  useEffect(() => {
    // Listen to changes in auth state from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUserEmail(session.user?.email || '');
        // Persist the signed-in email locally so identity matching (which keys
        // people by email) works across the app and survives reloads. Without
        // this, divido_email stayed empty for Google users, so a full-name member
        // ("Damini Gupta") couldn't be matched and whole groups were dropped from
        // All balances.
        try { if (session.user?.email) localStorage.setItem('divido_email', session.user.email); } catch { /* ignore */ }
        const saved = localStorage.getItem('divido_username');
        if (!saved || saved === 'You' || saved === 'undefined' || saved === 'Guest') {
          const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
          updateUserName(userFullName);
        }
        // Await background linking so database has user_email set before sync fetches
        if (session.user?.email) {
          await linkGuestIdentities(session.user.email);
          // Capture the Google (or provider) profile photo so co-members see it.
          const googlePic = session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture;
          if (googlePic) saveMyAvatar(session.user.email, googlePic);
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
        // Persist the signed-in email locally so identity matching (which keys
        // people by email) works across the app and survives reloads. Without
        // this, divido_email stayed empty for Google users, so a full-name member
        // ("Damini Gupta") couldn't be matched and whole groups were dropped from
        // All balances.
        try { if (session.user?.email) localStorage.setItem('divido_email', session.user.email); } catch { /* ignore */ }
        const saved = localStorage.getItem('divido_username');
        if (!saved || saved === 'You' || saved === 'undefined' || saved === 'Guest') {
          const userFullName = session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || session.user?.phone || 'User';
          updateUserName(userFullName);
        }
        // Await background linking so database has user_email set before sync fetches
        if (session.user?.email) {
          await linkGuestIdentities(session.user.email);
          // Capture the Google (or provider) profile photo so co-members see it.
          const googlePic = session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture;
          if (googlePic) saveMyAvatar(session.user.email, googlePic);
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
        { id: 'STANDALONE', name: 'Non-Group', members: [] as string[], currency: '₹' },
        ...groups,
      ].filter((g) => {
        if (globalSettleData.gId !== undefined && globalSettleData.gId !== null) {
          return String(g.id) === String(globalSettleData.gId);
        }
        if (targetGroupNames) {
          // Direct/shared threads are tagged "Non-Group" in the friends list, not
          // by their internal name — so match the display label, else the settle
          // sheet finds no groups and renders blank. STANDALONE is "Non-Group" too.
          if (String(g.id) === 'STANDALONE') {
            return targetGroupNames.includes('Non-Group') || targetGroupNames.includes('Non-Group');
          }
          const gLabel = (g as any).isDirect ? 'Non-Group' : String(g.name);
          return targetGroupNames.includes(gLabel) || targetGroupNames.includes(String(g.name));
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
        const groupExps = expenses.filter((e) => String(e.gId) === String(g.id) && !e.isDeleted);
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

        // Calculate this group's payback plan with the SAME engine the Friends /
        // Balances view uses, so the settle sheet can never disagree with the
        // friend card (the old hand-rolled pairwise math diverged — wrong
        // direction and totals). effectiveMembers mirrors FriendsView exactly: my
        // per-group name plus everyone who appears in an expense.
        void members;
        // Run the engine in identity space: each name on an expense resolves
        // through its recorded member_key (then the roster), so renamed or
        // re-claimed people keep one ledger. Same path as balancesByIdentity.
        const { expenses: keyedExps, keyToName } = toIdentitySpace(g, groupExps);
        const effectiveMembers = Array.from(new Set([
          myKey,
          ...keyedExps.reduce((acc, e) => {
            if (e.paid) acc.add(e.paid);
            if (Array.isArray(e.splitters)) e.splitters.forEach((s) => acc.add(s));
            return acc;
          }, new Set<string>()),
        ]));
        const useSimplify = g.id !== 'STANDALONE'; // debts are always simplified in groups
        const groupPlan = useSimplify
          ? simplifyMultiCurrencyDebts(effectiveMembers, keyedExps, g.currency || '₹')
          : computeRawPairwiseTransactions(effectiveMembers, keyedExps, g.currency || '₹');
        const nameOf = (k: string) => keyToName[k] ?? (k === myKey ? myG : k);

        // 2. Find transactions involving me and m
        const relevantExps = groupExps.filter((_, i) => {
          const ke = keyedExps[i];
          const splitterKeys = ke.splitters || [];
          return (
            (ke.paid === myKey && splitterKeys.includes(mKey)) ||
            (ke.paid === mKey && splitterKeys.includes(myKey))
          );
        });

        groupPlan.forEach((t) => {
          const fromKey = t.from;
          const toKey = t.to;
          const involvesUs = (fromKey === myKey && toKey === mKey) || (fromKey === mKey && toKey === myKey);

          if (involvesUs) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              const absVal = Math.abs(val);
              if (absVal > 0.01) {
                // val > 0: money flows t.from -> t.to; val < 0: the reverse direction for this currency
                const payer = nameOf(val > 0 ? t.from : t.to);
                const receiver = nameOf(val > 0 ? t.to : t.from);
                // Whether I'M the payer must be decided by IDENTITY, not a name
                // match against the flat global `me` — my per-group name can
                // differ from it, which silently flipped every line's direction.
                const iAmPayer = (val > 0 ? t.from : t.to) === myKey;

                const currencyExps = relevantExps.filter(
                  (e) => (e.currency || g.currency || '₹') === curr
                );
                const lastExp = currencyExps[currencyExps.length - 1] || relevantExps[relevantExps.length - 1];
                const summary = lastExp
                  ? `Last: ${lastExp.title} (${curr}${lastExp.amt})`
                  : 'Ongoing balance';

                initial.push({
                  gId: g.id,
                  // A shared 2-person thread's group name ("Damini & Vani") is internal;
                  // it's shown as Non-Group everywhere else too.
                  gName: (g as any).isDirect || String(g.id) === 'STANDALONE' ? 'Non-Group' : g.name,
                  curr: curr,
                  amt: Math.round(absVal * 100) / 100,
                  maxAmt: Math.round(absVal * 100) / 100,
                  paidBy: payer,
                  receivedBy: receiver,
                  iAmPayer,
                  selected: true,
                  // 'settle' = record a real payment; 'writeoff' = forgive it.
                  // Write-off is only offered on lines where I'm OWED (see UI).
                  mode: 'settle',
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
    // Any settle resolves an outstanding "pending UPI payment" prompt.
    clearPendingPay();
    const today = new Date().toISOString().split('T')[0];
    const newSettlements = localSettleEdits
      .filter((it) => it.selected && it.amt > 0)
      .map((it) => {
        const amt = parseFloat(it.amt) || 0;
        if (it.mode === 'writeoff') {
          // Write-off = forgive what they owe me. Recorded like a settlement so
          // the balance closes, but titled "Written off", excluded from Analytics,
          // and given a deterministic id (matches performWriteOff) so two devices /
          // a double-tap converge to one row instead of double-cancelling.
          return {
            id: `writeoff-${String(it.gId)}-${it.paidBy}-${it.receivedBy}-${it.curr}-${today}`,
            gId: it.gId,
            title: 'Written off',
            amt,
            paid: it.paidBy,
            splitters: [it.receivedBy],
            date: today,
            notes: '',
            currency: it.curr,
            category: '',
            mode: 'Equally' as const,
            shares: {},
          };
        }
        return {
          // Deterministic id so two devices (or a double-tap) recording the SAME
          // settlement converge to ONE row (amount is in the key, so two genuinely
          // different same-day payments stay distinct; exact duplicates collapse).
          id: `settle-${String(it.gId)}-${it.paidBy}-${it.receivedBy}-${it.curr}-${Math.round(amt * 100)}-${today}`,
          gId: it.gId,
          title: `✅ Settlement: ${it.paidBy} paid ${it.receivedBy}`,
          amt,
          paid: it.paidBy,
          splitters: [it.receivedBy],
          date: today,
          notes: '',
          currency: it.curr,
          category: '✅',
          mode: 'Equally' as const,
          shares: {},
        };
      });
    // Functional update: never write a stale `expenses` array here — a realtime
    // reload from the other device may have changed it since render, and the
    // spread-of-stale form would drop those changes.
    setExpenses((prev) => [...newSettlements, ...prev]);

    // Notify the other person — but tell the truth: a real settlement reads as
    // "settled up", a write-off reads as "wrote off" (no payment happened).
    if (globalSettleData?.name) {
      const fmt = (rows: typeof newSettlements) => {
        const totals: Record<string, number> = {};
        rows.forEach((s) => { totals[s.currency] = (totals[s.currency] || 0) + s.amt; });
        return Object.entries(totals).map(([c, v]) => `${c}${v.toFixed(0)}`).join(', ');
      };
      const settled = newSettlements.filter((s) => s.category === '✅');
      const wroteOff = newSettlements.filter((s) => s.title === 'Written off');
      if (settled.length > 0) {
        notifyFriend(globalSettleData.name, {
          type: 'payment_request',
          title: `${userName} settled up with you`,
          body: `Recorded a settlement of ${fmt(settled)}`,
          groupId: settled[0].gId,
        });
      }
      if (wroteOff.length > 0) {
        notifyFriend(globalSettleData.name, {
          type: 'payment_request',
          title: `${userName} wrote off a balance`,
          body: `Wrote off ${fmt(wroteOff)} — nothing to pay`,
          groupId: wroteOff[0].gId,
        });
      }
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
      preferences: md.preferences || null,
      updated_at: new Date().toISOString(),
    };
    const t = window.setTimeout(() => {
      supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('Failed to save profile to Supabase:', error);
        });
      // Self-heal: mirror our UPI onto our group_members rows so co-members can
      // read it and autofill when paying us. UpiSection does this on a manual
      // edit, but a UPI that only ever lived in the profile (loaded, never
      // re-typed) never reached the membership rows — so push it here too, once
      // per changed value.
      if (upi && userEmail && lastMemberUpiPushed.current !== upi) {
        lastMemberUpiPushed.current = upi;
        supabase
          .from('group_members')
          .update({ upi_id: upi })
          .eq('user_email', userEmail.toLowerCase())
          .then(({ error }) => {
            if (error) console.error('Failed to propagate UPI to group members:', error);
          });
      }
      // A manually-uploaded photo should also be visible to co-members.
      if (md.profilePhoto && userEmail) saveMyAvatar(userEmail, md.profilePhoto);
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
  // Persist the whole ledger debounced (it is re-serialised on every edit, which
  // is costly for big ledgers), and flush immediately if the page is hidden/closed
  // so a pending write is never lost. Quota errors must not crash the effect.
  useEffect(() => {
    const write = () => { try { localStorage.setItem('divido_groups', JSON.stringify(groups)); } catch { /* quota */ } };
    const t = window.setTimeout(write, 300);
    const onHide = () => { if (document.visibilityState !== 'visible') write(); };
    window.addEventListener('pagehide', write);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pagehide', write);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [groups]);
  useEffect(() => {
    const write = () => { try { localStorage.setItem('divido_expenses', JSON.stringify(expenses)); } catch { /* quota */ } };
    const t = window.setTimeout(write, 300);
    const onHide = () => { if (document.visibilityState !== 'visible') write(); };
    window.addEventListener('pagehide', write);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pagehide', write);
      document.removeEventListener('visibilitychange', onHide);
    };
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
    userMetadata,
    setUserMetadata,
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

  // Record on each expense which member row (member_key) each name refers to.
  // Idempotent: only fills names that have no key yet, so it also backfills
  // older expenses the first time any device opens them. Balances don't read
  // these keys yet.
  useEffect(() => {
    if (!isInitialLoadDone || !groups.some((g) => g.memberKeys)) return;
    const byId = new Map(groups.map((g) => [String(g.id), g]));
    setExpenses((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        const filled = fillPartyKeys(e, byId.get(String(e.gId)));
        if (!filled) return e;
        changed = true;
        return filled;
      });
      return changed ? next : prev;
    });
  }, [isInitialLoadDone, groups, expenses]);

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

  // One-time heal: adopt MY own Google profile name across every group I'm in.
  // People who joined before the "profile name once joined" rule kept the
  // placeholder the inviter typed ("baby", "bhaiya"). Each member's own device
  // knows their real profile name, so here — on their device — we rename their
  // per-group name to it (balance-safe via applyRename), once per session. It's
  // idempotent: once the name matches the profile, it never renames again.
  const profileNameHealDoneRef = useRef(false);
  useEffect(() => {
    if (!isInitialLoadDone || profileNameHealDoneRef.current) return;
    if (!userEmail || groups.length === 0) return;
    profileNameHealDoneRef.current = true;
    (async () => {
      try {
        // Heal toward the ACCOUNT profile name (the one set on the Profile
        // screen, loaded from the profiles table), not the Google name —
        // otherwise every refresh undid a name the user chose. Google's name
        // is only the fallback for an account that never set one.
        let accountName = '';
        try { accountName = (localStorage.getItem('divido_username') || '').trim(); } catch { /* ignore */ }
        if (['You', 'Guest', 'undefined', 'User'].includes(accountName)) accountName = '';
        const { data: { session } } = await supabase.auth.getSession();
        const raw = accountName || (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '').trim();
        const profileName = raw ? titleCaseName(raw) : '';
        if (!profileName) return;
        const myEmail = userEmail.toLowerCase();
        for (const g of groups) {
          if (!g || g.id === 'STANDALONE') continue;
          // My current name in this group: the per-group claimed identity, else
          // the member whose hidden identity resolves to my email.
          let myName = '';
          try { myName = localStorage.getItem(`divido_identity_${g.id}`) || ''; } catch { /* ignore */ }
          if (!myName) {
            const mi = g.memberIdentities || {};
            const match = (g.members || []).find((m) => (mi[m] || '').toLowerCase() === myEmail);
            if (match) myName = match.replace(/\s*\(Left\)$/i, '');
          }
          if (!myName) continue;
          // Same name as a different member → keep the name, add a short email
          // tag (hidden on screen) so stored names stay unique.
          const taken = new Set((g.members || [])
            .map((m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase())
            .filter((n) => n !== myName.toLowerCase()));
          const target = uniqueProfileName(profileName, myEmail, taken);
          if (myName.toLowerCase() === target.toLowerCase()) continue;
          await applyRename(g.id, myName, target);
        }
      } catch (e) {
        console.error('profile-name heal failed:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialLoadDone, groups, userEmail]);

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
      // This effect re-runs on every `groups` change (cloud sync streams them in),
      // so without a lock several async runs overlap and race — the joiner saw
      // "first click fails, second shows an empty group, third works". Serialize:
      // only one resolution runs at a time; later groups updates retry after it.
      if (joinInFlightRef.current || claimInProgressRef.current) return;
      joinInFlightRef.current = true;
      try {
        const urlParams = new URLSearchParams(window.location.search);

        // ---- Multi-group `?invite=` landing --------------------------------
        // Handled entirely here, before the legacy single-group `?joinGroupId=`
        // flow below — the two params are mutually exclusive (see
        // divido_pending_join's shape), and an `invite` link never falls
        // through to the joinGroupId flow.
        const inviteFromUrl = urlParams.get('invite');
        let inviteRaw: string | null = inviteFromUrl;
        if (!inviteRaw) {
          try {
            const savedRaw = localStorage.getItem('divido_pending_join');
            if (savedRaw) {
              const saved = JSON.parse(savedRaw);
              if (saved?.invite && (!saved.ts || Date.now() - saved.ts < 15 * 60 * 1000)) {
                inviteRaw = String(saved.invite);
              } else if (saved?.invite) {
                localStorage.removeItem('divido_pending_join');
              }
            }
          } catch { localStorage.removeItem('divido_pending_join'); }
        }

        if (inviteRaw) {
          const spots = parseInviteParam(inviteRaw);
          const cleanInviteUrl = () => {
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
          };

          if (spots.length === 0) {
            try { localStorage.removeItem('divido_pending_join'); } catch { /* ignore */ }
            cleanInviteUrl();
            setInviteLandingRaw(null);
            return;
          }

          // Persist the intent the moment the link is opened, before any
          // sign-in, so it survives a Google round-trip.
          if (inviteFromUrl) {
            try {
              localStorage.setItem('divido_pending_join', JSON.stringify({ invite: inviteFromUrl, ts: Date.now() }));
            } catch { /* storage full — non-fatal */ }
          }

          const { data: { session } } = await supabase.auth.getSession();
          const myEmail = sessionEmailForInvite(session);

          if (!myEmail) {
            // Signed out: render from whatever's cached locally, no network
            // call. Harmless to rebuild on every `groups` update — there's no
            // per-row user interaction to lose before sign-in.
            const rows: InviteUiRow[] = spots.map((s): InviteUiRow => {
              const g = groups.find((gr) => String(gr.id) === s.groupId);
              return g
                ? {
                    groupId: s.groupId,
                    name: g.name,
                    emoji: g.emoji,
                    memberCount: (g.members || []).filter((m) => !/\(Left\)\s*$/i.test(m)).length,
                    status: 'available',
                  }
                : { groupId: s.groupId, status: 'available' };
            });
            setInviteLandingRaw(inviteRaw);
            setInviteLandingMode('signedOut');
            setInviteLandingSpots(spots);
            setInviteLandingRows(rows);
            return;
          }

          setInviteSessionReady(true);

          // Signed in: only (re)fetch/rebuild once per invite — this effect
          // re-runs on every `groups` update, and redoing the fetch would wipe
          // the user's checkbox selection and un-dismiss the card.
          if (inviteLandingRaw === inviteRaw && inviteLandingMode === 'signedIn') return;

          const ids = Array.from(new Set(spots.map((s) => s.groupId)));
          const [{ data: groupRows }, { data: memberRows }] = await Promise.all([
            supabase.from('groups').select('*').in('id', ids),
            supabase.from('group_members').select('*').in('group_id', ids),
          ]);
          const entries = buildInviteLandingModel(spots, groupRows || [], memberRows || [], myEmail);

          // Nothing left to join (everything is already mine, taken or gone):
          // skip the card. If exactly one group is already mine, open it — same
          // landing as the old single-group link — otherwise stay on home.
          if (!entries.some((e) => e.status === 'joinable')) {
            try { localStorage.removeItem('divido_pending_join'); } catch { /* ignore */ }
            cleanInviteUrl();
            setInviteLandingRaw(null);
            const mine = entries.filter((e) => e.status === 'alreadyMine');
            if (mine.length === 1) {
              const row = (groupRows || []).find((g) => String(g.id) === mine[0].groupId);
              setSelectedId(row?.is_direct ? 'STANDALONE' : mine[0].groupId);
              setView('detail');
              setShowFriendsList(false);
            }
            return;
          }

          // Groups I'm already in are left off the card — they're clutter, not
          // a choice.
          const uiRows: InviteUiRow[] = entries
            .filter((e) => e.status === 'joinable' || e.status === 'takenByOther')
            .map((e): InviteUiRow => ({
              groupId: e.groupId,
              name: e.groupName,
              emoji: e.emoji,
              memberCount: e.activeMemberCount,
              status: e.status === 'joinable' ? 'available' : e.status === 'alreadyMine' ? 'alreadyMineOpen' : 'takenByOther',
            }));

          setInviteLandingRaw(inviteRaw);
          setInviteLandingMode('signedIn');
          setInviteLandingSpots(spots);
          setInviteLandingEntries(entries);
          setInviteLandingGroupRows(groupRows || []);
          setInviteLandingMemberRows(memberRows || []);
          setInviteLandingRows(uiRows);
          setInviteLandingSelectedIds(defaultSelectedGroupIds(entries));
          setInviteLandingRowErrors({});
          return;
        }

        let joinGroupId = urlParams.get('joinGroupId');
        const fromUrl = !!joinGroupId;
        // A freshly tapped link is a new intent: clear the "just claimed" guard
        // (left set, join -> leave -> tap again showed nothing).
        if (fromUrl && lastClaimedGroupRef.current === String(joinGroupId)) lastClaimedGroupRef.current = null;

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
            // Keep a name picked before the Google redirect (the redirect URL
            // carries ?joinGroupId back, so this runs again on return).
            const prevSaved = JSON.parse(localStorage.getItem('divido_pending_join') || 'null');
            const keepName = prevSaved && String(prevSaved.groupId) === String(joinGroupId) ? prevSaved.placeholderName : undefined;
            localStorage.setItem('divido_pending_join', JSON.stringify({ groupId: joinGroupId, ts: Date.now(), ...(keepName ? { placeholderName: keepName } : {}) }));
          } catch { /* storage full — non-fatal */ }
        }

        // Signed out: the database lets only signed-in users read groups, so a
        // lookup now comes back empty and would be mistaken for "group deleted"
        // — wiping the saved intent and the ?joinGroupId= URL that the Google
        // sign-in redirect is built from (the friend then lands with no join
        // card on their first click). Keep both and resolve after sign-in; this
        // effect re-runs when auth changes.
        // Meanwhile show the same "You're invited" card the multi-group link
        // uses (from whatever is cached), so the friend sees what they're
        // joining instead of a bare Login screen.
        const { data: { session } } = await supabase.auth.getSession();
        if (!sessionEmailForInvite(session)) {
          const cached = groups.find((gr) => String(gr.id) === String(joinGroupId));
          setInviteLandingRaw(`joinGroupId:${joinGroupId}`);
          setInviteLandingMode('signedOut');
          setInviteLandingSpots([{ groupId: String(joinGroupId), memberKey: '' }]);
          setInviteLandingRows([cached
            ? {
                groupId: String(joinGroupId),
                name: cached.name,
                emoji: cached.emoji,
                memberCount: (cached.members || []).filter((m) => !/\(Left\)\s*$/i.test(m)).length,
                status: 'available',
              }
            : { groupId: String(joinGroupId), status: 'available' }]);
          return;
        }
        setInviteSessionReady(true);
        // Signed in now: the signed-out preview card has done its job.
        setInviteLandingRaw((prev) => (prev && prev.startsWith('joinGroupId:') ? null : prev));

        // Fetch the group and its members together (one round-trip, not two).
        const [{ data: groupData, error: groupErr }, { data: existingMembers }] = await Promise.all([
          supabase.from('groups').select('*').eq('id', joinGroupId).single(),
          supabase.from('group_members').select('*').eq('group_id', joinGroupId),
        ]);

        if (groupErr || !groupData) {
          // The thread genuinely isn't in the cloud — stop retrying this invite on
          // every app open, clean the URL, and fall through to the normal app.
          try { localStorage.removeItem('divido_pending_join'); } catch { /* ignore */ }
          try {
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
          } catch { /* ignore */ }
          return;
        }

        if (!existingMembers) return;
        // Spots found already claimed by someone else during this run.
        const takenSpotIds = new Set<unknown>();
        let autoConfirmTarget: any = null;

        const rejoinName = urlParams.get('rejoinName');
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
          // Match the old row by EITHER email field: some leave paths move the
          // address from user_email to invite_email, and missing it sent a
          // returning member to the placeholder list instead of "Rejoin".
          const myEm = String(myEmail).toLowerCase();
          const leftMemberRow = existingMembers.find((m: any) =>
            m.name.toLowerCase().endsWith(' (left)') && !m.is_removed &&
            (String(m.user_email || '').toLowerCase() === myEm || String(m.invite_email || '').toLowerCase() === myEm)
          );
          if (leftMemberRow) {
            const cleanName = leftMemberRow.name.replace(/\s*\(Left\)$/i, '');
            // Removed by the admin (not a voluntary leave): no rejoin via link.
            let wasRemoved = false;
            try {
              const { data: logs } = await supabase
                .from('expenses')
                .select('title, created_at')
                .eq('group_id', joinGroupId)
                .eq('paid', 'SYSTEM');
              let removedAt = -1; let rejoinedAt = -1;
              const n = cleanName.toLowerCase();
              for (const l of logs || []) {
                const t = String(l.title || '').toLowerCase();
                const ts = Date.parse(String(l.created_at || '')) || 0;
                if (t === n + ' was removed') removedAt = Math.max(removedAt, ts);
                if (t.startsWith(n + ' rejoined')) rejoinedAt = Math.max(rejoinedAt, ts);
              }
              wasRemoved = removedAt >= 0 && removedAt > rejoinedAt;
            } catch { /* can't tell: fall through to the confirm card */ }
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
            if (wasRemoved) {
              localStorage.removeItem('divido_pending_join');
              setToastMsg('You were removed from ' + (groupData.name || 'this group') + ' by the admin. Ask them to add you back.');
              setTimeout(() => setToastMsg(null), 4000);
              return;
            }
            // Left by choice: ask first ("Rejoin as ..." card), then straight in.
            setLinkRequestRejoinMode(true);
            setLinkRequestGroup(groupData);
            setLinkRequestPlaceholders([leftMemberRow]);
            return;
          }

          // If they are already an active member, direct them straight in
          const alreadyMember = existingMembers.some((m: any) => m.user_email === myEmail);
          if (alreadyMember) {
            localStorage.removeItem('divido_pending_join');
            // A shared (isDirect) thread presents under Non-Group, not as a raw
            // group page — land the joiner on the Non-Group screen so they don't
            // see the internal group-detail UI and have to swipe back.
            setSelectedId(groupData.is_direct ? 'STANDALONE' : joinGroupId);
            setView('detail');
            setShowFriendsList(false);
            // Clean URL parameters
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            // Seed a HOME base entry (not an empty one) so a back-swipe from the
            // group you just entered/claimed goes to the home screen instead of
            // exiting the app. The detail entry is pushed on top by the history sync.
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
            return;
          }

          // Auto-claim: if a pending spot was added with THIS person's exact
          // email (invite_email), they are unambiguously that member — claim it
          // silently and go straight in. No "pick your name" card. This is the
          // email-identity magic.
          const normEmail = (s: string) => (s || '').trim().toLowerCase().replace(/[\s.]+$/, '');
          const myEmailNorm = normEmail(myEmail);
          let inviteMatch = existingMembers.find((m: any) =>
            m.invite_email && normEmail(String(m.invite_email)) === myEmailNorm &&
            !m.user_email && m.is_pending && !m.name.toLowerCase().endsWith(' (left)')
          );
          // Private 1:1 share link: no email was set on the invite, but a direct
          // thread has exactly ONE open spot — whoever opens the link claims it
          // (the link itself is the access). So no email entry needed to invite.
          if (!inviteMatch && groupData.is_direct) {
            const openSpots = existingMembers.filter((m: any) => m.is_pending && !m.user_email && !m.name.toLowerCase().endsWith(' (left)'));
            if (openSpots.length === 1) inviteMatch = openSpots[0];
          }
          // Exact-email match or a 1:1 link's single open spot: still ask first
          // with a one-tap "Join" card (with "Not me"), then go straight in.
          if (inviteMatch) autoConfirmTarget = inviteMatch;
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
            // A shared (isDirect) thread presents under Non-Group, not as a raw
            // group page — land the joiner on the Non-Group screen so they don't
            // see the internal group-detail UI and have to swipe back.
            setSelectedId(groupData.is_direct ? 'STANDALONE' : joinGroupId);
            setView('detail');
            const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            // Seed a HOME base entry (not an empty one) so a back-swipe from the
            // group you just entered/claimed goes to the home screen instead of
            // exiting the app. The detail entry is pushed on top by the history sync.
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
            return;
          }
        }

        // Show selection list of unlinked pending members (placeholders)
        const placeholders = existingMembers.filter((m: any) => m.is_pending && !m.user_email && !m.link_request_email && !takenSpotIds.has(m.id));
        // Prefill the "join as new member" name with the Google profile name, so
        // a signed-in invitee doesn't have to type it (they can still edit it).
        const rawGoogleName = (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '').trim();
        // Google names often arrive ALL CAPS ("VANDANA GUPTA"); normalize to
        // Title Case so they don't look shouty next to normally-cased names.
        const googleName = rawGoogleName.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
        // A claim finished (or started) while this run was awaiting — don't
        // pop the name list back up over the group they were just taken into.
        if (claimInProgressRef.current || lastClaimedGroupRef.current === String(joinGroupId)) return;
        if (googleName) setJoinNewName(googleName);
        setLinkRequestRejoinMode(false);
        setLinkRequestGroup(groupData);
        setLinkRequestPlaceholders(placeholders);
        if (autoConfirmTarget && placeholders.some((m: any) => m.id === autoConfirmTarget.id)) {
          setClaimConfirmTarget(autoConfirmTarget);
          setClaimConfirmAuto(!!autoConfirmTarget.invite_email);
        }
        // Returning from the Google sign-in the claim triggered: they already
        // picked a name before signing in, so reopen straight on that name's
        // confirm step (now showing their real Gmail) instead of the list.
        try {
          const saved = JSON.parse(localStorage.getItem('divido_pending_join') || 'null');
          const resumed = myEmail && saved?.placeholderName
            ? placeholders.find((m: any) => m.name === saved.placeholderName)
            : null;
          if (resumed) setClaimConfirmTarget(resumed);
        } catch { /* malformed saved intent — just show the list */ }
      } catch (err) {
        console.error('Landing error:', err);
      } finally {
        // Resolution finished (claim card shown, admitted, or nothing to do) —
        // drop the loading gate so the app renders its normal view, and release
        // the lock so a later groups update can retry if this run bailed early.
        joinInFlightRef.current = false;
        setIsResolvingInvite(false);
      }
    };

    joinGroupFromQuery();
    // Re-run on sign-in too, not only on `groups` changes: a brand-new invitee
    // may have no groups yet, so nothing else would retry the join after the
    // Google round-trip.
  }, [groups, isAuthenticated, userEmail]);

  // Safety net: never trap a friend on the invite loader if the round-trip
  // stalls (slow network, an early return). Fall through after a few seconds.
  useEffect(() => {
    if (!isResolvingInvite) return;
    const t = setTimeout(() => setIsResolvingInvite(false), 5000);
    return () => clearTimeout(t);
  }, [isResolvingInvite]);

  // Splitwise OAuth web callback landing. The native in-app-browser bounce case
  // is handled earlier (before this component's hooks even run its render body)
  // by the early-return check near the top of the render — by the time this
  // effect could run on native, the page has already been replaced. This only
  // ever resolves the WEB flow: verify the CSRF state, then hand the code (or
  // error) to the import sheet.
  useEffect(() => {
    if (window.location.pathname !== '/splitwise-callback') return;
    const cb = parseCallback(window.location.href);
    if (isNativeBounce(cb.state)) return; // native bounce already redirected away
    const check = consumeOAuthState(cb.state);
    if (cb.error) {
      setSwOauthError('denied');
    } else if (check.ok) {
      setSwOauthCode(cb.code);
    } else {
      setSwOauthError(check.reason);
    }
    setShowSplitwiseImport(true);
    window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', '/');
  }, []);

  // Splitwise OAuth native callback: Splitwise's in-app-browser bounces to our
  // custom URL scheme, which @capacitor/app's `appUrlOpen` delivers here.
  useEffect(() => {
    const unsubscribe = subscribeNativeCallback((cb) => {
      const check = consumeOAuthState(cb.state);
      if (cb.error) {
        setSwOauthError('denied');
      } else if (check.ok) {
        setSwOauthCode(cb.code);
      } else {
        setSwOauthError(check.reason);
      }
      setShowSplitwiseImport(true);
    });
    return unsubscribe;
  }, []);

  // Write off a past member's outstanding balance: record settlement-style
  // entries that cancel every pairwise amount they still have to pay/collect, so
  // their balance closes to zero (recorded as "written off", not silently
  // deleted). Reuses the app's pairwise math so the group's books stay balanced.
  const performWriteOff = (groupId: string | number, memberRow: string) => {
    const g = groups.find((x) => String(x.id) === String(groupId));
    if (!g) return;
    
    const targetKey = getPersonKey(g, memberRow);
    const groupExps = expenses.filter((e) => String(e.gId) === String(groupId) && !e.isDeleted);
    
    // Map expenses to identity-space so the math natively collapses duplicate names for the same person
    const { memberKeys, expenses: rekeyedExps, keyToName } = toIdentitySpace(g, groupExps);
    const txs = computeRawPairwiseTransactions(memberKeys, rekeyedExps, g.currency || '₹');
    
    const today = new Date().toISOString().split('T')[0];
    const writeOffs: any[] = [];
    txs.forEach((t: any) => {
      if (t.from !== targetKey && t.to !== targetKey) return;
      Object.entries(t.balances as Record<string, number>).forEach(([curr, val]) => {
        const absVal = Math.abs(val);
        if (absVal <= 0.01) return;
        
        const payerKey = val > 0 ? t.from : t.to;
        const receiverKey = val > 0 ? t.to : t.from;
        
        // Map back to canonical display names for the expense record
        const payerName = keyToName[payerKey] ?? payerKey;
        const receiverName = keyToName[receiverKey] ?? receiverKey;

        writeOffs.push({
          // Deterministic id so two devices (or a double-tap) writing off the
          // SAME person/currency on the same day converge to ONE row instead of
          // creating duplicate cancelling entries that double-reverse the balance.
          id: `writeoff-${String(groupId)}-${payerKey}-${receiverKey}-${curr}-${today}`,
          timestamp: Date.now(),
          gId: groupId,
          title: 'Written off',
          amt: Math.round(absVal * 100) / 100,
          paid: payerName,
          splitters: [receiverName],
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
    // Hard safety net: the Non-Group bucket is not a real group and must never be
    // "left"/"deleted" — doing so wiped every non-group expense. Never proceed.
    if (String(id) === 'STANDALONE') return;
    const isStandalone = String(id) === 'STANDALONE';
    const g = isStandalone
      ? { name: 'Non-Group', members: [] as string[] }
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
      if (parts.length) leaveBalLine = ` You still have ${parts.join(', ')} here.`;
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
                await logGroupEvent(id, `${me.replace(/\s*\(me\)$/i, '')} left`);
                // 1. Rename membership row to preserve history, keep email, set is_pending = true
                await supabase
                  .from('group_members')
                  .update({
                    name: me + ' (Left)',
                    is_pending: true
                  })
                  .eq('group_id', id)
                  .eq('name', me);

                // Tell every other joined member (by email — the old exact-name
                // lookup of just the admin usually matched nobody).
                const activeMembers = (g.members || []).filter((m) => !m.endsWith(' (Left)'));
                try {
                  const myEm = (userEmail || '').toLowerCase();
                  const { data: others } = await supabase
                    .from('group_members')
                    .select('user_email, name')
                    .eq('group_id', id)
                    .not('user_email', 'is', null);
                  for (const o of others || []) {
                    const em = String(o.user_email || '').toLowerCase();
                    if (!em || em === myEm || /\(Left\)\s*$/i.test(String(o.name || ''))) continue;
                    await pushNotification({
                      recipientEmail: o.user_email,
                      type: 'admin_transfer',
                      title: `${me.replace(/\s*\(me\)$/i, '')} left ${g.name}`,
                      fromName: me,
                      groupId: id,
                    });
                  }
                } catch (notifyErr) {
                  console.error('Leave notification failed:', notifyErr);
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
            // Zero-to-remove: you can't just walk away from a live balance. The
            // only two ways out are to Settle up (record the payment) or Write
            // off (forgive/cancel the balance) — both leave the group's ledger at
            // zero for you, so no phantom debt is stranded. There is deliberately
            // no plain "Leave anyway" here.
            title: `Leave "${g.name}"?`,
            desc: leaveBalLine.trim(),
            primaryLabel: 'Settle up →',
            primaryColor: '#10B981',
            onPrimary: () => {
              setBalanceCard(null);
              setShowFriendsList(false);
              setSelectedId(id);
              setView('detail');
              setGroupDetailTab('balances');
            },
            secondaryLabel: 'Write off & leave',
            onSecondary: () => { performWriteOff(id, me); performLeaveDelete(); },
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
        'Non-Group is a permanent category and cannot be renamed, but you can clear its history using the delete icon! ⚡'
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

  const [allGroupBalances, setAllGroupBalances] = React.useState<Record<string, Record<string, Record<string, number>>>>({});
  const [isCalculatingBalances, setIsCalculatingBalances] = React.useState(false);

  React.useEffect(() => {
    // Pre-group expenses by their gId to avoid filtering inside inner loops
    const expensesByGroup: Record<string, Expense[]> = {};
    expenses.forEach((e) => {
      if (!e || e.isDeleted) return;
      const gId = String(e.gId);
      if (!expensesByGroup[gId]) expensesByGroup[gId] = [];
      expensesByGroup[gId].push(e);
    });

    // Per-group net balances in identity space (names resolved through each
    // expense's recorded member_key, then the roster), keyed by person key.
    const batchData = groups.map(g => {
      const { memberKeys, expenses: keyed } = toIdentitySpace(g, expensesByGroup[String(g.id)] || []);
      return {
        members: memberKeys,
        expenses: keyed,
        defaultCurrency: g.currency || '₹',
        gId: String(g.id)
      };
    });

    // Add standalone
    batchData.push({
      members: [],
      expenses: expensesByGroup['STANDALONE'] || [],
      defaultCurrency: '₹',
      gId: 'STANDALONE'
    });

    setIsCalculatingBalances(true);
    asyncBatchNetBalances(batchData).then((map) => {
      setAllGroupBalances(map);
      setIsCalculatingBalances(false);
    }).catch(err => {
      console.error('Failed to compute balances in worker', err);
      setIsCalculatingBalances(false);
    });
  }, [groups, expenses]);

  const getMemberBalance = React.useCallback((groupId: string | number | null, memberName: string) => {
    const gId = String(groupId || 'STANDALONE');
    const groupBals = allGroupBalances[gId];
    if (!groupBals) return {};

    // Standalone has no per-group roster/identities — keep the plain name lookup.
    const g = gId === 'STANDALONE' ? null : groups.find((x) => String(x.id) === gId);
    if (!g) return groupBals[memberName] || {};

    // Balances are computed per person KEY (see batchData above), so every
    // display name of one person ("Ram", "Ram (Left)", a pre-rename name) is
    // already one bucket. Resolve the requested name to its key and read it.
    return groupBals[getPersonKey(g, memberName)] || groupBals[memberName] || {};
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

  const commitAddMembers = (groupId: string | number, names: string[], emails?: Record<string, string>, identities?: Record<string, string>) => {
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
      // If an email was supplied for a new member, record it as their identity
      // right away — the sync insert reads it back as invite_email, and it drives
      // display + suggestion dedup + auto-claim on join.
      const newIdentities = { ...(x.memberIdentities || {}) };
      toAdd.forEach((n) => {
        const em = emails?.[n];
        const id = identities?.[n];
        // Prefer an email identity; otherwise reuse the person's existing hidden
        // id (from a "Recently split with" pick) so the same name-only friend is
        // ONE person across groups instead of a fresh duplicate each time.
        if (em && em.includes('@')) newIdentities[n] = em.trim().toLowerCase();
        else if (id) newIdentities[n] = id;
      });
      return { ...x, members: newMembers, pendingMembers: newPending, memberIdentities: newIdentities };
    }));
    setNewlyAddedFriends(toAdd);
  };

  const resolvePersonChoice = (identity: string | null) => {
    if (!samePersonPrompt) return;
    const { groupId, queue, index, addNames, addEmails, addIdentities } = samePersonPrompt;
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
      if (addNames && addNames.length > 0) commitAddMembers(groupId, addNames, addEmails, addIdentities);
    } else {
      setSamePersonPrompt({ ...samePersonPrompt, index: nextIndex });
    }
  };

  const selectedGroup = selectedId === 'STANDALONE'
    ? {
        id: 'STANDALONE',
        name: 'Non-Group',
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

  // Opens the Splitwise import sheet fresh: sign-in gated like group creation,
  // and always starts a new connect attempt (clearing any OAuth result left
  // over from a previous open).
  const onImportSplitwise = () => {
    if (!requireSignInToCreate()) return;
    setSwOauthCode(null);
    setSwOauthError(null);
    setShowSplitwiseImport(true);
  };

  // Merges one Splitwise import batch (a "friends" row and/or one or more
  // group rows) into local state. Persistence then flows through the normal
  // useSupabaseSync path: new groups carry pendingSync: true (see
  // mapSplitwiseImport), which is what makes it insert them to the cloud; new
  // STANDALONE expenses are picked up by the non-group cloud-backup effect.
  const handleSplitwiseCommit = ({ groups: importedGroups, expenses: importedExpenses }: { groups: Group[]; expenses: Expense[] }) => {
    lastSplitwiseImportExpensesRef.current = importedExpenses;

    setGroups((prev) => {
      const merged = prev.map((g) => {
        const incoming = importedGroups.find((ig) => String(ig.id) === String(g.id));
        if (!incoming) return g;
        // A merge/re-import target: keep the existing group's identity (name,
        // currency, memberIdentities, …) and just add any roster members from
        // Splitwise it doesn't already have.
        const existingMembers = g.members || [];
        const missingMembers = (incoming.members || []).filter(
          (m) => !existingMembers.some((em) => em.toLowerCase() === m.toLowerCase())
        );
        if (missingMembers.length === 0) return g;
        return {
          ...g,
          members: [...existingMembers, ...missingMembers],
          pendingMembers: [...(g.pendingMembers || []), ...missingMembers],
        };
      });
      const newGroups = importedGroups.filter((ig) => !prev.some((g) => String(g.id) === String(ig.id)));
      return [...merged, ...newGroups];
    });

    setExpenses((prev) => {
      const incomingIds = new Set(importedExpenses.map((e) => String(e.id)));
      const replaced = prev.map((e) => {
        if (!incomingIds.has(String(e.id))) return e;
        return importedExpenses.find((ie) => String(ie.id) === String(e.id))!;
      });
      const newExpenses = importedExpenses.filter((ie) => !prev.some((e) => String(e.id) === String(ie.id)));
      return [...newExpenses, ...replaced];
    });

    setToastMsg(`Imported ${importedExpenses.length} expense${importedExpenses.length === 1 ? '' : 's'} from Splitwise`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Tapping a "needs review" row in the import summary: jump straight to that
  // expense's group (or Non-Group Expenses) and open it in the editor, the
  // same navigation sequence as the quick-add '+' (MasterSummary.tsx:1083-1091).
  const handleSplitwiseReviewTap = (expenseId: string, gId: string | number) => {
    const exp =
      lastSplitwiseImportExpensesRef.current.find((e) => String(e.id) === String(expenseId)) ||
      expenses.find((e) => String(e.id) === String(expenseId));
    if (!exp) return;
    setSelectedId(gId);
    setView('detail');
    setEditingExpenseSecure(exp);
    setShowExpModalSecure(true);
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
    // An open sub-screen (a Non-Group person) can take over, so the new
    // expense is prefilled with that friend instead of starting empty.
    if (!scan && !window.dispatchEvent(new Event('divido:add-expense', { cancelable: true }))) return;
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
  const quickAddExpenseWithFriend = (friendName: string, directGroupId?: string) => {
    if (!requireSignInToCreate()) return;
    const clean = friendName.replace(/\s*\(Left\)$/i, '').trim();
    if (!clean) return;
    setAutoOpenScanner(false);
    // If this person has a shared "direct" thread, add the expense INTO that group
    // so it syncs to them (a STANDALONE one would stay private and never reach the
    // other side). Use that group's roster name for the other member.
    const dg = directGroupId ? groups.find((g) => String(g.id) === String(directGroupId)) : undefined;
    const cln = (n: string) => n.replace(/\s*\(Left\)$/i, '').trim();
    if (dg) {
      // Enter the shared group's context so `me` resolves to my per-group name
      // (via divido_identity_<gid>) and the payer defaults correctly — the exact
      // path a normal group expense uses. Splitters = both roster members.
      let myInGroup = me;
      try { myInGroup = localStorage.getItem(`divido_identity_${dg.id}`) || me; } catch { /* ignore */ }
      const myEmailLower = (userEmail || '').trim().toLowerCase();
      const byEmail = (dg.members || []).find((m) => (dg.memberIdentities?.[m] || '').toLowerCase() === myEmailLower);
      if (byEmail) myInGroup = cln(byEmail);
      // Guard against the flat first name leaking in as the payer: if `myInGroup`
      // isn't actually a roster member (e.g. "Damini" vs the roster's "Damini
      // Gupta"), map it to the matching roster name — by email, else by exact
      // name, else by first-name token. A mismatched payer orphans the expense
      // (it never matches the person's identity, so it drops out of balances).
      const rosterHas = (nm: string) => (dg.members || []).some((m) => cln(m).toLowerCase() === nm.toLowerCase());
      if (!rosterHas(myInGroup)) {
        const meFirst = (me || '').trim().toLowerCase().split(' ')[0];
        const match =
          (dg.members || []).find((m) => (dg.memberIdentities?.[m] || '').toLowerCase() === myEmailLower) ||
          (dg.members || []).find((m) => cln(m).toLowerCase() === (me || '').trim().toLowerCase()) ||
          (dg.members || []).find((m) => cln(m).toLowerCase().split(' ')[0] === meFirst);
        if (match) myInGroup = cln(match);
      }
      setSelectedId(dg.id);
      setView('detail');
      setEditingExpenseSecure({
        id: 'temp-' + Date.now(),
        gId: dg.id,
        title: '',
        amt: 0,
        date: new Date().toISOString().split('T')[0],
        splitters: (dg.members || []).map(cln),
        paid: myInGroup,
      } as any);
      setShowExpModalSecure(true);
      return;
    }
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

  const handleCreateGroup = (groupData: { name: string; currency: string; members: string[]; emoji: string; createdDate?: string; memberEmails?: Record<string, string>; memberIdentities?: Record<string, string> }) => {
    const id = genGroupId();
    // Emails supplied for members at creation become their identity (invite_email
    // on insert), so they auto-claim when they sign in with that address.
    const memberIdentities: Record<string, string> = { ...(groupData.memberIdentities || {}) };
    Object.entries(groupData.memberEmails || {}).forEach(([n, em]) => {
      if (em && em.includes('@')) memberIdentities[n] = em.trim().toLowerCase();
    });
    // Everyone added at creation except me is a not-yet-claimed invitee, so they
    // must start as pending. The member list buckets Joined vs Pending purely on
    // this array — omitting it made fresh invitees (e.g. Ram) show as Joined
    // immediately, before they ever claimed their name via the join link.
    const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    // Row 0 is always the creator (CreateGroupView seeds it with `me`, and the
    // server insert in useSupabaseSync treats idx 0 as me too) — match that, and
    // compare suffix-stripped names, so the creator never lands in Pending.
    const cleanName = (n: string) => n.replace(/\s*\((me|you|left)\)$/i, '').trim().toLowerCase();
    const pendingMembers = groupData.members.filter((m, idx) => idx !== 0 && cleanName(m) !== meClean);
    const newGroup = {
      id,
      name: groupData.name,
      currency: groupData.currency,
      members: groupData.members,
      emoji: groupData.emoji,
      simplifyDebts: false,
      createdDate: groupData.createdDate || new Date().toISOString().split('T')[0],
      pendingMembers,
      memberIdentities,
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
      // Skip the "same person?" prompt for members added WITH an email — the
      // email (in memberIdentities) already settles identity via auto-merge.
      .filter((x) => x.candidates.length > 0 && !memberIdentities[x.name]);
    if (clashing.length > 0) {
      setSamePersonPrompt({ groupId: id, queue: clashing, index: 0, addNames: [] });
    }
  };

  // Promote a private, local Non-Group ("STANDALONE") expense into a hidden
  // 2-person "direct" group so it can be shared/invited/edited — reusing all the
  // normal group machinery, but presented under Non-Group Expenses (isDirect).
  // Returns the new group id (for building the invite link), or null.
  const promoteNonGroupExpense = (expenseId: string | number, otherName: string, otherEmail?: string): string | null => {
    const exp = expenses.find((e) => String(e.id) === String(expenseId));
    if (!exp || String(exp.gId) !== 'STANDALONE') return null;
    const other = (otherName || (exp.splitters || []).find((s) => s !== me) || '').trim();
    if (!other) return null;
    const gid = genGroupId();
    const email = (otherEmail || '').trim().toLowerCase();
    const memberIdentities: Record<string, string> = {};
    if (email.includes('@')) memberIdentities[other] = email;
    const newGroup = {
      id: gid,
      name: `${me} & ${other}`, // internal label only — never shown as a group
      currency: exp.currency || myDefaultCurrency || '₹',
      members: [me, other],
      simplifyDebts: false,
      createdDate: new Date().toISOString().split('T')[0],
      pendingMembers: [other], // the other person is pending until they open the link
      memberIdentities,
      isDirect: true,
      pendingSync: true,
    } as Group;
    setGroups((prev) => [...prev, newGroup]);
    setExpenses((prev) => prev.map((e) => (String(e.id) === String(expenseId) ? { ...e, gId: gid } : e)));
    return gid;
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

  // Splitwise OAuth native bounce: on native, the https callback page is only
  // ever loaded briefly inside the in-app browser (Splitwise doesn't support
  // custom-scheme redirect URIs), so it must hand off to our custom URL scheme
  // immediately — before any of the app's normal screens, sign-in gates, or
  // data loading render. Placed after all hooks above (so hook order stays
  // valid across renders) but before every other conditional return.
  if (window.location.pathname === '/splitwise-callback') {
    const swCallback = parseCallback(window.location.href);
    if (isNativeBounce(swCallback.state)) {
      let bounceUrl = buildNativeBounceUrl(swCallback.code || '', swCallback.state!);
      if (swCallback.error) bounceUrl += `&error=${encodeURIComponent(swCallback.error)}`;
      window.location.replace(bounceUrl);
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
          <div style={{ fontSize: '14px', fontWeight: 700, opacity: 0.7 }}>Returning to Divido…</div>
          <a
            href={bounceUrl}
            style={{
              marginTop: '4px', padding: '12px 22px', borderRadius: '14px',
              background: '#F97316', color: '#FFFFFF', fontSize: '14px', fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open Divido
          </a>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
  }

  // ---- Multi-group `?invite=` landing: shared handlers ---------------------
  // Redirect target for a Google OAuth round-trip: preserves whichever invite
  // context is on the current URL so joinGroupFromQuery can pick the flow back
  // up after sign-in. `invite` (multi-group) and `joinGroupId` (legacy
  // single-group) are mutually exclusive; `invite` wins if somehow both are
  // present.
  const buildOAuthRedirectUrl = () => {
    const params = new URL(window.location.href).searchParams;
    const invite = params.get('invite');
    const join = params.get('joinGroupId');
    const suffix = invite ? `?invite=${encodeURIComponent(invite)}` : join ? `?joinGroupId=${join}` : '';
    return window.location.origin + window.location.pathname + suffix;
  };

  // InviteLandingCard's "Continue with Google" (signed-out mode): same OAuth
  // call as Login.tsx, but the redirect carries `?invite=` so the resolver
  // resumes the invite on return. localStorage's divido_pending_join (set the
  // moment the invite link was opened, see joinGroupFromQuery) remains the
  // authoritative carrier of the intent — this redirect param is a same-tab
  // fast path only.
  const inviteSignIn = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildOAuthRedirectUrl(),
          queryParams: { prompt: 'select_account' },
        },
      });
    } catch (err) {
      console.error('Invite sign-in failed:', err);
    }
  };

  // Clears the invite intent (so it never resurfaces), cleans the URL, and
  // hides the card. Used by onDismiss and after a successful join.
  const dismissInviteLanding = () => {
    try { localStorage.removeItem('divido_pending_join'); } catch { /* ignore */ }
    try {
      const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
      window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
    } catch { /* ignore */ }
    setInviteLandingRaw(null);
    setInviteLandingRows([]);
    setInviteLandingEntries([]);
    setInviteLandingGroupRows([]);
    setInviteLandingMemberRows([]);
    setInviteLandingSelectedIds([]);
    setInviteLandingRowErrors({});
    setInviteLandingJoiningId(null);
  };

  const toggleInviteGroup = (groupId: string) => {
    setInviteLandingSelectedIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  // Tapping an "already yours" row: dismiss the card and open that group,
  // same Non-Group-vs-raw-group-page rule used everywhere else in this file.
  const openInviteGroup = (groupId: string) => {
    const groupRow = inviteLandingGroupRows.find((g) => String(g.id) === groupId);
    dismissInviteLanding();
    setSelectedId(groupRow?.is_direct ? 'STANDALONE' : groupId);
    setView('detail');
    setShowFriendsList(false);
  };

  // Signed-in "Join N groups": claims each selected joinable spot sequentially
  // (keeps `joiningGroupId` meaningful for the per-row spinner; claimInviteSpot's
  // RLS-ordering contract is per-group so this is also the safest order).
  const joinSelectedInviteGroups = async () => {
    const joinableIds = new Set(inviteLandingEntries.filter((e) => e.status === 'joinable').map((e) => e.groupId));
    const toJoin = inviteLandingSelectedIds.filter((id) => joinableIds.has(id));
    if (toJoin.length === 0) return;

    setInviteLandingBusy(true);
    setInviteLandingRowErrors({});

    const { data: { session } } = await supabase.auth.getSession();
    const myEmail = session?.user?.email || userEmail;
    const rawProfile = (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '').trim();
    const profileName = rawProfile ? titleCaseName(rawProfile) : '';
    const fallbackUsername = localStorage.getItem('divido_username') || undefined;

    const succeeded: { groupId: string; group: Group }[] = [];
    // Only real errors are retryable; a spot someone else took is final.
    const nextRowErrors: Record<string, string> = {};
    const takenIds = new Set<string>();

    for (const groupId of toJoin) {
      const entry = inviteLandingEntries.find((e) => e.groupId === groupId);
      const groupRow = inviteLandingGroupRows.find((g) => String(g.id) === groupId);
      if (!entry?.targetRow || !groupRow) {
        nextRowErrors[groupId] = "Couldn't join — try again";
        continue;
      }
      setInviteLandingJoiningId(groupId);
      const existingMembers = inviteLandingMemberRows.filter((m) => String(m.group_id) === groupId);
      const result = await claimInviteSpot(inviteSupabase, {
        groupRow,
        targetRow: entry.targetRow,
        existingMembers,
        myEmail,
        profileName,
        fallbackUsername,
      });
      if (result.status === 'joined') {
        localStorage.setItem(`divido_identity_${groupId}`, result.claimedName);
        const existingUsername = localStorage.getItem('divido_username');
        const hasRealName = !!existingUsername && !['You', 'Guest', 'undefined', ''].includes(existingUsername.trim());
        if (!hasRealName) { localStorage.setItem('divido_username', result.claimedName); setUserName(result.claimedName); }
        localStorage.setItem('divido_authenticated', 'true');
        setIsAuthenticated(true);
        succeeded.push({ groupId, group: result.group });
        logGroupEvent(groupId, `${result.claimedName} joined`);
      } else if (result.status === 'takenByOther') {
        takenIds.add(groupId);
      } else if (result.status === 'error') {
        console.error('Invite claim failed:', result.message);
        nextRowErrors[groupId] = "Couldn't join — try again";
      }
      // 'alreadyMine' can't occur here — entries are pre-filtered to
      // 'joinable' before the loop.
    }
    setInviteLandingJoiningId(null);

    if (succeeded.length > 0) {
      setGroups((prev) => {
        let next = prev;
        for (const { group } of succeeded) {
          next = next.some((g) => String(g.id) === String(group.id))
            ? next.map((g) => (String(g.id) === String(group.id) ? group : g))
            : [...next, group];
        }
        return next;
      });
    }

    // Spots someone else took in the meantime can't be retried — say so once.
    const announceTaken = () => {
      if (takenIds.size === 0) return;
      setToastMsg(takenIds.size === 1
        ? 'One group was already taken by someone else'
        : `${takenIds.size} groups were already taken by someone else`);
      setTimeout(() => setToastMsg(null), 3500);
    };

    if (Object.keys(nextRowErrors).length === 0) {
      // Nothing left to retry — dismiss and navigate like the legacy
      // single-group flow: exactly one join opens that group directly,
      // otherwise stay on home.
      dismissInviteLanding();
      announceTaken();
      if (succeeded.length === 1) {
        const groupRow = inviteLandingGroupRows.find((g) => String(g.id) === succeeded[0].groupId);
        setSelectedId(groupRow?.is_direct ? 'STANDALONE' : succeeded[0].groupId);
        setView('detail');
        setShowFriendsList(false);
      } else {
        setView('summary');
      }
      setInviteLandingBusy(false);
      return;
    }

    // Some spots hit a retryable error — keep the card open showing them. The
    // ones that went through leave the card (groups I'm in aren't shown); the
    // ones someone else took turn into disabled "Already joined" rows.
    const succeededIds = new Set(succeeded.map((s) => s.groupId));
    setInviteLandingSelectedIds((prev) => prev.filter((id) => !succeededIds.has(id) && !takenIds.has(id)));
    setInviteLandingEntries((prev) => prev.map((e): InviteLandingEntry => (
      succeededIds.has(e.groupId) ? { ...e, status: 'alreadyMine' }
        : takenIds.has(e.groupId) ? { ...e, status: 'takenByOther' }
          : e)));
    setInviteLandingRows((prev) => prev
      .filter((r) => !succeededIds.has(r.groupId))
      .map((r): InviteUiRow => (takenIds.has(r.groupId) ? { ...r, status: 'takenByOther' } : r)));
    setInviteLandingRowErrors(nextRowErrors);
    setInviteLandingBusy(false);
  };

  // Back from Google with an invite pending: the session exists but the auth
  // listener hasn't set isAuthenticated yet. Render the app (with its loader /
  // join card on top) rather than flashing the Login screen meanwhile.
  // Was I removed from the open group by the admin (vs leaving myself)? A
  // removed member gets no Rejoin option. Durable signal: the group's own
  // "<me> was removed" log entry (newer than any "<me> rejoined"), with the
  // 'removed' notification as a fallback.
  const removedFromSelected = (() => {
    if (!selectedId || selectedId === 'STANDALONE') return false;
    const myNames = new Set([me, localStorage.getItem(`divido_identity_${selectedId}`) || '']
      .map((n) => String(n || '').replace(/s*(me)$/i, '').replace(/s*(Left)$/i, '').trim().toLowerCase())
      .filter(Boolean));
    let removedAt = -1; let rejoinedAt = -1;
    for (const e of expenses) {
      if (String(e.gId) !== String(selectedId) || e.paid !== 'SYSTEM') continue;
      const t = String(e.title || '').toLowerCase();
      const ts = Number((e as any).timestamp || 0) || Date.parse(e.date || '') || 0;
      for (const n of myNames) {
        if (t === `${n} was removed` || t === `${n} (left) was removed`) removedAt = Math.max(removedAt, ts);
        if (t.startsWith(`${n} rejoined`)) rejoinedAt = Math.max(rejoinedAt, ts);
      }
    }
    if (removedAt >= 0) return removedAt > rejoinedAt;
    return notifications.some((n) => n.type === 'removed' && String(n.groupId) === String(selectedId));
  })();

  const inviteAwaitingAuth = inviteSessionReady && (isResolvingInvite || !!linkRequestGroup || (!!inviteLandingRaw && inviteLandingMode === 'signedIn'));
  if (!isAuthenticated && !inviteAwaitingAuth) {
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
        {inviteLandingRaw && inviteLandingMode === 'signedOut' && (
          <InviteLandingCard
            mode="signedOut"
            totalCount={inviteLandingSpots.length}
            rows={inviteLandingRows}
            selectedGroupIds={[]}
            onToggleGroup={() => {}}
            busy={false}
            onJoinSelected={() => {}}
            onSignIn={inviteSignIn}
            onDismiss={dismissInviteLanding}
          />
        )}
      </>
    );
  }

  // While an invite link is being checked, cover the screen with a small loader
  // so home doesn't flash before the group / join card. Only when needed: a
  // known member already landed straight in the group (getSavedUiState), and
  // once a join card is up it is the destination. Bounded by the 5 s safety
  // timeout on isResolvingInvite.
  if (isResolvingInvite && !(view === 'detail' && selectedId != null) && !inviteLandingRaw && !linkRequestGroup) {
    return <InviteLoader />;
  }

  // Fresh sign-in with no cached data yet: show a friendly branded splash (the
  // Divido cat) until the first cloud load finishes — so users never see an
  // empty "Your Groups" and get scared. Returning users with cached groups skip
  // this entirely (groups.length > 0). 5s safety timeout so it can't hang.
  // Never over a pending join card — it is the destination, and hiding it
  // behind the splash is what made invites feel slow to open.
  if (!isInitialLoadDone && !bootLoaderExpired && groups.length === 0 && isAuthenticated && !!userEmail && !inviteLandingRaw && !linkRequestGroup) {
    return <BootSplash />;
  }

  // Runs the actual claim/rejoin after the in-app confirm step (claimConfirmTarget)
  // is accepted. Extracted from the claim button's onClick so the native
  // confirm() could be replaced with a styled in-app confirmation card.
  // Someone the email matched tapped "Not me": the email on that spot is
  // probably wrong, so tell the group's members to check it.
  const notifyNotMe = async (spot: any, group: any) => {
    try {
      const spotName = titleCaseName(String(spot.name || '').replace(' (Left)', ''));
      const who = titleCaseName((userName || '').trim()) || userEmail || 'Someone';
      const { data: activeMems } = await supabase
        .from('group_members')
        .select('user_email')
        .eq('group_id', group.id)
        .not('user_email', 'is', null);
      const me = (userEmail || '').toLowerCase();
      for (const mem of activeMems || []) {
        if (!mem.user_email || String(mem.user_email).toLowerCase() === me) continue;
        await pushNotification({
          recipientEmail: mem.user_email,
          type: 'join',
          title: `Check ${spotName}'s email in ${group.name}`,
          body: `${who} opened the invite with ${spotName}'s email but said "Not me". The email may be wrong.`,
          fromName: who,
          groupId: group.id,
        });
      }
    } catch (e) {
      console.error('Not-me notification failed:', e);
    }
  };

  const runClaimPlaceholder = async (p: any) => {
    setSubmittingLinkRequest(true);
    claimInProgressRef.current = true;
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
        const cleanRedirect = buildOAuthRedirectUrl();
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
            id: genExpenseId(),
            group_id: linkRequestGroup.id,
            title: `${cleanName} rejoined`,
            amt: 0,
            paid: 'SYSTEM',
            date: new Date().toISOString().split('T')[0],
            mode: 'Equally',
            splitters: []
          });

        // No blocking alert — landing in the group is the confirmation.
      } else {
        // Normal claim flow — adopt the joiner's own PROFILE name
        // (once joined, your name = your profile name, not the
        // placeholder the inviter typed), unless it collides with
        // another member here.
        const rawProfile = (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || '').trim();
        let profileName = rawProfile ? titleCaseName(rawProfile) : '';
        if (!profileName) {
          const un = localStorage.getItem('divido_username');
          if (un && !['You', 'Guest', 'undefined', ''].includes(un.trim())) profileName = un.trim();
        }
        let claimName = p.name;
        const { data: mems } = await supabase.from('group_members').select('id, name, user_email, invite_email').eq('group_id', linkRequestGroup.id);
        // The joiner's OWN earlier spot (a "(Left)" row with their email) isn't
        // a name clash — it's them. Ignore it for the clash check and hide it
        // from Past Members once they're back.
        const myEm = activeEmail.toLowerCase();
        const ownLeftIds = (mems || [])
          .filter((m: any) => m.id !== p.id && /\(Left\)\s*$/i.test(String(m.name)) &&
            (String(m.user_email || '').toLowerCase() === myEm || String(m.invite_email || '').toLowerCase() === myEm))
          .map((m: any) => m.id);
        if (profileName && profileName.toLowerCase() !== p.name.toLowerCase()) {
          const taken = new Set((mems || [])
            .filter((m: any) => m.id !== p.id && !ownLeftIds.includes(m.id))
            .map((m: any) => String(m.name).replace(/\s*\(Left\)$/i, '').trim().toLowerCase()));
          claimName = uniqueProfileName(profileName, activeEmail, taken);
        }
        // `.select()` returns the rows actually updated: the database silently
        // blocks the write (0 rows) when someone else claimed this spot after
        // the list was loaded. Stop here rather than proceed as if joined —
        // nothing below (identity, expense rename, navigation) is valid then.
        const { data: claimedRows, error: claimErr } = await supabase
          .from('group_members')
          .update({
            name: claimName,
            user_email: activeEmail,
            is_pending: false,
          })
          .eq('id', p.id)
          .select('id');
        if (claimErr || !claimedRows || claimedRows.length === 0) {
          if (claimErr) console.error('Claim failed:', claimErr);
          setLinkRequestPlaceholders((prev) => prev.filter((m: { id: unknown }) => m.id !== p.id));
          setToastMsg(claimErr ? "Couldn't join — try again" : 'That spot was just taken — pick another');
          setTimeout(() => setToastMsg(null), 3000);
          return;
        }
        if (ownLeftIds.length > 0) {
          const { error: hideErr } = await supabase.from('group_members').update({ is_removed: true }).in('id', ownLeftIds);
          if (hideErr) console.error('Hiding own past spot failed:', hideErr);
        }
        // If the name changed from the placeholder, rewrite this
        // group's expenses so balances follow the new name.
        if (claimName !== p.name) {
          try {
            const { data: exps } = await supabase.from('expenses').select('*').eq('group_id', linkRequestGroup.id);
            const patches = computeClaimRenamePatches(exps || [], p.name, claimName);
            for (const patch of patches) {
              const { error } = await supabase
                .from('expenses')
                .update({ paid: patch.paid, splitters: patch.splitters, shares: patch.shares })
                .eq('id', patch.id);
              if (error) console.error('claim rename rewrite failed:', error);
            }
          } catch (rwErr) { console.error('claim rename rewrite failed:', rwErr); }
        }
        {
          const existing = localStorage.getItem('divido_username');
          const hasRealName = !!existing && !['You', 'Guest', 'undefined', ''].includes(existing.trim());
          if (!hasRealName) { localStorage.setItem('divido_username', claimName); setUserName(claimName); }
        }
        localStorage.setItem('divido_authenticated', 'true');
        localStorage.setItem(`divido_identity_${linkRequestGroup.id}`, claimName);
        logGroupEvent(linkRequestGroup.id, `${claimName} joined`);
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
          const activeMems = dropShadowedLeftRows(gm.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)')));
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

      setSelectedId((linkRequestGroup as any).is_direct || (linkRequestGroup as any).isDirect ? 'STANDALONE' : linkRequestGroup.id);
      setView('detail');
      setShowFriendsList(false); // Clear any lingering overlay state
      lastClaimedGroupRef.current = String(linkRequestGroup.id);
      setLinkRequestGroup(null);
      localStorage.removeItem('divido_pending_join');
    } catch (err) {
      console.error(err);
    } finally {
      claimInProgressRef.current = false;
      setSubmittingLinkRequest(false);
      const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
      // Seed a HOME base entry (not an empty one) so a back-swipe from the
      // group you just entered/claimed goes to the home screen instead of
      // exiting the app. The detail entry is pushed on top by the history sync.
      window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
    }
  };

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
        onImportSplitwise={onImportSplitwise}
      />

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
      )}

      <main ref={mainContentRef} className="main-content">
        {view !== 'create_group' && (
          <MobileHeader
            headerHidden={headerHidden}
            onRequestRejoin={() => { if (!removedFromSelected) setShowRejoinRequestModal(true); }}
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
            nonGroupSearch={nonGroupSearch}
            setNonGroupSearch={setNonGroupSearch}
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
            setGroupDetailTab={setGroupDetailTab}
            setShowFriendsList={setShowFriendsList}
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
            homeTabResetNonce={homeTabResetNonce}
            duplicateGroups={duplicateGroups}
            onMergeGroups={mergeGroups}
            onImportSplitwise={onImportSplitwise}
            onInviteToGroup={async (g, names) => {
              // Home-screen "Invite" for a group's not-yet-joined members. Same
              // link + native share sheet as the in-group Remind action.
              const inviteLink = `${window.location.origin}/?joinGroupId=${g.id}`;
              const shareText = groupInviteMessage(names, g.name);
              if (typeof navigator !== 'undefined' && (navigator as any).share) {
                try {
                  await (navigator as any).share({
                    title: g.name ? `Join "${g.name}" on Divido` : 'Join my group on Divido',
                    text: shareText,
                    url: inviteLink,
                  });
                } catch {
                  /* user dismissed the share sheet */
                }
                return;
              }
              // Desktop / no native share: copy the message + link.
              try {
                await navigator.clipboard.writeText(`${shareText}\n${inviteLink}`);
                setToastMsg('Invite link copied — send it to them 📋');
              } catch {
                setToastMsg(inviteLink);
              }
              setTimeout(() => setToastMsg(null), 3000);
            }}
            onInvitePerson={async (person) => {
              // Home-screen "Invite" for one still-pending person, across every
              // group they're pending in. Same native share sheet + fallback as
              // onInviteToGroup above, just built from a multi-group link.
              const spots = person.spots.map((s) => ({ groupId: String(s.group.id), memberKey: s.memberKey }));
              // Prefer the most recently active of the person's pending groups
              // as the single-group fallback (used only if no spot has a
              // memberKey yet); default to the first spot when activity ties.
              let fallbackGroupId = String(person.spots[0]?.group.id ?? '');
              let latestActivity = -Infinity;
              for (const s of person.spots) {
                const t = groupActivityTimestamp(s.group, expenses) ?? Date.now();
                if (t > latestActivity) {
                  latestActivity = t;
                  fallbackGroupId = String(s.group.id);
                }
              }
              const { url, coveredGroupIds } = buildPersonInviteLink(window.location.origin, spots, fallbackGroupId);
              const groupNameById = new Map(person.spots.map((s) => [String(s.group.id), s.group.name || '']));
              const groupNames = coveredGroupIds.map((gid) => groupNameById.get(gid) || '');
              const shareText = personInviteMessage(person.name, groupNames);
              const shareTitle = coveredGroupIds.length > 1
                ? 'Join my groups on Divido'
                : `Join ${groupNames[0] || 'my group'} on Divido`;
              if (typeof navigator !== 'undefined' && (navigator as any).share) {
                try {
                  await (navigator as any).share({ title: shareTitle, text: shareText, url });
                } catch {
                  /* user dismissed the share sheet */
                }
                return;
              }
              // Desktop / no native share: copy the message + link.
              try {
                await navigator.clipboard.writeText(`${shareText}\n${url}`);
                setToastMsg('Invite link copied — send it to them 📋');
              } catch {
                setToastMsg(url);
              }
              setTimeout(() => setToastMsg(null), 3000);
            }}
          />
        ) : view === 'groups' ? (
          <GroupsView
            groups={groups}
            expenses={expenses}
            getMemberBalance={getMemberBalance}
            setSelectedId={setSelectedId}
            setView={setView}
            setShowFriendsList={setShowFriendsList}
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
            userEmail={userEmail}
            setView={setView}
            setSelectedId={setSelectedId}
            setGlobalSettleData={setGlobalSettleData}
            userMetadata={userMetadata}
            memberAvatars={memberAvatars}
            onMergePeople={mergePeople}
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
            onImportSplitwise={onImportSplitwise}
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
            memberAvatars={memberAvatars}
            myEmail={userEmail}
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
              if (gid) {
                setSelectedId(gid);
                // Push intermediate history state so a back-swipe from the Members
                // overlay lands on the group detail screen instead of jumping all
                // the way back to the home screen.
                const midState = { ...getUiState(), view: 'detail', selectedId: gid, showFriendsList: false };
                window.history.pushState({ _divido: true, uiState: midState }, '');
                try { sessionStorage.setItem('divido_ui_state', JSON.stringify(midState)); } catch {}
              }
              setView('detail');
              setShowFriendsList(true);
            }}
            onImportSplitwise={onImportSplitwise}
          />
        ) : selectedId === 'STANDALONE' ? (
          <NonGroupView
            expenses={expenses}
            me={me}
            userName={userName}
            myEmail={userEmail}
            defaultCurrency={myDefaultCurrency}
            memberAvatars={memberAvatars}
            getMemberBalance={getMemberBalance}
            directThreads={(() => {
              const clean = (n: string) => (n || '').replace(/\s*\(Left\)$/i, '').trim();
              const myFirst = (me || '').trim().toLowerCase();
              const myFull = (userName || '').trim().toLowerCase();
              const myEmailLower = (userEmail || '').trim().toLowerCase();
              return groups
                .filter((g) => g.isDirect)
                .map((g) => {
                  // "Me" in this thread can be stored under my first name, my full
                  // name, or (after another device/claim synced it) keyed only by
                  // my email — so exclude by all three, else we'd pick MYSELF as
                  // the other person (both sides then show the owner's name).
                  const isMe = (m: string) => {
                    const c = clean(m).toLowerCase();
                    if (c && (c === myFirst || c === myFull)) return true;
                    const id = (g.memberIdentities?.[m] || '').trim().toLowerCase();
                    return !!myEmailLower && id === myEmailLower;
                  };
                  const otherRaw = (g.members || []).find((m) => clean(m) && !isMe(m)) || '';
                  const other = clean(otherRaw);
                  return {
                    groupId: String(g.id),
                    otherName: other,
                    email: (g.memberIdentities?.[otherRaw] || '').includes('@') ? g.memberIdentities![otherRaw] : '',
                    pending: (g.pendingMembers || []).some((pm) => clean(pm).toLowerCase() === other.toLowerCase()),
                  };
                })
                .filter((t) => t.otherName);
            })()}
            onBack={() => { setSelectedId(null); setView('summary'); }}
            searchQuery={nonGroupSearch || ''}
            onOpenExpense={(exp) => { setEditingExpenseSecure(exp); setShowExpModalSecure(true); }}
            onSettlePerson={(name, directGroupId) => setGlobalSettleDataSecure({ name: name.replace(/\s*\(Left\)$/i, '').trim(), gId: directGroupId || 'STANDALONE' })}
            onAddWithPerson={(name, directGroupId) => quickAddExpenseWithFriend(name, directGroupId)}
            backupMissingCount={(() => {
              const ids = new Set(expenses.map((e) => String(e.id)));
              return nonGroupBackup.filter((e) => e && String(e.gId) === 'STANDALONE' && !ids.has(String(e.id))).length;
            })()}
            onRestoreBackup={restoreNonGroupBackup}
            onClearAll={clearAllNonGroup}
            onCleanupEmpty={cleanupEmptyThreads}
            onDeletePerson={deletePersonNonGroup}
            onSharePerson={(name) => { sharePersonNonGroupBeta(name, ''); }}
            onRemindPerson={async (name) => {
              const clean = name.replace(/\s*\(Left\)$/i, '').trim();
              // In-app reminder (fire-and-forget so it doesn't consume the tap's
              // activation before the native share sheet).
              notifyFriend(clean, {
                type: 'reminder',
                title: `${userName} sent you a reminder`,
                body: 'You have a pending balance to settle',
                groupId: null,
              });
              const shareText = `Hey ${clean}! Just a reminder to settle up on Divido 💸`;
              if (typeof navigator !== 'undefined' && (navigator as any).share) {
                try {
                  await (navigator as any).share({ title: 'Settle up on Divido', text: shareText, url: window.location.origin });
                } catch { /* dismissed */ }
              }
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
            myEmail={userEmail}
            setShowConvertModalId={setShowConvertModalId}
            wasRemovedByAdmin={removedFromSelected}
            userMetadata={userMetadata}
            memberAvatars={memberAvatars}
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

                  setToastMsg('Member successfully approved and linked! 🎉');
                  setTimeout(() => setToastMsg(null), 3000);
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
              if (!removedFromSelected) setShowRejoinRequestModal(true);
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
                  
                  setToastMsg('Link request declined.');
                  setTimeout(() => setToastMsg(null), 3000);
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
            onReinviteMember={async (memberName: string, inviteUrl: string, silent?: boolean) => {
              const grpName = selectedGroup?.name;
              const shareText = `Hey ${memberName}! Rejoin ${grpName ? `"${grpName}"` : 'our group'} on Divido 💸`;
              // `silent` (re-add from the friend list) just reactivates them to
              // pending — no share sheet, no rejoin-link fallback popup.
              const nativeShare = !silent && typeof navigator !== 'undefined' && (navigator as any).share;

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

              if (!nativeShare && !silent) {
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
            onRemovePastMember={async (memberName: string) => {
              // Hide a past member from the list. Their row (and expenses) stay,
              // so balances are unchanged and the self-heal can't re-add them.
              if (!selectedId || selectedId === 'STANDALONE') return;
              const gid = selectedId;
              setGroups((prev) => prev.map((g) => String(g.id) === String(gid)
                ? { ...g, removedMembers: Array.from(new Set([...(g.removedMembers || []), memberName])) }
                : g));
              if (checkIfDemoMode() || !isAuthenticated) return;
              const { error } = await supabase.from('group_members')
                .update({ is_removed: true })
                .eq('group_id', gid)
                .ilike('name', memberName);
              if (error) {
                console.error('Remove past member failed:', error);
                alert('Could not remove right now. Please try again.');
                setGroups((prev) => prev.map((g) => String(g.id) === String(gid)
                  ? { ...g, removedMembers: (g.removedMembers || []).filter((n) => n !== memberName) }
                  : g));
              }
            }}
            onSettleMember={(memberName: string) => { if (selectedId && selectedId !== 'STANDALONE') setGlobalSettleDataSecure({ name: memberName.replace(/\s*\(Left\)$/i, '').trim(), gId: selectedId }); }}
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
              // A member who actually JOINED (their row has an account email) is
              // never hard-deleted on removal: hard-deleting them cut off their read
              // access (blank history), skipped the "was removed" log, and left a
              // stale Rejoin on their phone. Tombstone them like a member with
              // history. Only never-used invites are deleted outright.
              let joinedAccount = false;
              if (!isPastMember && !hasExpenseHistory && !checkIfDemoMode() && isAuthenticated) {
                try {
                  const { data: rows } = await supabase
                    .from('group_members')
                    .select('user_email')
                    .eq('group_id', selectedId)
                    .ilike('name', cleanName);
                  joinedAccount = (rows || []).some((r: any) => !!r.user_email);
                } catch { /* fall back to the old rule */ }
              }
              const hardDelete = (!hasExpenseHistory && !joinedAccount) || purgePastWithHistory;
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
                          await pushNotification({
                            recipientEmail: removedEmail,
                            type: 'removed',
                            title: `You were removed from ${grpName}`,
                            body: `The group admin removed you from ${grpName}. You can still view past history.`,
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
                        id: genExpenseId(),
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
            onAddMembers={(names, emails, identities) => {
              if (selectedId && selectedId !== 'STANDALONE') {
                // Skip the "same person?" prompt when identity is already settled:
                // an email, or a "Recently split with" pick that carried the
                // person's hidden id (you already told us who they are).
                const clashing = names
                  .map((n) => ({ name: n, candidates: findPersonCandidates(n, selectedId) }))
                  .filter((x) => x.candidates.length > 0 && !(emails && emails[x.name]) && !(identities && identities[x.name]));
                if (clashing.length > 0) {
                  setSamePersonPrompt({ groupId: selectedId, queue: clashing, index: 0, addNames: names, addEmails: emails, addIdentities: identities });
                } else {
                  commitAddMembers(selectedId, names, emails, identities);
                }
              }
            }}
            onCreateGroup={createGroupSecure}
            onSetMemberEmail={setMemberInviteEmail}
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





      {showExpModal && (
        <React.Suspense fallback={null}>
        <ExpenseModal
          memberAvatars={memberAvatars}
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
          myEmail={userEmail}
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
              name: 'Non-Group',
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
          onCreateNewGroup={() => {
            setShowExpModal(false);
            setView('create_group');
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
           onAdd={(names, emails, identities) => {
             if (selectedId === 'STANDALONE') {
               setNewlyAddedFriends(names);
             } else if (selectedId) {
               // If any added name already exists elsewhere, ask "same person?" —
               // but skip that when identity is already settled: an email, or a
               // "Recently split with" pick that carried the person's hidden id
               // (you already told us who they are by picking them).
               const clashing = names
                 .map((n) => ({ name: n, candidates: findPersonCandidates(n, selectedId) }))
                 .filter((x) => x.candidates.length > 0 && !(emails && emails[x.name]) && !(identities && identities[x.name]));
               if (clashing.length > 0) {
                 setSamePersonPrompt({ groupId: selectedId, queue: clashing, index: 0, addNames: names, addEmails: emails, addIdentities: identities });
               } else {
                 commitAddMembers(selectedId, names, emails, identities);
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
                // Mid-confirm, the × just backs out to the name list — the
                // whole invite is only declined from the list screen itself.
                if (claimConfirmTarget) {
                  setClaimConfirmTarget(null); setClaimConfirmAuto(false);
                  return;
                }
                const declinedId = linkRequestGroup?.id;
                setLinkRequestGroup(null);
                setJoinNewName('');
                localStorage.removeItem('divido_pending_join');
                if (declinedId != null) {
                  setGroups(prev => prev.filter(g => String(g.id) !== String(declinedId)));
                }
                const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
                // Seed a HOME base entry (not an empty one) so a back-swipe from the
            // group you just entered/claimed goes to the home screen instead of
            // exiting the app. The detail entry is pushed on top by the history sync.
            window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
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
                zIndex: 2,
              }}
            >
              ×
            </button>
            <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', padding: '0 36px', boxSizing: 'border-box', lineHeight: 1.35, wordBreak: 'break-word' }}>
              {linkRequestRejoinMode ? 'Rejoin' : 'Join'} "{linkRequestGroup.name}"?
            </h3>

            {claimConfirmTarget ? (() => {
              const confirmName = titleCaseName(claimConfirmTarget.name.replace(' (Left)', ''));
              // Show the actual signed-in Gmail address when we already know it
              // (returning users, or after the Google sign-in round-trip); a
              // brand-new visitor who hasn't signed in yet gets the generic
              // fallback since we don't know their email until they do.
              const isRealEmail = !!userEmail && !userEmail.startsWith('guest-') && !userEmail.startsWith('e2e-test');
              const emailLabel = isRealEmail ? userEmail : 'your Google account';
              const profileShown = titleCaseName((userName || '').trim());
              return (
                <div style={{ padding: '6px 0 2px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: '#FCE7F3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '4px auto 16px',
                      fontSize: '22px',
                      fontWeight: 700,
                      color: '#DB2777',
                    }}
                  >
                    {confirmName.charAt(0)}
                  </div>
                  <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0' }}>
                    You were added as "{confirmName}"
                  </p>
                  <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 400, lineHeight: 1.5, margin: '0 0 22px 0' }}>
                    {profileShown && profileShown.toLowerCase() !== confirmName.toLowerCase()
                      ? <>You'll show up as <b style={{ color: '#0F172A' }}>{profileShown}</b>. </>
                      : null}
                    This links {emailLabel} to this spot.
                  </p>
                  <button
                    disabled={submittingLinkRequest}
                    onClick={() => {
                      const target = claimConfirmTarget;
                      setClaimConfirmTarget(null); setClaimConfirmAuto(false);
                      runClaimPlaceholder(target);
                    }}
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: '14px',
                      border: 'none',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    disabled={submittingLinkRequest}
                    onClick={() => {
                      const spot = claimConfirmTarget;
                      const wasAuto = claimConfirmAuto;
                      setClaimConfirmTarget(null);
                      setClaimConfirmAuto(false);
                      if (wasAuto && spot && linkRequestGroup) notifyNotMe(spot, linkRequestGroup);
                    }}
                    style={{ marginTop: '12px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Not me
                  </button>
                </div>
              );
            })() : (<>
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
                  onClick={() => runClaimPlaceholder(p)}
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
              {/* The "Join as new member" section is now a single, distinct button 
                  instead of an input that looks like a claim card. */}
              <button
                disabled={submittingLinkRequest}
                onClick={async () => {
                  // Fallback to "New Member" if we don't have a real name yet.
                  // They'll be redirected to Google if they aren't signed in anyway.
                  let typed = joinNewName.trim();
                  if (!typed || typed === 'You' || typed === 'Guest') {
                    typed = (userName && userName !== 'You' && userName !== 'Guest') ? userName.trim() : 'New Member';
                  }

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
                      const cleanRedirect = buildOAuthRedirectUrl();
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
                    let claimedPlaceholderName = '';
                    if (!mine) {
                      const clash = roster.find((m: any) => norm(m.name) === norm(typed));
                      const clashIsUnclaimed = clash && !clash.user_email && !String(clash.name).toLowerCase().endsWith(' (left)');
                      if (clashIsUnclaimed) {
                        // A pending placeholder with this exact name is almost
                        // certainly THIS person (e.g. inviter typed "Chirag Gupta"
                        // and the joiner's Google name is also "Chirag Gupta").
                        // Claim it by attaching their email instead of erroring.
                        const { error: upErr } = await supabase.from('group_members')
                          .update({ 
                            user_email: myEmail, 
                            is_pending: false,
                            upi_id: userMetadata[typed]?.upiId || null,
                          })
                          .eq('id', clash.id);
                        if (upErr) throw upErr;
                        claimedPlaceholderName = String(clash.name).replace(/\s*\(Left\)$/i, '');
                      } else if (clash) {
                        // Name taken by an ALREADY-CLAIMED member (a different
                        // person) — genuinely needs disambiguation.
                        alert(`"${typed}" is already in this group. Add a surname or pick a different name.`);
                        setSubmittingLinkRequest(false);
                        return;
                      } else {
                        // Brand-new member identified by email.
                        const { error: insErr } = await supabase.from('group_members').insert({
                          group_id: linkRequestGroup.id,
                          name: typed,
                          user_email: myEmail,
                          is_pending: false,
                          person_id: null,
                          upi_id: userMetadata[typed]?.upiId || null,
                        });
                        if (insErr) throw insErr;
                      }
                    }
                    const myName = mine ? String(mine.name).replace(/\s*\(Left\)$/i, '') : (claimedPlaceholderName || typed);
                    if (!mine) logGroupEvent(linkRequestGroup.id, `${myName} joined`);
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
                        const activeMems = dropShadowedLeftRows(gm2.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)')));
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
                    setSelectedId((linkRequestGroup as any).is_direct || (linkRequestGroup as any).isDirect ? 'STANDALONE' : linkRequestGroup.id);
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
                    window.history.replaceState({ _divido: true, uiState: { view: 'summary', selectedId: null } }, '', cleanUrl);
                  }
                }}
                className="hover-up-mini"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#6366F1',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                  marginTop: '8px',
                }}
              >
                {(() => {
                  // (They can claim their exact name from the cards above, or join as new)
                  return 'Join as New Member';
                })()}
              </button>
            </div>
            )}
            </>)}
          </div>
        </div>
      )}

      {inviteLandingRaw && inviteLandingMode === 'signedIn' && (
        <InviteLandingCard
          mode="signedIn"
          totalCount={inviteLandingRows.length}
          rows={inviteLandingRows}
          selectedGroupIds={inviteLandingSelectedIds}
          onToggleGroup={toggleInviteGroup}
          onOpenGroup={openInviteGroup}
          busy={inviteLandingBusy}
          joiningGroupId={inviteLandingJoiningId}
          rowErrors={inviteLandingRowErrors}
          onJoinSelected={joinSelectedInviteGroups}
          onSignIn={inviteSignIn}
          onDismiss={dismissInviteLanding}
        />
      )}

      {showMembersHealth && selectedGroup && (
        <MembersHealthModal
          members={selectedGroup.members}
          selectedId={selectedId}
          me={me}
          getMemberBalance={getMemberBalance}
          onClose={() => setShowMembersHealth(false)}
        />
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
              maxHeight: '100dvh',
              display: 'flex',
              flexDirection: 'column',
              padding: 'calc(16px + env(safe-area-inset-top)) 18px calc(16px + env(safe-area-inset-bottom))',
              borderRadius: 0,
              position: 'relative',
              animation: 'slideUp 0.28s ease-out',
              background: '#FFFFFF',
              border: 'none',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Invisible decoy input to trick browser autofill heuristics.
                NOTE: no type="password" decoy — a password field (even hidden)
                makes mobile Chrome treat the modal as a login form and pop the
                password-manager bar over the real inputs. */}
            <input type="text" name="username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

            {/* Header section (fixed) */}
            <div style={{ flexShrink: 0, marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => setGlobalSettleData(null)}
                  aria-label="Back"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: '-4px', width: '30px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <h3 className="nunito" style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '19px', fontWeight: 800, color: '#1E293B', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Settle with {globalSettleData.name}
                </h3>
                <div style={{ width: '32px', flexShrink: 0 }} />
              </div>
              {globalSettleData.identity && String(globalSettleData.identity).includes('@') && (
                <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '12px', fontWeight: 500, marginBottom: '2px', wordBreak: 'break-all' }}>
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
                margin: 0,
              }}>
                {globalSettleData.gId ? `Breakdown for ${
                  globalSettleData.gId === 'STANDALONE'
                    ? 'Non-Group'
                    : groups.find((g) => String(g.id) === String(globalSettleData.gId))?.name || 'group'
                }` : 'Breakdown across all shared groups'}
              </p>
            </div>

            {/* Scrollable breakdown list */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
                paddingBottom: '16px',
              }}
            >
              {localSettleEdits.map((item, idx) => {
                const isPayable = !!item.iAmPayer;
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
                        <span style={{ fontSize: '10px', fontWeight: 800, marginTop: '1px', color: item.iAmPayer ? '#DB2777' : (item.mode === 'writeoff' ? '#B45309' : '#10B981') }}>
                          {item.iAmPayer ? 'You are Paying' : (item.mode === 'writeoff' ? 'Writing off' : 'You are Collecting')}
                        </span>
                        {/* Write off is offered only when THEY owe YOU — it's your
                            money to forgive. Tap to toggle between recording a real
                            payment and writing the amount off (can't recover). */}
                        {!item.iAmPayer && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocalSettleEdits((prev) => prev.map((x, i) => (i === idx ? { ...x, mode: x.mode === 'writeoff' ? 'settle' : 'writeoff' } : x)));
                            }}
                            style={{
                              marginTop: '5px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              alignSelf: 'flex-start',
                              padding: '2px 9px',
                              borderRadius: '20px',
                              border: '1px solid ' + (item.mode === 'writeoff' ? '#F59E0B' : '#E2E8F0'),
                              background: item.mode === 'writeoff' ? '#FEF3C7' : '#FFFFFF',
                              color: item.mode === 'writeoff' ? '#B45309' : '#64748B',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.mode === 'writeoff' ? '✓ Writing off · undo' : "Write off"}
                          </span>
                        )}
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
                          color: !isSelected ? '#94A3B8' : (isPayable ? '#EF4444' : '#0D9488'),
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

            {/* Pinned bottom footer: Net balances summary + Actions */}
            <div
              style={{
                flexShrink: 0,
                paddingTop: '12px',
                borderTop: '1px solid #F1F5F9',
                background: '#FFFFFF',
              }}
            >
              {(() => {
                const netBalances: Record<string, number> = {};
                localSettleEdits.forEach((item) => {
                  if (!item.selected) return;
                  const amt = parseFloat(item.amt) || 0;
                  if (!netBalances[item.curr]) netBalances[item.curr] = 0;
                  if (item.iAmPayer) {
                    netBalances[item.curr] -= amt;
                  } else {
                    netBalances[item.curr] += amt;
                  }
                });

                const hasActiveBalances = Object.values(netBalances).some((b) => Math.abs(b) >= 0.01);
                const friendName = globalSettleData.name;

                if (!hasActiveBalances) return null;

                return (
                  <div style={{ maxHeight: '100px', overflowY: 'auto', marginBottom: '10px' }}>
                    {Object.entries(netBalances).map(([curr, netVal]) => {
                      if (Math.abs(netVal) < 0.01) return null;
                      const isOwed = netVal < 0;
                      const absoluteAmt = Math.abs(netVal);

                      return (
                        <div
                          key={curr}
                          style={{
                            textAlign: 'center',
                            padding: '3px 0px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            color: '#475569',
                            fontStyle: 'italic',
                          }}
                        >
                          {isOwed ? (
                            <span>
                              You pay <strong>{friendName}</strong> a net of{' '}
                              <strong style={{ color: '#EF4444', fontSize: '14.5px', fontWeight: 700, marginLeft: '2px' }}>
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
                  if (item.iAmPayer) {
                    netBalances[item.curr] -= amt;
                  } else {
                    netBalances[item.curr] += amt;
                  }
                });

                const selectedCount = localSettleEdits.filter((it) => it.selected).length;
                const hasActiveBalances = Object.values(netBalances).some((b) => Math.abs(b) >= 0.01);
                const hasWriteoff = localSettleEdits.some((it) => it.selected && it.mode === 'writeoff');
                const confirmLabel = hasWriteoff ? 'Confirm' : 'Mark as Settled';
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
                    <div>
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
                    <div>
                      <button
                        className="hover-up"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '14px',
                          border: 'none',
                          background: '#FACC15',
                          color: '#3F2E00',
                          cursor: 'pointer',
                        }}
                        onClick={handleFinalGlobalSettle}
                      >
                        {confirmLabel}
                      </button>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '14px',
                        background: '#FACC15',
                        color: '#3F2E00',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onClick={handleFinalGlobalSettle}
                    >
                      {confirmLabel}
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
        </div>
      )}



      {view !== 'create_group' && !isPhotoViewerOpen && (
        <nav className="bottom-nav">
          <div
            className={`b-nav-btn ${view === 'summary' || view === 'detail' ? 'active' : ''}`}
            onClick={() => {
              setSelectedId(null);
              setView('summary');
              setHomeTabResetNonce((n) => n + 1);
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
            upiId={upiFor(userMetadata, (n) => {
              // QR opens from a group balance — that group pins the payee's exact
              // email; fall back to the cross-group resolver only if it can't.
              const k = getPersonKey(selectedGroup, n);
              return typeof k === 'string' && k.includes('@') ? k : nameToEmailUpi(n);
            }, qrModalData.payee) || ''}
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
        groups={groups}
        userMetadata={userMetadata}
        setUserMetadata={setUserMetadata}
        onFinalSettle={handleFinalGlobalSettle}
        onPaymentInitiated={() => {
          // User launched the UPI app. Remember it so we can nudge them to
          // confirm on next open if they don't come back to answer.
          if (!netPayablePopup) return;
          const pending: PendingPay = {
            name: globalSettleData?.name || netPayablePopup.friendName,
            gId: globalSettleData?.gId ?? null,
            curr: netPayablePopup.curr,
            amt: netPayablePopup.amt,
            ts: Date.now(),
          };
          try { localStorage.setItem(PENDING_PAY_KEY, JSON.stringify(pending)); } catch { /* ignore */ }
        }}
        onPaymentResolved={clearPendingPay}
      />

      {/* Pending UPI payment nudge — shown on reopen when the user launched a UPI
          payment but never confirmed whether it went through. */}
      {pendingPayPrompt && (
        <div
          className="modal-overlay"
          style={{ zIndex: 6500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { clearPendingPay(); setPendingPayPrompt(null); }}
        >
          <div
            className="card shadow-xl"
            style={{ width: '320px', padding: '22px 20px', background: 'var(--w)', textAlign: 'center', borderRadius: '20px', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '30px', marginBottom: '6px' }}>💸</div>
            <p style={{ fontSize: '15px', fontWeight: 800, color: 'var(--t)', margin: '0 0 6px' }}>
              Did your payment go through?
            </p>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--g)', margin: '0 0 18px', lineHeight: 1.5 }}>
              You started a <strong style={{ color: 'var(--t)' }}>{pendingPayPrompt.curr}{pendingPayPrompt.amt.toFixed(2)}</strong> UPI payment to {pendingPayPrompt.name} but didn't confirm it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-green press-anim"
                onClick={() => {
                  const p = pendingPayPrompt;
                  clearPendingPay();
                  setPendingPayPrompt(null);
                  // Reopen the settle card with fresh, canonical balances so they
                  // complete the settle through the normal flow (never replay stale
                  // money rows saved from a previous session).
                  setGlobalSettleDataSecure({ name: p.name, gId: p.gId });
                }}
                style={{ padding: '12px', fontSize: '13px', borderRadius: '14px', width: '100%', fontWeight: 600 }}
              >
                Yes — open to settle
              </button>
              <button
                onClick={() => { clearPendingPay(); setPendingPayPrompt(null); }}
                style={{ padding: '12px', background: 'none', border: '1.5px solid #E2E8F0', color: 'var(--t)', borderRadius: '14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                className="press-anim"
              >
                Not yet — keep it open
              </button>
            </div>
          </div>
        </div>
      )}

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

      {showSplitwiseImport && (
        <React.Suspense fallback={null}>
          <SplitwiseImportModal
            open={showSplitwiseImport}
            onClose={() => setShowSplitwiseImport(false)}
            oauthCode={swOauthCode}
            oauthError={swOauthError}
            groups={groups}
            expenses={expenses}
            me={me}
            myEmail={userEmail}
            onCommit={handleSplitwiseCommit}
            onReviewItemTap={handleSplitwiseReviewTap}
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
                          // 2. Mark them as past members and unlink the live account,
                          //    but PRESERVE the email as invite_email so this person's
                          //    identity stays glued across every group. Nulling it
                          //    outright made their entries fragment into per-group ids,
                          //    showing the same person as several duplicates in
                          //    balances/suggestions. Keeping the email as invite_email
                          //    also lets them auto-claim if they ever sign up again.
                          await supabase
                            .from('group_members')
                            .update({
                              name: cleanName + ' (Left)',
                              user_email: null,
                              invite_email: userEmail,
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
        void hasPendingRejoin; // rejoin no longer waits for an admin
        return (
          <RejoinSelfModal
            hasPendingRejoin={false}
            noActiveAdmin={noActiveAdmin}
            adminLabel={adminLabel}
            onClose={() => setShowRejoinRequestModal(false)}
            onRejoin={async () => {
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
                      .ilike('name', searchName)
                      .limit(1)
                      .maybeSingle();

                    if (matched) {
                      // Dormant group with NO active member/admin to approve a
                      // rejoin request: reactivate directly instead of sending a
                      // request nobody can ever approve. The rejoiner becomes the
                      // sole active member (and thus the new admin), reviving the
                      // group. Safe — it's their own identity, and there's no one to
                      // gate it against.
                      // Rejoin is self-service: after the confirm card the user is
                      // let straight back in (no admin approval step).
                      const grpForRejoin = groups.find((g) => String(g.id) === String(selectedId));
                      {
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
                        await logGroupEvent(selectedId, `${cleanName} rejoined`);
                        setGroups(groups.map((g) =>
                          String(g.id) === String(selectedId)
                            ? {
                                ...g,
                                members: g.members.map((m) => (m === searchName ? cleanName : m)),
                                pendingLinkRequests: (g.pendingLinkRequests || []).filter((r) => r.requestEmail !== myEmail),
                              }
                            : g
                        ));
                        // Tell the others (no popup for me — I just land back in).
                        try {
                          const { data: others } = await supabase
                            .from('group_members')
                            .select('user_email')
                            .eq('group_id', selectedId)
                            .not('user_email', 'is', null);
                          for (const o of others || []) {
                            if (!o.user_email || o.user_email === myEmail) continue;
                            await pushNotification({
                              recipientEmail: o.user_email,
                              type: 'join',
                              title: `${cleanName} rejoined ${grpForRejoin?.name || 'the group'}`,
                              body: `${cleanName} is back in the group.`,
                              fromName: cleanName,
                              groupId: selectedId,
                            });
                          }
                        } catch (e) { console.error('Rejoin notification failed:', e); }
                        return;
                      }
                    }
                  } catch (err) {
                    console.error('Failed to request rejoin:', err);
                  }
                }
            }}
          />
        );
      })()}

      {adminRejoinRequest && (
        <RejoinRequestModal
          request={adminRejoinRequest}
          onClose={() => setAdminRejoinRequest(null)}
          onDecline={async () => {
            if (!adminRejoinRequest) return;
            try {
              await supabase
                .from('group_members')
                .update({
                  link_request_email: null,
                  link_request_name: null,
                })
                .eq('id', adminRejoinRequest.id);

              setToastMsg('Rejoin request declined.');
              setTimeout(() => setToastMsg(null), 3000);
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
          onApprove={async () => {
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
                    id: genExpenseId(),
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

              setToastMsg('Rejoin request approved! 🎉');
              setTimeout(() => setToastMsg(null), 3000);
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
        />
      )}
    </div>
  );
}

export default App;
// force rebuild  
