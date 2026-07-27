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
}: UseSupabaseSyncProps) {
  const prevGroupsRef = useRef<Group[]>([]);
  const prevExpensesRef = useRef<Expense[]>([]);
  const groupsRef = useRef(groups);
  const initialLoadDoneRef = useRef(false);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const initializedRef = useRef(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
        emoji: g.emoji,
        simplifyDebts: g.simplifyDebts,
        members: [...(g.members || [])].sort()
      }));
    const nonDraft = groups.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
    const hasUnsyncedGroups = JSON.stringify(normalize(nonDraft)) !== JSON.stringify(normalize(prevGroupsRef.current));
    const hasUnsyncedExpenses = JSON.stringify(expenses) !== JSON.stringify(prevExpensesRef.current);
    return (hasUnsyncedGroups || hasUnsyncedExpenses) ? 'syncing' : 'synced';
  }, [groups, expenses, isOnline]);

  if (!initializedRef.current) {
    try {
      const savedGroups = localStorage.getItem('divido_last_synced_groups');
      if (savedGroups) prevGroupsRef.current = JSON.parse(savedGroups);
      const savedExpenses = localStorage.getItem('divido_last_synced_expenses');
      if (savedExpenses) prevExpensesRef.current = JSON.parse(savedExpenses);
    } catch (e) {
      console.error('Error loading last synced state:', e);
    }
    initializedRef.current = true;
  }

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Load data from Supabase on authentication / guest invite join
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;

    const loadData = async () => {
      try {
        if (!navigator.onLine) {
          console.log('Offline. Skipping cloud load.');
          return;
        }
        const normalizeGroupsForDiff = (arr: Group[]) =>
          arr.map(g => ({
            id: g.id,
            name: g.name,
            currency: g.currency,
            emoji: g.emoji,
            simplifyDebts: g.simplifyDebts,
            members: [...(g.members || [])].sort()
          }));

        const nonDraftGroups = groups.filter(g => g.name.trim() !== '' && typeof g.id === 'number' && g.id <= 2147483647);
        const hasUnsyncedGroups = JSON.stringify(normalizeGroupsForDiff(nonDraftGroups)) !== JSON.stringify(normalizeGroupsForDiff(prevGroupsRef.current));
        const hasUnsyncedExpenses = JSON.stringify(expenses) !== JSON.stringify(prevExpensesRef.current);
        if (hasUnsyncedGroups || hasUnsyncedExpenses) {
          console.log('Unsynced offline changes detected. Skipping load until sync is complete.', 'groups mismatch:', hasUnsyncedGroups, 'expenses mismatch:', hasUnsyncedExpenses);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        
        let groupIds: any[] = [];
        let memberRecords: any[] = [];

        if (session?.user?.email) {
          // 1. Fetch group memberships for this user
          const { data: userMems } = await supabase
            .from('group_members')
            .select('group_id, groups(*)')
            .eq('user_email', session.user.email);

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
          if (!session?.user?.email) {
            initialLoadDoneRef.current = true;
            return;
          }
          const unsynced = groups.filter(g => typeof g.id === 'number' && g.id > 2147483647);
          setGroups(unsynced);
          setExpenses([]);
          initialLoadDoneRef.current = true;
          return;
        }

        // 2. Fetch all members of these groups to reconstruct Group.members array
        const { data: allMembers, error: membersErr } = await supabase
          .from('group_members')
          .select('*')
          .in('group_id', groupIds);

        if (membersErr || !allMembers) return;

        // 3. Fetch all expenses for these groups
        const { data: expenseRecords, error: expenseErr } = await supabase
          .from('expenses')
          .select('*')
          .in('group_id', groupIds);

        if (expenseErr || !expenseRecords) return;

        // 4. Map groups
        const loadedGroups: Group[] = [];
        const idToGroup = new Map<number, any>();
        memberRecords.forEach((r: any) => {
          if (r.groups) {
            idToGroup.set(r.groups.id, r.groups);
          }
        });

        const currentEmail = session?.user?.email?.toLowerCase() || '';
        idToGroup.forEach((group: any) => {
          const groupMems = allMembers.filter((m: any) => m.group_id === group.id);
          const activeMems = groupMems.filter((m: any) => !m.link_request_email || !m.is_pending);
          
          const members = Array.from(new Set(activeMems.map((m: any) => m.name)));
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

          // Auto-heal: fix any members that have user_email set but are still marked pending
          const staleMembers = groupMems.filter((m: any) => m.is_pending && m.user_email && !m.link_request_email);
          for (const stale of staleMembers) {
            supabase.from('group_members').update({ is_pending: false }).eq('id', stale.id).then(() => {});
          }
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
        const mergedGroups = [...unsynced, ...loadedGroups];

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
      } catch (err) {
        console.error('Failed to load cloud database:', err);
      }
    };

    loadData();
  }, [isAuthenticated, setGroups, setExpenses, selectedId, loadTrigger]);

  // Realtime: detect when a friend joins, updates name, or creates expenses and sync immediately
  useEffect(() => {
    if (checkIfDemoMode()) return;
    if (!isAuthenticated && typeof selectedId !== 'number') return;

    const channel = supabase
      .channel('divido_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, async (payload) => {
        // Refresh members list on any database writes (claims, renames, additions)
        // If it was a new user requesting to match a placeholder, trigger matching popup
        if (payload.eventType === 'INSERT') {
          const newRow = payload.new as any;
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
        // Force refresh local groups state by triggering cloud refetch
        setLoadTrigger((prev) => prev + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        // Refresh expenses list on any db writes (additions, edits, deletions)
        setLoadTrigger((prev) => prev + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => {
        // Refresh groups settings (like simplify_debts changes) instantly
        setLoadTrigger((prev) => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, selectedId, setGroups, setMatchPrompt, setLoadTrigger]);

  // Sync groups to Supabase in real-time
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;
    if (!navigator.onLine) return;

    const syncGroups = async () => {
      try {
        const prev = prevGroupsRef.current;
        const curr = groups;

        const { data: { session } } = await supabase.auth.getSession();
        let userEmail = session?.user?.email;

        if (!userEmail && localStorage.getItem('divido_e2e_testing') === 'true') {
          userEmail = 'e2e-test-guest@divido.app';
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

            if (error) throw error;

            if (data && data[0]) {
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

            // Compare members to find new ones
            const newMembers = g.members.filter(m => !old.members.includes(m));
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
          const syncedGroups = nextGroups.filter(g => typeof g.id === 'number' && g.id <= 2147483647);
          prevGroupsRef.current = syncedGroups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(syncedGroups));

          prevExpensesRef.current = nextExpenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(nextExpenses));

          setGroups(nextGroups);
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
  }, [groups, expenses, selectedId, isAuthenticated, me, setGroups, setExpenses, setSelectedId]);

  // Sync expenses to Supabase in real-time
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;
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
  }, [expenses, isAuthenticated, setExpenses]);

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

  return { syncStatus };
}
