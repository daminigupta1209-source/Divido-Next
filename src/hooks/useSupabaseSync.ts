import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase, uploadAttachment } from '../lib/supabaseClient';
import { Group, Expense } from '../lib/types';
import { checkIfDemoMode } from '../lib/demoMode';
import { ensureArray, ensureObject, isLegacyRenameLog } from '../lib/utils';

// Fresh hidden person id for a new name-only member, so two people who share a
// name in different groups stay separate. Signed-in members are left null and
// identified by their email instead.
const genPersonId = (): string =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `pid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// When the "same person" prompt links a new member to an existing person, it
// stashes that person's id here keyed by `${groupId}::${name}`. On insert we
// consume it (link → shared id) or fall back to a fresh id (a new, separate
// person). Race-free: the id is chosen before the member is added.
const pickPersonId = (groupId: string | number, name: string): string => {
  try {
    const raw = localStorage.getItem('divido_person_link');
    const map = raw ? JSON.parse(raw) : {};
    const key = `${groupId}::${name}`;
    if (map[key]) {
      const v = map[key];
      delete map[key];
      localStorage.setItem('divido_person_link', JSON.stringify(map));
      return v;
    }
  } catch { /* ignore */ }
  return genPersonId();
};

// A group is born with a temporary local id (Date.now()+Math.random(), a float
// far above any real DB id) and is later reassigned a permanent Supabase id.
// Any expense saved carrying the old temp id would otherwise be stranded — it no
// longer matches its group, breaking balances and getting dropped on reload. We
// persist temp->DB id remaps here so stranded expenses can always be re-linked,
// even across sessions/reloads.
const GID_MAP_KEY = 'divido_gid_map';
const isTempGroupId = (id: any): boolean => Number(id) > 2147483647;

const rememberGidRemap = (tempId: any, dbId: any): void => {
  try {
    if (!isTempGroupId(tempId) || dbId == null || isTempGroupId(dbId)) return;
    const map = JSON.parse(localStorage.getItem(GID_MAP_KEY) || '{}');
    map[String(tempId)] = dbId;
    localStorage.setItem(GID_MAP_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

export const getGidRemap = (): Record<string, any> => {
  try {
    return JSON.parse(localStorage.getItem(GID_MAP_KEY) || '{}');
  } catch {
    return {};
  }
};

interface UseSupabaseSyncProps {
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  selectedId: string | number | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | number | null>>;
  isAuthenticated: boolean;
  me: string;
  setMatchPrompt: React.Dispatch<React.SetStateAction<any>>;
  userEmail: string;
}

export function useSupabaseSync({
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
}: UseSupabaseSyncProps) {
  // A guest (no real signed-in email) is fully local — the cloud-sync engine must
  // not run for them, or it corrupts their local group list.
  const hasCloudSession = !!userEmail;
  const prevGroupsRef = useRef<Group[]>([]);
  const prevExpensesRef = useRef<Expense[]>([]);
  const groupsRef = useRef(groups);
  const selectedIdRef = useRef(selectedId);
  const initialLoadDoneRef = useRef(false);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const initializedRef = useRef(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  // True once a real cloud load has populated data. Used to avoid wiping already
  // loaded groups when a later refresh pass momentarily returns an empty
  // membership list (a transient result that caused groups to flash empty).
  const hasSyncedOnceRef = useRef(false);

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(true);
    const handleOfflineStatus = () => setIsOnline(false);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOfflineStatus);
    };
  }, []);

  const syncStatus = useMemo<'synced' | 'syncing' | 'offline' | 'demo'>(() => {
    if (checkIfDemoMode()) return 'demo';
    if (!isOnline) return 'offline';
    const normalize = (arr: Group[]) =>
      arr.map(g => ({
        id: g.id,
        name: g.name,
        currency: g.currency,
        emoji: g.emoji || null,
        simplifyDebts: !!g.simplifyDebts,
      }));
    const nonDraft = groups.filter(g => g.name.trim() !== '' && !g.pendingSync);
    const nonDraftPrev = prevGroupsRef.current.filter(g => g.name.trim() !== '' && !g.pendingSync);
    const hasUnsyncedGroups = JSON.stringify(normalize(nonDraft)) !== JSON.stringify(normalize(nonDraftPrev));
    const hasUnsyncedExpenses = JSON.stringify(expenses) !== JSON.stringify(prevExpensesRef.current);
    return (hasUnsyncedGroups || hasUnsyncedExpenses) ? 'syncing' : 'synced';
  }, [groups, expenses, isOnline]);

  if (!initializedRef.current) {
    try {
      const savedGroups = localStorage.getItem('divido_last_synced_groups') || localStorage.getItem('divido_groups');
      if (savedGroups) prevGroupsRef.current = JSON.parse(savedGroups);
      const savedExpenses = localStorage.getItem('divido_last_synced_expenses') || localStorage.getItem('divido_expenses');
      if (savedExpenses) prevExpensesRef.current = JSON.parse(savedExpenses);
    } catch (e) {
      console.error('Error loading last synced state:', e);
    }
    initializedRef.current = true;
  }

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Safety net: the "Syncing ledger..." loader is gated on isInitialLoadDone.
  // If the cloud load stalls for any reason (slow network, an early-return path,
  // a diff that never converges), never trap the user on that screen — resolve
  // the gate after a short timeout so the app falls through to cached data.
  useEffect(() => {
    if (!isAuthenticated || !hasCloudSession || isInitialLoadDone) return;
    const t = setTimeout(() => {
      if (!initialLoadDoneRef.current) {
        console.warn('Initial cloud load did not complete in time — rendering cached data.');
        initialLoadDoneRef.current = true;
        setIsInitialLoadDone(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [isAuthenticated, hasCloudSession, isInitialLoadDone]);

  // Load data from Supabase on authentication / guest invite join
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated || !hasCloudSession) {
      initialLoadDoneRef.current = true;
      setIsInitialLoadDone(true);
      return;
    }

    const loadData = async () => {
      try {
        if (!navigator.onLine) {
          console.log('Offline. Skipping cloud load.');
          // Resolve the gate so the app renders cached data instead of hanging
          // on the "Syncing ledger..." loader while offline.
          initialLoadDoneRef.current = true;
          setIsInitialLoadDone(true);
          return;
        }
        const normalizeGroupsForDiff = (arr: Group[]) =>
          arr.map(g => ({
            id: g.id,
            name: g.name,
            currency: g.currency,
            emoji: g.emoji || null,
            simplifyDebts: !!g.simplifyDebts,
          }));

        const nonDraftGroups = groups.filter(g => g.name.trim() !== '' && !g.pendingSync);
        const nonDraftPrevGroups = prevGroupsRef.current.filter(g => g.name.trim() !== '' && !g.pendingSync);
        // A real-DB-id group present locally but absent from the last-synced
        // snapshot is a group we just JOINED (via an invite) or that otherwise
        // appeared from the server — real ids only ever come FROM the server, so
        // it needs a LOAD, not protection. Excluding these newly-appeared groups
        // from the "unsynced" check stops the guard from permanently blocking an
        // invitee's expenses from ever loading. Genuine local edits/removals to
        // groups that ARE in the snapshot are still protected.
        const prevGroupIds = new Set(nonDraftPrevGroups.map(g => g.id));
        const localGroupsForDiff = nonDraftGroups.filter(g => prevGroupIds.has(g.id as number));
        const hasUnsyncedGroups = JSON.stringify(normalizeGroupsForDiff(localGroupsForDiff)) !== JSON.stringify(normalizeGroupsForDiff(nonDraftPrevGroups));
        const hasUnsyncedExpenses = JSON.stringify(expenses) !== JSON.stringify(prevExpensesRef.current);
        if (hasUnsyncedGroups || hasUnsyncedExpenses) {
          console.log('Unsynced offline changes detected. Skipping load until sync is complete.', 'groups mismatch:', hasUnsyncedGroups, 'expenses mismatch:', hasUnsyncedExpenses);
          // Render the local (cached) ledger now instead of blocking on the
          // loader — the sync effects will upload these changes and re-trigger a
          // fresh load once the queue is caught up.
          initialLoadDoneRef.current = true;
          setIsInitialLoadDone(true);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        
        let groupIds: any[] = [];
        let memberRecords: any[] = [];

        const resolvedEmail = session?.user?.email || (localStorage.getItem('divido_e2e_testing') === 'true' ? localStorage.getItem('divido_mock_email') : null);
        if (resolvedEmail) {
          // 1. Fetch group memberships for this user
          const { data: userMems } = await supabase
            .from('group_members')
            .select('group_id, groups(*)')
            .eq('user_email', resolvedEmail);

          if (userMems) {
            memberRecords = userMems;
            groupIds = userMems.map((r: any) => r.group_id).filter(Boolean);
          }
        }

        // If guest mode (no session email), load the invite group details specifically
        if (groupIds.length === 0) {
          const urlParams = new URLSearchParams(window.location.search);
          const inviteGroupId = urlParams.get('joinGroupId') || selectedIdRef.current;
          
          // Group ids are permanent UUID strings — any non-empty, non-STANDALONE
          // value is a real group to load.
          const isValidDbId = !!inviteGroupId && inviteGroupId !== 'STANDALONE';

          if (isValidDbId) {
            const { data: gp } = await supabase
              .from('groups')
              .select('*')
              .eq('id', inviteGroupId)
              .single();
            
            if (gp) {
              groupIds = [gp.id];
              memberRecords = [{ group_id: gp.id, groups: gp }];
            }
          }
        }

        if (groupIds.length === 0) {
          if (!resolvedEmail) {
            initialLoadDoneRef.current = true;
            setIsInitialLoadDone(true);
            return;
          }
          // If we've already loaded real data, an empty membership result on a
          // later refresh pass is almost certainly transient — don't wipe the
          // loaded groups (that caused the "groups flash empty" glitch). Only
          // clear on the very first load, when the user genuinely has none.
          if (hasSyncedOnceRef.current) {
            initialLoadDoneRef.current = true;
            setIsInitialLoadDone(true);
            return;
          }
          const unsynced = groups.filter(g => g.pendingSync);
          setGroups(unsynced);
          setExpenses([]);
          initialLoadDoneRef.current = true;
          setIsInitialLoadDone(true);
          return;
        }

        // 2 & 3. Fetch all members and expenses of these groups in parallel
        const [membersRes, expensesRes] = await Promise.all([
          supabase
            .from('group_members')
            .select('*')
            .in('group_id', groupIds)
            .order('id', { ascending: true }),
          supabase
            .from('expenses')
            .select('*')
            .in('group_id', groupIds)
        ]);

        const allMembers = membersRes.data;
        const membersErr = membersRes.error;
        const expenseRecords = expensesRes.data;
        const expenseErr = expensesRes.error;

        if (membersErr || !allMembers || expenseErr || !expenseRecords) {
          // Don't leave the user stranded on the loader if a fetch fails —
          // fall through to whatever cached data we already have.
          initialLoadDoneRef.current = true;
          setIsInitialLoadDone(true);
          return;
        }

        // 4. Map groups
        const loadedGroups: Group[] = [];
        const idToGroup = new Map<number, any>();
        memberRecords.forEach((r: any) => {
          if (r.groups) {
            idToGroup.set(r.groups.id, r.groups);
          }
        });

        // Self-Healing Database Cleanup: Automatically find and delete duplicate member rows
        // (e.g., active row alongside left row with matching clean name) to prevent double-rendering.
        const duplicateMemsToDelete: number[] = [];
        idToGroup.forEach((group: any) => {
          const groupMems = allMembers.filter((m: any) => m.group_id === group.id);
          const nameMap = new Map<string, any[]>();
          groupMems.forEach((m: any) => {
            const cleanName = m.name.replace(/\s*\(Left\)$/i, '').toLowerCase();
            if (!nameMap.has(cleanName)) nameMap.set(cleanName, []);
            nameMap.get(cleanName)!.push(m);
          });
          nameMap.forEach((rows) => {
            if (rows.length > 1) {
              const leftRow = rows.find(r => r.name.toLowerCase().endsWith(' (left)') || r.is_pending);
              if (leftRow) {
                duplicateMemsToDelete.push(leftRow.id);
              } else {
                rows.slice(1).forEach(r => duplicateMemsToDelete.push(r.id));
              }
            }
          });
        });

        if (duplicateMemsToDelete.length > 0) {
          supabase
            .from('group_members')
            .delete()
            .in('id', duplicateMemsToDelete)
            .then(({ error }) => {
              if (error) console.error('Failed to run duplicate members database cleanup:', error);
              else setLoadTrigger(prev => prev + 1);
            });
        }

        // Self-Healing: collapse duplicate GROUPS (same name) that slipped in
        // from a slow-network sync retry or a second device creating the same
        // group before it had synced. Safety rules so this never loses data:
        //   * a group holding any expenses is NEVER deleted;
        //   * at least one group per name is always kept.
        // So we only ever remove empty twins — exactly the phantom "parel"/
        // "Kota" style duplicates.
        const expenseCountByGroup = new Map<number, number>();
        expenseRecords.forEach((e: any) => {
          expenseCountByGroup.set(e.group_id, (expenseCountByGroup.get(e.group_id) || 0) + 1);
        });
        const groupsByCleanName = new Map<string, any[]>();
        idToGroup.forEach((group: any) => {
          const key = String(group.name || '').trim().toLowerCase();
          if (!key) return;
          if (!groupsByCleanName.has(key)) groupsByCleanName.set(key, []);
          groupsByCleanName.get(key)!.push(group);
        });
        const duplicateGroupsToDelete: number[] = [];
        groupsByCleanName.forEach((grps) => {
          if (grps.length < 2) return;
          const empty = grps.filter((gr) => (expenseCountByGroup.get(gr.id) || 0) === 0);
          const withExpenses = grps.filter((gr) => (expenseCountByGroup.get(gr.id) || 0) > 0);
          if (withExpenses.length > 0) {
            // A real copy with data exists — drop every empty twin.
            empty.forEach((gr) => duplicateGroupsToDelete.push(gr.id));
          } else {
            // All copies are empty — keep the oldest (smallest id), drop the rest.
            [...empty]
              .sort((a, b) => Number(a.id) - Number(b.id))
              .slice(1)
              .forEach((gr) => duplicateGroupsToDelete.push(gr.id));
          }
        });

        if (duplicateGroupsToDelete.length > 0) {
          Promise.all([
            supabase.from('group_members').delete().in('group_id', duplicateGroupsToDelete),
            supabase.from('expenses').delete().in('group_id', duplicateGroupsToDelete),
          ]).then(async () => {
            const { error } = await supabase.from('groups').delete().in('id', duplicateGroupsToDelete);
            if (error) console.error('Failed to run duplicate groups cleanup:', error);
            else setLoadTrigger((prev) => prev + 1);
          });
        }

        const currentEmail = session?.user?.email?.toLowerCase() || '';
        idToGroup.forEach((group: any) => {
          // Don't render a duplicate we're about to delete — avoids a flash of
          // the phantom group before the cleanup reload lands.
          if (duplicateGroupsToDelete.includes(group.id)) return;
          const groupMems = allMembers.filter((m: any) => m.group_id === group.id);
          const activeMems = groupMems.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)'));
          
          const members = Array.from(new Set(activeMems.map((m: any) => m.name)));

          // Build the hidden identity for each member name: prefer an explicit
          // person_id, else the signed-in email, else fall back to the name
          // itself (legacy members keep merging by name — no behaviour change).
          const memberIdentities: Record<string, string> = {};
          activeMems.forEach((m: any) => {
            const cleanName = m.name.replace(/\s*\(Left\)$/i, '');
            // Email is the strongest identity (a real signed-in account), then the
            // stored person_id, then the raw name (legacy members merge by name).
            const identity = (m.user_email ? m.user_email.toLowerCase() : '') || m.person_id || cleanName;
            if (!memberIdentities[m.name]) memberIdentities[m.name] = identity;
          });

          // Hydrate this device's identity for this group from the account, so a
          // person's per-group name (e.g. "didi") resolves correctly on ANY device
          // — not only the one where they first claimed it.
          if (currentEmail) {
            const myRow = groupMems.find((m: any) => m.user_email?.toLowerCase() === currentEmail);
            if (myRow?.name) {
              localStorage.setItem(`divido_identity_${group.id}`, myRow.name.replace(/\s*\(Left\)$/i, ''));
            }
          }
          // A member is truly pending only if:
          // 1. DB says is_pending AND
          // 2. They have NOT been linked to any user_email (no one claimed them) AND
          // 3. They are NOT the currently logged-in user AND
          // 4. They are not a "(Left)" member
          const pendingMembers = Array.from(new Set(activeMems.filter((m: any) => {
            if (!m.is_pending || m.name.endsWith(' (Left)')) return false;
            // If this member has user_email set, they've been claimed — not pending
            if (m.user_email) return false;
            // If this member's name matches the current user (me), not pending
            if (currentEmail && m.user_email?.toLowerCase() === currentEmail) return false;
            return true;
          }).map((m: any) => m.name)));

          const pendingLinkRequests = groupMems
            .filter((m: any) => m.link_request_email && m.is_pending)
            .map((m: any) => ({
              id: m.id,
              placeholderName: m.name,
              requestName: m.link_request_name || m.link_request_email.split('@')[0],
              requestEmail: m.link_request_email,
            }));

          const isDuplicate = loadedGroups.some(g => 
            g.name.trim().toLowerCase() === group.name.trim().toLowerCase() &&
            JSON.stringify([...g.members].sort()) === JSON.stringify([...members].sort())
          );
          if (!isDuplicate) {
            loadedGroups.push({
              id: group.id,
              name: group.name,
              currency: group.currency || '₹',
              emoji: group.emoji || undefined,
              simplifyDebts: group.simplify_debts || false,
              createdDate: group.created_date || (group.created_at ? String(group.created_at).split('T')[0] : undefined),
              members,
              pendingMembers,
              pendingLinkRequests,
              memberIdentities,
            });
          }

          // Redundant auto-heal removed to prevent race conditions resetting is_pending for re-invited members.
        });

        // 5. Map expenses
        const loadedExpenses: Expense[] = expenseRecords.map((e: any) => ({
          id: e.id,
          timestamp: e.created_at ? new Date(e.created_at).getTime() : 0,
          gId: e.group_id,
          title: e.title,
          amt: parseFloat(e.amt) || 0,
          paid: e.paid,
          date: e.date,
          mode: e.mode,
          splitters: ensureArray(e.splitters),
          shares: ensureObject(e.shares),
          category: e.category,
          currency: e.currency,
          notes: e.notes,
          attachments: e.attachments || [],
          isRecurring: e.is_recurring,
          recurrence: e.recurrence,
          nextOccurrence: e.next_occurrence
        }));

        // Safety: backup current local data before overwriting with cloud data
        try {
          const localGroups = localStorage.getItem('divido_groups');
          const localExpenses = localStorage.getItem('divido_expenses');
          if (localGroups) localStorage.setItem('divido_backup_groups', localGroups);
          if (localExpenses) localStorage.setItem('divido_backup_expenses', localExpenses);
        } catch (e) { /* quota exceeded — ignore */ }

        const unsynced = groups.filter(g => g.pendingSync);
        // Deduplicate: if a local not-yet-synced group has the same name as a group
        // fetched from the database, the sync succeeded. Remove the local copy so it
        // doesn't double-render.
        const cleanUnsynced = unsynced.filter(u => {
          const alreadySynced = loadedGroups.some(l => 
            l.name.trim().toLowerCase() === u.name.trim().toLowerCase()
          );
          return !alreadySynced;
        });

        // Prevent race conditions: ensure the currently selected group is never lost during a sync merge
        const currentSelectedId = selectedIdRef.current;
        const selectedLocalGroup = groupsRef.current.find(g => String(g.id) === String(currentSelectedId));
        if (selectedLocalGroup && !loadedGroups.some(l => String(l.id) === String(selectedLocalGroup.id) || l.name.trim().toLowerCase() === selectedLocalGroup.name.trim().toLowerCase())) {
          loadedGroups.push(selectedLocalGroup);
        }

        const mergedGroups = [...cleanUnsynced, ...loadedGroups];

        // Merge: keep any local expenses that are NOT in the cloud yet (pending upload)
        // These have temporary IDs (timestamp-based, > 2147483647) or belong to unsynced groups
        const cloudExpenseIds = new Set(loadedExpenses.map((e: any) => String(e.id)));
        // Heal any expense stranded on a temp (pre-sync) group id using the
        // recorded temp->DB map, BEFORE the belongsToSyncedGroup filter — otherwise
        // a stranded expense matches no synced group and gets silently dropped.
        const gidMap = getGidRemap();
        const healedExpenses = expenses.map(e => {
          const mapped = gidMap[String(e.gId)];
          return mapped != null && String(mapped) !== String(e.gId) ? { ...e, gId: mapped } : e;
        });
        const localOnlyExpenses = healedExpenses.filter(e => {
          // Keep if this expense doesn't exist in cloud AND belongs to a valid group
          if (cloudExpenseIds.has(String(e.id))) return false; // already in cloud
          if (e.gId === 'STANDALONE') return true; // standalone expenses are local-only
          // Check if it belongs to an unsynced group (temp ID) or a synced group
          const belongsToSyncedGroup = mergedGroups.some(g => String(g.id) === String(e.gId));
          return belongsToSyncedGroup;
        });
        // Drop legacy "X is now Y" name-change log rows so they can't reappear
        // from a local cache or re-upload after being deleted.
        const mergedExpenses = [...loadedExpenses, ...localOnlyExpenses].filter((e) => !isLegacyRenameLog(e));

        prevGroupsRef.current = loadedGroups;
        localStorage.setItem('divido_last_synced_groups', JSON.stringify(loadedGroups));
        prevExpensesRef.current = loadedExpenses;
        localStorage.setItem('divido_last_synced_expenses', JSON.stringify(loadedExpenses));

        setGroups(mergedGroups);
        setExpenses(mergedExpenses);
        hasSyncedOnceRef.current = true;
        initialLoadDoneRef.current = true;
        setIsInitialLoadDone(true);
      } catch (err) {
        console.error('Failed to load cloud database:', err);
        // Never trap the user on the loader — render cached data on failure.
        initialLoadDoneRef.current = true;
        setIsInitialLoadDone(true);
      }
    };

    loadData();
  }, [isAuthenticated, hasCloudSession, setGroups, setExpenses, loadTrigger]);

  // Realtime: detect when a friend joins, updates name, or creates expenses and sync immediately
  useEffect(() => {
    if (checkIfDemoMode()) return;
    if (!hasCloudSession) return;
    if (!isAuthenticated && typeof selectedIdRef.current !== 'number') return;

    // The subscription receives EVERY change on these tables across the whole
    // database. Reloading the entire account on each one (incl. strangers'
    // activity in unrelated groups) is wasteful, so:
    //   1. Ignore changes that don't touch one of my groups (or me directly).
    //   2. Debounce, so a burst of writes collapses into a single reload.
    const myEmail = (userEmail || '').toLowerCase();
    const myGroupIds = () => new Set(groupsRef.current.map((g) => String(g.id)));
    // undefined group id (e.g. a DELETE without full replica identity) -> can't
    // tell, so reload to stay correct rather than risk missing a change.
    const affectsMyGroups = (gid: any) =>
      gid === undefined || gid === null ? true : myGroupIds().has(String(gid));

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        setLoadTrigger((prev) => prev + 1);
      }, 500);
    };

    const channel = supabase
      .channel('divido_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, async (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const gid = newRow?.group_id ?? oldRow?.group_id;
        // A row that names my email is relevant even if the group isn't in my
        // list yet (e.g. I'm being added/matched into a brand-new group).
        const involvesMe = !!myEmail && [newRow?.user_email, newRow?.link_request_email, oldRow?.user_email]
          .some((e: any) => e && String(e).toLowerCase() === myEmail);
        if (!affectsMyGroups(gid) && !involvesMe) return;

        // If it was a new user requesting to match a placeholder, trigger matching popup
        if (payload.eventType === 'INSERT') {
          if (newRow.is_pending && newRow.user_email && !newRow.name.toLowerCase().endsWith(' (left)')) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email && newRow.user_email !== session.user.email) {
              const myGroup = groupsRef.current.find(g => String(g.id) === String(newRow.group_id));
              if (myGroup) {
                const { data: allMems } = await supabase
                  .from('group_members')
                  .select('id, name, is_pending')
                  .eq('group_id', newRow.group_id)
                  .eq('is_pending', true);
                if (allMems && allMems.length > 0) {
                  setMatchPrompt({
                    newMemberName: newRow.name,
                    newMemberEmail: newRow.user_email,
                    newMemberRecordId: newRow.id,
                    groupId: newRow.group_id,
                    groupName: myGroup.name,
                    pendingPlaceholders: allMems.map((m: any) => ({ id: m.id, name: m.name })),
                  });
                }
              }
            }
          }
        }
        scheduleReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
        const gid = (payload.new as any)?.group_id ?? (payload.old as any)?.group_id;
        if (!affectsMyGroups(gid)) return;
        scheduleReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, (payload) => {
        const id = (payload.new as any)?.id ?? (payload.old as any)?.id;
        if (!affectsMyGroups(id)) return;
        scheduleReload();
      })
      .subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, hasCloudSession, setGroups, setMatchPrompt, setLoadTrigger, userEmail]);

  // Sync groups to Supabase in real-time
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated || !hasCloudSession) return;
    if (!navigator.onLine) return;

    const syncGroups = async () => {
      try {
        const prev = prevGroupsRef.current;
        const curr = groups;

        const { data: { session } } = await supabase.auth.getSession();
        let userEmail = session?.user?.email;

        if (!userEmail && localStorage.getItem('divido_e2e_testing') === 'true') {
          userEmail = localStorage.getItem('divido_mock_email') || 'e2e-test-guest@divido.app';
        }

        // If guest (no email) and we have groups, do not try to sync groups (they cannot create groups)
        if (!userEmail && groups.length > 0 && prev.length === 0) {
          // If loading for first time as guest, skip syncing to prevent overwriting
          prevGroupsRef.current = groups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(groups));
          return;
        }

        // Groups are only deleted explicitly from the UI via handleDeleteGroup, never via auto-diffing.

        // 2. Find inserted or updated groups
        let localStateUpdated = false;
        const nextGroups = [...curr];
        let nextExpenses = [...expenses];
        let nextSelectedId = selectedId;

        for (let i = 0; i < nextGroups.length; i++) {
          const g = nextGroups[i];
          if (g.id === 'STANDALONE') continue;
          const old = prev.find(p => p.id === g.id);
          if (!old) {
            if (!g.name || g.name.trim() === '') {
              continue;
            }

            // Only groups CREATED on this device (pendingSync) need inserting. A
            // group that isn't flagged but also isn't in our synced snapshot was
            // JOINED via an invite / appeared from the server — inserting it would
            // trigger a duplicate-key 409, so skip; it gets folded into
            // prevGroupsRef at the end of this pass, unblocking the cloud load.
            if (!g.pendingSync) {
              continue;
            }

            // Sync Lock: skip if this temporary group is already uploading in another active task
            const lockKey = `divido_syncing_${g.id}`;
            if (sessionStorage.getItem(lockKey) === 'true') {
              console.log(`Group ${g.name} (temp ID: ${g.id}) is already syncing. Skipping duplicate request.`);
              continue;
            }

            // Set the sync lock
            sessionStorage.setItem(lockKey, 'true');

            try {
              // Save-time duplicate guard. A freshly-created group can reach
              // this insert twice — a slow-network sync retry that fires before
              // the first insert's real id has propagated back into local
              // state, or a second device creating the same-named group. The
              // type-time name check (CreateGroupView) only sees THIS device's
              // in-memory list, so it can't catch either case. Before inserting,
              // ask the cloud whether a group with this exact name that I
              // already belong to exists; if so, adopt it instead of creating a
              // twin.
              if (userEmail) {
                const { data: myMemberships } = await supabase
                  .from('group_members')
                  .select('group_id, groups(id, name)')
                  .eq('user_email', userEmail);
                const existing = (myMemberships || []).find((r: any) =>
                  r.groups && String(r.groups.name || '').trim().toLowerCase() === g.name.trim().toLowerCase()
                );
                if (existing) {
                  sessionStorage.removeItem(lockKey);
                  const adoptedId = existing.group_id;
                  const oldGroupId = g.id;
                  rememberGidRemap(oldGroupId, adoptedId);
                  nextGroups[i] = { ...g, id: adoptedId, pendingSync: false };
                  nextExpenses = nextExpenses.map((exp) =>
                    String(exp.gId) === String(oldGroupId) ? { ...exp, gId: adoptedId } : exp
                  );
                  if (String(nextSelectedId) === String(oldGroupId)) {
                    nextSelectedId = adoptedId;
                  }
                  localStateUpdated = true;
                  continue;
                }
              }

              // Insert new group with its PERMANENT client-generated id (no
              // temp->DB swap anymore — the id we send is the id forever).
              const insertId = g.id;
              const { data, error } = await supabase
                .from('groups')
                .insert({
                  id: insertId,
                  name: g.name,
                  currency: g.currency,
                  emoji: g.emoji,
                  simplify_debts: g.simplifyDebts,
                  created_date: g.createdDate
                })
                .select();

              if (error) {
                sessionStorage.removeItem(lockKey); // release lock on failure
                throw error;
              }

              if (data && data[0]) {
                sessionStorage.removeItem(lockKey); // release lock on success
                const newGroupId = data[0].id;
              const oldGroupId = g.id;
              rememberGidRemap(oldGroupId, newGroupId);

              // Link creator and other group members
              const memberInserts = g.members.map((m, idx) => {
                const isMe = m.toLowerCase() === me.toLowerCase() || idx === 0;
                return {
                  group_id: newGroupId,
                  name: m,
                  user_email: isMe ? userEmail : null,
                  is_pending: !isMe,
                  // Me is identified by email; other name-only members get their
                  // own hidden id so same-named people never merge across groups.
                  person_id: isMe ? null : genPersonId(),
                };
              });
              const { error: memErr } = await supabase.from('group_members').insert(memberInserts);
              if (memErr) throw memErr;

              // Update in local state variables. The id is unchanged (we sent it),
              // so clearing pendingSync is the meaningful change — it marks the
              // group as now living in the cloud.
              nextGroups[i] = { ...g, id: newGroupId, pendingSync: false };

              // Rewrite associated expenses to map from oldGroupId to newGroupId
              // (a no-op when ids match, kept for the id-adoption edge case).
              nextExpenses = nextExpenses.map(exp =>
                String(exp.gId) === String(oldGroupId) ? { ...exp, gId: newGroupId } : exp
              );

              // Rewrite selectedId if it was the old group ID
              if (String(nextSelectedId) === String(oldGroupId)) {
                nextSelectedId = newGroupId;
              }
              localStateUpdated = true;
            }
          } catch (err) {
            sessionStorage.removeItem(lockKey);
            throw err;
          }
          } else {
            if (old.name !== g.name || old.currency !== g.currency || old.emoji !== g.emoji || old.simplifyDebts !== g.simplifyDebts) {
              // Update existing group
              const { error } = await supabase
                .from('groups')
                .update({
                  name: g.name,
                  currency: g.currency,
                  emoji: g.emoji,
                  simplify_debts: g.simplifyDebts
                })
                .eq('id', g.id);
              if (error) throw error;
            }

            if (old.createdDate !== g.createdDate && g.createdDate) {
              // Separate non-fatal update: requires the created_date column
              // (ALTER TABLE groups ADD COLUMN created_date date;)
              const { error: dateErr } = await supabase
                .from('groups')
                .update({ created_date: g.createdDate })
                .eq('id', g.id);
              if (dateErr) console.error('Failed to sync group formed date:', dateErr);
            }

            // Compare members to find new ones (ignore left members and existing name-variants)
            const newMembers = g.members.filter(m => !m.endsWith(' (Left)') && !old.members.includes(m) && !old.members.includes(m + ' (Left)'));
            if (newMembers.length > 0) {
              const memberInserts = newMembers.map(m => ({
                group_id: g.id,
                name: m,
                is_pending: true,
                person_id: pickPersonId(g.id, m),
              }));
              const { error: memErr } = await supabase.from('group_members').insert(memberInserts);
              if (memErr) throw memErr;
            }
          }
        }

        if (localStateUpdated) {
          // Deduplicate nextGroups to prevent temporary copies from remaining alongside synced copies
          const uniqueNextGroups: Group[] = [];
          const seenGroupIds = new Set<any>();
          for (const g of nextGroups) {
            if (g.id) {
              if (seenGroupIds.has(g.id)) continue;
              seenGroupIds.add(g.id);
            }
            uniqueNextGroups.push(g);
          }

          const syncedGroups = uniqueNextGroups.filter(g => g.name.trim() !== '' && !g.pendingSync);
          prevGroupsRef.current = syncedGroups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(syncedGroups));

          prevExpensesRef.current = nextExpenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(nextExpenses));

          setGroups(uniqueNextGroups);
          setExpenses(nextExpenses);
          setSelectedId(nextSelectedId);
        } else {
          const syncedGroups = groups.filter(g => g.name.trim() !== '' && !g.pendingSync);
          prevGroupsRef.current = syncedGroups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(syncedGroups));
        }        // Trigger load data once queue is fully caught up
        if (!initialLoadDoneRef.current) {
          setLoadTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error('Failed to sync groups to cloud (will retry when online):', err);
      }
    };

    syncGroups();
  }, [groups, expenses, selectedId, isAuthenticated, hasCloudSession, me, setGroups, setExpenses, setSelectedId]);

  // Sync expenses to Supabase in real-time
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated || !hasCloudSession) return;
    if (!navigator.onLine) return;

    const syncExpenses = async () => {
      try {
        const prev = prevExpensesRef.current;
        const curr = expenses;

        // Skip syncing if we are loading initial data
        if (!initialLoadDoneRef.current) {
          prevExpensesRef.current = curr;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(curr));
          return;
        }

        // 1. Find deleted expenses
        const deleted = prev.filter(p => !curr.some(c => c.id === p.id));

        // Safety: refuse to mass-delete if too many expenses disappear at once.
        // This protects against accidental state resets wiping the database.
        // Legitimate bulk deletions (e.g. deleting a group) are handled separately.
        if (deleted.length > 3 && deleted.length > prev.length * 0.5) {
          console.warn(`Safety: blocked mass-deletion of ${deleted.length} expenses. This looks like a state reset, not intentional deletion.`);
        } else {
          for (const e of deleted) {
            // Expense ids are permanent client-generated ids now; delete by id.
            // (A never-synced id simply matches no row — a harmless no-op.)
            if (e.id != null) {
              const { error } = await supabase.from('expenses').delete().eq('id', String(e.id));
              if (error) throw error;
            }
          }
        }

        // 2. Find inserted or updated expenses
        let localStateUpdated = false;
        const nextExpenses = [...curr];

        for (let i = 0; i < nextExpenses.length; i++) {
          const e = nextExpenses[i];
          if (e.gId === 'STANDALONE') {
            // Moved from a group to Non-Group: remove the cloud row so it doesn't reappear in the old group
            const old = prev.find(p => p.id === e.id);
            if (old && old.gId !== 'STANDALONE') {
              const { error } = await supabase.from('expenses').delete().eq('id', String(e.id));
              if (error) throw error;
            }
            continue;
          }

          // Upload any local data URL attachments to Supabase Storage first
          let attachmentsUpdated = false;
          const updatedAttachments = e.attachments ? [...e.attachments] : [];
          for (let j = 0; j < updatedAttachments.length; j++) {
            if (updatedAttachments[j] && updatedAttachments[j].startsWith('data:')) {
              const publicUrl = await uploadAttachment(updatedAttachments[j]);
              if (publicUrl !== updatedAttachments[j]) {
                updatedAttachments[j] = publicUrl;
                attachmentsUpdated = true;
              }
            }
          }

          let updatedExpense = e;
          if (attachmentsUpdated) {
            updatedExpense = { ...e, attachments: updatedAttachments };
            nextExpenses[i] = updatedExpense;
            localStateUpdated = true;
          }

          const old = prev.find(p => p.id === updatedExpense.id);
          if (!old || old.gId === 'STANDALONE') {
            // Insert new expense (also covers a Non-Group expense moved into a group — it has no cloud row yet)
            // If this expense's group hasn't been inserted into the cloud yet, skip
            // for now — inserting the expense first would violate the group_id
            // foreign key. It syncs on the next pass once the group row exists.
            const grpForExpense = groups.find(gr => String(gr.id) === String(updatedExpense.gId));
            if (grpForExpense && grpForExpense.pendingSync) {
              continue;
            }

            // Send the permanent client id (as text) — no temp->DB swap anymore.
            const insertId = updatedExpense.id != null ? String(updatedExpense.id) : undefined;
            const { error } = await supabase
              .from('expenses')
              .insert({
                id: insertId,
                group_id: updatedExpense.gId,
                title: updatedExpense.title,
                amt: updatedExpense.amt,
                paid: updatedExpense.paid,
                date: updatedExpense.date,
                mode: updatedExpense.mode || 'Equally',
                splitters: updatedExpense.splitters || [],
                shares: updatedExpense.shares,
                category: updatedExpense.category,
                currency: updatedExpense.currency,
                notes: updatedExpense.notes,
                attachments: updatedExpense.attachments || [],
                is_recurring: updatedExpense.isRecurring || false,
                recurrence: updatedExpense.recurrence || 'none',
                next_occurrence: updatedExpense.nextOccurrence
              });

            if (error) throw error;
            // No id remap needed — the id we sent is permanent.
          } else if (
            String(old.gId) !== String(updatedExpense.gId) ||
            old.title !== updatedExpense.title ||
            old.amt !== updatedExpense.amt ||
            old.paid !== updatedExpense.paid ||
            old.date !== updatedExpense.date ||
            old.mode !== updatedExpense.mode ||
            JSON.stringify(old.splitters) !== JSON.stringify(updatedExpense.splitters) ||
            JSON.stringify(old.shares) !== JSON.stringify(updatedExpense.shares) ||
            old.category !== updatedExpense.category ||
            old.currency !== updatedExpense.currency ||
            old.notes !== updatedExpense.notes ||
            JSON.stringify(old.attachments) !== JSON.stringify(updatedExpense.attachments) ||
            old.isRecurring !== updatedExpense.isRecurring ||
            old.recurrence !== updatedExpense.recurrence ||
            old.nextOccurrence !== updatedExpense.nextOccurrence
          ) {
            // Update existing expense
            const { error } = await supabase
              .from('expenses')
              .update({
                group_id: updatedExpense.gId,
                title: updatedExpense.title,
                amt: updatedExpense.amt,
                paid: updatedExpense.paid,
                date: updatedExpense.date,
                mode: updatedExpense.mode || 'Equally',
                splitters: updatedExpense.splitters || [],
                shares: updatedExpense.shares,
                category: updatedExpense.category,
                currency: updatedExpense.currency,
                notes: updatedExpense.notes,
                attachments: updatedExpense.attachments || [],
                is_recurring: updatedExpense.isRecurring || false,
                recurrence: updatedExpense.recurrence || 'none',
                next_occurrence: updatedExpense.nextOccurrence
              })
              .eq('id', String(updatedExpense.id));
            if (error) throw error;
          }
        }

        if (localStateUpdated) {
          prevExpensesRef.current = nextExpenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(nextExpenses));
          setExpenses(nextExpenses);
        } else {
          prevExpensesRef.current = expenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(expenses));
        }

        // Trigger load data once queue is fully caught up
        if (!initialLoadDoneRef.current) {
          setLoadTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error('Failed to sync expenses to cloud (will retry when online):', err);
      }
    };

    syncExpenses();
  }, [expenses, isAuthenticated, hasCloudSession, setExpenses]);

  // Listen for online status to trigger automatic sync queue flush
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network connection restored. Replaying sync queue...');
      // Force trigger state updates to re-run the sync effects
      setGroups((prev) => [...prev]);
      setExpenses((prev) => [...prev]);
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [setGroups, setExpenses]);

  return { syncStatus, isInitialLoadDone };
}
