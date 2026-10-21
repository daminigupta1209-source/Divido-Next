import React from 'react';
import { shown } from '../lib/identity';
import { NetBalanceTiles } from './NetBalanceTiles';
import type { Expense } from '../lib/types';
import { computeNonGroupPeople, type DirectThread } from '../lib/nonGroupPeople';
import { getPersonalExpenses, personalSpendByCurrency, filterByPeriod, periodLabel, filterByDayRange, customRangeLabel, todayDayKey, type SpendPeriod } from '../lib/personalExpenses';
import { formatDate, getEmoji, formatExactAmount, getMonthYearKey, matchesAmount } from '../lib/utils';
import { NonGroupPhotoUpload, type NonGroupPhoto } from './NonGroupPhotoUpload';

interface NonGroupViewProps {
  expenses: Expense[];
  me: string;
  userName?: string;
  myEmail?: string;
  defaultCurrency: string;
  memberAvatars?: Record<string, string>;
  // Canonical balance engine (same one Friends/Balances use). For STANDALONE it
  // returns the person's net position per currency: negative = they owe me.
  getMemberBalance: (groupId: string | number | null, memberName: string) => Record<string, number>;
  // Hidden 2-person "direct" groups = shared non-group threads. Their expenses
  // are shown here alongside plain STANDALONE ones so a person never disappears
  // from this screen after being shared/invited.
  directThreads?: DirectThread[];
  onBack: () => void;
  onOpenExpense: (exp: Expense) => void;
  onSettlePerson: (name: string, directGroupId?: string, email?: string, keys?: string[]) => void;
  onRemindPerson?: (name: string) => void;
  onAddWithPerson?: (name: string, directGroupId?: string, keys?: string[]) => void;
  onAddPersonal?: () => void;
  // Photos tab upload. With a person → their thread; without → a personal
  // ("You") entry, which the expense form can still split with a friend.
  onAddPhoto?: (photo: NonGroupPhoto, person?: { name: string; directGroupId?: string; keys?: string[] }) => void;
  onSharePerson?: (name: string, directGroupId?: string, keys?: string[]) => void;
  // How many backed-up non-group expenses aren't present locally (for restore).
  backupMissingCount?: number;
  onRestoreBackup?: () => void;
  onClearAll?: () => void;
  onCleanupEmpty?: () => void;
  onDeletePerson?: (name: string, directGroupId?: string, keys?: string[]) => void;
  // Options sheet → "Delete Non-Group" on a person's screen. balanceText is ''
  // when settled; otherwise the parent blocks the delete behind Settle up.
  onRequestDeletePerson?: (req: { name: string; balanceText: string; onSettle: () => void; onDelete: () => void }) => void;
  // Header search text: filters the people list by name, email or expense name.
  searchQuery?: string;
}

const cleanName = (n: string) => (n || '').replace(/\s*\(Left\)$/i, '').trim();

// Same solid avatar palette as the All-balances (Friends) view.
const AVATAR_BG = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];

// "I collect X" from a person = the negative of their net position (2-person
// non-group expenses only ever involve me + them, so their net IS the pairwise
// balance). Positive => I collect, negative => I pay.
const myPerspective = (bal: Record<string, number>): { curr: string; amount: number }[] =>
  Object.entries(bal)
    .map(([curr, val]) => ({ curr, amount: -val }))
    .filter((x) => Math.abs(x.amount) > 0.01);

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

const chipStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.28)',
  borderRadius: '999px',
  padding: '1px 7px',
  fontSize: '11px',
  fontWeight: 700,
  flexShrink: 0,
};

const NetBalanceDetailsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  payLines: { curr: string; amount: number }[];
  collectLines: { curr: string; amount: number }[];
}> = ({ isOpen, onClose, payLines, collectLines }) => {
  if (!isOpen) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: '24px', marginBottom: '14px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '2px' }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', margin: '-4px -4px 0 0', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {payLines.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '6px' }}>You pay</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: collectLines.length > 0 ? '14px' : '6px' }}>
              {payLines.map((l) => (
                <span key={l.curr} style={{ fontSize: '15px', fontWeight: 600, color: '#B91C1C' }}>
                  {l.curr}{formatExactAmount(Math.abs(l.amount))}
                </span>
              ))}
            </div>
          </div>
        )}

        {collectLines.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '6px' }}>You collect</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
              {collectLines.map((l) => (
                <span key={l.curr} style={{ fontSize: '15px', fontWeight: 600, color: '#047857' }}>
                  {l.curr}{formatExactAmount(Math.abs(l.amount))}
                </span>
              ))}
            </div>
          </div>
        )}

        {payLines.length === 0 && collectLines.length === 0 && (
          <div style={{ fontSize: '14px', color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>
            All settled up
          </div>
        )}
      </div>
    </div>
  );
};

export const NonGroupView: React.FC<NonGroupViewProps> = ({
  expenses,
  me,
  userName,
  defaultCurrency,
  memberAvatars,
  getMemberBalance,
  directThreads = [],
  onOpenExpense,
  onSettlePerson,
  onAddWithPerson,
  onAddPersonal,
  onAddPhoto,
  backupMissingCount = 0,
  onRestoreBackup,
  onClearAll,
  onCleanupEmpty,
  onDeletePerson,
  onRequestDeletePerson,
  onSharePerson,
  searchQuery = '',
}) => {
  // Bottom toggle on the front page: Settle | Photos (swipe left/right).
  const [activeTab, setActiveTab] = React.useState<'settle' | 'photos'>('settle');
  // Inside a person's screen: their Activities | Photos.
  const [personTab, setPersonTab] = React.useState<'activity' | 'photos'>('activity');
  const personSwipeX = React.useRef<{ x: number; y: number } | null>(null);
  // Which person's full profile page is open (tapping their DP/avatar).
  // Remembered for this tab so a refresh stays on that person's screen.
  const [profilePerson, setProfilePerson] = React.useState<string | null>(() => { try { return sessionStorage.getItem('dv_ng_person') || null; } catch { return null; } });
  // The open person's friend ids, so two friends with the same name open their
  // own screens (the name alone can't tell them apart).
  const [profileKeys, setProfileKeys] = React.useState<string[]>(() => { try { return (sessionStorage.getItem('dv_ng_person_keys') || '').split(',').filter(Boolean); } catch { return []; } });
  // "You" pinned row — self-only (personal) expenses screen. Mutually
  // exclusive with profilePerson (entering one clears the other).
  // Remembered for this tab so a refresh stays on the You screen.
  const [personalMode, setPersonalMode] = React.useState(() => { try { return sessionStorage.getItem('dv_personal_open') === '1'; } catch { return false; } });
  const [showFrontNetSheet, setShowFrontNetSheet] = React.useState(false);
  // Shared-thread id of the open person (set while rendering their screen).
  const profilePersonThread = React.useRef<string | undefined>(undefined);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const meLower = cleanName(me).toLowerCase();
  // My name inside each shared thread (the sharer's label for me, e.g.
  // "Swami Chinmayanand"), so those expenses read "You paid", not a stranger.
  // Keyed by string: directThreads is a fresh array on every App render.
  const myThreadNamesKey = directThreads.map((t) => cleanName(t.myName || '').toLowerCase()).filter(Boolean).join('|');

  const isMe = React.useCallback(
    (name: string) => {
      const c = cleanName(name).toLowerCase();
      if (!c) return false;
      if (c === 'you' || c === meLower) return true;
      if (userName && c === cleanName(userName).toLowerCase()) return true;
      // First-name guess only when my full name is unknown (else "Damini Gupta"
      // on a "Damini …" account would be hidden as me).
      if (!userName && (c.startsWith(meLower + ' ') || c.endsWith(' ' + meLower))) return true;
      if (myThreadNamesKey && myThreadNamesKey.split('|').includes(c)) return true;
      return false;
    },
    [meLower, userName, myThreadNamesKey]
  );

  // Personal (self-only) expenses — paid by me, split only with me.
  const personalExps = React.useMemo(() => getPersonalExpenses(expenses, isMe), [expenses, isMe]);
  const personalSpend = React.useMemo(
    () => personalSpendByCurrency(expenses, isMe, defaultCurrency),
    [expenses, isMe, defaultCurrency]
  );

  // Personal screen summary: period picker (remembered per device) drives the
  // total card AND the list below it.
  const [spendPeriod, setSpendPeriodState] = React.useState<SpendPeriod | 'custom'>(() => {
    try {
      const v = localStorage.getItem('divido_personal_period');
      if (v === 'month' || v === 'year' || v === 'fiveYears' || v === 'all' || v === 'custom') return v;
    } catch { /* storage unavailable */ }
    return 'month';
  });
  const setSpendPeriod = (p: SpendPeriod | 'custom') => {
    setSpendPeriodState(p);
    try { localStorage.setItem('divido_personal_period', p); } catch { /* storage unavailable */ }
  };
  // Custom range, both ends inclusive ('YYYY-MM-DD'). Defaults to this month so far.
  const [customRange, setCustomRangeState] = React.useState<{ from: string; to: string }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('divido_personal_custom') || 'null');
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v.from) && /^\d{4}-\d{2}-\d{2}$/.test(v.to) && v.from <= v.to) return v;
    } catch { /* storage unavailable / bad JSON */ }
    const today = todayDayKey(new Date());
    return { from: `${today.slice(0, 8)}01`, to: today };
  });
  const setCustomRange = (r: { from: string; to: string }) => {
    setCustomRangeState(r);
    try { localStorage.setItem('divido_personal_custom', JSON.stringify(r)); } catch { /* storage unavailable */ }
  };
  const periodExps = React.useMemo(
    () => (spendPeriod === 'custom'
      ? filterByDayRange(personalExps, customRange.from, customRange.to)
      : filterByPeriod(personalExps, spendPeriod, new Date())),
    [personalExps, spendPeriod, customRange]
  );
  const currentPeriodLabel = spendPeriod === 'custom'
    ? customRangeLabel(customRange.from, customRange.to)
    : periodLabel(spendPeriod, new Date());
  // Pill dropdown + custom-range editor.
  const [periodMenuOpen, setPeriodMenuOpen] = React.useState(false);
  const [customDraft, setCustomDraft] = React.useState<{ from: string; to: string } | null>(null);
  const [customError, setCustomError] = React.useState('');
  const periodSpend = React.useMemo(
    () => personalSpendByCurrency(periodExps, isMe, defaultCurrency),
    [periodExps, isMe, defaultCurrency]
  );

  React.useEffect(() => { setPersonTab('activity'); }, [profilePerson]);

  // Phone/browser back closes the open profile (returns to the list) instead of
  // leaving the non-group screen entirely.
  React.useEffect(() => {
    if (!profilePerson) return;
    try { sessionStorage.setItem('dv_ng_person', profilePerson); sessionStorage.setItem('dv_ng_person_keys', profileKeys.join(',')); } catch { /* ignore */ }
    // After a refresh the entry is already there; don't stack a second one.
    if (!(window.history.state && window.history.state.dividoNonGroupProfile)) window.history.pushState({ dividoNonGroupProfile: true }, '');
    // Landing back ON this screen's entry (e.g. a menu above it closed) must
    // not close the person; only stepping back past it does.
    const onPop = (e: PopStateEvent) => { if (e.state && e.state.dividoNonGroupProfile) return; setProfilePerson(null); };
    // The top-bar back arrow asks first; while a person is open it closes
    // them (pops the entry pushed above) instead of leaving Non-Group.
    const onHeaderBack = (ev: Event) => { ev.preventDefault(); window.history.back(); };
    // Bottom "+ Expense" while a person is open → prefill them.
    const onAddExpense = (ev: Event) => {
      if (!onAddWithPerson) return;
      ev.preventDefault();
      const t = profilePersonThread.current;
      onAddWithPerson(profilePerson, t, profileKeys);
    };
    // Header share icon (shown only while a person is open) → invite them.
    const onSharePersonEv = () => {
      if (onSharePerson) onSharePerson(profilePerson, profilePersonThread.current, profileKeys);
    };
    window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: !!onSharePerson, name: shown(profilePerson), email: people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase())?.email || '', avatar: avatarFor(profilePerson, people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase())?.email), avatarBg: AVATAR_BG[(cleanName(profilePerson).charCodeAt(0) || 0) % AVATAR_BG.length], status: personStatus(profilePerson) } }));
    window.addEventListener('divido:share-person', onSharePersonEv);
    window.addEventListener('popstate', onPop);
    window.addEventListener('divido:header-back', onHeaderBack);
    window.addEventListener('divido:add-expense', onAddExpense);
    return () => {
      try { sessionStorage.removeItem('dv_ng_person'); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: false } }));
      window.removeEventListener('divido:share-person', onSharePersonEv);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('divido:header-back', onHeaderBack);
      window.removeEventListener('divido:add-expense', onAddExpense);
    };
  }, [profilePerson]);

  // Phone/browser back closes the personal-expenses screen (returns to the
  // list) instead of leaving the non-group screen entirely. Mirrors the
  // profile-person effect above, minus the share icon (nothing to invite).
  // Keyed ONLY on personalMode: onAddPersonal is a new function on every App
  // render, and re-running this effect re-pushed a history entry mid-back,
  // which broke back-swipe (Android exited the app). Read it via a ref.
  const onAddPersonalRef = React.useRef(onAddPersonal);
  onAddPersonalRef.current = onAddPersonal;
  React.useEffect(() => {
    if (!personalMode) return;
    try { sessionStorage.setItem('dv_personal_open', '1'); } catch { /* ignore */ }
    // After a refresh the entry is already there; don't stack a second one.
    if (!(window.history.state && window.history.state.dividoPersonalExpenses)) window.history.pushState({ dividoPersonalExpenses: true }, '');
    const onPop = (e: PopStateEvent) => { if (e.state && e.state.dividoPersonalExpenses) return; setPersonalMode(false); };
    const onHeaderBack = (ev: Event) => { ev.preventDefault(); window.history.back(); };
    // Bottom "+ Expense" while personal expenses are open → log a new one.
    const onAddExpense = (ev: Event) => {
      const add = onAddPersonalRef.current;
      if (!add) return;
      ev.preventDefault();
      add();
    };
    // personal: true → header swaps "Non-Group" for my DP + "You".
    window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: false, personal: true } }));
    window.addEventListener('popstate', onPop);
    window.addEventListener('divido:header-back', onHeaderBack);
    window.addEventListener('divido:add-expense', onAddExpense);
    return () => {
      try { sessionStorage.removeItem('dv_personal_open'); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: false, personal: false } }));
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('divido:header-back', onHeaderBack);
      window.removeEventListener('divido:add-expense', onAddExpense);
    };
  }, [personalMode]);

  const directGroupIds = React.useMemo(() => new Set(directThreads.map((t) => String(t.groupId))), [directThreads]);

  // Does an expense involve this person (by paid or splitter)?
  const expenseInvolves = React.useCallback((e: Expense, lowerName: string) => {
    if (cleanName(e.paid).toLowerCase() === lowerName) return true;
    return (e.splitters || []).some((s) => cleanName(s).toLowerCase() === lowerName);
  }, []);

  // Non-group expenses = plain STANDALONE ones PLUS any in a shared 2-person
  // "direct" thread. Newest first.
  const nonGroupExps = React.useMemo(
    () =>
      expenses
        .filter((e) => e && !e.isDeleted && (String(e.gId) === 'STANDALONE' || directGroupIds.has(String(e.gId))))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [expenses, directGroupIds]
  );

  // One entry per OTHER person, from the canonical engine (shared with Home).
  const people = React.useMemo(
    () => computeNonGroupPeople(expenses, directThreads, isMe, getMemberBalance),
    [expenses, directThreads, isMe, getMemberBalance]
  );

  // "Yet to join" banner — same idea as the home one (lib/joinProgress skips
  // direct threads, so Non-Group counts its own). Joined = claimed the shared
  // link; everyone else (invited, or never shared) is yet to join.
  const ngJoinPending = React.useMemo(() => people.filter((p) => !(p.directGroupId && !p.pending)), [people]);
  const ngJoinedN = people.length - ngJoinPending.length;
  const NG_JOIN_SNOOZE_KEY = 'divido_ng_join_snooze';
  const [ngJoinSnooze, setNgJoinSnooze] = React.useState<{ until: number; count: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(NG_JOIN_SNOOZE_KEY) || 'null'); } catch { return null; }
  });
  // × hides it for a week, unless MORE people become yet-to-join.
  const ngJoinSnoozed = !!ngJoinSnooze && Date.now() < ngJoinSnooze.until && ngJoinPending.length <= ngJoinSnooze.count;
  const showNgJoinBanner = !!onSharePerson && ngJoinPending.length > 0 && !ngJoinSnoozed;
  const dismissNgJoinBanner = () => {
    const s = { until: Date.now() + 7 * 86400000, count: ngJoinPending.length };
    setNgJoinSnooze(s);
    try { localStorage.setItem(NG_JOIN_SNOOZE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  };
  const [showNgJoinSheet, setShowNgJoinSheet] = React.useState(false);
  // Per-row "Shared ✓" for 2s after tapping Invite (like the home sheet).
  const [ngInvited, setNgInvited] = React.useState<Record<string, boolean>>({});
  const inviteNgPerson = (name: string, directGroupId?: string) => {
    if (!onSharePerson) return;
    onSharePerson(name, directGroupId);
    setNgInvited((prev) => ({ ...prev, [name]: true }));
    setTimeout(() => setNgInvited((prev) => { const next = { ...prev }; delete next[name]; return next; }), 2000);
  };

  // Options sheet → "Share Link": with a person open, share them directly (same
  // as the header share icon); otherwise pick who to share with.
  const [showSharePicker, setShowSharePicker] = React.useState(false);
  React.useEffect(() => {
    const on = () => {
      if (!onSharePerson) return;
      if (profilePerson) onSharePerson(profilePerson, profilePersonThread.current, profileKeys);
      else setShowSharePicker(true);
    };
    window.addEventListener('divido:nongroup-share', on);
    return () => window.removeEventListener('divido:nongroup-share', on);
  }, [profilePerson, onSharePerson]);

  // Options sheet → "Delete Non-Group": the open person's request is rebuilt
  // every render (below), so the listener always sees the current balance.
  const deleteRequestRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    const on = () => deleteRequestRef.current?.();
    window.addEventListener('divido:nongroup-delete', on);
    return () => window.removeEventListener('divido:nongroup-delete', on);
  }, []);

  const searchLower = searchQuery.trim().toLowerCase();
  const [balFilter, setBalFilter] = React.useState<'pay' | 'collect' | null>(null);
  const shownPeople = React.useMemo(() => {
    const byBal = balFilter
      ? people.filter((p) => myPerspective(p.bal).some((l) => (balFilter === 'pay' ? l.amount < 0 : l.amount > 0)))
      : people;
    if (!searchLower) return byBal;
    return byBal.filter((p) => {
      if (p.name.toLowerCase().includes(searchLower) || p.email.toLowerCase().includes(searchLower)) return true;
      if (matchesAmount(searchLower, Object.entries(p.bal))) return true;
      const keys = p.aliases.map((a) => a.toLowerCase());
      if (keys.some((k) => k.includes(searchLower))) return true;
      const theirs = nonGroupExps.filter((e) => keys.some((k) => expenseInvolves(e, k)));
      if (theirs.some((e) => matchesAmount(searchLower, [[e.currency || '₹', e.amt || 0]]))) return true;
      return theirs.some((e) => (e.title || '').toLowerCase().includes(searchLower));
    });
  }, [people, searchLower, nonGroupExps, expenseInvolves, balFilter]);

  // The pinned "You" row is a permanent entry point (shown even with zero
  // personal expenses) — search only hides it when nothing could match, and
  // it never appears under a balance filter (personal expenses have no
  // counterpart balance).
  const personalMatchesSearch =
    !searchLower ||
    'you'.includes(searchLower) ||
    'personal'.includes(searchLower) ||
    meLower.includes(searchLower) ||
    personalExps.some(
      (e) => (e.title || '').toLowerCase().includes(searchLower) || matchesAmount(searchLower, [[e.currency || defaultCurrency, e.amt || 0]])
    );
  const showPersonalRow = !balFilter && personalMatchesSearch;

  // Header details page chip: no shared thread yet → 'private'; shared but
  // not claimed → 'pending'; claimed → 'joined'.
  const personStatus = (name: string): 'private' | 'pending' | 'joined' => {
    const p = people.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p?.directGroupId) return 'private';
    return p.pending ? 'pending' : 'joined';
  };

  // Pictures are stored by email (member_avatars); name is the fallback.
  const avatarFor = (name: string, email?: string) => (email && memberAvatars?.[email.trim().toLowerCase()]) || memberAvatars?.[name] || memberAvatars?.[cleanName(name)] || '';
  // Pictures load a moment after a refresh: re-send the open person's DP to
  // the header once it arrives (the open-screen effect only sends it once).
  const openPersonEmail = profilePerson ? people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase())?.email || '' : '';
  const openPersonAvatar = profilePerson ? avatarFor(profilePerson, openPersonEmail) : '';
  React.useEffect(() => {
    if (!profilePerson || !openPersonAvatar) return;
    window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: !!onSharePerson, name: shown(profilePerson), email: openPersonEmail, avatar: openPersonAvatar, avatarBg: AVATAR_BG[(cleanName(profilePerson).charCodeAt(0) || 0) % AVATAR_BG.length], status: personStatus(profilePerson) } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilePerson, openPersonAvatar, openPersonEmail]);
  const Avatar: React.FC<{ name: string; email?: string; size?: number }> = ({ name, email, size = 38 }) => {
    const url = avatarFor(name, email);
    if (url) {
      return (
        <img
          src={url}
          alt={cleanName(name)}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      );
    }
    // Match the All-balances avatar: solid colour + a single white initial.
    const idx = (cleanName(name).charCodeAt(0) || 0) % AVATAR_BG.length;
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: AVATAR_BG[idx],
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.4),
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {cleanName(name).charAt(0).toUpperCase()}
      </div>
    );
  };

  // Wording + colours match the All-balances (Friends) cards.
  const balanceText = (bal: Record<string, number>): { text: string; color: string } => {
    const lines = myPerspective(bal);
    if (lines.length === 0) return { text: 'Settled up', color: '#94A3B8' };
    const parts = lines.map((l) => `${l.amount > 0 ? 'You collect' : 'You pay'} ${l.curr}${formatExactAmount(l.amount)}`);
    // Show the primary currency; fold the rest into a compact "+N more" so 2-3
    // currencies don't crowd the row. Colour follows the PRIMARY line's direction
    // (green = collect, red = pay) so it never washes out to grey.
    const text = lines.length > 1 ? `${parts[0]} · +${lines.length - 1} more` : parts[0];
    const color = lines[0].amount > 0 ? '#047857' : '#B91C1C';
    return { text, color };
  };

  // Only a person's screen (set below) offers Delete.
  deleteRequestRef.current = null;

  // ── Personal (self-only) expenses — tap the pinned "You" row ────────────────
  if (personalMode) {
    return (
      <div className="content-width-limit" style={{ paddingTop: '4px' }}>
        {/* Spend pill (same shape as the person screens' balance pill). Tap it
            to pick the period, or a custom date range. */}
        {(() => {
          const lines = Object.entries(periodSpend).filter(([, v]) => v > 0.004);
          const primary = lines.find(([c]) => c === defaultCurrency) || lines[0];
          const others = lines.filter((l) => l !== primary);
          const now = new Date();
          const pillLabel =
            spendPeriod === 'month' ? 'This month'
            : spendPeriod === 'year' ? 'This year'
            : currentPeriodLabel;
          const options: { id: SpendPeriod; label: string; sub?: string }[] = [
            { id: 'month', label: 'This month', sub: periodLabel('month', now) },
            { id: 'year', label: 'This year', sub: periodLabel('year', now) },
            { id: 'fiveYears', label: 'Last 5 years', sub: periodLabel('fiveYears', now) },
            { id: 'all', label: 'All time' },
          ];
          const closeMenu = () => { setPeriodMenuOpen(false); setCustomDraft(null); setCustomError(''); };
          const applyCustom = () => {
            if (!customDraft || !customDraft.from || !customDraft.to) { setCustomError('Pick both dates.'); return; }
            if (customDraft.from > customDraft.to) { setCustomError('Start date must be on or before the end date.'); return; }
            setCustomRange(customDraft);
            setSpendPeriod('custom');
            closeMenu();
          };
          const itemStyle = (active: boolean): React.CSSProperties => ({
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            background: active ? '#F1F5F9' : 'transparent', border: 'none', borderRadius: '10px',
            padding: '9px 10px', cursor: 'pointer', fontSize: '13.5px', fontWeight: active ? 600 : 500, color: '#0F172A', textAlign: 'left',
          });
          const dateInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', color: '#0F172A', background: '#FFFFFF', fontFamily: 'inherit' };
          return (
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={periodMenuOpen}
                aria-label={`Spending period: ${pillLabel}. Change period`}
                onClick={() => (periodMenuOpen ? closeMenu() : setPeriodMenuOpen(true))}
                style={{ width: '100%', background: '#857AA6', color: '#FFFFFF', border: 'none', borderRadius: '14px', padding: '6px 14px', boxShadow: '0 6px 16px rgba(0,0,0,0.06)', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit' }}
              >
                <div style={{ fontSize: '11px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Spent · {pillLabel}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: periodMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {primary ? `${primary[0]}${formatExactAmount(primary[1])}` : `${defaultCurrency}0`}
                  {others.length > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.85 }}>
                      {'  '}{others.map(([c, v]) => `+ ${c}${formatExactAmount(v)}`).join('  ')}
                    </span>
                  )}
                </div>
              </button>

              {periodMenuOpen && (
                <>
                  {/* Tap outside closes the menu. */}
                  <div onClick={closeMenu} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div role="menu" aria-label="Spending period" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 41, background: '#FFFFFF', border: '0.5px solid #E2E8F0', borderRadius: '14px', boxShadow: '0 12px 28px rgba(15,23,42,0.14)', padding: '6px' }}>
                    {customDraft ? (
                      <div style={{ padding: '6px 6px 4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Custom range</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <label style={{ flex: 1, minWidth: 0, fontSize: '11px', fontWeight: 600, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            From
                            <input type="date" value={customDraft.from} max={customDraft.to || undefined} onChange={(e) => { setCustomDraft({ ...customDraft, from: e.target.value }); setCustomError(''); }} style={dateInput} />
                          </label>
                          <label style={{ flex: 1, minWidth: 0, fontSize: '11px', fontWeight: 600, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            To
                            <input type="date" value={customDraft.to} min={customDraft.from || undefined} onChange={(e) => { setCustomDraft({ ...customDraft, to: e.target.value }); setCustomError(''); }} style={dateInput} />
                          </label>
                        </div>
                        {customError && <div role="alert" style={{ fontSize: '12px', color: '#B91C1C' }}>{customError}</div>}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => { setCustomDraft(null); setCustomError(''); }} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '7px 14px', fontSize: '13px', fontWeight: 500, color: '#334155', cursor: 'pointer' }}>Back</button>
                          <button type="button" onClick={applyCustom} style={{ background: '#059669', border: 'none', borderRadius: '10px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}>Apply</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {options.map((o) => {
                          const active = spendPeriod === o.id;
                          return (
                            <button key={o.id} type="button" role="menuitemradio" aria-checked={active} onClick={() => { setSpendPeriod(o.id); closeMenu(); }} style={itemStyle(active)}>
                              <span>{o.label}{o.sub && <span style={{ fontSize: '12px', fontWeight: 400, color: '#94A3B8' }}>{'  '}{o.sub}</span>}</span>
                              {active && <span aria-hidden="true" style={{ color: '#059669', fontWeight: 700 }}>✓</span>}
                            </button>
                          );
                        })}
                        <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 6px' }} />
                        <button type="button" role="menuitemradio" aria-checked={spendPeriod === 'custom'} onClick={() => setCustomDraft({ ...customRange })} style={itemStyle(spendPeriod === 'custom')}>
                          <span>Custom range…{spendPeriod === 'custom' && <span style={{ fontSize: '12px', fontWeight: 400, color: '#94A3B8' }}>{'  '}{currentPeriodLabel}</span>}</span>
                          {spendPeriod === 'custom' && <span aria-hidden="true" style={{ color: '#059669', fontWeight: 700 }}>✓</span>}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Empty state — only before the first personal expense ever. */}
        {personalExps.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '6px', padding: '18px 12px 14px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>🧾</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Track your own spending</div>
            <div style={{ fontSize: '12.5px', color: '#94A3B8', maxWidth: '260px' }}>Doctor visits, bills, shopping — logged just for you, never split.</div>
          </div>
        )}

        {/* Add button — only before the first personal expense; after that the
            bottom "+ Expense" adds a personal one on this screen. */}
        {onAddPersonal && personalExps.length === 0 && (
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => onAddPersonal()}
              style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: '14px', padding: '11px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(5,150,105,0.25)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add personal expense
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(() => {
            // Per-month totals for the headers (primary currency first).
            const monthTotals = new Map<string, Record<string, number>>();
            periodExps.forEach((e) => {
              const { key } = getMonthYearKey(e.date, e.id);
              const c = e.currency || defaultCurrency;
              const t = monthTotals.get(key) || {};
              t[c] = (t[c] || 0) + (Number(e.amt) || 0);
              monthTotals.set(key, t);
            });
            const totalText = (key: string) => {
              const t = Object.entries(monthTotals.get(key) || {}).sort(([a], [b]) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : 0));
              return t.map(([c, v]) => `${c}${formatExactAmount(v)}`).join(' · ');
            };
            let lastKey = '';
            const rows: React.ReactNode[] = [];
            periodExps.forEach((e) => {
              const { key, label } = getMonthYearKey(e.date, e.id);
              if (key !== lastKey) {
                lastKey = key;
                rows.push(
                  <div key={`mh-${key}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#94A3B8', margin: '8px 2px 8px' }}>
                    <span>{label}</span>
                    <span style={{ color: '#64748B' }}>{totalText(key)}</span>
                  </div>
                );
              }
              const curr = e.currency || defaultCurrency;
              const cleanTitle = (e.title || '').replace(/\s*💎\s*$/, '').trim();
              const emoji = getEmoji(e.title) || '⚡';

              rows.push(
                <div key={e.id} className="hover-up-mini" onClick={() => onOpenExpense(e)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', cursor: 'pointer', marginBottom: '12px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>{emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanTitle}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>You paid · {formatDate(e.date)}</div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{curr} {formatExactAmount(Number(e.amt) || 0)}</span>
                </div>
              );
            });
            return rows;
          })()}
          {personalExps.length > 0 && periodExps.length === 0 && (
            <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
              No personal expenses in {currentPeriodLabel}.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Person profile (tap the DP) ──────────────────────────────────────────────
  if (profilePerson) {
    const p = (profileKeys.length ? people.find((x) => (x.keys || []).some((k) => profileKeys.includes(k))) : undefined)
      || people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase() && !(x.keys || []).length)
      || people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase());
    profilePersonThread.current = p?.directGroupId;
    const lines = p ? myPerspective(p.bal) : [];
    const hasBal = lines.length > 0;
    const personPayLines = lines.filter((l) => l.amount < 0);
    const personCollectLines = lines.filter((l) => l.amount > 0);
    // All names this person was saved under (same email ⇒ same person).
    const aliasLower = new Set((p?.aliases || [profilePerson]).map((a) => a.toLowerCase()));
    const theirKeys = new Set(p?.keys || []);
    const theirExps = nonGroupExps.filter((e) => {
      // An expense with a friend id belongs to exactly that friend.
      if (String(e.gId) === 'STANDALONE' && e.otherKey && e.otherKey.startsWith('ngp-')) return theirKeys.has(e.otherKey);
      if (e.paid && aliasLower.has(cleanName(e.paid).toLowerCase())) return true;
      return (e.splitters || []).some((s) => aliasLower.has(cleanName(s).toLowerCase()));
    })
      // Newest date first so each month heading appears once.
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.timestamp || 0) - (a.timestamp || 0));
    const deleteThread = () => {
      if (!onDeletePerson) return;
      (p?.aliases || [profilePerson]).forEach((a, i) => onDeletePerson(a, i === 0 ? p?.directGroupId : undefined, p?.keys));
      setProfilePerson(null);
    };
    deleteRequestRef.current = onRequestDeletePerson && onDeletePerson
      ? () => onRequestDeletePerson({
          name: shown(profilePerson),
          balanceText: lines.map((l) => `${l.curr}${formatExactAmount(Math.abs(l.amount))} to ${l.amount < 0 ? 'pay' : 'collect'}`).join(', '),
          onSettle: () => onSettlePerson(profilePerson, p?.directGroupId, p?.email, p?.keys),
          onDelete: deleteThread,
        })
      : null;
    return (
      <div
        className="content-width-limit"
        style={{ paddingTop: '4px', minHeight: '70vh' }}
        onTouchStart={(e) => { personSwipeX.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const st = personSwipeX.current;
          personSwipeX.current = null;
          if (!st) return;
          const dx = e.changedTouches[0].clientX - st.x;
          const dy = e.changedTouches[0].clientY - st.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
          setPersonTab(dx < 0 ? 'photos' : 'activity');
        }}
      >

        {/* Net balance card — tap for the summary, with "Settle up" inside */}
        <NetBalanceTiles
          style={{ marginBottom: '14px' }}
          pay={hasBal && personPayLines.length > 0 ? personPayLines[0].curr + formatExactAmount(Math.abs(personPayLines[0].amount)) : undefined}
          payMore={personPayLines.length - 1}
          collect={hasBal && personCollectLines.length > 0 ? personCollectLines[0].curr + formatExactAmount(Math.abs(personCollectLines[0].amount)) : undefined}
          collectMore={personCollectLines.length - 1}
          payLines={personPayLines}
          collectLines={personCollectLines}
          summaryAction={{ label: 'Settle up', onClick: () => onSettlePerson(profilePerson, p?.directGroupId, p?.email, p?.keys) }}
        />

        {/* Activities / Photos toggle (swipeable) — like the group page */}
        <div style={{ display: 'flex', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '999px', padding: '3px', gap: '2px', margin: '4px 0 14px' }}>
          {([{ id: 'activity', label: 'Activities' }, { id: 'photos', label: 'Photos' }] as const).map((tab) => {
            const on = tab.id === personTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPersonTab(tab.id)}
                style={{ flex: 1, border: 'none', background: on ? '#FFFFFF' : 'transparent', color: on ? '#0F172A' : '#64748B', fontWeight: on ? 700 : 600, fontSize: '14px', borderRadius: '999px', padding: '7px 0', cursor: 'pointer', boxShadow: on ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', transition: '0.2s all ease' }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {personTab === 'photos' ? (() => {
          const theirPhotos = theirExps.flatMap((e) => (e.attachments || []).map((url) => ({ url, exp: e })));
          const addTheirPhoto = (photo: NonGroupPhoto) => onAddPhoto?.(photo, { name: profilePerson, directGroupId: profilePersonThread.current, keys: p?.keys });
          return theirPhotos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              {onAddPhoto && <NonGroupPhotoUpload variant="button" onSave={addTheirPhoto} />}
              <p style={{ fontSize: '13px', color: '#94A3B8', margin: '14px 0 0' }}>No photos yet. Upload one, or attach a receipt to an expense with {shown(profilePerson)}.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '8px' }}>
              {onAddPhoto && <NonGroupPhotoUpload variant="tile" onSave={addTheirPhoto} />}
              {theirPhotos.map((ph, i) => (
                <div key={`${ph.exp.id}-${i}`} onClick={() => onOpenExpense(ph.exp)} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #E2E8F0' }}>
                  <img src={ph.url} alt={ph.exp.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          );
        })() : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(() => {
            let lastKey = '';
            const rows: React.ReactNode[] = [];
            theirExps.forEach((e) => {
              const { key, label } = getMonthYearKey(e.date, e.id);
              if (key !== lastKey) {
                lastKey = key;
                rows.push(
                  <div key={`mh-${key}`} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#94A3B8', margin: '8px 2px 8px' }}>{label}</div>
                );
              }
              const curr = e.currency || defaultCurrency;
              const iPaid = isMe(e.paid);
              const isSettlement =
                (e.title || '').includes('Settlement') ||
                (e.title || '').includes('Payment Recorded') ||
                e.category === '💸' ||
                e.category === '✅' ||
                e.category === '🤝' ||
                e.title === 'Payment Recorded';

              const cleanTitle = isSettlement
                ? (e.title === 'Payment Recorded' ? 'Payment Recorded' : 'Settlement')
                : (e.title || '').replace(/\s*💎\s*$/, '').trim();

              const emoji = isSettlement
                ? (e.title === 'Payment Recorded' ? '⚡' : (getEmoji(e.title) || '💸'))
                : (getEmoji(e.title) || '⚡');

              rows.push(
                <div key={e.id} className="hover-up-mini" onClick={() => onOpenExpense(e)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', cursor: 'pointer', marginBottom: '12px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>{emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanTitle}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{iPaid ? 'You paid' : `${shown(cleanName(e.paid))} paid`} · {formatDate(e.date)}</div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{curr} {formatExactAmount(Number(e.amt) || 0)}</span>
                </div>
              );
            });
            return rows;
          })()}
          {theirExps.length === 0 && (
            <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>No activities yet.</p>
          )}
          {onDeletePerson && theirExps.length > 0 && (
            hasBal ? (
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                Settle up to delete these expenses
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete all expenses with ${profilePerson}? This can't be undone.`)) deleteThread();
                }}
                style={{ display: 'block', margin: '8px auto 2px', background: 'none', border: 'none', color: '#94A3B8', fontSize: '11.5px', fontWeight: 500, cursor: 'pointer', textAlign: 'center' }}
                onMouseEnter={(ev) => (ev.currentTarget.style.color = '#EF4444')}
                onMouseLeave={(ev) => (ev.currentTarget.style.color = '#94A3B8')}
              >
                Delete all expenses with {profilePerson}
              </button>
            )
          )}
        </div>
        )}
      </div>
    );
  }

  // ── People list (front page) ─────────────────────────────────────────────────
  // The top bar (back + "Non-Group Expenses" title) is provided by MobileHeader,
  // so this view starts at the net-balance card.

  // My overall non-group position: sum every person's balance from MY perspective
  // across BOTH buckets (private STANDALONE + shared threads). Summing only
  // STANDALONE wrongly showed "All settled up" when the balances live in shared
  // threads.
  const netByCurr: Record<string, number> = {};
  people.forEach((p) => myPerspective(p.bal).forEach((l) => { netByCurr[l.curr] = (netByCurr[l.curr] || 0) + l.amount; }));
  const netLines = Object.entries(netByCurr)
    .map(([curr, amount]) => ({ curr, amount }))
    .filter((x) => Math.abs(x.amount) > 0.01);
  const netHasBalance = netLines.length > 0;
  const frontPayLines = netLines.filter((l) => l.amount < 0);
  const frontCollectLines = netLines.filter((l) => l.amount > 0);

  // Every receipt/photo attached to a non-group expense, newest first.
  const photos = nonGroupExps.flatMap((e) =>
    (e.attachments || []).map((url) => ({ url, exp: e }))
  );

  // Pinned "You" row subtitle — primary currency spent (defaultCurrency wins
  // ties), folding any others into a compact "+N more".
  const personalSpendLines = Object.entries(personalSpend).filter(([, v]) => v > 0.004);
  const personalPrimary = personalSpendLines.find(([c]) => c === defaultCurrency) || personalSpendLines[0];
  const personalSubtitle = !personalPrimary
    ? ''
    : `${personalPrimary[0]}${formatExactAmount(personalPrimary[1])} spent${personalSpendLines.length > 1 ? ` · +${personalSpendLines.length - 1} more` : ''}`;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Horizontal swipe only (ignore vertical scrolls).
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) setActiveTab('photos');
    else setActiveTab('settle');
  };

  return (
    // Swipe anywhere on the screen (like the group page), not only on the
    // list — an empty Photos tab left almost nothing to swipe on.
    <div className="content-width-limit" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ minHeight: '70vh' }}>
      {/* Cloud-backup restore banner — only when this device has NO non-group
          expenses at all (the real "new device / after a wipe" case). Once you
          already have data, a stale backup entry shouldn't nag you. */}
      {backupMissingCount > 0 && onRestoreBackup && nonGroupExps.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '14px', padding: '12px 14px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>☁️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A8A' }}>Restore from backup</div>
            <div style={{ fontSize: '11.5px', color: '#3B82F6' }}>{backupMissingCount} non-group {backupMissingCount === 1 ? 'expense' : 'expenses'} saved in your cloud backup.</div>
          </div>
          <button
            type="button"
            onClick={onRestoreBackup}
            style={{ border: 'none', background: '#2563EB', color: '#FFFFFF', borderRadius: '10px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            Restore
          </button>
        </div>
      )}

      {/* Yet-to-join banner — same look as the home one. */}
      {showNgJoinBanner && (() => {
        const pendingN = ngJoinPending.length;
        const totalN = Math.max(people.length, 1);
        const pct = Math.round((ngJoinedN / totalN) * 100);
        const sub = pendingN <= 2 && ngJoinedN > 0 ? `Almost there — ${pendingN} to go!` : `${ngJoinedN} of ${people.length} joined`;
        return (
          <div
            className="card shadow-sm hover-up-mini"
            onClick={() => setShowNgJoinSheet(true)}
            style={{ background: 'var(--w)', border: '1.5px solid var(--bg)', borderRadius: '18px', padding: '10px 12px 10px 10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)', animation: 'fadeIn 0.4s ease-out', cursor: 'pointer' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '17px' }}>🎯</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.1px' }}>
                {pendingN} friend{pendingN === 1 ? '' : 's'} yet to join
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Friends joined" style={{ flex: 1, height: '6px', borderRadius: '999px', background: '#EDE9FE', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg, #34D399, #059669)', transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--g)', whiteSpace: 'nowrap', flexShrink: 0 }}>{sub}</span>
              </div>
            </div>
            <span style={{ color: '#7C3AED', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>Invite →</span>
            <span
              onClick={(e) => { e.stopPropagation(); dismissNgJoinBanner(); }}
              style={{ color: '#94A3B8', fontSize: '18px', fontWeight: 600, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}
              title="Dismiss"
            >
              ×
            </span>
          </div>
        );
      })()}

      {showNgJoinSheet && (
        <div
          onClick={() => setShowNgJoinSheet(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: '24px', marginBottom: '6px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '2px' }} />
              <button type="button" onClick={() => setShowNgJoinSheet(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', margin: '-4px -4px 0 0', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>Get everyone in</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', marginBottom: '14px' }}>
              {ngJoinPending.length} friend{ngJoinPending.length === 1 ? '' : 's'} yet to join
            </div>
            {ngJoinPending.length === 0 ? (
              <div style={{ fontSize: '14px', color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>Everyone's in! 🎉</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {ngJoinPending.map((p, idx) => {
                  const invited = !!ngInvited[p.name];
                  return (
                    <div key={(p.keys && p.keys[0]) || p.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: idx < ngJoinPending.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <Avatar name={p.name} email={p.email} size={38} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown(p.name)}</span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: p.email ? '#64748B' : '#B8AEA2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email || 'No email'}</span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#94A3B8' }}>{p.directGroupId ? "Invited · hasn't opened the link" : 'Not shared yet'}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Invite ${shown(p.name)}`}
                        disabled={invited}
                        onClick={() => inviteNgPerson(p.name, p.directGroupId)}
                        style={{ flexShrink: 0, background: invited ? '#D1FAE5' : '#7C3AED', color: invited ? '#047857' : '#FFFFFF', border: 'none', borderRadius: '999px', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: invited ? 'default' : 'pointer' }}
                      >
                        {invited ? 'Shared ✓' : 'Invite'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Net balance card — styled to match the home page pill */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px' }}>
          Net Balance
        </div>
        <NetBalanceTiles
          pay={netHasBalance && frontPayLines.length > 0 ? frontPayLines[0].curr + formatExactAmount(Math.abs(frontPayLines[0].amount)) : undefined}
          payMore={frontPayLines.length - 1}
          collect={netHasBalance && frontCollectLines.length > 0 ? frontCollectLines[0].curr + formatExactAmount(Math.abs(frontCollectLines[0].amount)) : undefined}
          collectMore={frontCollectLines.length - 1}
          payLines={frontPayLines}
          collectLines={frontCollectLines}
          active={balFilter}
          onSummaryFilter={(f) => { setBalFilter(f === 'all' ? null : f); setActiveTab('settle'); }}
          onPayClick={() => { setBalFilter((f) => (f === 'pay' ? null : 'pay')); setActiveTab('settle'); }}
          onCollectClick={() => { setBalFilter((f) => (f === 'collect' ? null : 'collect')); setActiveTab('settle'); }}
        />
        {balFilter && (
          <button
            onClick={() => setBalFilter(null)}
            style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px 5px 12px', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, background: '#F1F5F9', color: '#334155' }}
          >
            {balFilter === 'pay' ? 'To pay' : 'To collect'} <span style={{ fontSize: '13px' }}>✕</span>
          </button>
        )}
      </div>

      <NetBalanceDetailsSheet
        isOpen={showFrontNetSheet}
        onClose={() => setShowFrontNetSheet(false)}
        payLines={frontPayLines}
        collectLines={frontCollectLines}
      />

      {showSharePicker && (
        <div
          onClick={() => setShowSharePicker(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', margin: '0 auto 14px' }} />
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '8px' }}>Share with</div>
            {people.length === 0 ? (
              <div style={{ fontSize: '14px', color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>No one to share with yet</div>
            ) : (
              people.map((p) => (
                <button
                  key={(p.keys && p.keys[0]) || p.name}
                  type="button"
                  onClick={() => { setShowSharePicker(false); onSharePerson?.(p.name, p.directGroupId, p.keys); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '10px 4px', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Avatar name={p.name} email={p.email} size={34} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#2E2A25', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown(p.name)}</span>
                    {p.email && <span style={{ fontSize: '12px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Friends / Photos toggle (swipeable) — matches the home Groups/Activities tabs */}
      <div style={{ marginBottom: '14px', marginTop: '4px' }}>
        <div
          style={{
            display: 'flex',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: '999px',
            padding: '3px',
            gap: '2px',
          }}
        >
          {([{ id: 'settle', label: 'Friends' }, { id: 'photos', label: 'Photos' }] as const).map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  position: 'relative',
                  border: 'none',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#0F172A' : '#64748B',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: '14px',
                  borderRadius: '999px',
                  padding: '7px 0',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  transition: '0.2s all ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ minHeight: '80px' }}>
        {activeTab === 'settle' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {showPersonalRow && (
              <div
                role="button"
                tabIndex={0}
                className="hover-up-mini"
                onClick={() => { setProfilePerson(null); setPersonalMode(true); }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setProfilePerson(null); setPersonalMode(true); }
                }}
                aria-label={`Personal expenses, ${personalPrimary ? personalSubtitle : 'none yet'}`}
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}
              >
                <img
                  src="/divido_laughing_cat_mascot_1778063273427.png"
                  alt=""
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#2E2A25', margin: 0 }}>You</h3>
                  </div>
                  {personalSubtitle && <span style={{ fontSize: '12.5px', fontWeight: 400, color: '#64748B' }}>{personalSubtitle}</span>}
                </div>
                {onAddPersonal && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onAddPersonal(); }}
                    aria-label="Add personal expense"
                    style={{ flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%', background: '#059669', color: '#FFFFFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 2px 6px rgba(5,150,105,0.25)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ width: '15px', height: '15px' }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
                <span style={{ display: 'flex', alignItems: 'center', color: '#94A3B8', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </span>
              </div>
            )}
            {people.length === 0 && !showPersonalRow && (
              <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
                No non-group expenses yet. Add a quick expense with someone and it'll show up here.
              </p>
            )}
            {people.length > 0 && (
              <>
                {searchLower && shownPeople.length === 0 && !showPersonalRow && (
                  <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
                    No one matches "{searchQuery.trim()}".
                  </p>
                )}
                {shownPeople.map((p) => {
                const b = balanceText(p.bal);
                return (
                  <div
                    key={(p.keys && p.keys[0]) || p.name}
                    style={{ background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', overflow: 'hidden' }}
                  >
                    {/* Tap the card to open this person's screen */}
                    <div
                      className="hover-up-mini"
                      onClick={() => { setPersonalMode(false); setProfileKeys(p.keys || []); setProfilePerson(p.name); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        <Avatar name={p.name} email={p.email} size={40} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#2E2A25', margin: 0, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{shown(p.name)}</h3>
                        </div>
                        {p.email && (
                          <span style={{ fontSize: '12px', fontWeight: 400, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</span>
                        )}
                        <span style={{ fontSize: '12.5px', fontWeight: 400, color: b.color }}>{b.text}</span>
                      </div>
                      {onAddWithPerson && (
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); onAddWithPerson(p.name, p.directGroupId, p.keys); }}
                          title={`Add expense with ${shown(p.name)}`}
                          style={{ flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%', background: '#059669', color: '#FFFFFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 2px 6px rgba(5,150,105,0.25)' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ width: '15px', height: '15px' }}>
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', color: '#94A3B8', flexShrink: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  );
                })}
              </>
            )}
          </div>
        ) : photos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            {onAddPhoto && <NonGroupPhotoUpload variant="button" onSave={(photo) => onAddPhoto(photo)} />}
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: '14px 0 0' }}>
              No receipts yet. Upload one, or attach a photo to a non-group expense.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '8px' }}>
            {onAddPhoto && <NonGroupPhotoUpload variant="tile" onSave={(photo) => onAddPhoto(photo)} />}
            {photos.map((ph, i) => (
              <div
                key={`${ph.exp.id}-${i}`}
                onClick={() => onOpenExpense(ph.exp)}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #E2E8F0' }}
              >
                <img src={ph.url} alt={ph.exp.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const profileBtn: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  padding: '10px',
  borderRadius: '10px',
  border: '0.5px solid #CBD5E1',
  background: '#FFFFFF',
  color: '#334155',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};
