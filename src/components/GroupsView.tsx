import React, { useState, useEffect } from 'react';
import { getEmoji, GROUP_COLORS, formatCompactAmount } from '../lib/utils';
import { StyledDropdown } from './StyledDropdown';

const filterBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 600, background: '#F1F5F9', color: '#475569', boxShadow: 'none' };
import { Group, Expense } from '../lib/types';
import { BalanceDisplay } from './BalanceDisplay';
import { simplifyMultiCurrencyDebts } from '../lib/calculations';

interface GroupsViewProps {
  groups: Group[];
  expenses: Expense[];
  getMemberBalance: (groupId: string | number, memberName: string) => Record<string, number>;
  setSelectedId: (id: string | number | null) => void;
  setView: (view: string) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  handleRenameGroup: (id: string | number) => void;
  handleDeleteGroup: (id: string | number) => void;
  me: string;
}

export const GroupsView: React.FC<GroupsViewProps> = ({
  groups,
  expenses,
  getMemberBalance,
  setSelectedId,
  setView,
  setGroups,
  handleRenameGroup,
  handleDeleteGroup,
  me,
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '30days' | '7days'>('all');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owe' | 'owed' | 'settled'>('all');
  const [showFilters, setShowFilters] = useState(false);

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

  useEffect(() => {
    const closeDrop = () => {
      setOpenDropdownId(null);
    };
    window.addEventListener('click', closeDrop);
    return () => window.removeEventListener('click', closeDrop);
  }, []);

  // 1. Separate Non-Group Card data
  const nonGroupColor = { bg: '#FAF5FF', border: '#F3E8FF', text: '#7C3AED' }; // Very Soft Lavender
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

  // 2. Filter groups
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

  return (
    <div className="content-width-limit" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="desktop-only-header" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <h1 className="nunito" style={{ fontSize: '28px', fontWeight: 950, color: 'var(--t)', letterSpacing: '-0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Your Groups</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '1px solid #78350F',
              color: '#78350F',
              fontSize: '8px',
              fontWeight: 500,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              cursor: 'pointer',
              padding: 0,
              margin: 0,
              lineHeight: 1,
              transform: 'translateY(1px)',
              userSelect: 'none',
              transition: '0.2s all',
            }}
            title="What is this page?"
          >
            i
          </button>
        </h1>
        {showInfo && (
          <div style={{
            fontSize: '12px',
            color: 'var(--purple-text)',
            background: 'var(--nav-bg)',
            padding: '8px 16px',
            borderRadius: '12px',
            border: '1px solid var(--nav-hover)',
            fontWeight: 800,
            animation: 'fadeSlideIn 0.2s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            justifyContent: 'center'
          }}>
            <span>ℹ️</span>
            <span>View, rename, and manage your group ledgers.</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Filter Bar Row */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', marginBottom: '8px' }}>
          <span
            onClick={() => setView('summary')}
            style={{
              fontSize: '22px',
              cursor: 'pointer',
              opacity: 0.4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '38px',
              flexShrink: 0,
            }}
          >
            ←
          </span>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, lineHeight: 0, fontSize: 0 }}>
            <svg
              viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '13px',
                height: '13px',
                opacity: 0.4,
                pointerEvents: 'none',
                color: '#64748B',
                zIndex: 2,
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck="false"
              data-1p-ignore
              data-lpignore="true"
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                height: '38px',
                lineHeight: 'normal',
                fontSize: '13px',
                margin: 0,
                padding: '0 12px 0 34px',
                borderRadius: '24px',
                border: '2px solid #F1F5F9',
                outline: 'none',
                fontWeight: 600,
                background: 'var(--w)',
                color: '#475569',
                boxSizing: 'border-box',
                verticalAlign: 'top',
              }}
            />
          </div>

          {/* Funnel Filter Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowFilters(!showFilters); }}
            title="Filters"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '44px',
              height: '44px',
              padding: 0,
              opacity: showFilters || timeFilter !== 'all' || balanceFilter !== 'all' ? 1 : 0.55,
              transition: '0.2s all',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: timeFilter !== 'all' || balanceFilter !== 'all' ? '#F59E0B' : '#475569',
              flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '18px', height: '18px' }}>
              <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <div style={{ display: 'flex', gap: '8px', animation: 'fadeIn 0.2s ease-out', marginBottom: '8px' }}>
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
        )}

        {/* Render Standalone / Non-Group Card first */}
        <div
          key="STANDALONE"
          className="hover-up-mini"
          onClick={() => {
            setSelectedId('STANDALONE');
            setView('detail');
          }}
          style={{
            position: 'relative',
            padding: '12px 14px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1.5px solid #F1F5F9',
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
            transition: '0.2s all ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            cursor: 'pointer',
            minHeight: '64px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
            <h3 className="nunito" style={{ fontSize: '15px', color: '#334155', fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Non-Group Expenses
            </h3>
            <button
              type="button"
              title="Non-group expenses are personal/one-off transactions outside of group ledgers."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '1px solid #64748B',
                color: '#64748B',
                fontSize: '8px',
                fontWeight: 800,
                cursor: 'help',
                padding: 0,
                margin: 0,
                lineHeight: 1,
                transform: 'translateY(1.5px)',
                userSelect: 'none',
              }}
            >
              i
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {nonGroupRels.length === 0 ? (
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A', background: '#ECFDF5', border: 'none', padding: '4px 10px', borderRadius: '20px' }}>
                Settled Up
              </span>
            ) : (
              (() => {
                const nonGroupEntries = Object.entries(nonGroupBal).filter(([_, v]) => Math.abs(v) > 0.01);
                return (
                  <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', whiteSpace: 'nowrap' }}>
                    {nonGroupEntries.slice(0, 3).map(([curr, val], idx, shown) => {
                      const isOwed = val > 0.01;
                      const isLast = idx === shown.length - 1;
                      return (
                        <span key={curr} style={{ color: isOwed ? '#16A34A' : '#EF4444' }}>
                          {isOwed ? '+' : '-'}{curr}{formatCompactAmount(val)}
                          {!isLast && <span style={{ color: '#94A3B8' }}>, </span>}
                        </span>
                      );
                    })}
                    {nonGroupEntries.length > 3 && <span style={{ color: '#94A3B8' }}>…</span>}
                  </span>
                );
              })()
            )}
            <span style={{ fontSize: '16px', color: '#94A3B8', fontWeight: 900, marginLeft: '4px', lineHeight: 1 }}>›</span>
          </div>
        </div>

        {/* Remaining Group Cards */}
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
                padding: '12px 14px',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1.5px solid #F1F5F9',
                boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                transition: '0.2s all ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                cursor: 'pointer',
              }}
            >
              {/* Left Side: Avatar + Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: c.bg,
                    border: 'none',
                    color: c.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                    fontWeight: 900,
                    overflow: 'hidden',
                  }}
                >
                  {g.emoji && (g.emoji.startsWith('data:image/') || g.emoji.startsWith('http')) ? (
                    <img src={g.emoji} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    g.name.charAt(0).toUpperCase() || '👤'
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3
                    className="nunito"
                    style={{
                      fontSize: '15px',
                      color: '#0F172A',
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
              </div>

              {/* Right Side: Net Balance Tags & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {rels.length === 0 ? (
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A', background: '#ECFDF5', border: 'none', padding: '4px 10px', borderRadius: '20px' }}>
                    Settled Up
                  </span>
                ) : (
                  (() => {
                    const balEntries = Object.entries(bal).filter(([_, v]) => Math.abs(v) > 0.01);
                    return (
                      <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', whiteSpace: 'nowrap' }}>
                        {balEntries.slice(0, 3).map(([curr, val], idx, shown) => {
                          const isOwed = val > 0.01;
                          const isLast = idx === shown.length - 1;
                          return (
                            <span key={curr} style={{ color: isOwed ? '#16A34A' : '#EF4444' }}>
                              {isOwed ? '+' : '-'}{curr}{formatCompactAmount(val)}
                              {!isLast && <span style={{ color: '#94A3B8' }}>, </span>}
                            </span>
                          );
                        })}
                        {balEntries.length > 3 && <span style={{ color: '#94A3B8' }}>…</span>}
                      </span>
                    );
                  })()
                )}
                <span style={{ fontSize: '16px', color: '#94A3B8', fontWeight: 900, marginLeft: '4px', lineHeight: 1 }}>›</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
