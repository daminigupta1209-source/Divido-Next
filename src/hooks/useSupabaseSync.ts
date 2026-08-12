import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase, uploadAttachment } from '../lib/supabaseClient';
import { Group, Expense } from '../lib/types';
import { checkIfDemoMode } from '../lib/demoMode';
import { ensureArray, ensureObject } from '../lib/utils';

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
  const initialLoadDoneRef = useRef(false);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const initializedRef = useRef(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);

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
    const nonDraft = groups.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
    const nonDraftPrev = prevGroupsRef.current.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
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
    if (checkIfDemoMode() || !isAuthenticated || !hasCloudSession) return;

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

        const nonDraftGroups = groups.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
        const nonDraftPrevGroups = prevGroupsRef.current.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
        const hasUnsyncedGroups = JSON.stringify(normalizeGroupsForDiff(nonDraftGroups)) !== JSON.stringify(normalizeGroupsForDiff(nonDraftPrevGroups));
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
          const inviteGroupId = urlParams.get('joinGroupId') || selectedId;
          
          const parsedId = inviteGroupId ? parseInt(String(inviteGroupId), 10) : NaN;
          const isValidDbId = !isNaN(parsedId) && parsedId <= 2147483647;

          if (isValidDbId && inviteGroupId !== 'STANDALONE') {
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
          const unsynced = groups.filter(g => typeof g.id === 'number' && g.id > 2147483647);
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

        const currentEmail = session?.user?.email?.toLowerCase() || '';
        idToGroup.forEach((group: any) => {
          const groupMems = allMembers.filter((m: any) => m.group_id === group.id);
          const activeMems = groupMems.filter((m: any) => !m.link_request_email || !m.is_pending || m.name.endsWith(' (Left)'));
          
          const members = Array.from(new Set(activeMems.map((m: any) => m.name)));

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
            });
          }

          // Redundant auto-heal removed to prevent race conditions resetting is_pending for re-invited members.
        });

        // 5. Map expenses
        const loadedExpenses: Expense[] = expenseRecords.map((e: any) => ({
          id: e.id,
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

        const unsynced = groups.filter(g => typeof g.id === 'number' && g.id > 2147483647);
        // Deduplicate: if a local temp group has the same name as a group fetched from the database,
        // it means the sync succeeded. Remove the local temp copy so it doesn't double-render.
        const cleanUnsynced = unsynced.filter(u => {
          const alreadySynced = loadedGroups.some(l => 
            l.name.trim().toLowerCase() === u.name.trim().toLowerCase()
          );
          return !alreadySynced;
        });

        // Prevent race conditions: ensure the currently selected group is never lost during a sync merge
        const selectedLocalGroup = groupsRef.current.find(g => String(g.id) === String(selectedId));
        if (selectedLocalGroup && !loadedGroups.some(l => String(l.id) === String(selectedLocalGroup.id))) {
          loadedGroups.push(selectedLocalGroup);
        }

        const mergedGroups = [...cleanUnsynced, ...loadedGroups];

        // Merge: keep any local expenses that are NOT in the cloud yet (pending upload)
        // These have temporary IDs (timestamp-based, > 2147483647) or belong to unsynced groups
        const cloudExpenseIds = new Set(loadedExpenses.map((e: any) => String(e.id)));
        const localOnlyExpenses = expenses.filter(e => {
          // Keep if this expense doesn't exist in cloud AND belongs to a valid group
          if (cloudExpenseIds.has(String(e.id))) return false; // already in cloud
          if (e.gId === 'STANDALONE') return true; // standalone expenses are local-only
          // Check if it belongs to an unsynced group (temp ID) or a synced group
          const belongsToSyncedGroup = mergedGroups.some(g => String(g.id) === String(e.gId));
          return belongsToSyncedGroup;
        });
        const mergedExpenses = [...loadedExpenses, ...localOnlyExpenses];

        prevGroupsRef.current = loadedGroups;
        localStorage.setItem('divido_last_synced_groups', JSON.stringify(loadedGroups));
        prevExpensesRef.current = loadedExpenses;
        localStorage.setItem('divido_last_synced_expenses', JSON.stringify(loadedExpenses));

        setGroups(mergedGroups);
        setExpenses(mergedExpenses);
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
  }, [isAuthenticated, hasCloudSession, setGroups, setExpenses, selectedId, loadTrigger]);

  // Realtime: detect when a friend joins, updates name, or creates expenses and sync immediately
  useEffect(() => {
    if (checkIfDemoMode()) return;
    if (!hasCloudSession) return;
    if (!isAuthenticated && typeof selectedId !== 'number') return;

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
  }, [isAuthenticated, hasCloudSession, selectedId, setGroups, setMatchPrompt, setLoadTrigger, userEmail]);

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

            // A group with a real (small) DB id that isn't in our synced list was
            // JOINED via an invite — or already exists in the cloud — not created
            // on this device (locally-created groups carry large temporary ids).
            // Re-inserting it triggers a duplicate-key 409, so adopt it as-is; it
            // gets folded into prevGroupsRef at the end of this sync pass, which
            // also unblocks the initial cloud load.
            if (typeof g.id === 'number' && g.id <= 2147483647) {
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
              // Insert new group
              const insertId = typeof g.id === 'number' && g.id < 2147483647 ? g.id : undefined;
              const { data, error } = await supabase
                .from('groups')
                .insert({
                  id: insertId,
                  name: g.name,
                  currency: g.currency,
                  emoji: g.emoji,
                  simplify_debts: g.simplifyDebts
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

              // Link creator and other group members
              const memberInserts = g.members.map((m, idx) => {
                const isMe = m.toLowerCase() === me.toLowerCase() || idx === 0;
                return {
                  group_id: newGroupId,
                  name: m,
                  user_email: isMe ? userEmail : null,
                  is_pending: !isMe
                };
              });
              const { error: memErr } = await supabase.from('group_members').insert(memberInserts);
              if (memErr) throw memErr;

              // Update in local state variables
              nextGroups[i] = { ...g, id: newGroupId };
              
              // Rewrite associated expenses to map from oldGroupId to newGroupId
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
                is_pending: true
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

          const syncedGroups = uniqueNextGroups.filter(g => typeof g.id === 'number' && g.id <= 2147483647);
          prevGroupsRef.current = syncedGroups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(syncedGroups));

          prevExpensesRef.current = nextExpenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(nextExpenses));

          setGroups(uniqueNextGroups);
          setExpenses(nextExpenses);
          setSelectedId(nextSelectedId);
        } else {
          const syncedGroups = groups.filter(g => typeof g.id === 'number' && g.id <= 2147483647);
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
            // Only delete from DB if it has a valid DB id (not a local temp id)
            if (typeof e.id === 'number' && e.id <= 2147483647) {
              const { error } = await supabase.from('expenses').delete().eq('id', e.id);
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
              const { error } = await supabase.from('expenses').delete().eq('id', e.id);
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
            // If the group ID is still a temporary ID (too large), skip it until the group syncs and updates the ID
            if (typeof updatedExpense.gId === 'number' && updatedExpense.gId > 2147483647) {
              continue;
            }

            const insertId = typeof updatedExpense.id === 'number' && updatedExpense.id < 2147483647 ? updatedExpense.id : undefined;
            const { data, error } = await supabase
              .from('expenses')
              .insert({
                id: insertId,
                group_id: updatedExpense.gId,
                title: updatedExpense.title,
                amt: updatedExpense.amt,
                paid: updatedExpense.paid,
                date: updatedExpense.date,
                mode: updatedExpense.mode || 'Equally',
                splitters: updatedExpense.splitters,
                shares: updatedExpense.shares,
                category: updatedExpense.category,
                currency: updatedExpense.currency,
                notes: updatedExpense.notes,
                attachments: updatedExpense.attachments || [],
                is_recurring: updatedExpense.isRecurring || false,
                recurrence: updatedExpense.recurrence || 'none',
                next_occurrence: updatedExpense.nextOccurrence
              })
              .select();

            if (error) throw error;

            if (data && data[0]) {
              const newExpId = data[0].id;
              nextExpenses[i] = { ...updatedExpense, id: newExpId };
              localStateUpdated = true;
            }
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
                splitters: updatedExpense.splitters,
                shares: updatedExpense.shares,
                category: updatedExpense.category,
                currency: updatedExpense.currency,
                notes: updatedExpense.notes,
                attachments: updatedExpense.attachments || [],
                is_recurring: updatedExpense.isRecurring || false,
                recurrence: updatedExpense.recurrence || 'none',
                next_occurrence: updatedExpense.nextOccurrence
              })
              .eq('id', updatedExpense.id);
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
