import { useState, useEffect, useMemo } from 'react';
import { Group, Expense, UserMetadata } from '../lib/types';
import { simplifyMultiCurrencyDebts } from '../lib/calculations';
import { getEmoji } from '../lib/utils';

export interface UseGroupDetailFormProps {
  selectedId: string | number | null;
  groups: Group[];
  expenses: Expense[];
  getMemberBalance: (gId: string | number | null, member: string) => Record<string, number>;
  setView: (v: string) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  me: string;
}

export function useGroupDetailForm({
  selectedId,
  groups,
  expenses,
  getMemberBalance,
  setView,
  setGroups,
  setExpenses,
  me,
}: UseGroupDetailFormProps) {
  const currentId = selectedId;
  const selectedGroup = useMemo(() => {
    return selectedId === 'STANDALONE'
      ? {
          id: 'STANDALONE',
          name: 'Non-Group Expenses',
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
          currency: '₹',
          emoji: '👤',
          simplifyDebts: false,
        }
      : groups.find((g) => String(g.id) === String(selectedId));
  }, [selectedId, groups, expenses, me]);

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(selectedGroup?.name || '');
  const [nameError, setNameError] = useState('');
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  const [openExpId, setOpenExpId] = useState<string | number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [showPaybackPlan, setShowPaybackPlan] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances'>('expenses');
  const [filterFriend, setFilterFriend] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showGroupOptionsMenu, setShowGroupOptionsMenu] = useState(false);

  useEffect(() => {
    if (selectedGroup) {
      if (selectedGroup.name === '') {
        setIsRenaming(true);
        setNewName('');
      } else {
        setIsRenaming(false);
        setNewName(selectedGroup.name);
      }
    }
  }, [selectedId, groups]);

  useEffect(() => {
    const closeDrop = () => {
      setOpenExpId(null);
      setShowExportMenu(false);
      setShowFriendsList(false);
      setShowGroupOptionsMenu(false);
    };
    window.addEventListener('click', closeDrop);
    return () => window.removeEventListener('click', closeDrop);
  }, []);

  const handleExportCSV = () => {
    if (!selectedGroup) return;
    const currentGId = String(selectedId);
    const groupExpenses = expenses.filter((e) => String(e.gId) === currentGId);
    const baseCurrency = selectedGroup.currency || '₹';
    
    const headers = ['Date', 'Title', 'Category', 'Paid By', 'Split Mode', 'Split Members', 'Total Amount', 'Currency'].join(',');
    
    const rows = groupExpenses.map((e) => {
      const isSettlement = e.title.includes('🤝 Settlement');
      const category = getEmoji(e.title) || (isSettlement ? '🤝' : '📄');
      
      const escapedTitle = `"${e.title.replace(/"/g, '""')}"`;
      const escapedCategory = `"${category.replace(/"/g, '""')}"`;
      const escapedPaidBy = `"${e.paid.replace(/"/g, '""')}"`;
      const escapedSplitMode = `"${(e.mode || 'Equally').replace(/"/g, '""')}"`;
      
      const splitters = e.splitters || selectedGroup.members || [];
      const escapedSplitters = `"${splitters.join(', ').replace(/"/g, '""')}"`;
      
      return [
        e.date,
        escapedTitle,
        escapedCategory,
        escapedPaidBy,
        escapedSplitMode,
        escapedSplitters,
        e.amt.toFixed(2),
        e.currency || baseCurrency
      ].join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedGroup.name.replace(/\s+/g, '_')}_Expenses_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!selectedGroup) return;
    const currentGId = String(selectedId);
    const groupExpenses = expenses.filter((e) => String(e.gId) === currentGId);
    const baseCurrency = selectedGroup.currency || '₹';

    const memberBalances = Array.from(new Set(selectedGroup.members)).map((m) => {
      const bal = getMemberBalance(selectedId, m);
      return { name: m, balance: bal };
    });

    const pairDebts: Record<string, Record<string, number>> = {};
    groupExpenses.forEach((e) => {
      const splitters = e.splitters || selectedGroup.members;
      const c = e.currency || selectedGroup.currency || '₹';
      splitters.forEach((s) => {
        if (s !== e.paid) {
          const amtVal =
            !e.mode || e.mode === 'Equally'
              ? e.amt / (splitters.length || 1)
              : e.mode === 'Unequally'
              ? parseFloat(e.shares?.[s]?.toString() || '0')
              : (e.amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
          if (amtVal > 0.01) {
            const key = `${s}-${e.paid}`;
            if (!pairDebts[key]) pairDebts[key] = {};
            pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
          }
        }
      });
    });

    const rawTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
    const processedPairs = new Set<string>();

    Object.keys(pairDebts).forEach((key) => {
      const [from, to] = key.split('-');
      const reverseKey = `${to}-${from}`;
      if (processedPairs.has(key)) return;
      const currencies = new Set([
        ...Object.keys(pairDebts[key] || {}),
        ...Object.keys(pairDebts[reverseKey] || {}),
      ]);

      const balances: Record<string, number> = {};
      currencies.forEach((c) => {
        const debt = pairDebts[key]?.[c] || 0;
        const credit = pairDebts[reverseKey]?.[c] || 0;
        const net = debt - credit;
        if (Math.abs(net) > 0.01) {
          balances[c] = net;
        }
      });

      if (Object.keys(balances).length > 0) {
        const hasOwed = Object.values(balances).some((v) => v > 0.01);
        const hasOwe = Object.values(balances).some((v) => v < -0.01);

        if (hasOwed && !hasOwe) {
          rawTransactions.push({ from, to, balances });
        } else if (hasOwe && !hasOwed) {
          const inverted: Record<string, number> = {};
          Object.entries(balances).forEach(([k, v]) => {
            inverted[k] = -v;
          });
          rawTransactions.push({ from: to, to: from, balances: inverted });
        } else if (hasOwed && hasOwe) {
          rawTransactions.push({ from, to, balances });
        }
      }
      processedPairs.add(key);
      processedPairs.add(reverseKey);
    });

    const simplifiedTransactions = simplifyMultiCurrencyDebts(
      selectedGroup.members,
      groupExpenses,
      selectedGroup.currency || '₹'
    );

    const useSimplify = !!selectedGroup.simplifyDebts;
    const finalTransactions = useSimplify ? simplifiedTransactions : rawTransactions;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocker prevented opening the print report! 🛑 Please allow popups for this site.');
      return;
    }

    const formatBalance = (bal: Record<string, number>) => {
      const entries = Object.entries(bal).filter(([_, v]) => Math.abs(v) > 0.01);
      if (entries.length === 0) return 'Fully Settled';
      return entries.map(([curr, val]) => `${curr}${val.toFixed(2)}`).join(', ');
    };

    const formatSettleBalance = (bal: Record<string, number>) => {
      return Object.entries(bal)
        .map(([curr, val]) => `${curr}${val.toFixed(2)}`)
        .join(', ');
    };

    const html = `
      <html>
        <head>
          <title>${selectedGroup.name} Expense Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1E293B;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              border-bottom: 2px solid #E2E8F0;
              padding-bottom: 20px;
              margin-bottom: 30px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-title {
              font-size: 28px;
              font-weight: 800;
              color: #1E293B;
            }
            .meta {
              font-size: 12px;
              color: #64748B;
              margin-top: 5px;
            }
            .section {
              margin-bottom: 40px;
            }
            .section-title {
              font-size: 18px;
              font-weight: 800;
              margin-bottom: 15px;
              color: #334155;
              border-bottom: 1px solid #F1F5F9;
              padding-bottom: 6px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th, td {
              text-align: left;
              padding: 10px 12px;
              font-size: 13px;
              border-bottom: 1px solid #F1F5F9;
            }
            th {
              font-weight: 800;
              color: #475569;
              background-color: #F8FAFC;
            }
            .positive {
              color: #16A34A;
              font-weight: 800;
            }
            .negative {
              color: #DC2626;
              font-weight: 800;
            }
            .settled {
              color: #64748B;
            }
            .due-card {
              background-color: #F8FAFC;
              border: 1.5px solid #E2E8F0;
              border-radius: 12px;
              padding: 12px 16px;
              margin-bottom: 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 14px;
            }
            .settled-banner {
              background-color: #ECFDF5;
              border: 1.5px solid #A7F3D0;
              color: #065F46;
              border-radius: 12px;
              padding: 14px;
              text-align: center;
              font-weight: 800;
              font-size: 14px;
            }
            @media print {
              body {
                padding: 20px;
              }
              button {
                display: none;
              }
              @page {
                size: A4;
                margin: 20mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="header-title">🏘️ ${selectedGroup.name}</div>
              <div class="meta">Report Generated: ${new Date().toLocaleDateString()}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 800; color: #1E3A8A;">Total Group Spend</div>
              <div style="font-size: 24px; font-weight: 900; color: #1E293B;">
                ${baseCurrency}${groupExpenses.reduce((sum, e) => sum + (e.title.includes('🤝 Settlement') ? 0 : e.amt), 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">📊 Member Balances</div>
            <table>
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>Current Balance Status</th>
                </tr>
              </thead>
              <tbody>
                ${memberBalances.map((m) => {
                  const balStr = formatBalance(m.balance);
                  const isOweVal = Object.values(m.balance).some((v) => v < -0.01);
                  const isOwedVal = Object.values(m.balance).some((v) => v > 0.01);
                  const cl = isOwedVal ? 'positive' : isOweVal ? 'negative' : 'settled';
                  return `
                    <tr>
                      <td style="font-weight: 700;">${m.name}</td>
                      <td class="${cl}">${balStr}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">🚀 Payback Plan (Dues Settlements)</div>
            ${finalTransactions.length === 0 ? `
              <div class="settled-banner">
                Everyone is fully settled! 🎉 No pending payments.
              </div>
            ` : finalTransactions.map((t) => {
              const isInvolvedFrom = t.from === me;
              const isInvolvedTo = t.to === me;
              const color = isInvolvedFrom ? '#DC2626' : isInvolvedTo ? '#16A34A' : '#1E3A8A';
              return `
                <div class="due-card">
                  <div>
                    <strong>${t.from}</strong> pays <strong>${t.to}</strong>
                  </div>
                  <div style="font-weight: 900; color: ${color};">
                    ${formatSettleBalance(t.balances)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="section">
            <div class="section-title">📝 Expense Ledger Activity</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Paid By</th>
                  <th>Split Details</th>
                  <th style="text-align: right;">Cost</th>
                </tr>
              </thead>
              <tbody>
                ${groupExpenses.map((e) => {
                  const isSettle = e.title.includes('🤝 Settlement');
                  const splitters = e.splitters || selectedGroup.members || [];
                  const isPersonal = splitters.length === 1 && splitters[0] === e.paid;
                  const splitText = isSettle
                    ? 'Settlement'
                    : isPersonal
                    ? 'Personal Expense'
                    : `${e.mode || 'Equally'} (${splitters.join(', ')})`;
                  return `
                    <tr>
                      <td style="color: #64748B; white-space: nowrap;">${e.date}</td>
                      <td style="font-weight: 600;">${e.title}</td>
                      <td>${e.paid}</td>
                      <td style="color: #64748B; font-size: 11px;">${splitText}</td>
                      <td style="text-align: right; font-weight: 700; ${isSettle ? 'color: #10B981;' : ''}">
                        ${e.currency || baseCurrency}${e.amt.toFixed(2)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="text-align: center; margin-top: 50px; font-size: 10px; color: #94A3B8; font-weight: 700; letter-spacing: 1px;">
            GENERATED WITH DIVIDO BILL SPLITTER ⚡
          </div>

          <script>
            window.onload = function() {
              window.focus();
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleCancel = () => {
    if (!selectedGroup) return;
    if (selectedGroup.name === '') {
      setGroups(groups.filter((g) => g.id !== selectedId));
      setView('summary');
    } else {
      setIsRenaming(false);
      setNewName(selectedGroup.name);
      setNameError('');
    }
  };

  const handleRename = () => {
    if (!selectedGroup) return;
    const trimmed = newName.trim();
    setNameError('');
    if (trimmed) {
      const isDuplicate = groups.some(
        (g) => g.id !== selectedId && g.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (isDuplicate) {
        setNameError('This Group name already exists! 🏘️');
        return;
      }
      setGroups(groups.map((g) => (g.id === currentId || g.id === selectedId) ? { ...g, name: trimmed } : g));
      setIsRenaming(false);
    } else {
      if (selectedGroup.name && selectedGroup.name !== '') {
        setIsRenaming(false);
        setNewName(selectedGroup.name);
      }
    }
  };

  const handleClearAll = () => {
    if (
      confirm(
        'Are you sure you want to clear all activity in this group? 🧹\n\nThis will permanently delete all expenses and settlements in this group.'
      )
    ) {
      setExpenses(expenses.filter((e) => String(e.gId) !== String(selectedId)));
    }
  };

  const filtered = expenses.filter((e) => {
    if (String(e.gId) !== String(selectedId)) return false;
    if (e.paid === 'SYSTEM') return false;
    const splitters = e.splitters || selectedGroup?.members || [];
    if (filter !== 'all' && e.paid !== filter && !splitters.includes(filter)) return false;
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      if (Number(e.id || Date.now()) < cutoff) return false;
    }
    if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedTag !== 'all') {
      if (!e.tags || !e.tags.includes(selectedTag)) return false;
    }
    return true;
  });

  const { savedTransCount, myTrans, otherTrans, finalTransactions } = useMemo(() => {
    if (!selectedGroup) return { savedTransCount: 0, myTrans: [], otherTrans: [], finalTransactions: [] };
    const pairDebts: Record<string, Record<string, number>> = {};
    const currentGId = String(selectedId);
    const groupExpenses = expenses.filter((e) => String(e.gId) === currentGId);
    
    groupExpenses.forEach((e) => {
      const splitters = e.splitters || selectedGroup.members || [];
      const c = e.currency || selectedGroup.currency || '₹';
      splitters.forEach((s) => {
        if (s !== e.paid) {
          const amtVal =
            !e.mode || e.mode === 'Equally'
              ? e.amt / (splitters.length || 1)
              : e.mode === 'Unequally'
              ? parseFloat(e.shares?.[s]?.toString() || '0')
              : (e.amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
          if (amtVal > 0.01) {
            const key = `${s}-${e.paid}`;
            if (!pairDebts[key]) pairDebts[key] = {};
            pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
          }
        }
      });
    });

    const rawTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
    const processedPairs = new Set<string>();

    Object.keys(pairDebts).forEach((key) => {
      const [from, to] = key.split('-');
      const reverseKey = `${to}-${from}`;
      if (processedPairs.has(key)) return;
      const currencies = new Set([
        ...Object.keys(pairDebts[key] || {}),
        ...Object.keys(pairDebts[reverseKey] || {}),
      ]);

      const balances: Record<string, number> = {};
      currencies.forEach((c) => {
        const debt = pairDebts[key]?.[c] || 0;
        const credit = pairDebts[reverseKey]?.[c] || 0;
        const net = debt - credit;
        if (Math.abs(net) > 0.01) {
          balances[c] = net;
        }
      });

      if (Object.keys(balances).length > 0) {
        const hasOwed = Object.values(balances).some((v) => v > 0.01);
        const hasOwe = Object.values(balances).some((v) => v < -0.01);

        if (hasOwed && !hasOwe) {
          rawTransactions.push({ from, to, balances });
        } else if (hasOwe && !hasOwed) {
          const inverted: Record<string, number> = {};
          Object.entries(balances).forEach(([k, v]) => {
            inverted[k] = -v;
          });
          rawTransactions.push({ from: to, to: from, balances: inverted });
        } else if (hasOwed && hasOwe) {
          rawTransactions.push({ from, to, balances });
        }
      }
      processedPairs.add(key);
      processedPairs.add(reverseKey);
    });

    const simplifiedTransactions = simplifyMultiCurrencyDebts(
      selectedGroup.members || [],
      groupExpenses,
      selectedGroup.currency || '₹'
    );

    const finalTransactions = selectedGroup.id !== 'STANDALONE' && selectedGroup.simplifyDebts
      ? simplifiedTransactions
      : rawTransactions;
    const rawTransCount = rawTransactions.length;
    const simpTransCount = simplifiedTransactions.length;
    const savedTransCount = rawTransCount - simpTransCount;

    const myTrans = finalTransactions.filter((t) => t.from === me || t.to === me);
    const otherTrans = finalTransactions.filter((t) => t.from !== me && t.to !== me);

    return {
      savedTransCount,
      myTrans,
      otherTrans,
      finalTransactions
    };
  }, [selectedId, expenses, selectedGroup, me]);

  const hasExpenses = expenses.some((e) => String(e.gId) === String(selectedId) && e.paid !== 'SYSTEM');
  const groupUniqueTags = useMemo(() => Array.from(new Set(expenses.filter(e => String(e.gId) === String(selectedId)).flatMap(e => e.tags || []))), [expenses, selectedId]);

  return {
    currentId,
    selectedGroup,
    isRenaming,
    setIsRenaming,
    newName,
    setNewName,
    nameError,
    setNameError,
    filter,
    setFilter,
    dateRange,
    setDateRange,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    openExpId,
    setOpenExpId,
    showExportMenu,
    setShowExportMenu,
    showFriendsList,
    setShowFriendsList,
    showPaybackPlan,
    setShowPaybackPlan,
    showInfo,
    setShowInfo,
    activeTab,
    setActiveTab,
    filterFriend,
    setFilterFriend,
    filterType,
    setFilterType,
    showGroupOptionsMenu,
    setShowGroupOptionsMenu,
    handleExportCSV,
    handleExportPDF,
    handleCancel,
    handleRename,
    handleClearAll,
    filtered,
    savedTransCount,
    myTrans,
    otherTrans,
    finalTransactions,
    hasExpenses,
    groupUniqueTags,
  };
}
