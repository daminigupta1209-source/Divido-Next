import React, { useState, useRef, useEffect } from 'react';
import { BalanceDisplay } from './BalanceDisplay';

import { Group, Expense, UserMetadata } from '../lib/types';
import { simplifyMultiCurrencyDebts } from '../lib/calculations';
import { worldCurrencies, formatCompactAmount } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
import { StyledDropdown } from './StyledDropdown';

// Small translucent count chip for extra currencies in the Net Balance pill.
const pillChipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.28)', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700, flexShrink: 0 };

interface FriendsViewProps {
  groups: Group[];
  expenses: Expense[];
  me: string;
  setView: (view: string) => void;
  setSelectedId: (id: string | number | null) => void;
  setGlobalSettleData: (data: any) => void;
  userMetadata: Record<string, UserMetadata>;
  setUserMetadata: (meta: Record<string, UserMetadata>) => void;
  searchQuery?: string;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  groups,
  expenses,
  me,
  setView,
  setSelectedId,
  setGlobalSettleData,
  userMetadata,
  searchQuery = '',
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showFriendsDropdown, setShowFriendsDropdown] = useState(false);
  const [showBalanceDropdown, setShowBalanceDropdown] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owed' | 'owe'>('all');
  const [convertTo, setConvertTo] = useState<string | null>(null);
  const [rateMap, setRateMap] = useState<Record<string, number>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState<string>('');
  const [showConvertPicker, setShowConvertPicker] = useState(false);
  const [manualRates, setManualRates] = useState(false);
  const [sourceCurr, setSourceCurr] = useState<string>('ALL');

  const masterBal: Record<string, Record<string, number>> = {};

  // Calculate friends' net balances by using the simplified transaction plans from each group.
  // This ensures that FriendsView perfectly syncs with simplified group balances.
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

    // Determine if we should simplify debts for this group (standalone is never simplified)
    const useSimplify = g.id !== 'STANDALONE' && !!g.simplifyDebts;
    
    // We get raw transaction directions or simplified outcomes matching standard ledger engines
    let groupTransactions: { from: string; to: string; balances: Record<string, number> }[] = [];
    if (useSimplify) {
      groupTransactions = simplifyMultiCurrencyDebts(effectiveMembers, groupExps, g.currency || '₹');
    } else {
      // Manual non-simplified calculation path matching GroupDetail.tsx
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

    // Accumulate transactions involving me
    groupTransactions.forEach((t) => {
      if (t.from === me) {
        const friend = t.to;
        if (!masterBal[friend]) masterBal[friend] = {};
        Object.entries(t.balances).forEach(([curr, val]) => {
          masterBal[friend][curr] = (masterBal[friend][curr] || 0) - val;
        });
      } else if (t.to === me) {
        const friend = t.from;
        if (!masterBal[friend]) masterBal[friend] = {};
        Object.entries(t.balances).forEach(([curr, val]) => {
          masterBal[friend][curr] = (masterBal[friend][curr] || 0) + val;
        });
      }
    });
  });

  // Include non-group standalone expenses too
  const standaloneExps = expenses.filter((e) => e.gId === 'STANDALONE');
  const standaloneMembers = Array.from(new Set([
    me,
    ...standaloneExps.flatMap((e) => [e.paid, ...(e.splitters || [])])
  ]));

  standaloneExps.forEach((e) => {
    const c = e.currency || '₹';
    const splitters = e.splitters || [e.paid];
    const amount = e.amt || 0;

    if (e.paid === me) {
      splitters.forEach((m) => {
        if (m === me) return;
        if (!masterBal[m]) masterBal[m] = {};
        const otherShare =
          !e.mode || e.mode === 'Equally'
            ? amount / splitters.length
            : e.mode === 'Unequally'
            ? parseFloat(e.shares?.[m]?.toString() || '0')
            : (amount * parseFloat(e.shares?.[m]?.toString() || '0')) / 100;
        masterBal[m][c] = (masterBal[m][c] || 0) + otherShare;
      });
    } else if (splitters.includes(me)) {
      const payer = e.paid;
      if (!masterBal[payer]) masterBal[payer] = {};
      const myShare =
        !e.mode || e.mode === 'Equally'
          ? amount / splitters.length
          : e.mode === 'Unequally'
          ? parseFloat(e.shares?.[me]?.toString() || '0')
          : (amount * parseFloat(e.shares?.[me]?.toString() || '0')) / 100;
      masterBal[payer][c] = (masterBal[payer][c] || 0) - myShare;
    }
  });

  const friends = Object.entries(masterBal).map(([name, bals]) => ({ name, bals }));

  // Distinct currencies present across all friend balances
  const distinctCurrencies = Array.from(
    new Set(friends.flatMap((f) => Object.entries(f.bals).filter(([_, v]) => Math.abs(v) > 0.01).map(([c]) => c)))
  );

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
      setConvertTarget(convertTo || distinctCurrencies[0] || '₹');
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
    if (searchQuery.trim() && !f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    if (selectedFriends.length > 0 && !selectedFriends.includes(f.name)) return false;
    if (balanceFilter === 'owed' && !isOwed) return false;
    if (balanceFilter === 'owe' && !isOwe) return false;
    return true;
  });

  const toggleFriend = (name: string) => {
    setSelectedFriends((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const balanceLabel = balanceFilter === 'all' ? 'All Balances' : balanceFilter === 'owed' ? 'To Collect' : 'To Pay';
  const friendsLabel = selectedFriends.length === 0 ? 'All Friends' : selectedFriends.length === 1 ? selectedFriends[0] : `${selectedFriends.length} Friends`;

  const dropdownStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '10px 14px', borderRadius: '20px',
    border: '1.5px solid #E2E8F0', background: 'var(--w)',
    fontSize: '13px', fontWeight: 800, color: '#475569',
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
    fontSize: '12px', fontWeight: 800,
    color: active ? '#16A34A' : '#1E293B',
    background: active ? '#F0FDF4' : 'transparent',
  });

  return (
    <div className="content-width-limit">
      {/* Title + filters on same row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', animation: 'fadeSlideIn 0.5s ease-out', flexWrap: 'nowrap' }}>
        <span onClick={() => setView('summary')} style={{ fontSize: '22px', cursor: 'pointer', opacity: 0.4, lineHeight: 1, flexShrink: 0 }}>←</span>
        {/* Friends filter */}
        <div style={dropdownStyle}>
          <button style={btnStyle} onClick={(e) => { e.stopPropagation(); setShowFriendsDropdown(!showFriendsDropdown); setShowBalanceDropdown(false); }}>
            <span>{friendsLabel}</span><span style={{ fontSize: '9px', marginLeft: '2px' }}>▼</span>
          </button>
          {showFriendsDropdown && (
            <>
              <div onClick={() => setShowFriendsDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
              <div style={popupStyle}>
                <div style={optionStyle(selectedFriends.length === 0)} onClick={() => { setSelectedFriends([]); setShowFriendsDropdown(false); }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${selectedFriends.length === 0 ? '#16A34A' : '#CBD5E1'}`, background: selectedFriends.length === 0 ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selectedFriends.length === 0 && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                  </div>
                  <span>All Friends</span>
                </div>
                {friends.map((f) => (
                  <div key={f.name} style={optionStyle(selectedFriends.includes(f.name))} onClick={() => toggleFriend(f.name)}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${selectedFriends.includes(f.name) ? '#16A34A' : '#CBD5E1'}`, background: selectedFriends.includes(f.name) ? '#16A34A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selectedFriends.includes(f.name) && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                    </div>
                    {f.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Balance filter */}
        <div style={dropdownStyle}>
          <button style={btnStyle} onClick={(e) => { e.stopPropagation(); setShowBalanceDropdown(!showBalanceDropdown); setShowFriendsDropdown(false); }}>
            <span>{balanceLabel}</span><span style={{ fontSize: '9px', marginLeft: '2px' }}>▼</span>
          </button>
          {showBalanceDropdown && (
            <>
              <div onClick={() => setShowBalanceDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
              <div style={popupStyle}>
                {(['all', 'owed', 'owe'] as const).map((opt) => (
                  <div
                    key={opt}
                    onClick={() => {
                      setBalanceFilter(opt);
                      setShowBalanceDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: balanceFilter === opt ? 800 : 600,
                      cursor: 'pointer',
                      color: '#1E293B',
                      background: balanceFilter === opt ? '#F1F5F9' : 'transparent',
                      textAlign: 'left',
                    }}
                  >
                    {opt === 'all' ? 'All Balances' : opt === 'owed' ? 'To Collect' : 'To Pay'}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Convert currency — only when 2+ currencies exist */}
        {distinctCurrencies.length > 1 && (
          <button
            title="Convert currencies"
            onClick={(e) => { e.stopPropagation(); setShowConvertModal(true); }}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              color: convertTo ? '#16A34A' : '#64748B',
              flexShrink: 0,
              transition: '0.2s all ease',
            }}
          >
            <span style={{ fontSize: '20px', lineHeight: 1, filter: convertTo ? 'none' : 'grayscale(1) opacity(0.7)' }}>💱</span>
            <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: convertTo ? '#16A34A' : '#64748B' }}>
              {convertTo ? convertTo : 'Convert'}
            </span>
          </button>
        )}
      </div>

      {/* Universal Net Balance Card */}
      <div style={{ marginBottom: '22px', width: '100%', animation: 'fadeIn 0.25s ease-out' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px', display: 'block' }}>
          {balanceFilter === 'owe' ? 'Net Payable' : balanceFilter === 'owed' ? 'Net Receivable' : 'Net Balance'}
        </span>
        <div style={{ display: 'flex', borderRadius: '999px', overflow: 'hidden', height: '36px', width: '100%', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
          {/* Left section: to pay */}
          {balanceFilter !== 'owed' && (
          <div
            onClick={() => setBalanceFilter('owe')}
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              background: '#DE7093',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 500,
              gap: '6px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              userSelect: 'none',
              padding: '0 10px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            title="Filter by Payables"
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {(() => {
              const entries = Object.entries(totalPayable);
              if (entries.length === 0) return 'Nothing to pay';
              const [c, v] = entries[0];
              return (<>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}{formatCompactAmount(v)} to pay</span>
                {entries.length > 1 && <span style={pillChipStyle}>+{entries.length - 1}</span>}
              </>);
            })()}
          </div>
          )}
          {/* Right section: to collect */}
          {balanceFilter !== 'owe' && (
          <div
            onClick={() => setBalanceFilter('owed')}
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              background: '#6FC7A4',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 500,
              gap: '6px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              userSelect: 'none',
              padding: '0 10px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            title="Filter by Receivables"
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {(() => {
              const entries = Object.entries(totalReceivable);
              if (entries.length === 0) return 'Nothing to collect';
              const [c, v] = entries[0];
              return (<>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}{formatCompactAmount(v)} to collect</span>
                {entries.length > 1 && <span style={pillChipStyle}>+{entries.length - 1}</span>}
              </>);
            })()}
          </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', marginRight: '2px' }}>
          <span
            onClick={() => {
              setBalanceFilter('all');
            }}
            style={{ fontSize: '12px', fontWeight: 500, color: '#C7607F', cursor: 'pointer', userSelect: 'none' }}
          >
            Tap to settle →
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {filteredFriends.map((f) => {
          const activeBals = getConvertedBals(f.bals);
          const isOwed = Object.values(activeBals).some((v) => v > 0.01);
          const isOwe = Object.values(activeBals).some((v) => v < -0.01);
          const active = isOwe || isOwed;

          const balEntries = Object.entries(activeBals).filter(([_, v]) => Math.abs(v) > 0.01);
          const payList = balEntries.filter(([_, v]) => v < -0.01);
          const collectList = balEntries.filter(([_, v]) => v > 0.01);
          const joinPrimary = (entries: [string, number][]) => {
            if (entries.length === 0) return '';
            const [curr, val] = entries[0];
            return `${curr}${formatCompactAmount(val)}`;
          };

          const AV_COLORS = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];
          const avBg = AV_COLORS[(f.name.charCodeAt(0) || 0) % AV_COLORS.length];

          const pillBase: React.CSSProperties = {
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          };
          const cardChip: React.CSSProperties = { background: '#F1EFE8', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: 800, lineHeight: '16px' };

          return (
            <div
              key={f.name}
              className="hover-up-mini"
              onClick={() => { if (active) setGlobalSettleData({ name: f.name, balances: activeBals }); }}
              style={{
                padding: '14px 16px',
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
              <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: avBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, flexShrink: 0 }}>
                {f.name.charAt(0).toUpperCase()}
              </div>

              {/* Name */}
              <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 className="nunito" style={{ fontSize: '17px', fontWeight: 800, color: '#2E2A25', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</h3>
                {userMetadata[f.name]?.upiId && <span title="Payment Linked" style={{ fontSize: '13px', cursor: 'help' }}>💳</span>}
              </div>

              {/* Balance pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
                {!active ? (
                  <span style={{ ...pillBase, color: '#3FA97C' }}>Settled up</span>
                ) : (
                  <>
                    {payList.length > 0 && (
                      <span style={{ ...pillBase, color: '#D8608A', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                        {joinPrimary(payList)} to pay
                        {payList.length > 1 && <span style={cardChip}>+{payList.length - 1}</span>}
                      </span>
                    )}
                    {collectList.length > 0 && (
                      <span style={{ ...pillBase, color: '#3FA97C', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                        {joinPrimary(collectList)} to collect
                        {collectList.length > 1 && <span style={cardChip}>+{collectList.length - 1}</span>}
                      </span>
                    )}
                  </>
                )}
              </div>

              <span style={{ fontSize: '18px', color: '#B8ADA0', fontWeight: 900, lineHeight: 1, flexShrink: 0 }}>›</span>
            </div>
          );
        })}
        {filteredFriends.length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', background: 'var(--bg)', border: '2px dashed #E2E8F0' }}>
            <p style={{ color: 'var(--g)', fontWeight: 800 }}>
              {friends.length === 0 ? 'Your circle is quiet right now... Add some friends to get started! 🌈' : 'No friends match the selected filters.'}
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

            <h3 className="nunito" style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>
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
                  buttonStyle={{ fontSize: '14px', fontWeight: 800, color: '#475569', border: '1.5px solid #E2E8F0', boxShadow: 'none', minWidth: '60px', padding: '6px 10px' }}
                  options={[{ value: 'ALL', label: 'All' }, ...distinctCurrencies.map((c) => ({ value: c, label: c }))]}
                />
              </div>

              {/* Connection arrow with live rate */}
              <div style={{ flex: 1.5, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0D9488', background: '#E6F4EA', padding: '2px 8px', borderRadius: '100px', whiteSpace: 'nowrap', marginBottom: '6px' }}>
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
                    fontWeight: 800,
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
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>
                    <span style={{ opacity: 0.5 }}>1</span>
                    <span style={{ color: '#0D9488' }}>{c}</span>
                    <span>=</span>
                    <input
                      type="number"
                      step="any"
                      value={rateMap[c] ?? ''}
                      onChange={(e) => setRateMap((prev) => ({ ...prev, [c]: parseFloat(e.target.value) || 0 }))}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '10px', border: '1.5px solid #EEF2FF', background: '#F8FAFC', textAlign: 'center', fontWeight: 800 }}
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
              style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 900, borderRadius: '16px', border: 'none', cursor: 'pointer', opacity: isConverting ? 0.6 : 1 }}
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
