import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Group, Expense } from '../lib/types';
import { checkIfDemoMode } from '../lib/demoMode';

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
    const hasUnsyncedGroups = JSON.stringify(groups) !== JSON.stringify(prevGroupsRef.current);
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

        const hasUnsyncedGroups = JSON.stringify(groups) !== JSON.stringify(prevGroupsRef.current);
        const hasUnsyncedExpenses = JSON.stringify(expenses) !== JSON.stringify(prevExpensesRef.current);
        if (hasUnsyncedGroups || hasUnsyncedExpenses) {
          console.log('Unsynced offline changes detected. Skipping load until sync is complete.');
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
          
          if (inviteGroupId && inviteGroupId !== 'STANDALONE') {
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
          setGroups([]);
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

        idToGroup.forEach((group: any) => {
          const groupMems = allMembers.filter((m: any) => m.group_id === group.id);
          const activeMems = groupMems.filter((m: any) => !m.link_request_email || !m.is_pending);
          
          const members = Array.from(new Set(activeMems.map((m: any) => m.name)));
          const pendingMembers = Array.from(new Set(activeMems.filter((m: any) => m.is_pending).map((m: any) => m.name)));

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
          splitters: e.splitters || [],
          shares: e.shares || {},
          category: e.category,
          currency: e.currency,
          notes: e.notes,
          attachments: e.attachments || [],
          isRecurring: e.is_recurring,
          recurrence: e.recurrence,
          nextOccurrence: e.next_occurrence
        }));

        prevGroupsRef.current = loadedGroups;
        localStorage.setItem('divido_last_synced_groups', JSON.stringify(loadedGroups));
        prevExpensesRef.current = loadedExpenses;
        localStorage.setItem('divido_last_synced_expenses', JSON.stringify(loadedExpenses));

        setGroups(loadedGroups);
        setExpenses(loadedExpenses);
        initialLoadDoneRef.current = true;
      } catch (err) {
        console.error('Failed to load cloud database:', err);
      }
    };

    loadData();
  }, [isAuthenticated, setGroups, setExpenses, selectedId, loadTrigger]);

  // Realtime: detect when a friend joins, updates name, or creates expenses and sync immediately
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;

    const channel = supabase
      .channel('divido_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, async (payload) => {
        // Refresh members list on any database writes (claims, renames, additions)
        // If it was a new user requesting to match a placeholder, trigger matching popup
        if (payload.eventType === 'INSERT') {
          const newRow = payload.new as any;
          if (newRow.is_pending) {
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
        // Force refresh local groups state
        setGroups((prev) => [...prev]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        // Refresh expenses list on any db writes (additions, edits, deletions)
        setGroups((prev) => [...prev]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => {
        // Refresh groups settings (like simplify_debts changes) instantly
        setGroups((prev) => [...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, setGroups, setMatchPrompt]);

  // Sync groups to Supabase in real-time
  useEffect(() => {
    if (checkIfDemoMode() || !isAuthenticated) return;
    if (!navigator.onLine) return;

    const syncGroups = async () => {
      try {
        const prev = prevGroupsRef.current;
        const curr = groups;

        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session?.user?.email;

        // If guest (no email) and we have groups, do not try to sync groups (they cannot create groups)
        if (!userEmail && groups.length > 0 && prev.length === 0) {
          // If loading for first time as guest, skip syncing to prevent overwriting
          prevGroupsRef.current = groups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(groups));
          return;
        }

        // 1. Find deleted groups
        const deleted = prev.filter(p => !curr.some(c => c.id === p.id));
        for (const g of deleted) {
          if (!g.members || g.members.length <= 1) {
            const { error } = await supabase.from('groups').delete().eq('id', g.id);
            if (error) throw error;
          }
        }

        // 2. Find inserted or updated groups
        let localStateUpdated = false;
        let nextGroups = [...curr];
        let nextExpenses = [...expenses];
        let nextSelectedId = selectedId;

        for (let i = 0; i < nextGroups.length; i++) {
          const g = nextGroups[i];
          if (g.id === 'STANDALONE') continue;
          const old = prev.find(p => p.id === g.id);
          if (!old) {
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
              const memberInserts = g.members.map(m => {
                const isMe = m === me;
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
          prevGroupsRef.current = nextGroups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(nextGroups));

          prevExpensesRef.current = nextExpenses;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(nextExpenses));

          setGroups(nextGroups);
          setExpenses(nextExpenses);
          setSelectedId(nextSelectedId);
        } else {
          prevGroupsRef.current = groups;
          localStorage.setItem('divido_last_synced_groups', JSON.stringify(groups));
        }

        // Trigger load data once queue is fully caught up
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
        if (curr.length > 0 && prev.length === 0) {
          prevExpensesRef.current = curr;
          localStorage.setItem('divido_last_synced_expenses', JSON.stringify(curr));
          return;
        }

        // 1. Find deleted expenses
        const deleted = prev.filter(p => !curr.some(c => c.id === p.id));
        for (const e of deleted) {
          const { error } = await supabase.from('expenses').delete().eq('id', e.id);
          if (error) throw error;
        }

        // 2. Find inserted or updated expenses
        let localStateUpdated = false;
        let nextExpenses = [...curr];

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
          const old = prev.find(p => p.id === e.id);
          if (!old || old.gId === 'STANDALONE') {
            // Insert new expense (also covers a Non-Group expense moved into a group — it has no cloud row yet)
            // If the group ID is still a temporary ID (too large), skip it until the group syncs and updates the ID
            if (typeof e.gId === 'number' && e.gId > 2147483647) {
              continue;
            }

            const insertId = typeof e.id === 'number' && e.id < 2147483647 ? e.id : undefined;
            const { data, error } = await supabase
              .from('expenses')
              .insert({
                id: insertId,
                group_id: e.gId,
                title: e.title,
                amt: e.amt,
                paid: e.paid,
                date: e.date,
                mode: e.mode || 'Equally',
                splitters: e.splitters,
                shares: e.shares,
                category: e.category,
                currency: e.currency,
                notes: e.notes,
                attachments: e.attachments || [],
                is_recurring: e.isRecurring || false,
                recurrence: e.recurrence || 'none',
                next_occurrence: e.nextOccurrence
              })
              .select();

            if (error) throw error;

            if (data && data[0]) {
              const newExpId = data[0].id;
              nextExpenses[i] = { ...e, id: newExpId };
              localStateUpdated = true;
            }
          } else if (
            String(old.gId) !== String(e.gId) ||
            old.title !== e.title ||
            old.amt !== e.amt ||
            old.paid !== e.paid ||
            old.date !== e.date ||
            old.mode !== e.mode ||
            JSON.stringify(old.splitters) !== JSON.stringify(e.splitters) ||
            JSON.stringify(old.shares) !== JSON.stringify(e.shares) ||
            old.category !== e.category ||
            old.currency !== e.currency ||
            old.notes !== e.notes ||
            old.isRecurring !== e.isRecurring ||
            old.recurrence !== e.recurrence ||
            old.nextOccurrence !== e.nextOccurrence
          ) {
            // Update existing expense
            const { error } = await supabase
              .from('expenses')
              .update({
                group_id: e.gId,
                title: e.title,
                amt: e.amt,
                paid: e.paid,
                date: e.date,
                mode: e.mode || 'Equally',
                splitters: e.splitters,
                shares: e.shares,
                category: e.category,
                currency: e.currency,
                notes: e.notes,
                attachments: e.attachments || [],
                is_recurring: e.isRecurring || false,
                recurrence: e.recurrence || 'none',
                next_occurrence: e.nextOccurrence
              })
              .eq('id', e.id);
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
