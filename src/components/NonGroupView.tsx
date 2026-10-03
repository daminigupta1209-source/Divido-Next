import React from 'react';
import { NetBalanceTiles } from './NetBalanceTiles';
import type { Expense } from '../lib/types';
import { formatDate, getEmoji, formatExactAmount, getMonthYearKey } from '../lib/utils';

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
  directThreads?: { groupId: string; otherName: string; email: string; pending: boolean }[];
  onBack: () => void;
  onOpenExpense: (exp: Expense) => void;
  onSettlePerson: (name: string, directGroupId?: string) => void;
  onRemindPerson?: (name: string) => void;
  onAddWithPerson?: (name: string, directGroupId?: string) => void;
  onSharePerson?: (name: string, directGroupId?: string) => void;
  // How many backed-up non-group expenses aren't present locally (for restore).
  backupMissingCount?: number;
  onRestoreBackup?: () => void;
  onClearAll?: () => void;
  onCleanupEmpty?: () => void;
  onDeletePerson?: (name: string, directGroupId?: string) => void;
  // Header search text: filters the people list by name, email or expense name.
  searchQuery?: string;
}

const cleanName = (n: string) => (n || '').replace(/\s*\(Left\)$/i, '').trim();

// Same solid avatar palette as the All-balances (Friends) view.
const AVATAR_BG = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];

const fmt = (v: number) => {
  const abs = Math.abs(v);
  return abs.toFixed(2).replace(/\.00$/, '');
};

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
  backupMissingCount = 0,
  onRestoreBackup,
  onClearAll,
  onCleanupEmpty,
  onDeletePerson,
  onSharePerson,
  searchQuery = '',
}) => {
  // Bottom toggle on the front page: Settle | Photos (swipe left/right).
  const [activeTab, setActiveTab] = React.useState<'settle' | 'photos'>('settle');
  // Which person's full profile page is open (tapping their DP/avatar).
  const [profilePerson, setProfilePerson] = React.useState<string | null>(null);
  const [showFrontNetSheet, setShowFrontNetSheet] = React.useState(false);
  // Shared-thread id of the open person (set while rendering their screen).
  const profilePersonThread = React.useRef<string | undefined>(undefined);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const meLower = cleanName(me).toLowerCase();

  const isMe = React.useCallback(
    (name: string) => {
      const c = cleanName(name).toLowerCase();
      if (!c) return false;
      if (c === 'you' || c === meLower) return true;
      if (userName && c === cleanName(userName).toLowerCase()) return true;
      if (c.startsWith(meLower + ' ') || c.endsWith(' ' + meLower)) return true;
      return false;
    },
    [meLower, userName]
  );

  // Phone/browser back closes the open profile (returns to the list) instead of
  // leaving the non-group screen entirely.
  React.useEffect(() => {
    if (!profilePerson) return;
    window.history.pushState({ dividoNonGroupProfile: true }, '');
    const onPop = () => setProfilePerson(null);
    // The top-bar back arrow asks first; while a person is open it closes
    // them (pops the entry pushed above) instead of leaving Non-Group.
    const onHeaderBack = (ev: Event) => { ev.preventDefault(); window.history.back(); };
    // Bottom "+ Expense" while a person is open → prefill them.
    const onAddExpense = (ev: Event) => {
      if (!onAddWithPerson) return;
      ev.preventDefault();
      const t = profilePersonThread.current;
      onAddWithPerson(profilePerson, t);
    };
    // Header share icon (shown only while a person is open) → invite them.
    const onSharePersonEv = () => {
      if (onSharePerson) onSharePerson(profilePerson, profilePersonThread.current);
    };
    window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: !!onSharePerson } }));
    window.addEventListener('divido:share-person', onSharePersonEv);
    window.addEventListener('popstate', onPop);
    window.addEventListener('divido:header-back', onHeaderBack);
    window.addEventListener('divido:add-expense', onAddExpense);
    return () => {
      window.dispatchEvent(new CustomEvent('divido:nongroup-person', { detail: { open: false } }));
      window.removeEventListener('divido:share-person', onSharePersonEv);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('divido:header-back', onHeaderBack);
      window.removeEventListener('divido:add-expense', onAddExpense);
    };
  }, [profilePerson]);

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

  // One entry per OTHER person. Balance is combined across both buckets (their
  // plain STANDALONE net + their net in a shared direct thread) via the canonical
  // engine — never hand-rolled.
  const people = React.useMemo(() => {
    type P = { name: string; email: string; standalone: boolean; directGroupId?: string; otherNameInGroup?: string; pending: boolean };
    const byName = new Map<string, P>();
    // Seed shared (direct) threads first so pending/email are captured.
    directThreads.forEach((t) => {
      const c = cleanName(t.otherName);
      if (!c || isMe(c)) return;
      const key = c.toLowerCase();
      const ex = byName.get(key);
      if (ex) {
        ex.directGroupId = String(t.groupId);
        ex.otherNameInGroup = t.otherName;
        ex.pending = ex.pending || t.pending;
        if (!ex.email && t.email) ex.email = t.email;
      } else {
        byName.set(key, { name: c, email: t.email || '', standalone: false, directGroupId: String(t.groupId), otherNameInGroup: t.otherName, pending: t.pending });
      }
    });
    // Add plain STANDALONE participants.
    expenses
      .filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted)
      .forEach((e) => {
        const names = new Set<string>();
        if (e.paid) names.add(e.paid);
        (e.splitters || []).forEach((s) => names.add(s));
        const otherEmail = (e.otherEmail || '').trim().toLowerCase();
        names.forEach((raw) => {
          const c = cleanName(raw);
          if (!c || isMe(c)) return;
          const key = c.toLowerCase();
          const ex = byName.get(key);
          if (ex) { ex.standalone = true; if (!ex.email && otherEmail.includes('@')) ex.email = otherEmail; }
          else byName.set(key, { name: c, email: otherEmail.includes('@') ? otherEmail : '', standalone: true, pending: false });
        });
      });
    return Array.from(byName.values())
      .map((p) => {
        const key = p.name.toLowerCase();
        const bal: Record<string, number> = {};
        if (p.standalone) Object.entries(getMemberBalance('STANDALONE', p.name)).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
        if (p.directGroupId && p.otherNameInGroup) Object.entries(getMemberBalance(p.directGroupId, p.otherNameInGroup)).forEach(([c, v]) => { bal[c] = (bal[c] || 0) + v; });
        const count = nonGroupExps.filter((e) => expenseInvolves(e, key)).length;
        return { name: p.name, email: p.email, pending: p.pending, directGroupId: p.directGroupId, bal, count };
      })
      // Hide empty leftovers: a person with no expenses AND no balance (e.g. a
      // stray/abandoned direct thread) shouldn't clutter the list.
      .filter((p) => p.count > 0 || Object.values(p.bal).some((v) => Math.abs(v) > 0.01))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [expenses, directThreads, nonGroupExps, isMe, getMemberBalance, expenseInvolves]);

  const searchLower = searchQuery.trim().toLowerCase();
  const shownPeople = React.useMemo(() => {
    if (!searchLower) return people;
    return people.filter((p) => {
      if (p.name.toLowerCase().includes(searchLower) || p.email.toLowerCase().includes(searchLower)) return true;
      const key = p.name.toLowerCase();
      return nonGroupExps.some((e) => expenseInvolves(e, key) && (e.title || '').toLowerCase().includes(searchLower));
    });
  }, [people, searchLower, nonGroupExps, expenseInvolves]);

  const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 38 }) => {
    const url = memberAvatars?.[name] || memberAvatars?.[cleanName(name)];
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
    const parts = lines.map((l) => `${l.amount > 0 ? 'You collect' : 'You pay'} ${l.curr}${fmt(l.amount)}`);
    // Show the primary currency; fold the rest into a compact "+N more" so 2-3
    // currencies don't crowd the row. Colour follows the PRIMARY line's direction
    // (green = collect, red = pay) so it never washes out to grey.
    const text = lines.length > 1 ? `${parts[0]} · +${lines.length - 1} more` : parts[0];
    const color = lines[0].amount > 0 ? '#047857' : '#B91C1C';
    return { text, color };
  };

  // ── Person profile (tap the DP) ──────────────────────────────────────────────
  if (profilePerson) {
    const p = people.find((x) => x.name.toLowerCase() === profilePerson.toLowerCase());
    profilePersonThread.current = p?.directGroupId;
    const lines = p ? myPerspective(p.bal) : [];
    const hasBal = lines.length > 0;
    const personPayLines = lines.filter((l) => l.amount < 0);
    const personCollectLines = lines.filter((l) => l.amount > 0);
    const pLower = profilePerson.toLowerCase();
    const theirExps = nonGroupExps.filter((e) => {
      const names = new Set<string>();
      if (e.paid) names.add(cleanName(e.paid).toLowerCase());
      (e.splitters || []).forEach((s) => names.add(cleanName(s).toLowerCase()));
      return names.has(pLower);
    })
      // Newest date first so each month heading appears once.
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.timestamp || 0) - (a.timestamp || 0));
    return (
      <div className="content-width-limit" style={{ paddingTop: '4px' }}>

        {/* Pair header — you & them */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', position: 'relative', width: '76px', height: '52px', marginBottom: '6px' }}>
            <div style={{ position: 'absolute', left: 0, border: '2px solid #FFFFFF', borderRadius: '50%' }}><Avatar name={me} size={52} /></div>
            <div style={{ position: 'absolute', left: '24px', border: '2px solid #FFFFFF', borderRadius: '50%' }}><Avatar name={profilePerson} size={52} /></div>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>You &amp; {profilePerson}</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
            {p?.email && <span>{p.email}</span>}
          </div>
        </div>

        {/* Net balance card — tap to settle up with this person */}
        <NetBalanceTiles
          style={{ marginBottom: '14px' }}
          pay={hasBal && personPayLines.length > 0 ? personPayLines[0].curr + formatExactAmount(Math.abs(personPayLines[0].amount)) : undefined}
          payMore={personPayLines.length - 1}
          collect={hasBal && personCollectLines.length > 0 ? personCollectLines[0].curr + formatExactAmount(Math.abs(personCollectLines[0].amount)) : undefined}
          collectMore={personCollectLines.length - 1}
          onClick={() => onSettlePerson(profilePerson, p?.directGroupId)}
        />

        {/* Settle = tap the balance card; Invite = share icon in the header. */}
        <div style={{ height: '6px' }} />

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
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{iPaid ? 'You paid' : `${cleanName(e.paid)} paid`} · {formatDate(e.date)}</div>
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
                  if (window.confirm(`Delete all expenses with ${profilePerson}? This can't be undone.`)) { onDeletePerson(profilePerson, p?.directGroupId); setProfilePerson(null); }
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
          onClick={() => setShowFrontNetSheet(true)}
        />
      </div>

      <NetBalanceDetailsSheet
        isOpen={showFrontNetSheet}
        onClose={() => setShowFrontNetSheet(false)}
        payLines={frontPayLines}
        collectLines={frontCollectLines}
      />

      {/* Settle / Photos toggle (swipeable) — matches the home Groups/Activities tabs */}
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
          {([{ id: 'settle', label: 'Settle' }, { id: 'photos', label: 'Photos' }] as const).map((tab) => {
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
          people.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
              No non-group expenses yet. Add a quick expense with someone and it'll show up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {searchLower && shownPeople.length === 0 && (
                <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
                  No one matches "{searchQuery.trim()}".
                </p>
              )}
              {shownPeople.map((p) => {
                const b = balanceText(p.bal);
                return (
                  <div
                    key={p.name}
                    style={{ background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', overflow: 'hidden' }}
                  >
                    {/* Tap the card to open this person's screen */}
                    <div
                      className="hover-up-mini"
                      onClick={() => setProfilePerson(p.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        <Avatar name={p.name} size={40} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2E2A25', margin: 0, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{p.name}</h3>
                        </div>
                        {p.email && (
                          <span style={{ fontSize: '11.5px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</span>
                        )}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: b.color }}>{b.text}</span>
                      </div>
                      {onAddWithPerson && (
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); onAddWithPerson(p.name, p.directGroupId); }}
                          title={`Add expense with ${p.name}`}
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
            </div>
          )
        ) : photos.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
            No receipts yet. Attach a photo to a non-group expense and it'll appear here.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '8px' }}>
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
