import React, { useState, useEffect } from 'react';
import { BalanceDisplay } from './BalanceDisplay';
import { getEmoji, GROUP_COLORS, formatCompactAmount, parseExpenseId } from '../lib/utils';
import { StyledDropdown } from './StyledDropdown';

// Pill-style trigger for the compact filter dropdowns (matches the old selects).
const filterBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 600, background: '#F1F5F9', color: '#475569', boxShadow: 'none' };
import { simplifyMultiCurrencyDebts } from '../lib/calculations';

import { Group, Expense, UserMetadata } from '../lib/types';

interface MasterSummaryProps {
  groups: Group[];
  expenses: Expense[];
  getMemberBalance: (groupId: string | number, memberName: string) => Record<string, number>;
  setSelectedId: (id: string | number | null) => void;
  setView: (view: string) => void;
  setGroups: (groups: Group[]) => void;
  setExpenses: (expenses: Expense[]) => void;
  setShowCurrPickerId: (id: string | null) => void;
  showCurrPickerId: string | null;
  handleRenameGroup: (id: string | number) => void;
  handleDeleteGroup: (id: string | number) => void;
  me: string;
  setShowExpModal: (show: boolean) => void;
  setEditingExpense: (exp: Expense | null) => void;
  globalSettleData: any;
  setGlobalSettleData: (data: any) => void;
  userMetadata: Record<string, UserMetadata>;
  setUserMetadata: (meta: Record<string, UserMetadata>) => void;
  onShowQR: (payee: string, amt: number, curr: string) => void;
  // Make props optional or define them to prevent typescript issues
  timeFilter?: any;
  setTimeFilter?: any;
  balanceFilter?: any;
  setBalanceFilter?: any;
  showTimeMenu?: any;
  setShowTimeMenu?: any;
  searchNonce?: number;
  searchQuery?: string;
  setSearchQuery?: (val: string) => void;
  onCreateGroup?: () => void;
  loading?: boolean;
}

export const MasterSummary: React.FC<MasterSummaryProps> = ({
  groups,
  expenses,
  getMemberBalance,
  setSelectedId,
  setView,
  setGroups,
  setExpenses,
  setShowCurrPickerId,
  showCurrPickerId,
  handleRenameGroup,
  handleDeleteGroup,
  me,
  setShowExpModal,
  setEditingExpense,
  globalSettleData,
  setGlobalSettleData,
  userMetadata,
  setUserMetadata,
  onShowQR,
  searchNonce,
  searchQuery = '',
  setSearchQuery = () => {},
  onCreateGroup,
  loading = false,
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | number | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | '30days' | '7days'>('all');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owe' | 'owed' | 'settled'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const budgetDismissKey = `budgetBannerDismissed_${new Date().getFullYear()}_${new Date().getMonth()}`;
  const [budgetBannerDismissed, setBudgetBannerDismissed] = useState(() => localStorage.getItem(budgetDismissKey) === '1');
  const [upiBannerDismissed, setUpiBannerDismissed] = useState(() => localStorage.getItem('divido_upi_banner_dismissed') === '1');

  useEffect(() => {
    const closeDrop = () => {
      setOpenDropdownId(null);
    };
    window.addEventListener('click', closeDrop);
    return () => window.removeEventListener('click', closeDrop);
  }, []);

  // Header search icon opens the filter panel (which contains the search field)
  useEffect(() => {
    if (searchNonce) setShowFilters(true);
  }, [searchNonce]);

  const netBalances: Record<string, number> = {};
  // Calculate overall netBalances by accumulating from the simplified group plans and standalone expenses
  // This guarantees perfect sync across MasterSummary and FriendsView.
  groups.forEach((g) => {
    const groupExps = expenses.filter((e) => String(e.gId) === String(g.id));
    const effectiveMembers = Array.from(new Set([
      me,
      ...groupExps.reduce((acc, e) => {
        if (e.paid) acc.add(e.paid);
        if (Array.isArray(e.splitters)) {
          e.splitters.forEach((s) => acc.add(s));
        }
        return acc;
      }, new Set<string>())
    ]));

    const useSimplify = g.id !== 'STANDALONE' && !!g.simplifyDebts;
    let groupTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
    
    if (useSimplify) {
      groupTransactions = simplifyMultiCurrencyDebts(effectiveMembers, groupExps, g.currency || '₹');
    } else {
      const pairDebts: Record<string, Record<string, number>> = {};
      groupExps.forEach((e) => {
        const splitters = e.splitters || effectiveMembers;
        const c = e.currency || g.currency || '₹';
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
            groupTransactions.push({ from, to, balances });
          } else if (hasOwe && !hasOwed) {
            const inverted: Record<string, number> = {};
            Object.entries(balances).forEach(([k, v]) => {
              inverted[k] = -v;
            });
            groupTransactions.push({ from: to, to: from, balances: inverted });
          } else if (hasOwed && hasOwe) {
            groupTransactions.push({ from, to, balances });
          }
        }
        processedPairs.add(key);
        processedPairs.add(reverseKey);
      });
    }

    groupTransactions.forEach((t) => {
      if (t.from === me) {
        Object.entries(t.balances).forEach(([curr, val]) => {
          netBalances[curr] = (netBalances[curr] || 0) - val;
        });
      } else if (t.to === me) {
        Object.entries(t.balances).forEach(([curr, val]) => {
          netBalances[curr] = (netBalances[curr] || 0) + val;
        });
      }
    });
  });

  const isWithinRange = (dateStr: string, days: number) => {
    try {
      const expDate = new Date(dateStr);
      const diffTime = Math.abs(Date.now() - expDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= days;
    } catch {
      return false;
    }
  };

  const nonGroupBal = getMemberBalance('STANDALONE', me);
  const nonGroupExps = expenses.filter((e) => String(e.gId) === 'STANDALONE');
  const nonGroupMembers = Array.from(new Set(nonGroupExps.flatMap((e) => e.splitters || [])));
  
  const nonGroupRels = nonGroupMembers
    .filter((m) => m !== me)
    .map((m) => {
      const rel: Record<string, number> = {};
      nonGroupExps.forEach((e) => {
        const curr = e.currency || '₹';
        if (!rel[curr]) rel[curr] = 0;
        const splitters = e.splitters && e.splitters.length > 0 ? e.splitters : [e.paid];
        const amount = parseFloat(e.amt.toString()) || 0;
        const myShare = !e.mode || e.mode === 'Equally' ? amount / splitters.length : e.mode === 'Unequally' ? parseFloat(e.shares?.[me]?.toString() || '0') : (amount * parseFloat(e.shares?.[me]?.toString() || '0')) / 100;
        const otherShare = !e.mode || e.mode === 'Equally' ? amount / splitters.length : e.mode === 'Unequally' ? parseFloat(e.shares?.[m]?.toString() || '0') : (amount * parseFloat(e.shares?.[m]?.toString() || '0')) / 100;
        if (e.paid === me && splitters.includes(m)) rel[curr] += otherShare;
        if (e.paid === m && splitters.includes(me)) rel[curr] -= myShare;
      });
      return { name: m, balances: rel };
    })
    .filter((r) => Object.values(r.balances).some((v) => Math.abs(v) > 0.01));

  const filteredGroups = groups.filter((g) => {
    if (g.name.trim() === '' && !expenses.some((e) => String(e.gId) === String(g.id)) && g.members.length <= 1) {
      return false;
    }
    
    // Search filter
    if (searchQuery && !g.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    const groupExps = expenses.filter((e) => String(e.gId) === String(g.id));

    // Time filter
    if (timeFilter !== 'all') {
      const limitDays = timeFilter === '30days' ? 30 : 7;
      const hasRecentExps = groupExps.some((e) => isWithinRange(e.date, limitDays));
      if (!hasRecentExps) return false;
    }

    // Balance filter
    if (balanceFilter !== 'all') {
      const bal = getMemberBalance(g.id, me);
      const totalNet = Object.values(bal).reduce((a, b) => a + b, 0);
      if (balanceFilter === 'owed' && totalNet <= 0.01) return false;
      if (balanceFilter === 'owe' && totalNet >= -0.01) return false;
      if (balanceFilter === 'settled' && Math.abs(totalNet) > 0.01) return false;
    }

    return true;
  });

  const standaloneExps = expenses.filter((e) => e.gId === 'STANDALONE');
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
        netBalances[c] = (netBalances[c] || 0) + otherShare;
      });
    } else if (splitters.includes(me)) {
      const payer = e.paid;
      const myShare =
        !e.mode || e.mode === 'Equally'
          ? amount / splitters.length
          : e.mode === 'Unequally'
          ? parseFloat(e.shares?.[me]?.toString() || '0')
          : (amount * parseFloat(e.shares?.[me]?.toString() || '0')) / 100;
      netBalances[c] = (netBalances[c] || 0) - myShare;
    }
  });

  const totalOwed = Object.values(netBalances).filter(v => v > 0.01).reduce((sum, v) => sum + v, 0);
  const totalOwe = Object.values(netBalances).filter(v => v < -0.01).reduce((sum, v) => sum + Math.abs(v), 0);
  const showCompact = (totalOwed > 0.01 && totalOwe <= 0.01) || (totalOwe > 0.01 && totalOwed <= 0.01);

  let netCardTheme = {
    bg: '#FFFFFF',
    border: '#E2E8F0',
    shadow: '#CBD5E1',
    text: '#64748B',
    avatarBg: '#F1F5F9',
    avatarText: '#64748B'
  };

  if (totalOwed > 0.01 && totalOwe <= 0.01) {
    netCardTheme = {
      bg: '#FFFFFF',
      border: '#A7F3D0',
      shadow: '#6EE7B7',
      text: '#065F46',
      avatarBg: '#DCFCE7',
      avatarText: '#15803D'
    };
  } else if (totalOwe > 0.01 && totalOwed <= 0.01) {
    netCardTheme = {
      bg: '#FFFFFF',
      border: '#FECDD3',
      shadow: '#FDA4AF',
      text: '#9F1239',
      avatarBg: '#FEE2E2',
      avatarText: '#B91C1C'
    };
  } else if (totalOwed > 0.01 && totalOwe > 0.01) {
    netCardTheme = {
      bg: '#FFFFFF',
      border: '#BFDBFE',
      shadow: '#93C5FD',
      text: '#0369A1',
      avatarBg: '#EFF6FF',
      avatarText: '#1D4ED8'
    };
  }

  const exceededBudgets = (() => {
    const budgets = userMetadata[me]?.budgets || {};
    const budgetEntries = Object.entries(budgets).filter(([_, amt]) => amt !== undefined && amt !== null && amt !== '');
    if (budgetEntries.length === 0) return [];

    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const thisMonthExpenses = expenses.filter((e) => e.date.startsWith(currentMonthKey));
    const spentByCategory = thisMonthExpenses.reduce<Record<string, number>>((acc, e) => {
      const emoji = e.category || getEmoji(e.title) || '⚡';
      acc[emoji] = (acc[emoji] || 0) + (parseFloat(e.amt.toString()) || 0);
      return acc;
    }, {});

    return budgetEntries
      .map(([emoji, limit]) => {
        const spent = spentByCategory[emoji] || 0;
        const limitNum = parseFloat(String(limit)) || 0;
        return { emoji, spent, limit: limitNum };
      })
      .filter((b) => b.spent > b.limit);
  })();

  const hasNoUpi = !userMetadata[me]?.upiId;

  return (
    <div className="content-width-limit">
      {hasNoUpi && !upiBannerDismissed && (
        <div
          className="card shadow-sm hover-up-mini"
          onClick={() => {
            sessionStorage.setItem('divido_autofocus_upi', 'true');
            setView('profile');
          }}
          style={{
            background: 'var(--w)',
            border: '1.5px solid var(--bg)',
            borderRadius: '999px',
            padding: '6px 16px 6px 8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.02)',
            animation: 'fadeIn 0.4s ease-out',
            cursor: 'pointer',
          }}
        >
          {/* Orange UPI Circular Badge */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#FFFFFF', fontStyle: 'italic', fontWeight: 900, fontSize: '10px', letterSpacing: '-0.3px' }}>UPI</span>
          </div>

          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 800,
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.1px',
            }}
          >
            <span style={{ color: 'var(--t)' }}>Link UPI </span>
            <span style={{ color: 'var(--g)', fontWeight: 500, fontSize: '11px', marginLeft: '2px' }}>to receive instantly</span>
          </span>

          {/* Action Arrow */}
          <span
            style={{
              color: '#EA580C',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              transition: 'transform 0.15s',
            }}
            className="arrow-hover-right"
          >
            →
          </span>

          {/* Dismiss Icon */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setUpiBannerDismissed(true);
              localStorage.setItem('divido_upi_banner_dismissed', '1');
            }}
            style={{
              color: '#94A3B8',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px 4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
            title="Dismiss"
          >
            ×
          </span>
        </div>
      )}

      {exceededBudgets.length > 0 && !budgetBannerDismissed && (
        <div
          className="card shadow-sm hover-up-mini"
          style={{
            background: '#FFF5F5',
            border: '1px solid #FCA5A5',
            borderRadius: '14px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            animation: 'fadeIn 0.4s ease-out',
            textAlign: 'left',
            position: 'relative',
          }}
        >
          <button
            onClick={() => { setBudgetBannerDismissed(true); localStorage.setItem(budgetDismissKey, '1'); }}
            style={{
              position: 'absolute', top: '10px', right: '12px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '16px', color: '#FCA5A5', lineHeight: 1, padding: '2px',
              fontWeight: 900,
            }}
            title="Dismiss"
          >×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <span style={{ fontSize: '28px' }}>⚠️</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <h4 className="nunito" style={{ fontSize: '15px', color: '#B91C1C', margin: 0, fontWeight: 900 }}>
                Monthly Budget Exceeded!
              </h4>
              <p style={{ fontSize: '12px', fontWeight: 800, color: '#DC2626', margin: 0, opacity: 0.8 }}>
                You have exceeded your limit in: {exceededBudgets.map(b => `${b.emoji} (${b.spent.toFixed(0)} / ${b.limit})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('analytics')}
            style={{
              padding: '8px 16px',
              background: '#EF4444',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(239, 68, 68, 0.15)'
            }}
          >
            Check Analytics
          </button>
        </div>
      )}

      {(() => {
        const hasActiveBalancesForCard = totalOwed > 0.01 || totalOwe > 0.01;
        const netEntries = Object.entries(netBalances).filter(([_, v]) => Math.abs(v) > 0.01);
        const getBacks = netEntries.filter(([_, v]) => v > 0.01);
        const payBacks = netEntries.filter(([_, v]) => v < -0.01);

        // Only the primary currency's amount is shown in the pill; the small label
        // above it carries a "+N" when more currencies exist (full detail on tap).
        const primaryAmt = (entries: [string, number][]) => {
          const [curr, val] = entries[0];
          return `${curr}${formatCompactAmount(val)}`;
        };

        const PINK = '#DC2626';
        const GREEN = '#059669';

        // Original single-line look (regular weight, no uppercase). Segments size
        // to content so the longer side gets room; ellipsis is the safety net.
        const segStyle: React.CSSProperties = {
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0 10px',
          cursor: 'pointer',
        };
        // Small translucent count chip for extra currencies (e.g. "+1").
        const chipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.28)', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, flexShrink: 0 };

        return (
          <div style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px' }}>
              Net Balance
            </div>

            <div onClick={() => hasActiveBalancesForCard && setView('friends')} style={{ position: 'relative', display: 'flex', height: '36px', borderRadius: '999px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.06)', cursor: hasActiveBalancesForCard ? 'pointer' : 'default' }}>
              {!hasActiveBalancesForCard ? (
                <div style={{ ...segStyle, background: GREEN, cursor: 'default' }}>All settled up</div>
              ) : (
                <>
                  {payBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: PINK }}
                      onClick={() => setView('friends')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryAmt(payBacks)} to pay</span>
                      {payBacks.length > 1 && <span style={chipStyle}>+{payBacks.length - 1}</span>}
                    </div>
                  )}
                  {getBacks.length > 0 && (
                    <div
                      style={{ ...segStyle, background: GREEN }}
                      onClick={() => setView('friends')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{primaryAmt(getBacks)} to collect</span>
                      {getBacks.length > 1 && <span style={chipStyle}>+{getBacks.length - 1}</span>}
                    </div>
                  )}
                </>
              )}
              {hasActiveBalancesForCard && (
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF', fontSize: '20px', fontWeight: 900, lineHeight: 1, pointerEvents: 'none', opacity: 0.9 }}>›</span>
              )}
            </div>
          </div>
        );
      })()}


      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Section header: title + funnel */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0 2px 2px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C' }}>
            Your groups · {filteredGroups.length} active
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowFilters(!showFilters); }}
            title="Filters"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '44px',
              height: '44px',
              marginRight: '-7px',
              padding: 0,
              opacity: showFilters || searchQuery || timeFilter !== 'all' || balanceFilter !== 'all' ? 1 : 0.55,
              transition: '0.2s all',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: searchQuery || timeFilter !== 'all' || balanceFilter !== 'all' ? '#059669' : '#8A8178',
              flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '17px', height: '17px' }}>
              <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Filters (search + pills), revealed by funnel */}
        {showFilters && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeIn 0.2s ease-out', marginBottom: '4px' }}>

            <div style={{ display: 'flex', gap: '8px' }}>
            <StyledDropdown
              fullWidth
              ariaLabel="Filter by time"
              value={timeFilter}
              onChange={(v) => setTimeFilter(v as any)}
              buttonStyle={filterBtnStyle}
              options={[
                { value: 'all', label: 'Any Time' },
                { value: '7days', label: 'Last 7 Days' },
                { value: '30days', label: 'Last 30 Days' },
              ]}
            />
            <StyledDropdown
              fullWidth
              ariaLabel="Filter by balance"
              value={balanceFilter}
              onChange={(v) => setBalanceFilter(v as any)}
              buttonStyle={filterBtnStyle}
              options={[
                { value: 'all', label: 'All Balances' },
                { value: 'owed', label: 'You Get Back' },
                { value: 'owe', label: 'You Pay Back' },
                { value: 'settled', label: 'Settled Up' },
              ]}
            />
            </div>
          </div>
        )}

        {/* Non-Group Expenses Card — Rendered as the first card in the Your Groups list */}
        <div
          key="STANDALONE"
          className="hover-up-mini"
          onClick={() => {
            setSelectedId('STANDALONE');
            setView('detail');
          }}
          style={{
            padding: '14px 16px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '0.5px solid #EFE7DC',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            transition: '0.2s all ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            cursor: 'pointer',
          }}
        >
          {/* Avatar + Title Block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#F1F5F9',
                border: 'none',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 950,
                flexShrink: 0,
              }}
            >
              NG
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                className="nunito"
                style={{
                  fontSize: '15px',
                  color: '#2E2A25',
                  fontWeight: 800,
                  margin: 0,
                  lineHeight: 1.2,
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                Non-Group Expenses
              </h3>
            </div>
          </div>

          {/* Balance / Status block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {nonGroupRels.length === 0 ? (
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#16A34A' }}>
                Settled Up
              </span>
            ) : (
              (() => {
                const nonGroupEntries = Object.entries(nonGroupBal).filter(([_, v]) => Math.abs(v) > 0.01);
                return (
                  <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {nonGroupEntries.slice(0, 2).map(([curr, val], idx, shown) => {
                      const isOwed = val > 0.01;
                      const isLast = idx === shown.length - 1;
                      return (
                        <span key={curr} style={{ color: isOwed ? '#16A34A' : '#EF4444' }}>
                          {isOwed ? '+' : '-'}{curr}{Math.abs(val).toFixed(0)}
                          {!isLast && <span style={{ color: '#94A3B8' }}>, </span>}
                        </span>
                      );
                    })}
                    {nonGroupEntries.length > 2 && <span style={{ color: '#94A3B8' }}>…</span>}
                  </span>
                );
              })()
            )}
            <span style={{ fontSize: '18px', color: '#CFC6BB', fontWeight: 900, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>›</span>
          </div>
        </div>

        {/* Loading skeletons — while the first cloud load runs and there are no
            groups yet, show shimmer placeholders instead of an empty list, so a
            fresh sign-in never looks like "your groups are gone". */}
        {loading && filteredGroups.length === 0 && (
          <>
            <style>{`@keyframes sk-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
            {[0, 1, 2].map((i) => (
              <div key={`sk-${i}`} style={{ padding: '14px 16px', background: '#FFFFFF', borderRadius: '16px', border: '0.5px solid #EFE7DC', display: 'flex', alignItems: 'center', gap: '12px', animation: 'sk-pulse 1.2s ease-in-out infinite' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#EEE9E2', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ height: '12px', width: '55%', borderRadius: '6px', background: '#EEE9E2' }} />
                  <div style={{ height: '10px', width: '35%', borderRadius: '6px', background: '#F1ECE4' }} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* Group Cards List */}
        {filteredGroups.map((g, i) => {
          const c = GROUP_COLORS[i % GROUP_COLORS.length];
          const bal = getMemberBalance(g.id, me);

          // Calculate status message
          const groupExps = expenses.filter((e) => String(e.gId) === String(g.id));
          const simplified = simplifyMultiCurrencyDebts(g.members || [], groupExps, g.currency || '₹');
          const memberBals: Record<string, Record<string, number>> = {};
          simplified.forEach((t) => {
            if (t.from === me) {
              if (!memberBals[t.to]) memberBals[t.to] = {};
              Object.entries(t.balances).forEach(([c, v]) => {
                memberBals[t.to][c] = (memberBals[t.to][c] || 0) - v;
              });
            } else if (t.to === me) {
              if (!memberBals[t.from]) memberBals[t.from] = {};
              Object.entries(t.balances).forEach(([c, v]) => {
                memberBals[t.from][c] = (memberBals[t.from][c] || 0) + v;
              });
            }
          });
          
          const rels = Object.entries(memberBals).map(([name, balances]) => ({
            name,
            balances,
          })).filter((r) => Object.values(r.balances).some((v) => Math.abs(v) > 0.01));

          // Most recent activity for the subtitle line
          const lastExp = groupExps.slice().sort((a, b) => (b.date.localeCompare(a.date)) || (parseExpenseId(b.id) - parseExpenseId(a.id)))[0];
          const relTime = (dateStr: string) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            const day = Math.floor((Date.now() - d.getTime()) / 86400000);
            if (day <= 0) return 'today';
            if (day === 1) return 'yesterday';
            if (day < 7) return `${day}d ago`;
            if (day < 30) return `${Math.floor(day / 7)}w ago`;
            return `${Math.floor(day / 30)}mo ago`;
          };
          const subtitle = lastExp ? `Updated ${relTime(lastExp.date)}` : 'No expenses yet';

          const balEntries = Object.entries(bal).filter(([_, v]) => Math.abs(v) > 0.01);
          const payList = balEntries.filter(([_, v]) => v < -0.01);
          const collectList = balEntries.filter(([_, v]) => v > 0.01);
          const joinGroupPrimary = (entries: [string, number][]) => {
            if (entries.length === 0) return '';
            const [curr, val] = entries[0];
            return `${curr}${formatCompactAmount(val)}`;
          };
          const pillBase: React.CSSProperties = {
            padding: '2px 4px',
            borderRadius: '999px',
            fontSize: '13.5px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            textAlign: 'right',
          };
          // Count chip for extra currencies on white cards (text colour inherited).
          const cardChip: React.CSSProperties = { background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 800, lineHeight: '16px' };

          return (
            <div
              key={g.id}
              className="hover-up-mini"
              onClick={() => {
                setSelectedId(g.id);
                setView('detail');
              }}
              style={{
                position: 'relative',
                padding: '14px 16px',
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '0.5px solid #EFE7DC',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                transition: '0.2s all ease',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: c.bg,
                  color: c.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 900,
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {g.emoji && (g.emoji.startsWith('data:image/') || g.emoji.startsWith('http')) ? (
                  <img src={g.emoji} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                ) : (
                  g.name.charAt(0).toUpperCase() || '👤'
                )}
              </div>

              {/* Name + subtitle */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3
                  className="nunito"
                  style={{
                    fontSize: '17px',
                    color: '#2E2A25',
                    fontWeight: 800,
                    margin: 0,
                    lineHeight: 1.2,
                    opacity: g.name ? 1 : 0.5,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g.name || 'Untitled Group'}
                </h3>
              </div>

              {/* Balance pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', alignItems: 'flex-end', flexShrink: 0 }}>
                {balEntries.length === 0 ? (
                  <span style={{ ...pillBase, color: '#2C8A63' }}>Settled up</span>
                ) : (
                  <>
                    {payList.length > 0 && (
                      <span style={{ ...pillBase, color: '#D8608A', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                        {joinGroupPrimary(payList)} to pay
                        {payList.length > 1 && <span style={cardChip}>+{payList.length - 1}</span>}
                      </span>
                    )}
                    {collectList.length > 0 && (
                      <span style={{ ...pillBase, color: '#3FA97C', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                        {joinGroupPrimary(collectList)} to collect
                        {collectList.length > 1 && <span style={cardChip}>+{collectList.length - 1}</span>}
                      </span>
                    )}
                  </>
                )}
              </div>

              <span style={{ fontSize: '18px', color: '#C9BEB2', fontWeight: 900, lineHeight: 1, flexShrink: 0 }}>›</span>
            </div>
          );
        })}

        {/* New Group card — pinned at the bottom of the Your Groups list.
            Peach fill + solid orange border so it stands apart from the green. */}
        {onCreateGroup && (
          <button
            type="button"
            onClick={onCreateGroup}
            className="hover-up-mini"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '15px',
              background: '#FDECDD',
              borderRadius: '16px',
              border: '1.5px solid #F97316',
              color: '#C2410C',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: '0.2s all ease',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', display: 'block', flexShrink: 0 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span style={{ lineHeight: 1, display: 'block' }}>New Group</span>
          </button>
        )}
      </div>
    </div>
  );
};
