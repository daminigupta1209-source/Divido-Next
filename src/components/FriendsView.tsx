import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NetBalanceTiles } from './NetBalanceTiles';
import { BalanceDisplay } from './BalanceDisplay';

import { Group, Expense, UserMetadata, GlobalSettleData } from '../lib/types';
import { simplifyMultiCurrencyDebts, computeRawPairwiseTransactions } from '../lib/calculations';
import { asyncBatchComputeGroups } from '../lib/workerHelper';
import { getPersonKey, resolveSelfKey, toIdentitySpace, withoutEmailTag, buildNameEmailResolver, buildNameIdentityResolver, findDuplicatePeople, isValidEmail, type DuplicateEntry, type DuplicatePerson, shown } from '../lib/identity';
import { worldCurrencies, formatExactAmount, formatCompactAmount } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
import { StyledDropdown } from './StyledDropdown';

// Small translucent count chip for extra currencies in the Net Balance pill.
const pillChipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.28)', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, flexShrink: 0 };

// Review-and-merge screen: one section per duplicate name. The joined
// account's email is the primary (locked); the other pending invites under that
// name are ticked by default and get pointed at the primary on Merge.
const AV_BG = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];

export interface MergeReview {
  name: string;
  primary: string;
  primaryGroups: string[];
  others: DuplicateEntry[];
  /** Set when nobody with this name has joined yet: the user picks the primary. */
  all?: DuplicateEntry[];
}

const MergeRow: React.FC<{
  r: MergeReview;
  onMerge: (entries: DuplicateEntry[], canonicalEmail?: string) => Promise<void>;
  onDismiss: () => void;
}> = ({ r, onMerge, onDismiss }) => {
  const [busy, setBusy] = useState(false);
  // Nobody joined yet → the user can choose which email is the primary.
  const [primary, setPrimary] = useState(r.primary);
  const others = r.all ? r.all.filter((e) => e.email !== primary) : r.others;
  const primaryGroups = r.all ? r.all.filter((e) => e.email === primary).map((e) => e.groupName) : r.primaryGroups;
  const [checked, setChecked] = useState<boolean[]>(() => (r.all || r.others).map(() => true));
  React.useEffect(() => { setChecked(others.map(() => true)); }, [primary]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedCount = checked.filter(Boolean).length;
  const canMerge = selectedCount >= 1 && !busy;
  const toggle = (i: number) => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const bg = AV_BG[(r.name.charCodeAt(0) || 0) % AV_BG.length];

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: bg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 600, flexShrink: 0 }}>
          {r.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: '#1E293B', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown(r.name)}</div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not the same person"
          title="Not the same person"
          style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', flexShrink: 0, cursor: 'pointer', color: '#64748B', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >✕</button>
      </div>
      <div style={{ padding: '9px 0', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#047857', background: '#D1FAE5', borderRadius: '999px', padding: '2px 8px', flexShrink: 0 }}>Primary</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{primary}</span>
        </div>
        <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '3px' }}>{r.all ? 'In' : 'Joined in'} {primaryGroups.join(', ')}</div>
      </div>
      {others.map((e, i) => (
        <label key={i} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: '1px solid #F1F5F9', cursor: 'pointer' }}>
          <span style={{ width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked[i] ? '#10B981' : '#FFFFFF', border: checked[i] ? 'none' : '2px solid #CBD5E1', boxSizing: 'border-box', color: '#FFFFFF', fontSize: '12px', fontWeight: 700 }}>
            {checked[i] ? '✓' : ''}
          </span>
          <span style={{ fontSize: '14px', color: checked[i] ? '#1E293B' : '#94A3B8', flexShrink: 0 }}>{e.groupName}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{e.email || 'no email'}</span>
          {r.all && e.email && (
            <span
              onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setPrimary(e.email); }}
              style={{ fontSize: '11px', fontWeight: 600, color: '#047857', flexShrink: 0, cursor: 'pointer', paddingLeft: '4px' }}
            >Make primary</span>
          )}
        </label>
      ))}
      <button
        disabled={!canMerge}
        onClick={async () => {
          const entries = others.filter((_, i) => checked[i]);
          if (entries.length === 0) return;
          setBusy(true);
          try { await onMerge(entries, primary); } finally { setBusy(false); }
        }}
        style={{ width: '100%', marginTop: '10px', padding: '11px', borderRadius: '12px', border: 'none', background: canMerge ? '#10B981' : '#CBD5E1', color: '#FFFFFF', fontWeight: 600, fontSize: '13.5px', cursor: canMerge ? 'pointer' : 'default' }}
      >
        {busy ? 'Merging…' : selectedCount === 0 ? 'Tick at least 1 to merge' : 'Merge into primary'}
      </button>
    </div>
  );
};

const MergeDuplicatesModal: React.FC<{
  reviews: MergeReview[];
  onClose: () => void;
  onMerge: (entries: DuplicateEntry[], canonicalEmail?: string) => Promise<void>;
  onDismiss: (r: MergeReview) => void;
}> = ({ reviews, onClose, onMerge, onDismiss }) => {
  // Full screen; phone back closes it.
  React.useEffect(() => {
    window.history.pushState({ dividoMergeScreen: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F8FAFC', zIndex: 10001, overflowY: 'auto', padding: '16px 16px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <button type="button" onClick={() => window.history.back()} aria-label="Back" style={{ background: 'none', border: 'none', padding: '4px', margin: '0 0 0 -6px', cursor: 'pointer', color: '#475569', display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 600, color: '#1E293B' }}>Duplicate names</h3>
        </div>

        {reviews.length === 0 && (
          <p style={{ textAlign: 'center', color: '#16A34A', fontWeight: 600, fontSize: '14px', padding: '20px 0' }}>
            All done — no duplicates left.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reviews.map((r) => (
            <MergeRow key={r.name + r.primary} r={r} onMerge={onMerge} onDismiss={() => onDismiss(r)} />
          ))}
        </div>
      </div>
    </div>
  );
};

// Shrink the amount line to fit when the exact figure gets long, so big
// balances (e.g. ₹1,250,000 to collect) always fit on one line instead of
// overflowing or being truncated with an ellipsis — precision is never lost.
const fitAmountFont = (text: string, base: number): number => {
  const n = text.length;
  if (n <= 15) return base;
  if (n <= 19) return base - 1;
  if (n <= 23) return base - 2;
  if (n <= 27) return base - 3;
  return Math.max(base - 4, 9);
};

// Prefer the exact figure and shrink it to fit; but once it would need to go
// below a readable size, round to compact (e.g. ₹1.2M) so the number stays
// legible instead of becoming tiny. base-2 (≈11px) is the readability floor.
const pickAmount = (
  value: number,
  curr: string,
  prefix: string,
  suffix: string,
  base: number,
): { text: string; fontSize: number } => {
  const exact = `${prefix}${curr}${formatExactAmount(value)}${suffix}`;
  const exactFont = fitAmountFont(exact, base);
  if (exactFont >= base - 2) return { text: exact, fontSize: exactFont };
  const compact = `${prefix}${curr}${formatCompactAmount(value)}${suffix}`;
  return { text: compact, fontSize: fitAmountFont(compact, base) };
};

interface FriendsViewProps {
  groups: Group[];
  expenses: Expense[];
  me: string;
  userEmail?: string;
  setView: (view: string) => void;
  setSelectedId: (id: string | number | null) => void;
  setGlobalSettleData: (data: GlobalSettleData | null) => void;
  userMetadata: Record<string, UserMetadata>;
  memberAvatars?: Record<string, string>;
  onMergePeople?: (entries: DuplicateEntry[], canonicalEmail?: string) => void | Promise<void>;
  setUserMetadata: (meta: Record<string, UserMetadata>) => void;
  searchQuery?: string;
  showConvertModal?: boolean;
  setShowConvertModal?: (b: boolean) => void;
  onQuickAddExpense?: (friendName: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  groups,
  expenses,
  me,
  userEmail,
  setView,
  setSelectedId,
  setGlobalSettleData,
  userMetadata,
  memberAvatars,
  onMergePeople,
  setUserMetadata,
  searchQuery = '',
  showConvertModal = false,
  setShowConvertModal = () => {},
  onQuickAddExpense,
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [showFriendsDropdown, setShowFriendsDropdown] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  // Home's Pay / Collect tile opens this list pre-filtered (one-time hint).
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owed' | 'owe'>(() => {
    try {
      const hint = sessionStorage.getItem('divido_friends_filter');
      sessionStorage.removeItem('divido_friends_filter');
      if (hint === 'owe' || hint === 'owed') return hint;
    } catch { /* ignore */ }
    return 'all';
  });
  // Already mounted (kept alive): follow Home's tile taps live too.
  useEffect(() => {
    const on = (e: Event) => {
      const v = (e as CustomEvent).detail;
      if (v === 'owe' || v === 'owed' || v === 'all') setBalanceFilter(v);
      try { sessionStorage.removeItem('divido_friends_filter'); } catch { /* ignore */ }
    };
    window.addEventListener('divido:friends-filter', on);
    return () => window.removeEventListener('divido:friends-filter', on);
  }, []);
  // Tap the Net Balance bar → sheet with every currency + filter choices.
  const [showNetSheet, setShowNetSheet] = useState(false);
  const [convertTo, setConvertTo] = useState<string | null>(null);
  const [rateMap, setRateMap] = useState<Record<string, number>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [convertTarget, setConvertTarget] = useState<string>('');
  const [showConvertPicker, setShowConvertPicker] = useState(false);
  const [manualRates, setManualRates] = useState(false);
  const [sourceCurr, setSourceCurr] = useState<string>('ALL');
  const [showMergeModal, setShowMergeModal] = useState(false);
  // People who appear under one name but with 2+ identities (usually fragmented
  // after an account deletion) — offered for review/merge. Recompute on data.
  const duplicatePeople: DuplicatePerson[] = useMemo(() => findDuplicatePeople(groups, me), [groups, me]);
  // Review cards: same name, 2+ different emails, where exactly ONE email is a
  // joined (signed-in) account. That account is the primary; Merge points the
  // other (pending) invites at it. Two different joined accounts are never
  // offered — they really are separate people.
  const reviewKey = (r: MergeReview) => [r.name.toLowerCase(), r.primary, ...r.others.map((o) => o.email || o.groupId).sort()].join('|');
  const [dismissedReviews, setDismissedReviews] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('divido_merge_dismissed') || '[]'); } catch { return []; }
  });
  const dismissReview = (r: MergeReview) => {
    setDismissedReviews((prev) => {
      const next = [...prev, reviewKey(r)];
      try { localStorage.setItem('divido_merge_dismissed', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const allMergeReviews = useMemo(() => {
    const out: MergeReview[] = [];
    duplicatePeople.forEach((d) => {
      const withEmail = d.entries.filter((e) => e.email);
      if (new Set(withEmail.map((e) => e.email)).size < 2) return;
      const isJoined = (e: DuplicateEntry) => {
        const g = groups.find((x) => String(x.id) === String(e.groupId));
        return !!g && !(g.pendingMembers || []).includes(e.memberName);
      };
      const joinedEmails = new Set(withEmail.filter(isJoined).map((e) => e.email));
      if (joinedEmails.size === 0) {
        // Nobody has joined: offer it, the user chooses the primary email.
        const primary = withEmail[0].email;
        out.push({
          name: d.name,
          primary,
          primaryGroups: withEmail.filter((e) => e.email === primary).map((e) => e.groupName),
          others: d.entries.filter((e) => e.email !== primary),
          all: d.entries,
        });
        return;
      }
      if (joinedEmails.size !== 1) return;
      const primary = [...joinedEmails][0];
      const others = d.entries.filter((e) => e.email !== primary && !isJoined(e));
      if (others.length === 0) return;
      const primaryGroups = withEmail.filter((e) => e.email === primary && isJoined(e)).map((e) => e.groupName);
      out.push({ name: d.name, primary, primaryGroups, others });
    });
    return out;
  }, [duplicatePeople, groups]);
  const mergeReviews = allMergeReviews.filter((r) => !dismissedReviews.includes(reviewKey(r)));

  // Emails the app already knows (from any group's member identities), for the
  // merge sheet's "Merge into this email" autocomplete. Ranked so ones tied to a
  // matching name (exact, then same first name) come first, then all the rest.
  const knownEmails = useMemo(() => {
    const byName: Record<string, Set<string>> = {};
    const all = new Set<string>();
    for (const g of groups || []) {
      const mi = (g as any).memberIdentities || {};
      for (const [nm, id] of Object.entries(mi)) {
        if (typeof id === 'string' && id.includes('@')) {
          const em = id.toLowerCase();
          all.add(em);
          const k = nm.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
          (byName[k] = byName[k] || new Set()).add(em);
        }
      }
    }
    return { byName, all: Array.from(all) };
  }, [groups]);

  const suggestEmails = useMemo(() => (name: string): string[] => {
    const key = name.trim().toLowerCase();
    const first = key.split(' ')[0];
    const exact = knownEmails.byName[key] ? Array.from(knownEmails.byName[key]) : [];
    const firstMatches = Object.entries(knownEmails.byName)
      .filter(([k]) => k.split(' ')[0] === first)
      .flatMap(([, s]) => Array.from(s));
    const ranked = Array.from(new Set([...exact, ...firstMatches]));
    const rest = knownEmails.all.filter((e) => !ranked.includes(e));
    return [...ranked, ...rest];
  }, [knownEmails]);

  // Heavy balance derivation depends only on groups/expenses/me, so memoize it
  // to avoid recomputing every friend's balance on unrelated re-renders (typing
  // in the search box, opening a dropdown, etc.).
  const [friendsData, setFriendsData] = useState<{
    friends: { id: string; name: string; groups: string[]; bals: Record<string, number> }[];
    isDupName: (name: string) => boolean;
    distinctCurrencies: string[];
    allSharedMembers: Set<string>;
  }>({
    friends: [],
    isDupName: () => false,
    distinctCurrencies: [],
    allSharedMembers: new Set<string>()
  });
  const [isCalculatingFriends, setIsCalculatingFriends] = useState(true);

  useEffect(() => {
    let active = true;
    const compute = async () => {
      setIsCalculatingFriends(true);
      const masterBal: Record<string, Record<string, number>> = {};
      const idMeta: Record<string, { name: string; groups: Set<string> }> = {};
      const bumpBal = (id: string, name: string, groupName: string | null, curr: string, delta: number) => {
        if (!masterBal[id]) masterBal[id] = {};
        masterBal[id][curr] = (masterBal[id][curr] || 0) + delta;
        if (!idMeta[id]) idMeta[id] = { name, groups: new Set() };
        if (groupName) idMeta[id].groups.add(groupName);
      };
      const allSharedMembers = new Set<string>();

      // Prepare batch request. Each group runs in identity space: every name on
      // an expense resolves through its recorded member_key (then the roster),
      // so renamed / re-claimed people keep one ledger — the same path the
      // settle sheet uses, so the two can't disagree.
      let myEmail = userEmail || '';
      if (!myEmail) { try { myEmail = localStorage.getItem('divido_email') || ''; } catch { /* ignore */ } }
      let fullName = ''; try { fullName = localStorage.getItem('divido_username') || ''; } catch { /* ignore */ }
      const prep = groups.map((g) => {
        const groupExps = expenses.filter((e) => !e.isDeleted && String(e.gId) === String(g.id));
        let myG = me;
        let claimName = ''; try { claimName = localStorage.getItem(`divido_identity_${g.id}`) || ''; } catch { /* ignore */ }
        if (claimName) myG = claimName;
        // Identify "me" in THIS group robustly (see resolveSelfKey): the global
        // `me` is only the first name, but the user may be enrolled under their
        // full name in some groups, so match by the stable email when available
        // and fall back through full name / first name / per-group claim. Getting
        // this wrong silently drops the whole group from All balances.
        const myKey = resolveSelfKey(g, { email: myEmail, fullName, firstName: me, claim: claimName });
        const { expenses: keyedExps, keyToName } = toIdentitySpace(g, groupExps);
        const effectiveMembers = Array.from(new Set([
          myKey,
          ...keyedExps.reduce((acc, e) => {
            if (e.paid) acc.add(e.paid);
            if (Array.isArray(e.splitters)) e.splitters.forEach((s) => acc.add(s));
            return acc;
          }, new Set<string>()),
        ]));
        return { g, myG, myKey, keyedExps, keyToName, effectiveMembers };
      });

      const groupsData = prep.map(({ g, keyedExps, effectiveMembers }) => ({
        type: (g.id !== 'STANDALONE') ? 'simplify' as const : 'raw' as const,
        members: effectiveMembers,
        expenses: keyedExps,
        defaultCurrency: g.currency || '₹',
        gId: String(g.id)
      }));

      const batchResults = await asyncBatchComputeGroups(groupsData);

      prep.forEach(({ g, myG, myKey, keyToName, effectiveMembers }) => {
        const nameOf = (k: string) => withoutEmailTag(g, keyToName[k] ?? (k === myKey ? myG : k));
        effectiveMembers.forEach((k) => { if (k !== myKey) allSharedMembers.add(nameOf(k)); });
        (g.members || []).forEach((m) => {
          const name = m.replace(' (Left)', '');
          if (name && getPersonKey(g, name) !== myKey) allSharedMembers.add(name);
        });

        const gLabel = g.isDirect ? 'Non-Group' : g.name;

        const groupTransactions = batchResults[String(g.id)] || [];

        groupTransactions.forEach((t) => {
          if (t.from === myKey) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              bumpBal(t.to, nameOf(t.to), gLabel, curr, -val);
            });
          } else if (t.to === myKey) {
            Object.entries(t.balances).forEach(([curr, val]) => {
              bumpBal(t.from, nameOf(t.from), gLabel, curr, val);
            });
          }
        });
      });

      const standaloneExps = expenses.filter((e) => !e.isDeleted && e.gId === 'STANDALONE');
      const standaloneMembers = Array.from(new Set([
        me,
        ...standaloneExps.flatMap((e) => [e.paid, ...(e.splitters || [])])
      ]));
      standaloneMembers.forEach((m) => { if (m && m !== me) allSharedMembers.add(m); });

      // Resolve a Non-Group person to their EMAIL identity (from any group they're
      // in) so they merge into their in-group self instead of showing as a
      // separate name-keyed duplicate that flickers as standalone data syncs.
      // Never resolve to MY OWN email (would list me as my own friend) — keep the
      // name in that case; the `m === me` guards below still exclude me by name.
      const nameEmail = buildNameEmailResolver(groups);
      let selfEmail = (userEmail || '').toLowerCase();
      if (!selfEmail) { try { selfEmail = (localStorage.getItem('divido_email') || '').toLowerCase(); } catch { /* ignore */ } }
      // No email? Fall back to the one identity this name has across groups
      // (e.g. a person_id), so a Non-Group "Chhutki" joins her Raipur self.
      // Ambiguous names stay separate; never resolve to myself.
      const nameIdentity = buildNameIdentityResolver(groups);
      const myKeys = new Set(prep.map((x) => String(x.myKey).toLowerCase()));
      const standaloneId = (nm: string) => {
        const em = nameEmail(nm) || nameIdentity(nm);
        return em && em.toLowerCase() !== selfEmail && !myKeys.has(em.toLowerCase()) ? em : nm;
      };

      standaloneExps.forEach((e) => {
        const c = e.currency || '₹';
        const splitters = e.splitters || [e.paid];
        const amount = e.amt || 0;

        if (e.paid === me) {
          splitters.forEach((m) => {
            if (m === me) return;
            const otherShare =
              !e.mode || e.mode === 'Equally'
                ? amount / splitters.length
                : e.mode === 'Unequally'
                ? parseFloat(e.shares?.[m]?.toString() || '0')
                : (amount * parseFloat(e.shares?.[m]?.toString() || '0')) / 100;
            bumpBal(standaloneId(m), m, 'Non-Group', c, otherShare);
          });
        } else if (splitters.includes(me)) {
          const payer = e.paid;
          const myShare =
            !e.mode || e.mode === 'Equally'
              ? amount / splitters.length
              : e.mode === 'Unequally'
              ? parseFloat(e.shares?.[me]?.toString() || '0')
              : (amount * parseFloat(e.shares?.[me]?.toString() || '0')) / 100;
          bumpBal(standaloneId(payer), payer, 'Non-Group', c, -myShare);
        }
      });

      const friends = Object.entries(masterBal).map(([id, bals]) => ({
        id,
        name: idMeta[id]?.name || id,
        groups: idMeta[id] ? Array.from(idMeta[id].groups) : [],
        bals,
      }));
      const dupNameCount: Record<string, number> = {};
      friends.forEach((f) => { const n = f.name.toLowerCase(); dupNameCount[n] = (dupNameCount[n] || 0) + 1; });
      const isDupName = (name: string) => (dupNameCount[name.toLowerCase()] || 0) > 1;

      const distinctCurrencies = Array.from(
        new Set(friends.flatMap((f) => Object.entries(f.bals).filter(([_, v]) => Math.abs(v) > 0.01).map(([c]) => c)))
      );

      if (active) {
        setFriendsData({ friends, isDupName, distinctCurrencies, allSharedMembers });
        setIsCalculatingFriends(false);
      }
    };
    compute();
    return () => { active = false; };
  }, [groups, expenses, me, userEmail]);

  const { friends, isDupName, distinctCurrencies, allSharedMembers } = friendsData;

  // Fetch live rates (er-api, same source as the group converter) for every currency → target
  const fetchRatesTo = async (target: string) => {
    setIsConverting(true);
    const FALLBACK: Record<string, Record<string, number>> = {
      INR: { USD: 0.012, EUR: 0.011, GBP: 0.0094, AED: 0.044, SAR: 0.045 },
      USD: { INR: 83.5, EUR: 0.93, GBP: 0.79, AED: 3.67, SAR: 3.75 },
      EUR: { INR: 89.5, USD: 1.07, GBP: 0.85, AED: 3.93, SAR: 4.02 },
      GBP: { INR: 105.8, USD: 1.27, EUR: 1.18, AED: 4.65, SAR: 4.75 },
      AED: { INR: 22.7, USD: 0.27, EUR: 0.25, GBP: 0.21, SAR: 1.02 },
    };
    const toCode = worldCurrencies.find((c) => c.s === target)?.c || target;
    const next: Record<string, number> = {};
    for (const from of distinctCurrencies) {
      const fromCode = worldCurrencies.find((c) => c.s === from)?.c || from;
      if (fromCode === toCode) { next[from] = 1; continue; }
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${fromCode}`);
        const data = await res.json();
        if (data.result === 'success' && data.rates[toCode]) {
          next[from] = data.rates[toCode];
        } else {
          next[from] = FALLBACK[fromCode]?.[toCode] ?? 1;
        }
      } catch {
        next[from] = FALLBACK[fromCode]?.[toCode] ?? 1;
      }
    }
    setRateMap(next);
    setIsConverting(false);
  };

  useEffect(() => {
    if (convertTarget) fetchRatesTo(convertTarget);
  }, [convertTarget]);

  useEffect(() => {
    if (showConvertModal && !convertTarget) {
      // Prefer the user's home currency as the default target so converting a
      // single-currency balance still yields a useful estimate (e.g. $ → ₹).
      const homeCurrency = userMetadata[me]?.defaultCurrency;
      setConvertTarget(convertTo || homeCurrency || distinctCurrencies[0] || '₹');
    }
  }, [showConvertModal]);

  // Get converted balances helper
  const getConvertedBals = (bals: Record<string, number>) => {
    if (!convertTo) return bals;
    const next: Record<string, number> = {};
    Object.entries(bals).forEach(([curr, val]) => {
      const shouldConvert = sourceCurr === 'ALL' || curr === sourceCurr;
      if (shouldConvert && curr !== convertTo) {
        const rate = rateMap[curr] ?? 1;
        next[convertTo] = (next[convertTo] || 0) + val * rate;
      } else {
        next[curr] = (next[curr] || 0) + val;
      }
    });
    const cleaned: Record<string, number> = {};
    Object.entries(next).forEach(([curr, val]) => {
      if (Math.abs(val) > 0.01) cleaned[curr] = val;
    });
    return cleaned;
  };

  const totalReceivable: Record<string, number> = {};
  const totalPayable: Record<string, number> = {};
  friends.forEach((f) => {
    const activeBals = getConvertedBals(f.bals);
    Object.entries(activeBals).forEach(([curr, val]) => {
      if (val > 0.01) {
        totalReceivable[curr] = (totalReceivable[curr] || 0) + val;
      } else if (val < -0.01) {
        totalPayable[curr] = (totalPayable[curr] || 0) + Math.abs(val);
      }
    });
  });

  const filteredFriends = friends.filter((f) => {
    const isOwed = Object.values(f.bals).some((v) => v > 0.01);
    const isOwe = Object.values(f.bals).some((v) => v < -0.01);
    const q = (search || searchQuery || '').trim().toLowerCase();
    if (q) {
      // Amounts too: "300", "₹300", "1,200", "1200.50" all match.
      const amounts = Object.entries(f.bals || {}).flatMap(([curr, v]) => {
        const a = Math.abs(v);
        const exact = formatExactAmount(a);
        return [exact, `${curr}${exact}`, String(Math.round(a * 100) / 100), a.toFixed(2)];
      });
      const hay = [f.name, shown(f.name), String(f.id || ''), ...(f.groups || []), ...amounts].join(' ').toLowerCase();
      const noCommas = (s: string) => s.replace(/,/g, '');
      if (!hay.includes(q) && !noCommas(hay).includes(noCommas(q))) return false;
    }
    if (selectedFriends.length > 0 && !selectedFriends.includes(f.id)) return false;
    if (balanceFilter === 'owed' && !isOwed) return false;
    if (balanceFilter === 'owe' && !isOwe) return false;
    return true;
  });

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    );
  };

  const friendsLabel = selectedFriends.length === 0
    ? 'All Friends'
    : selectedFriends.length === 1
    ? (friends.find((f) => f.id === selectedFriends[0])?.name || 'Friend')
    : `${selectedFriends.length} Friends`;

  const dropdownStyle: React.CSSProperties = {
    position: 'relative',
    flex: 1,
    minWidth: 0,
  };

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    width: '100%', boxSizing: 'border-box',
    padding: '6px 12px', borderRadius: '20px',
    border: '1.5px solid #E2E8F0', background: 'var(--w)',
    fontSize: '12px', fontWeight: 600, color: '#475569',
    cursor: 'pointer', whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  };

  const popupStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    background: 'var(--w)', border: '1.5px solid #F1F5F9',
    borderRadius: '14px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
    zIndex: 200, width: 'max-content', minWidth: '130px', padding: '6px',
  };

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '12px', fontWeight: 600,
    color: active ? '#16A34A' : '#1E293B',
    background: active ? '#F0FDF4' : 'transparent',
  });

  return (
    <div className="content-width-limit">
      {showMergeModal && (
        <MergeDuplicatesModal
          reviews={mergeReviews}
          onDismiss={dismissReview}
          onClose={() => setShowMergeModal(false)}
          onMerge={async (entries, canonicalEmail) => { if (onMergePeople) await onMergePeople(entries, canonicalEmail); }}
        />
      )}
      {onMergePeople && mergeReviews.length > 0 && (
        <div
          onClick={() => setShowMergeModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '14px', padding: '10px 14px', marginBottom: '14px', cursor: 'pointer' }}
        >
          <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 600, color: '#92400E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Found {mergeReviews.length} duplicate {mergeReviews.length === 1 ? 'name' : 'names'}
          </span>
          <span style={{ color: '#B45309', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>Review ›</span>
        </div>
      )}
      {/* Universal Net Balance Card — kept above the search bar */}
      <div style={{ marginBottom: '18px', width: '100%', animation: 'fadeIn 0.25s ease-out' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px', display: 'block' }}>
          {balanceFilter === 'owe' ? 'Net Payable' : balanceFilter === 'owed' ? 'Net Receivable' : 'Net Balance'}
        </span>
        {/* Tap → sheet with the full per-currency breakdown and filters. */}
        {(() => {
          const payEntries = Object.entries(totalPayable);
          const collectEntries = Object.entries(totalReceivable);
          const amt = (e: [string, number][]) => (e.length ? pickAmount(e[0][1], e[0][0], '', '', 13).text : undefined);
          return (
            <NetBalanceTiles
              pay={amt(payEntries)}
              payMore={payEntries.length - 1}
              collect={amt(collectEntries)}
              collectMore={collectEntries.length - 1}
              payLines={payEntries.map(([curr, amount]) => ({ curr, amount }))}
              collectLines={collectEntries.map(([curr, amount]) => ({ curr, amount }))}
              active={balanceFilter === 'owe' ? 'pay' : balanceFilter === 'owed' ? 'collect' : null}
              onSummaryFilter={(f) => setBalanceFilter(f === 'pay' ? 'owe' : f === 'collect' ? 'owed' : 'all')}
              onPayClick={() => setBalanceFilter((f) => (f === 'owe' ? 'all' : 'owe'))}
              onCollectClick={() => setBalanceFilter((f) => (f === 'owed' ? 'all' : 'owed'))}
            />
          );
        })()}
      </div>

      {showNetSheet && (() => {
        const payList = Object.entries(totalPayable);
        const collectList = Object.entries(totalReceivable);
        const segColor = { all: '#1E293B', owe: '#EF4444', owed: '#10B981' };
        const filterBtn = (key: 'all' | 'owe' | 'owed', label: string) => {
          const active = balanceFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setBalanceFilter(key)}
              style={{ flex: 1, minWidth: 0, padding: '9px 4px', borderRadius: '999px', border: 'none', background: active ? segColor[key] : 'transparent', color: active ? '#FFFFFF' : '#475569', fontSize: '13px', fontWeight: active ? 700 : 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', transition: 'background 0.2s, color 0.2s', boxShadow: active ? '0 2px 6px rgba(0,0,0,0.12)' : 'none' }}
            >
              {label}
            </button>
          );
        };
        return (
          <div onClick={() => setShowNetSheet(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: '24px', marginBottom: '14px' }}>
                <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '2px' }} />
                <button
                  type="button"
                  onClick={() => setShowNetSheet(false)}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', margin: '-4px -4px 0 0', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              {balanceFilter !== 'owed' && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '6px' }}>You pay</div>
                  {payList.length === 0 ? (
                    <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: balanceFilter === 'owe' ? '18px' : '14px' }}>Nothing to pay</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: balanceFilter === 'owe' ? '18px' : '14px' }}>
                      {payList.map(([c, v]) => (
                        <span key={c} style={{ fontSize: '15px', fontWeight: 600, color: '#B91C1C' }}>{c}{formatExactAmount(Math.abs(v))}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {balanceFilter !== 'owe' && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '6px' }}>You collect</div>
                  {collectList.length === 0 ? (
                    <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '18px' }}>Nothing to collect</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '18px' }}>
                      {collectList.map(([c, v]) => (
                        <span key={c} style={{ fontSize: '15px', fontWeight: 600, color: '#047857' }}>{c}{formatExactAmount(Math.abs(v))}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div role="radiogroup" style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '999px', background: '#F1F5F9' }}>
                {filterBtn('all', 'All')}
                {filterBtn('owe', 'To pay')}
                {filterBtn('owed', 'To collect')}
              </div>
            </div>
          </div>
        );
      })()}

      {balanceFilter !== 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => setBalanceFilter('all')}
            title="Clear filter"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px 5px 12px', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, background: balanceFilter === 'owe' ? '#FFE4E6' : '#D1FAE5', color: balanceFilter === 'owe' ? '#BE123C' : '#047857' }}
          >
            {balanceFilter === 'owe' ? 'To pay' : 'To collect'}
            <span style={{ fontSize: '13px', lineHeight: 1 }}>✕</span>
          </button>
          {/* Short summary so it's clear what this list is and what to do next. */}
          <span style={{ fontSize: '12.5px', color: '#64748B' }}>
            {(() => {
              const n = filteredFriends.length;
              if (n === 0) return balanceFilter === 'owe' ? 'No one to pay' : 'No one to collect from';
              const who = `${n} ${n === 1 ? 'friend' : 'friends'}`;
              return balanceFilter === 'owe'
                ? `You have ${who} to pay · tap one to settle`
                : `You have ${who} to collect from · tap one to settle`;
            })()}
          </span>
        </div>
      )}

      {/* Filter dropdowns — revealed by the funnel */}
      {showFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', animation: 'fadeSlideIn 0.5s ease-out', flexWrap: 'nowrap' }}>
          {/* Friends filter */}
          <div style={dropdownStyle}>
            <button style={btnStyle} onClick={(e) => { e.stopPropagation(); setShowFriendsDropdown(!showFriendsDropdown); }}>
              <span>{friendsLabel}</span><span style={{ fontSize: '9px', marginLeft: '2px' }}>▼</span>
            </button>
            {showFriendsDropdown && (
              <>
                <div onClick={() => setShowFriendsDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
                <div style={popupStyle}>
                  <div style={optionStyle(selectedFriends.length === 0)} onClick={() => { setSelectedFriends([]); setShowFriendsDropdown(false); }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${selectedFriends.length === 0 ? '#16A34A' : '#CBD5E1'}`, background: selectedFriends.length === 0 ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selectedFriends.length === 0 && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 600 }}>✓</span>}
                    </div>
                    <span>All Friends</span>
                  </div>
                  {friends.map((f) => (
                    <div key={f.id} style={optionStyle(selectedFriends.includes(f.id))} onClick={() => toggleFriend(f.id)}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${selectedFriends.includes(f.id) ? '#16A34A' : '#CBD5E1'}`, background: selectedFriends.includes(f.id) ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selectedFriends.includes(f.id) && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 600 }}>✓</span>}
                      </div>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown(f.name)}</span>
                        {isDupName(f.name) && f.groups.length > 0 && (
                          <span style={{ fontSize: '10px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.groups.join(', ')}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {convertTo && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '16px',
            padding: '10px 14px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#1E40AF',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'left'
          }}
        >
          <span>💡</span>
          <span>Converted balances are live estimates. Settlements and reminders remain in their original currencies.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '0 12px' }}>
        {filteredFriends.map((f) => {
          const activeBals = getConvertedBals(f.bals);
          const isOwed = Object.values(activeBals).some((v) => v > 0.01);
          const isOwe = Object.values(activeBals).some((v) => v < -0.01);
          const active = isOwe || isOwed;

          const balEntries = Object.entries(activeBals).filter(([_, v]) => Math.abs(v) > 0.01);
          const payList = balEntries.filter(([_, v]) => v < -0.01);
          const collectList = balEntries.filter(([_, v]) => v > 0.01);
          const fitRow = (entries: [string, number][], label: string) => {
            const [curr, val] = entries[0];
            // label makes clear WHO acts ("You pay" / "You collect"); ≈ marks a
            // converted estimate.
            const prefix = `${label}${convertTo ? '≈ ' : ''}`;
            // Fixed size on every card (long text truncates with …) so rows
            // never differ in size between people.
            return { ...pickAmount(val, curr, prefix, '', 13), fontSize: 13 };
          };

          const AV_COLORS = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];
          // Colour by identity when a name is shared (so two same-named people look
          // distinct); otherwise keep the original name-based colour unchanged.
          const avSeed = isDupName(f.name)
            ? (f.id || f.name).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0)
            : (f.name.charCodeAt(0) || 0);
          const avBg = AV_COLORS[avSeed % AV_COLORS.length];

          const pillBase: React.CSSProperties = {
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          };
          const cardChip: React.CSSProperties = { background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 600, lineHeight: '16px' };

          return (
            <div
              key={f.id}
              onClick={() => { if (active) setGlobalSettleData({ name: f.name, identity: f.id, groups: f.groups, balances: activeBals }); }}
              style={{
                padding: '16px',
                marginBottom: '12px',
                background: '#FFFFFF',
                border: '0.5px solid #EFE7DC',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderRadius: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                boxSizing: 'border-box',
                cursor: active ? 'pointer' : 'default',
              }}
            >
              {/* Avatar */}
              {(() => {
                const email = f.id && String(f.id).includes('@') ? String(f.id).toLowerCase() : '';
                const photo = (email && memberAvatars?.[email]) || '';
                return photo ? (
                  <img
                    src={photo}
                    alt={f.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: avBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
                    {f.name.charAt(0).toUpperCase()}
                  </div>
                );
              })()}

              {/* Name with the amount stacked right below it (left-aligned) */}
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2E2A25', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize', flexShrink: 1 }}>{shown(f.name)}</h3>
                  {!(f.id && String(f.id).includes('@')) && f.groups && f.groups.length > 0 && (
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>({f.groups.join(', ')})</span>
                  )}
                </div>
                {f.id && String(f.id).includes('@') && (
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.id}</span>
                )}
                {!active ? (
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8' }}>Settled up</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    {payList.length > 0 && (() => {
                      const { text: txt, fontSize } = fitRow(payList, 'You pay ');
                      return (
                      <span style={{ fontSize: `${fontSize}px`, fontWeight: 500, color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
                        {payList.length > 1 && <span style={{ ...cardChip, flexShrink: 0 }}>+{payList.length - 1}</span>}
                      </span>
                      );
                    })()}
                    {collectList.length > 0 && (() => {
                      const { text: txt, fontSize } = fitRow(collectList, 'You collect ');
                      return (
                      <span style={{ fontSize: `${fontSize}px`, fontWeight: 500, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
                        {collectList.length > 1 && <span style={{ ...cardChip, flexShrink: 0 }}>+{collectList.length - 1}</span>}
                      </span>
                      );
                    })()}
                  </div>
                )}
              </div>


              <span style={{ fontSize: '18px', color: '#B8ADA0', fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>›</span>
            </div>
          );
        })}
        {filteredFriends.length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', background: 'var(--bg)', border: '2px dashed #E2E8F0' }}>
            <p style={{ color: '#94A3B8', fontWeight: 600, opacity: 0.7 }}>
              {friends.length === 0
                ? (allSharedMembers.size > 0 ? 'All settled up.' : 'No friends yet.')
                : 'No matches.'}
            </p>
          </div>
        )}
      </div>

      {/* Convert Currency Modal — mirrors the group converter */}
      {showConvertModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowConvertModal(false)}
          style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '330px',
              padding: '20px 20px',
              position: 'relative',
              textAlign: 'center',
              background: '#FFFFFF',
              borderRadius: '24px',
              boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            <div
              onClick={() => setShowConvertModal(false)}
              style={{ position: 'absolute', top: '12px', right: '12px', cursor: 'pointer', fontSize: '20px', opacity: 0.2 }}
            >
              ✕
            </div>

            <div
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                color: '#64748B',
                background: '#F1F5F9',
                padding: '4px 10px',
                borderRadius: '100px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '12px',
              }}
            >
              <span className={isConverting ? 'spin' : ''}>🌐</span>{' '}
              {isConverting ? 'Fetching Live Rates...' : 'Open ER API'}
            </div>

            <h3  style={{ fontSize: '20px', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
              Convert Currencies
            </h3>

            {/* Graphical Conversion Flow Diagram */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '20px',
              padding: '16px 12px',
              marginBottom: '16px',
              marginTop: '12px'
            }}>
              {/* Source Currency */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
                  From
                </span>
                <StyledDropdown
                  ariaLabel="Convert from currency"
                  value={sourceCurr}
                  onChange={(v) => setSourceCurr(v)}
                  buttonStyle={{ fontSize: '14px', fontWeight: 600, color: '#475569', border: '1.5px solid #E2E8F0', boxShadow: 'none', minWidth: '60px', padding: '6px 10px' }}
                  options={[{ value: 'ALL', label: 'All' }, ...distinctCurrencies.map((c) => ({ value: c, label: c }))]}
                />
              </div>

              {/* Connection arrow with live rate */}
              <div style={{ flex: 1.5, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#0D9488', background: '#E6F4EA', padding: '2px 8px', borderRadius: '100px', whiteSpace: 'nowrap', marginBottom: '6px' }}>
                  1 : {(() => {
                    const lookup = sourceCurr === 'ALL' ? (distinctCurrencies.find((c) => c !== convertTarget) || distinctCurrencies[0]) : sourceCurr;
                    return rateMap[lookup] ?? '…';
                  })()}
                </span>
                {/* Visual Arrow Line */}
                <div style={{ width: '100%', height: '2px', background: '#CBD5E1', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    right: '-2px',
                    top: '-4px',
                    width: '0',
                    height: '0',
                    borderTop: '5px solid transparent',
                    borderBottom: '5px solid transparent',
                    borderLeft: '7px solid #CBD5E1'
                  }} />
                </div>
              </div>

              {/* Target Currency */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
                  To
                </span>
                <div
                  onClick={() => setShowConvertPicker(true)}
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1E293B',
                    background: '#FFFFFF',
                    border: '1.5px solid #0D9488',
                    borderRadius: '12px',
                    padding: '6px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    minWidth: '45px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)'
                  }}
                >
                  {convertTarget || '—'} <span style={{ fontSize: '9px', opacity: 0.5 }}>▼</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
              {distinctCurrencies.length > 1 && (
                <span style={{ fontSize: '10px', fontWeight: 500, color: '#64748B', display: 'block', marginBottom: '6px' }}>
                  *{distinctCurrencies.filter((c) => c !== convertTarget).length} other currencies will also be converted.
                </span>
              )}
              <button
                onClick={() => setManualRates(!manualRates)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0D9488',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Edit Conversion Rates Manually
              </button>
            </div>

            {manualRates && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {distinctCurrencies.filter((c) => c !== convertTarget).map((c) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                    <span style={{ opacity: 0.5 }}>1</span>
                    <span style={{ color: '#0D9488' }}>{c}</span>
                    <span>=</span>
                    <input
                      type="number"
                      step="any"
                      value={rateMap[c] ?? ''}
                      onChange={(e) => setRateMap((prev) => ({ ...prev, [c]: parseFloat(e.target.value) || 0 }))}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '10px', border: '1.5px solid #EEF2FF', background: '#F8FAFC', textAlign: 'center', fontWeight: 600 }}
                    />
                    <span style={{ color: '#16A34A' }}>{convertTarget}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              disabled={isConverting || !convertTarget}
              onClick={() => { setConvertTo(convertTarget); setShowConvertModal(false); }}
              className="btn-green hover-up"
              style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 600, borderRadius: '16px', border: 'none', cursor: 'pointer', opacity: isConverting ? 0.6 : 1 }}
            >
              {isConverting ? 'Fetching rates…' : 'Apply Conversion'}
            </button>

            {convertTo && (
              <div
                onClick={() => { setConvertTo(null); setShowConvertModal(false); }}
                style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textAlign: 'center', cursor: 'pointer', marginTop: '12px', textDecoration: 'underline' }}
              >
                Reset to original currencies
              </div>
            )}
          </div>

          <SearchableCurrencyPicker
            show={showConvertPicker}
            current={convertTarget}
            onClose={() => setShowConvertPicker(false)}
            onSelect={(sym) => { setConvertTarget(sym); setShowConvertPicker(false); }}
          />
        </div>
      )}
    </div>
  );
};
