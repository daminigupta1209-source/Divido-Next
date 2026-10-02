import { useEffect, useState } from 'react';
import { Group, Expense } from '../lib/types';
import { asyncBatchComputeGroups } from '../lib/workerHelper';
import {
  getPersonKey,
  resolveSelfKey,
  toIdentitySpace,
  withoutEmailTag,
  buildNameEmailResolver,
  buildNameIdentityResolver,
} from '../lib/identity';

export interface FriendBalance {
  id: string;
  name: string;
  groups: string[];
  bals: Record<string, number>;
}

export interface FriendsBalancesResult {
  friends: FriendBalance[];
  isDupName: (name: string) => boolean;
  distinctCurrencies: string[];
  allSharedMembers: Set<string>;
  isCalculating: boolean;
}

interface UseFriendsBalancesArgs {
  groups: Group[];
  expenses: Expense[];
  me: string;
  userEmail?: string;
  // Lets a caller skip this (worker-backed) computation entirely while its
  // output isn't needed on screen (e.g. a different view is active). When
  // false, no work runs and the hook returns the last computed result (or the
  // empty default if it never ran).
  enabled?: boolean;
}

const EMPTY_FRIENDS_DATA: Omit<FriendsBalancesResult, 'isCalculating'> = {
  friends: [],
  isDupName: () => false,
  distinctCurrencies: [],
  allSharedMembers: new Set<string>(),
};

// Moved verbatim from FriendsView's balance-derivation effect (previously
// lines ~226-397): resolves every group's expenses into identity-space,
// batches them through the calculation worker, and folds the results into a
// per-person ledger scoped to `me`. This is a behaviour-preserving move — the
// settle sheet scopes balances by the exact `id`/`groups` this produces, so
// the identity resolution, self-exclusion, 'Non-Group' labelling for
// isDirect groups, worker call, and cancellation guard must stay equivalent.
export const useFriendsBalances = ({
  groups,
  expenses,
  me,
  userEmail,
  enabled = true,
}: UseFriendsBalancesArgs): FriendsBalancesResult => {
  // Heavy balance derivation depends only on groups/expenses/me, so memoize it
  // to avoid recomputing every friend's balance on unrelated re-renders (typing
  // in the search box, opening a dropdown, etc.).
  const [friendsData, setFriendsData] = useState<Omit<FriendsBalancesResult, 'isCalculating'>>(EMPTY_FRIENDS_DATA);
  const [isCalculatingFriends, setIsCalculatingFriends] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setIsCalculatingFriends(false);
      return;
    }
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
  }, [groups, expenses, me, userEmail, enabled]);

  return { ...friendsData, isCalculating: isCalculatingFriends };
};
