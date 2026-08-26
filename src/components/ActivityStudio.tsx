import React from 'react';
import { BalanceDisplay } from './BalanceDisplay';
import { getEmoji, formatDate, getExactTime, getMonthYearKey, formatCompactAmount } from '../lib/utils';
import { Group, Expense } from '../lib/types';
import { useActivityStudio } from '../hooks/useActivityStudio';
import { StyledDropdown } from './StyledDropdown';

const asFilterBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: '20px', border: '1.5px solid #E2E8F0', fontSize: '12px', fontWeight: 600, background: 'var(--w, #fff)', color: '#475569', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };

interface ActivityStudioProps {
  expenses: Expense[];
  groups: Group[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setEditingExpense: (exp: Expense | null) => void;
  setShowExpModal: (show: boolean) => void;
  setEditingSettle: (exp: Expense | null) => void;
  setShowSettleModal: (show: boolean) => void;
  me: string;
  setShowConvertModalId: (id: string | number | null) => void;
  setGroups: (groups: Group[]) => void;
  deleteExpense: (id: string | number) => void;
  setSelectedId: (id: string | number | null) => void;
  setView: (view: string) => void;
  hideBackButton?: boolean;
}

export const ActivityStudio: React.FC<ActivityStudioProps> = ({
  expenses,
  groups,
  setExpenses,
  setEditingExpense,
  setShowExpModal,
  setEditingSettle,
  setShowSettleModal,
  me,
  setShowConvertModalId,
  setGroups,
  deleteExpense,
  setSelectedId,
  setView,
  hideBackButton = false,
}) => {
  const {
    openDropdownId,
    setOpenDropdownId,
    filterType,
    setFilterType,
    dateFilter,
    setDateFilter,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    openExpId,
    setOpenExpId,
    showInfo,
    setShowInfo,
    selectedTag,
    setSelectedTag,
    allUniqueTags,
    sorted,
    showExportMenu,
    setShowExportMenu,
    handleExportCSV,
    handleExportPDF,
    handleEdit,
    searchQuery,
    setSearchQuery,
  } = useActivityStudio({
    expenses,
    groups,
    setExpenses,
    setEditingExpense,
    setShowExpModal,
    setEditingSettle,
    setShowSettleModal,
    me,
    setShowConvertModalId,
    setGroups,
    deleteExpense,
    setSelectedId,
    setView,
  });

  const [showFilters, setShowFilters] = React.useState(false);

  return (
    <div className="content-width-limit">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', width: '100%' }}>
        {!hideBackButton && (
          <span
            onClick={() => setView('summary')}
            style={{
              fontSize: '22px', cursor: 'pointer', opacity: 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '38px', width: '24px', flexShrink: 0,
            }}
          >
            ←
          </span>
        )}

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
            type="text"
            placeholder="Search activities..."
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
            opacity: showFilters || filterType !== 'all' || dateFilter !== 'all' || selectedTag !== 'all' ? 1 : 0.55,
            transition: '0.2s all',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: filterType !== 'all' || dateFilter !== 'all' || selectedTag !== 'all' ? '#F59E0B' : '#475569',
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
        <div style={{ display: 'flex', gap: '8px', animation: 'fadeIn 0.2s ease-out', marginBottom: '16px' }}>
          <StyledDropdown
            fullWidth
            ariaLabel="Filter by type"
            value={filterType}
            onChange={setFilterType}
            buttonStyle={asFilterBtnStyle}
            options={[
              { value: 'all', label: 'All Activities' },
              { value: 'expenses', label: 'Expenses' },
              { value: 'settlements', label: 'Settlements' },
            ]}
          />
          <StyledDropdown
            fullWidth
            ariaLabel="Filter by date"
            value={dateFilter}
            onChange={setDateFilter}
            buttonStyle={asFilterBtnStyle}
            options={[
              { value: 'all', label: 'Any Time' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
              { value: 'custom', label: 'Custom Range' },
            ]}
          />
          {allUniqueTags.length > 0 && (
            <StyledDropdown
              fullWidth
              ariaLabel="Filter by tag"
              value={selectedTag}
              onChange={setSelectedTag}
              buttonStyle={asFilterBtnStyle}
              options={[
                { value: 'all', label: 'All Tags' },
                ...allUniqueTags.map((tag) => ({ value: tag, label: `#${tag}` })),
              ]}
            />
          )}
        </div>
      )}

        {dateFilter === 'custom' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#F8FAFC',
              padding: '12px 16px',
              borderRadius: '16px',
              border: '1.5px dashed #E2E8F0',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>FROM</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #E2E8F0',
                  outline: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#1E293B',
                  background: '#FFFFFF',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>TO</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #E2E8F0',
                  outline: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#1E293B',
                  background: '#FFFFFF',
                }}
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Reset
              </button>
            )}
          </div>
        )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          paddingBottom: '40px',
        }}
      >
        {sorted.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'var(--w)',
              borderRadius: '24px',
              border: '1.5px solid #F1F5F9',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏜️</div>
            <h3  style={{ fontWeight: 600, color: 'var(--g)', margin: 0 }}>
              No activities found
            </h3>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--g)', opacity: 0.6, marginTop: '4px', margin: 0 }}>
              Your financial history is a blank canvas.
            </p>
          </div>
        ) : (
          sorted.map((e, i) => {
            const g = groups.find((x) => String(x.id) === String(e.gId));
            const { key: myKey, label: myLabel } = getMonthYearKey(e.date, e.id);
            const showHeader = i === 0 || getMonthYearKey(sorted[i - 1].date, sorted[i - 1].id).key !== myKey;

            const isSettlement =
              e.title?.includes('✅ Settlement') || e.category === '✅' || e.title?.toLowerCase().includes('settlement');
            const timeStr = isSettlement ? getExactTime(e.id) : null;

            return (
              <React.Fragment key={e.id}>
                {showHeader && (
                  <div
                    style={{
                      padding: '12px 8px 8px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <span
                      style={{
                        background: '#EEF2FF',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#4F46E5',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {myLabel}
                    </span>
                    <div style={{ flex: 1, height: '1.5px', background: '#F1F5F9' }}></div>
                  </div>
                )}

                {e.isConversion ? (
                  <div
                    className="card hover-up-mini"
                    onClick={() => setShowConvertModalId(e.gId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 28px',
                      borderRadius: '16px',
                      background: 'var(--w)',
                      border: '1.5px solid #F1F5F9',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: '#F5F3FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          border: '1px solid #DDD6FE',
                          flexShrink: 0,
                        }}
                      >
                        💱
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#5B21B6',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                          }}
                        >
                          Normalized Ledger
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {(() => {
                            const rateMap = e.ratesUsed ? JSON.parse(e.ratesUsed) : { [e.fromCurr || '']: e.ratesUsed };
                            return Object.entries(rateMap)
                              .filter(([src]) => src !== e.toCurr)
                              .map(([src, r]: any) => (
                                <span
                                  key={src}
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    background: '#EDE9FE',
                                    color: '#7C3AED',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {src}➔{e.toCurr} @ {r}
                                </span>
                              ));
                          })()}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <div className="dropdown" style={{ position: 'relative' }}>
                        <div
                          style={{ fontSize: '20px', color: '#6D28D9', padding: '6px', cursor: 'pointer', opacity: 0.6 }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setOpenExpId(openExpId === e.id ? null : e.id);
                          }}
                        >
                          ⋮
                        </div>
                        {openExpId === e.id && (
                          <div
                            className="card shadow-xl"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              background: 'var(--w)',
                              zIndex: 100,
                              minWidth: '160px',
                              padding: '6px',
                              borderRadius: '12px',
                              border: '1.5px solid #F1F5F9',
                            }}
                          >
                            <div
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setShowConvertModalId(e.gId);
                                setOpenExpId(null);
                              }}
                              style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px' }}
                              className="hover-bg"
                            >
                              ⚙️ Adjust Conversion
                            </div>
                            <div
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (
                                  confirm(
                                    `Undo this conversion? 🔄\n\nThis will restore the exact state before this conversion.`
                                  )
                                ) {
                                  const snapshotArr = e.snapshot ? JSON.parse(e.snapshot) : [];
                                  const snapMap: Record<string, any> = {};
                                  snapshotArr.forEach((s: any) => {
                                    snapMap[s.id] = s;
                                  });

                                  setExpenses((prev) =>
                                    prev
                                      .map((x) => {
                                        if (snapMap[x.id]) {
                                          const s = snapMap[x.id];
                                          return { ...x, amt: s.amt, currency: s.currency, shares: s.shares };
                                        }
                                        return x;
                                      })
                                      .filter((x) => x.id !== e.id)
                                  );

                                  const restoredCurr = e.fromCurr || snapshotArr[0]?.currency || '₹';
                                  setGroups(
                                    groups.map((g) =>
                                      String(g.id) === String(e.gId) ? { ...g, currency: restoredCurr } : g
                                    )
                                  );
                                } else if (confirm('Just delete the log entry without undoing?')) {
                                  setExpenses(expenses.filter((x) => x.id !== e.id));
                                }
                                setOpenExpId(null);
                              }}
                              style={{
                                padding: '8px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#DB2777',
                                borderRadius: '8px',
                              }}
                              className="hover-bg"
                            >
                              🗑️ Delete Activity
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="card hover-up-mini"
                    onClick={() => handleEdit(e)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 24px 14px 16px',
                      borderRadius: '16px',
                      background: 'var(--w)',
                      border: '1.5px solid #F1F5F9',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)',
                      minHeight: '70px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '12px',
                          background: isSettlement ? '#ECFDF5' : '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          border: '1px solid ' + (isSettlement ? '#D1FAE5' : '#E2E8F0'),
                          flexShrink: 0,
                        }}
                      >
                        {e.category || getEmoji(e.title) || '⚡'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
                          <h3  style={{ fontSize: isSettlement ? '13px' : '15px', color: 'var(--t)', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                            {isSettlement ? 'Payment Recorded' : e.title}
                          </h3>
                          {e.gId !== 'STANDALONE' && (
                            <span
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedId(e.gId);
                                setView('detail');
                              }}
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: '#8B5CF6',
                                background: '#F5F3FF',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                            >
                              {g?.name || 'Legacy Group'}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748B', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isSettlement ? (
                            <span style={{ color: '#16A34A', fontWeight: 700 }}>
                              {e.paid === me ? 'You' : e.paid} paid {e.splitters?.[0] === me ? 'you' : e.splitters?.[0]}
                            </span>
                          ) : (
                            <span style={{ color: e.paid === me ? '#16A34A' : '#DC2626' }}>{e.paid === me ? 'You paid' : `${e.paid} paid`}</span>
                          )}
                          <span>•</span>
                          <span>{formatDate(e.date)}{timeStr ? ` at ${timeStr}` : ''}</span>
                          {e.tags && e.tags.length > 0 && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#0284C7' }}>{e.tags.map(t => `#${t}`).join(' ')}</span>
                            </>
                          )}
                          {e.isRecurring && (
                            <>
                              <span>•</span>
                              <span title={`Next: ${e.nextOccurrence || 'N/A'}`} style={{ color: '#0F766E' }}>
                                🔁 {e.recurrence ? e.recurrence.charAt(0).toUpperCase() + e.recurrence.slice(1) : 'Recurring'}
                              </span>
                            </>
                          )}
                        </div>
                        {e.notes && e.notes !== 'Granular Global Clearance' && (
                          <div
                            style={{
                              fontSize: '10px',
                              fontStyle: 'italic',
                              color: '#64748B',
                              marginTop: '6px',
                              background: '#F8FAFC',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid #F1F5F9',
                              display: 'inline-block',
                              whiteSpace: 'pre-wrap',
                              maxWidth: '280px',
                              lineHeight: '1.3',
                            }}
                          >
                            📝 {e.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t)',  }}>
                          {e.currency || '₹'} {formatCompactAmount((Number(e.amt) || 0))}
                        </span>
                      </div>

                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};
