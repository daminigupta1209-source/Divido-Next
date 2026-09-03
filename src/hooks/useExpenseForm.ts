import { useState, useEffect, useRef, useMemo } from 'react';
import { escManager } from '../lib/escManager';
import { Group, Expense } from '../lib/types';
import { calculateNextOccurrenceDate } from '../lib/calculations';
import { getEmoji, parseExpenseId, genExpenseId } from '../lib/utils';

export interface UseExpenseFormProps {
  setShowExpModal: (show: boolean) => void;
  setEditingExpense: (expense: Expense | null) => void;
  editingExpense: Expense | null;
  selectedGroup: Group;
  selectedId: string | number | null;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setShowCurrPickerId: (id: string | null) => void;
  showCurrPickerId: string | null;
  me: string;
  myEmail?: string;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setShowAddFriendModal: (show: boolean) => void;
  setSelectedId: (id: string | number | null) => void;
  view: string;
  newlyAddedFriends: string[];
  setNewlyAddedFriends: (friends: string[]) => void;
  setActiveSplitters?: (splitters: string[]) => void;
  userName: string;
  defaultCurrency: string;
  autoOpenScanner?: boolean;
  setAutoOpenScanner?: (val: boolean) => void;
  onExpenseSaved?: (savedExpense: Expense, activeGroup?: Group) => void;
}

export function useExpenseForm({
  setShowExpModal,
  setEditingExpense,
  editingExpense,
  selectedGroup,
  selectedId,
  expenses,
  setExpenses,
  setShowCurrPickerId,
  showCurrPickerId,
  me,
  myEmail,
  groups,
  setGroups,
  setShowAddFriendModal,
  setSelectedId,
  view,
  newlyAddedFriends,
  setNewlyAddedFriends,
  setActiveSplitters,
  userName,
  defaultCurrency,
  autoOpenScanner = false,
  setAutoOpenScanner,
  onExpenseSaved,
}: UseExpenseFormProps) {
  const [localGId, setLocalGId] = useState<string | number>(() => {
    if (editingExpense) return editingExpense.gId;
    if (view === 'summary') return 'STANDALONE';
    return selectedId || 'STANDALONE';
  });

  // A newly-created group starts with a temporary local id and is reassigned a
  // permanent Supabase id once it syncs. For a brand-new expense being added to
  // the active group, follow that id change — otherwise an expense saved after
  // the remap keeps the dead temp id, gets stranded from its group, and can no
  // longer be matched (e.g. the "is this member in any expense?" check misses
  // it, so removing that member orphans the expense).
  useEffect(() => {
    const isNewExpense = !editingExpense || String(editingExpense.id ?? '').startsWith('temp-');
    if (
      isNewExpense &&
      selectedId &&
      selectedId !== 'STANDALONE' &&
      localGId !== 'STANDALONE' &&
      String(localGId) !== String(selectedId)
    ) {
      setLocalGId(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const activeGroup = useMemo(() => {
    if (localGId === 'STANDALONE') {
      const standaloneParticipants = expenses
        .filter((e) => e && String(e.gId) === 'STANDALONE')
        .reduce((acc, e) => {
          if (e.paid) acc.add(e.paid);
          if (Array.isArray(e.splitters)) {
            e.splitters.forEach((s) => acc.add(s));
          }
          return acc;
        }, new Set<string>());

      return {
        id: 'STANDALONE',
        name: 'Non-Group Expenses',
        // Include the current expense's own splitters so a quick "add expense
        // with a friend" (prefilled with someone new to Non-Group) shows them
        // as a selectable chip, not just an invisible selection.
        members: Array.from(new Set([
          me,
          ...standaloneParticipants,
          ...((editingExpense && Array.isArray(editingExpense.splitters)) ? editingExpense.splitters : []),
        ])),
        currency: defaultCurrency,
        emoji: '👤',
        simplifyDebts: false,
      };
    }
    return groups.find((g) => g && String(g.id) === String(localGId));
  }, [localGId, groups, expenses, me, defaultCurrency, editingExpense]);

  const [selectedSplitters, setSelectedSplitters] = useState<string[]>(() => {
    // Only reuse a saved selection when it actually has members. A new expense
    // is created with splitters: [], which should default to "everyone selected".
    if (editingExpense && Array.isArray(editingExpense.splitters) && editingExpense.splitters.length > 0) {
      return editingExpense.splitters;
    }
    if (activeGroup && Array.isArray(activeGroup.members)) {
      return localGId === 'STANDALONE' ? [me] : Array.from(new Set(activeGroup.members)).filter((m) => !m.endsWith(' (Left)'));
    }
    return [me];
  });

  const [amt, setAmt] = useState<string>(() => {
    if (!editingExpense) return '';
    const isTemp = editingExpense.id && String(editingExpense.id).startsWith('temp-');
    if (isTemp || editingExpense.amt === 0) return '';
    return String(editingExpense.amt);
  });
  const [payer, setPayer] = useState<string>(
    editingExpense && editingExpense.paid ? editingExpense.paid : me
  );

  useEffect(() => {
    if (typeof setActiveSplitters === 'function') {
      setActiveSplitters(selectedSplitters);
    }
  }, [selectedSplitters, setActiveSplitters]);

  useEffect(() => {
    if (newlyAddedFriends.length > 0) {
      setSelectedSplitters((prev) => Array.from(new Set([...(prev || []), ...newlyAddedFriends])));
      setNewlyAddedFriends([]);
    }
  }, [newlyAddedFriends, setNewlyAddedFriends]);

  const [title, setTitle] = useState<string>(() => {
    if (!editingExpense) return '';
    const isSettlement = editingExpense.title?.includes('Settlement') || editingExpense.category === '💸' || editingExpense.category === '🤝';
    return isSettlement ? 'Payment Recorded' : editingExpense.title;
  });
  const [overrideEmoji, setOverrideEmoji] = useState<string | null>(() => {
    if (!editingExpense) return null;
    const isSettlement = editingExpense.title?.includes('Settlement') || editingExpense.category === '💸' || editingExpense.category === '🤝';
    return isSettlement ? (editingExpense.category || '💸') : null;
  });
  const [showGroupDropdown, setShowGroupDropdown] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selIdx, setSelIdx] = useState<number>(-1);
  const suggs = [
    'Dinner 🍕',
    'Taxi 🚕',
    'Rent 🏠',
    'Groceries 🛒',
    'Drinks 🍻',
    'Movie 🍿',
    'Hotel 🏨',
    'Fuel ⛽',
    'Shopping 🛍️',
    'Gift 🎁',
    'Gym 🏋️‍♂️',
    'Coffee ☕',
  ];

  const [date, setDate] = useState<string>(
    editingExpense ? editingExpense.date : new Date().toISOString().split('T')[0]
  );
  const [splitMode, setSplitMode] = useState<string>(
    editingExpense &&
      (editingExpense.mode === 'Equally' ||
        editingExpense.mode === 'Unequally' ||
        editingExpense.mode === 'Percentage')
      ? editingExpense.mode
      : 'Equally'
  );
  const [shares, setShares] = useState<Record<string, number>>(editingExpense?.shares || {});
  const [notes, setNotes] = useState<string>(editingExpense && editingExpense.notes ? editingExpense.notes : '');

  const [showNotesPopup, setShowNotesPopup] = useState<boolean>(false);
  const [showDatePopup, setShowDatePopup] = useState<boolean>(false);
  const [tempNotes, setTempNotes] = useState<string>(editingExpense && editingExpense.notes ? editingExpense.notes : '');
  const [recurrence, setRecurrence] = useState<'weekly' | 'monthly' | 'yearly' | 'none'>(
    editingExpense?.recurrence || 'none'
  );
  const [showRecurrencePopup, setShowRecurrencePopup] = useState<boolean>(false);
  const recurrenceContainerRef = useRef<HTMLDivElement | null>(null);
  const [showSharesPopup, setShowSharesPopup] = useState<boolean>(false);
  const showSharesPopupRef = useRef(showSharesPopup);
  const descriptionContainerRef = useRef<HTMLDivElement | null>(null);

  const latestExpInGroup = useMemo(
    () =>
      expenses
        .filter((e) => e && String(e.gId) === String(localGId))
        .sort((a, b) => parseExpenseId(b.id) - parseExpenseId(a.id))[0],
    [expenses, localGId]
  );

  const lastUsedGroupCurrency = localGId ? localStorage.getItem(`divido_last_used_currency_${localGId}`) : null;

  const defaultCurr = lastUsedGroupCurrency || (latestExpInGroup
    ? latestExpInGroup.currency || localStorage.getItem('divido_last_used_currency') || defaultCurrency
    : activeGroup?.currency || localStorage.getItem('divido_last_used_currency') || defaultCurrency);

  const [curr, setCurr] = useState<string>(editingExpense?.currency || defaultCurr);
  const [manualEdits, setManualEdits] = useState<Set<string>>(new Set());
  const [shouldShake, setShouldShake] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(!!autoOpenScanner);
  const [highlightAddFriend, setHighlightAddFriend] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<string[]>(editingExpense?.attachments || []);
  const [tagsInput, setTagsInput] = useState<string>(editingExpense?.tags ? editingExpense.tags.map(t => '#' + t).join(', ') : '');
  const [showAttachmentsPreview, setShowAttachmentsPreview] = useState<boolean>(false);
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState<number>(0);
  const [showValidationErrorPopup, setShowValidationErrorPopup] = useState<boolean>(false);
  const [showFriendPickerPopup, setShowFriendPickerPopup] = useState<boolean>(false);
  const [friendPickerSearch, setFriendPickerSearch] = useState<string>('');
  // Non-group: optional email captured when picking/adding the other person.
  const [friendPickerEmail, setFriendPickerEmail] = useState<string>(editingExpense?.otherEmail || '');
  const [apiError, setApiError] = useState<string | null>(null);

  const openScanner = () => {
    setShowScannerModal(true);
  };

  useEffect(() => {
    if (autoOpenScanner) {
      openScanner();
      if (setAutoOpenScanner) {
        setAutoOpenScanner(false);
      }
    }
  }, [autoOpenScanner, setAutoOpenScanner]);

  const handleScanComplete = (data: { title: string; amt: string; notes?: string; attachments: string[] }) => {
    setTitle(data.title);
    setAmt(data.amt);
    if (data.notes) setNotes(data.notes);
    if (data.attachments && data.attachments.length > 0) {
      setAttachments(data.attachments);
    }
    setHighlightAddFriend(true);
  };

  const allKnownFriends = useMemo(() => {
    const allGroupMembers = groups.reduce<string[]>((acc, g) => acc.concat(g?.members || []), []);
    const standaloneParticipants = expenses
      .filter((e) => e && String(e.gId) === 'STANDALONE')
      .reduce<string[]>((acc, e) => {
        if (e.paid) acc.push(e.paid);
        if (Array.isArray(e.splitters)) {
          e.splitters.forEach((s) => acc.push(s));
        }
        return acc;
      }, []);
    const meLower = (me || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
    const myEmailLower = (myEmail || '').trim().toLowerCase();
    // Names that resolve to MY account across any group (I may be listed under a
    // different name elsewhere) — so I never suggest or let anyone pick myself.
    const myNames = new Set<string>();
    if (myEmailLower) {
      for (const g of groups || []) {
        const mi = g?.memberIdentities || {};
        for (const [nm, id] of Object.entries(mi)) {
          if (typeof id === 'string' && id.toLowerCase() === myEmailLower) {
            myNames.add(nm.replace(/\s*\(Left\)$/i, '').trim().toLowerCase());
          }
        }
      }
    }
    return Array.from(
      new Set([...allGroupMembers, ...standaloneParticipants])
    ).filter((f) => {
      const fl = (f || '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
      return fl !== meLower && !myNames.has(fl);
    });
  }, [groups, expenses, me, myEmail]);

  const friendsToSelect = useMemo(() => {
    if (localGId !== 'STANDALONE') {
      const raw = activeGroup ? Array.from(new Set(activeGroup.members)) : [me];
      return raw.filter((m) => {
        const cleanName = m.replace(' (Left)', '');
        return !m.endsWith(' (Left)') || selectedSplitters.includes(cleanName) || selectedSplitters.includes(m);
      });
    }
    return Array.from(new Set([me, ...selectedSplitters]));
  }, [localGId, activeGroup, selectedSplitters, me]);

  const payerOptions = useMemo(() => {
    if (localGId !== 'STANDALONE') {
      const raw = activeGroup ? Array.from(new Set(activeGroup.members)) : [me];
      return raw.filter((m) => {
        const cleanName = m.replace(' (Left)', '');
        return (
          m === payer ||
          cleanName === payer ||
          !m.endsWith(' (Left)') ||
          selectedSplitters.includes(cleanName) ||
          selectedSplitters.includes(m)
        );
      });
    }
    return friendsToSelect;
  }, [localGId, activeGroup, friendsToSelect, payer, me, selectedSplitters]);

  const filteredSuggs = suggs;

  const currentEmoji = useMemo(() => overrideEmoji || getEmoji(title) || '📄', [title, overrideEmoji]);

  useEffect(() => {
    if (!title.trim()) return;

    const localEmoji = getEmoji(title);
    if (localEmoji) {
      setOverrideEmoji(localEmoji);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Analyze the description of an expense and return EXACTLY ONE suitable emoji icon that represents it. Do not write any other text or explanation. Only return the emoji. Description: "${title}"`
              }]
            }]
          })
        });
        const data = await response.json();
        if (!response.ok) return;
        const emoji = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (emoji && emoji.length > 0 && emoji.length <= 4) {
          setOverrideEmoji(emoji);
        }
      } catch (err) {
        console.error('Gemini emoji generation failed:', err);
      }
    }, 450);

    return () => clearTimeout(handler);
  }, [title]);

  const triggerShake = () => {
    setShouldShake(true);
    setTimeout(() => setShouldShake(false), 500);
  };

  useEffect(() => {
    if (!activeGroup) return;

    if (editingExpense && String(localGId) === String(editingExpense.gId)) {
      // Back on the expense's original group — restore its saved selection, but
      // Map a stored name to the roster's actual spelling (case-insensitive,
      // suffix-stripped). Old expenses may hold "didi" while the member row is
      // "Didi" — without this the "Paid by" dropdown and the "Paid for"
      // checkboxes can't find their match and render blank/unchecked.
      const canonName = (nm: string): string => {
        if (!nm || !activeGroup?.members) return nm;
        const target = nm.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
        const match = activeGroup.members.find(
          (m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === target
        );
        return match ? match.replace(/\s*\(Left\)$/i, '') : nm;
      };
      // a new expense has an empty splitters list, so fall back to all members.
      setSelectedSplitters(
        Array.isArray(editingExpense.splitters) && editingExpense.splitters.length > 0
          ? editingExpense.splitters.map(canonName)
          : localGId === 'STANDALONE'
          ? [me]
          : Array.from(new Set(activeGroup.members)).filter((m) => !m.endsWith(' (Left)'))
      );
      setShares(editingExpense.shares || {});
      setManualEdits(new Set());
      setPayer(canonName(editingExpense.paid) || me);
      setCurr(editingExpense.currency || activeGroup.currency || defaultCurrency);
      return;
    }

    // New expense, or an edited expense moved to a different group:
    // reset selection to the target group's members so stale names can't leak across groups
    setSelectedSplitters(
      localGId === 'STANDALONE'
        ? [me]
        : Array.isArray(activeGroup.members)
        ? Array.from(new Set(activeGroup.members)).filter((m) => !m.endsWith(' (Left)'))
        : [me]
    );
    if (editingExpense) {
      setShares({});
      setManualEdits(new Set());
    }
    const lastUsedGroupCurrency = localGId ? localStorage.getItem(`divido_last_used_currency_${localGId}`) : null;
    setCurr(lastUsedGroupCurrency || activeGroup.currency || defaultCurrency);
    setPayer(me);
  }, [localGId]);

  const handleShareChange = (name: string, val: string) => {
    const numVal = val === '' ? undefined : parseFloat(val);
    const newShares = { ...shares };
    if (numVal === undefined || isNaN(numVal)) {
      delete newShares[name];
    } else {
      newShares[name] = numVal;
    }
    const newManualEdits = new Set(manualEdits);
    newManualEdits.add(name);
    setManualEdits(newManualEdits);

    const unedited = selectedSplitters.filter((m) => !newManualEdits.has(m));
    if (unedited.length === 1 && splitMode !== 'Equally') {
      const remainingMember = unedited[0];
      const totalAmount = parseFloat(amt) || 0;
      const othersSum = selectedSplitters
        .filter((m) => m !== remainingMember)
        .reduce((acc, m) => acc + (newShares[m] || 0), 0);

      if (splitMode === 'Unequally') {
        newShares[remainingMember] = Math.max(0, totalAmount - othersSum);
      } else if (splitMode === 'Percentage') {
        newShares[remainingMember] = Math.max(0, 100 - othersSum);
      }
    }
    setShares(newShares);
  };

  const totalShares = selectedSplitters.reduce((acc, m) => acc + (shares[m] || 0), 0);

  const getShareAmt = (m: string) => {
    const totalAmount = parseFloat(amt) || 0;
    if (splitMode === 'Equally') return totalAmount / (selectedSplitters.length || 1);
    if (splitMode === 'Unequally') return shares[m] || 0;
    return (totalAmount * (shares[m] || 0)) / 100;
  };

  const isValid =
    selectedSplitters.length > 0 &&
    (splitMode === 'Equally'
      ? parseFloat(amt) > 0
      : splitMode === 'Unequally'
      ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.0001
      : Math.abs(totalShares - 100) < 0.0001);

  const handleSave = () => {
    if (!title) {
      setShowValidationErrorPopup(true);
      triggerShake();
      return;
    }
    if (!amt || parseFloat(amt) <= 0) {
      setShowValidationErrorPopup(true);
      triggerShake();
      return;
    }
    if (isValid && localGId) {
      const isTemporaryNewExpense = editingExpense?.id && String(editingExpense.id).startsWith('temp-');
      // Enforce "one name per person per group": snap every name to the group's
      // exact roster spelling (case-insensitive match) so the stored data can
      // never hold "didi" and "Didi" as if they were two people.
      const roster = localGId !== 'STANDALONE' && activeGroup?.members ? activeGroup.members : [];
      const canonName = (nm: string): string => {
        if (!nm || roster.length === 0) return nm;
        const target = nm.replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
        const match = roster.find((m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === target);
        return match ? match.replace(/\s*\(Left\)$/i, '') : nm;
      };
      const canonShares: Record<string, number> = {};
      Object.entries(shares || {}).forEach(([nm, v]) => { canonShares[canonName(nm)] = v as number; });
      const savedExp: Expense = {
        id: (editingExpense && !isTemporaryNewExpense) ? editingExpense.id : genExpenseId(),
        timestamp: (editingExpense && !isTemporaryNewExpense && editingExpense.timestamp) ? editingExpense.timestamp : Date.now(),
        gId: localGId,
        title,
        amt: parseFloat(amt) || 0,
        paid: canonName(payer),
        date,
        mode: splitMode,
        shares: canonShares,
        splitters: Array.from(new Set(selectedSplitters.map(canonName))),
        category: overrideEmoji || getEmoji(title) || '⚡',
        currency: curr,
        notes: notes.trim() ? notes : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        isRecurring: recurrence !== 'none',
        recurrence: recurrence === 'none' ? undefined : recurrence,
        nextOccurrence: recurrence === 'none' ? undefined : calculateNextOccurrenceDate(date, recurrence),
        tags: tagsInput.split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t.length > 0),
        otherEmail:
          localGId === 'STANDALONE' && friendPickerEmail.trim().includes('@')
            ? friendPickerEmail.trim().toLowerCase()
            : (localGId === 'STANDALONE' ? editingExpense?.otherEmail : undefined),
      };

      setExpenses(
        editingExpense && !isTemporaryNewExpense
          ? (prev) => prev.map((e) => (e.id === editingExpense.id ? savedExp : e))
          : (prev) => [savedExp, ...prev]
      );
      if (onExpenseSaved) {
        onExpenseSaved(savedExp, activeGroup);
      }
      setShowExpModal(false);
      setEditingExpense(null);
    } else {
      setShowValidationErrorPopup(true);
      triggerShake();
    }
  };
  // Reset unequal splits to Equal split if the total amount is modified from the saved/default amount
  useEffect(() => {
    if (splitMode === 'Unequally') {
      // For a brand-new expense the "original amount" is 0, so entering the total
      // (e.g. in the shares popup, which is bound to amt) would always trip the
      // reset and wipe the unequal split the user is building. Only reset when a
      // SAVED expense's amount is actually changed.
      const isNewExpense = !editingExpense?.id || String(editingExpense.id).startsWith('temp-');
      if (isNewExpense) return;
      const parsedAmt = parseFloat(amt) || 0;
      const originalAmt = editingExpense?.amt || 0;
      if (Math.abs(parsedAmt - originalAmt) > 0.01) {
        setSplitMode('Equally');
        setShares({});
        setManualEdits(new Set());
      }
    }
  }, [amt]);

  useEffect(() => {
    const unedited = selectedSplitters.filter((m) => !manualEdits.has(m));
    if (unedited.length === 1 && splitMode !== 'Equally') {
      const remainingMember = unedited[0];
      const totalAmount = parseFloat(amt) || 0;
      const othersSum = selectedSplitters
        .filter((m) => m !== remainingMember)
        .reduce((acc, m) => acc + (shares[m] || 0), 0);

      const newShares = { ...shares };
      if (splitMode === 'Unequally') {
        newShares[remainingMember] = Math.max(0, totalAmount - othersSum);
      } else if (splitMode === 'Percentage') {
        newShares[remainingMember] = Math.max(0, 100 - othersSum);
      }

      if (JSON.stringify(newShares) !== JSON.stringify(shares)) {
        setShares(newShares);
      }
    }
  }, [amt, splitMode, selectedSplitters, manualEdits, shares]);

  useEffect(() => {
    showSharesPopupRef.current = showSharesPopup;
  }, [showSharesPopup]);

  const blurTimeoutRef = useRef<number | null>(null);

  const friendsToSelectRef = useRef(friendsToSelect);
  const showSuggestionsRef = useRef(showSuggestions);
  const isValidRef = useRef(isValid);
  const titleRef = useRef(title);
  const amtRef = useRef(amt);
  const splitModeRef = useRef(splitMode);
  const payerRef = useRef(payer);
  const dateRef = useRef(date);
  const notesRef = useRef(notes);
  const recurrenceRef = useRef(recurrence);
  const attachmentsRef = useRef(attachments);
  const handleSaveRef = useRef(handleSave);
  const selectedSplittersRef = useRef(selectedSplitters);

  useEffect(() => { friendsToSelectRef.current = friendsToSelect; }, [friendsToSelect]);
  useEffect(() => { showSuggestionsRef.current = showSuggestions; }, [showSuggestions]);
  useEffect(() => { isValidRef.current = isValid; }, [isValid]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { amtRef.current = amt; }, [amt]);
  useEffect(() => { splitModeRef.current = splitMode; }, [splitMode]);
  useEffect(() => { payerRef.current = payer; }, [payer]);
  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { recurrenceRef.current = recurrence; }, [recurrence]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
  useEffect(() => { selectedSplittersRef.current = selectedSplitters; }, [selectedSplitters]);
  useEffect(() => { showSharesPopupRef.current = showSharesPopup; }, [showSharesPopup]);

  useEffect(() => {
    if (showSharesPopup) {
      return escManager.register(() => {
        setShowSharesPopup(false);
      });
    }
  }, [showSharesPopup]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        recurrenceContainerRef.current &&
        !recurrenceContainerRef.current.contains(e.target as Node)
      ) {
        setShowRecurrencePopup(false);
      }
      if (
        descriptionContainerRef.current &&
        !descriptionContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return escManager.register(() => {
      setEditingExpense(null);
      setShowExpModal(false);
    });
  }, [setEditingExpense, setShowExpModal]);

  useEffect(() => {
    if (showAttachmentsPreview) {
      return escManager.register(() => {
        setShowAttachmentsPreview(false);
      });
    }
  }, [showAttachmentsPreview]);

  useEffect(() => {
    if (showScannerModal) {
      return escManager.register(() => {
        setShowScannerModal(false);
      });
    }
  }, [showScannerModal]);

  useEffect(() => {
    if (showNotesPopup) {
      return escManager.register(() => {
        setShowNotesPopup(false);
      });
    }
  }, [showNotesPopup]);

  useEffect(() => {
    if (showValidationErrorPopup) {
      return escManager.register(() => {
        setShowValidationErrorPopup(false);
      });
    }
  }, [showValidationErrorPopup]);

  useEffect(() => {
    if (showFriendPickerPopup) {
      return escManager.register(() => {
        setShowFriendPickerPopup(false);
        setFriendPickerSearch('');
      });
    }
  }, [showFriendPickerPopup]);

  useEffect(() => {
    if (showSuggestions) {
      return escManager.register(() => {
        setShowSuggestions(false);
      });
    }
  }, [showSuggestions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isValidRef.current && titleRef.current) {
          handleSaveRef.current();
        }
        return;
      }

      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft'
      ) {
        const activeEl = document.activeElement;
        const isTextInput =
          activeEl &&
          activeEl.tagName === 'INPUT' &&
          ((activeEl as HTMLInputElement).type === 'text' ||
            (activeEl as HTMLInputElement).type === 'number');
        const isLeftOrRight = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        if (isTextInput && isLeftOrRight) return;

        const isSelect = activeEl && activeEl.tagName === 'SELECT';
        if (isSelect && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;

        if (activeEl?.id === 'exp-title' && showSuggestionsRef.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          return;
        }

        let elements: string[] = [];
        if (showSharesPopupRef.current) {
          elements = [
            'shares-val-input',
            'shares-split-mode-select',
            ...selectedSplittersRef.current.map((f) => `share-input-${f}`),
            'shares-done-btn',
          ];
        } else {
          elements = [
            ...friendsToSelectRef.current.map((f) => `friend-pill-${f}`),
            'add-friend-btn',
            'exp-title',
            'expense-scan-btn',
            'expense-notes-btn',
            'val-entry',
            'expense-recurrence-btn',
            'expense-date-btn',
            'payer-select',
            'split-mode-select',
            ...(attachmentsRef.current && attachmentsRef.current.length > 0
              ? attachmentsRef.current.map((_, idx) => `attachment-btn-${idx}`)
              : []),
            'save-expense-btn',
          ];
        }

        if (activeEl) {
          const idx = elements.indexOf(activeEl.id);
          if (idx !== -1) {
            e.preventDefault();
            const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
            let nextIdx = isNext ? idx + 1 : idx - 1;
            if (nextIdx < 0) nextIdx = elements.length - 1;
            if (nextIdx >= elements.length) nextIdx = 0;
            const nextEl = document.getElementById(elements[nextIdx]);
            nextEl?.focus();
            if (nextEl?.tagName === 'INPUT') {
              (nextEl as HTMLInputElement).select?.();
            }
          }
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.id === 'expense-date-btn' ||
            activeEl.id === 'expense-notes-btn' ||
            activeEl.id === 'expense-scan-btn' ||
            activeEl.id === 'expense-recurrence-btn' ||
            activeEl.id === 'shares-done-btn' ||
            activeEl.id.startsWith('friend-pill-') ||
            activeEl.id.startsWith('attachment-btn-'))
        ) {
          e.preventDefault();
          (activeEl as HTMLElement).click();
          return;
        }
      }

      if (e.key === 'Enter') {
        if (document.activeElement?.id === 'exp-title' && showSuggestionsRef.current) return;
        const activeEl = document.activeElement;

        if (showSharesPopupRef.current) {
          if (activeEl) {
            if (activeEl.id === 'shares-val-input') {
              e.preventDefault();
              e.stopPropagation();
              document.getElementById('shares-split-mode-select')?.focus();
            } else if (activeEl.id === 'shares-split-mode-select') {
              e.preventDefault();
              e.stopPropagation();
              const firstFriend = selectedSplittersRef.current[0];
              if (firstFriend) {
                const el = document.getElementById(`share-input-${firstFriend}`);
                el?.focus();
                (el as HTMLInputElement).select?.();
              } else {
                document.getElementById('shares-done-btn')?.focus();
              }
            } else if (activeEl.id.startsWith('share-input-')) {
              e.preventDefault();
              e.stopPropagation();
              const friendId = activeEl.id.replace('share-input-', '');
              const friends = selectedSplittersRef.current;
              const idx = friends.indexOf(friendId);
              if (idx !== -1 && idx + 1 < friends.length) {
                const nextFriend = friends[idx + 1];
                const el = document.getElementById(`share-input-${nextFriend}`);
                if (el) {
                  el.focus();
                  (el as HTMLInputElement).select?.();
                }
              } else {
                document.getElementById('shares-done-btn')?.focus();
              }
            }
          }
          return;
        }

        if (!activeEl || activeEl === document.body) {
          if (!titleRef.current) {
            document.getElementById('exp-title')?.focus();
          } else if (!amtRef.current) {
            document.getElementById('val-entry')?.focus();
          } else {
            setTimeout(() => document.getElementById('payer-select')?.focus(), 20);
          }
        } else if (activeEl.id === 'exp-title') {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('val-entry')?.focus();
        } else if (activeEl.id === 'val-entry') {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => document.getElementById('payer-select')?.focus(), 20);
        } else if (activeEl.id === 'payer-select') {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('split-mode-select')?.focus();
        } else if (activeEl.id === 'split-mode-select') {
          e.preventDefault();
          e.stopPropagation();
          if (splitModeRef.current !== 'Equally') {
            setShowSharesPopup(true);
            setTimeout(() => {
              const el = document.getElementById('shares-val-input');
              el?.focus();
              (el as HTMLInputElement).select?.();
            }, 50);
          } else {
            if (isValidRef.current && titleRef.current) {
              handleSaveRef.current();
            } else {
              document.getElementById('save-expense-btn')?.focus();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    localGId,
    setLocalGId,
    activeGroup,
    selectedSplitters,
    setSelectedSplitters,
    amt,
    setAmt,
    payer,
    setPayer,
    title,
    setTitle,
    overrideEmoji,
    setOverrideEmoji,
    showGroupDropdown,
    setShowGroupDropdown,
    showSuggestions,
    setShowSuggestions,
    selIdx,
    setSelIdx,
    date,
    setDate,
    splitMode,
    setSplitMode,
    shares,
    setShares,
    notes,
    setNotes,
    showNotesPopup,
    setShowNotesPopup,
    showDatePopup,
    setShowDatePopup,
    tempNotes,
    setTempNotes,
    recurrence,
    setRecurrence,
    showRecurrencePopup,
    setShowRecurrencePopup,
    recurrenceContainerRef,
    showSharesPopup,
    setShowSharesPopup,
    descriptionContainerRef,
    curr,
    setCurr,
    manualEdits,
    setManualEdits,
    shouldShake,
    setShouldShake,
    isScanning,
    setIsScanning,
    showScannerModal,
    setShowScannerModal,
    highlightAddFriend,
    setHighlightAddFriend,
    attachments,
    setAttachments,
    tagsInput,
    setTagsInput,
    showAttachmentsPreview,
    setShowAttachmentsPreview,
    activeAttachmentIndex,
    setActiveAttachmentIndex,
    showValidationErrorPopup,
    setShowValidationErrorPopup,
    showFriendPickerPopup,
    setShowFriendPickerPopup,
    friendPickerSearch,
    setFriendPickerSearch,
    friendPickerEmail,
    setFriendPickerEmail,
    apiError,
    setApiError,
    openScanner,
    handleScanComplete,
    allKnownFriends,
    friendsToSelect,
    payerOptions,
    filteredSuggs,
    currentEmoji,
    triggerShake,
    handleShareChange,
    totalShares,
    getShareAmt,
    isValid,
    handleSave,
    blurTimeoutRef,
  };
}
