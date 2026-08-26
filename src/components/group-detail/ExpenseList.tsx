import React, { useState } from 'react';
import { Group, Expense } from '../../lib/types';
import { ExpenseRow } from './ExpenseRow';
import { StyledDropdown } from '../StyledDropdown';

import { parseExpenseId } from '../../lib/utils';

const elFilterBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: '20px', border: '1.5px solid #E2E8F0', fontSize: '12px', fontWeight: 800, background: 'var(--w, #fff)', color: '#475569', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };

interface ExpenseListProps {
  setView: (v: any) => void;
  filtered: Expense[];
  me: string;
  selectedGroup: Group;
  selectedId: string | number | null;
  dateRange: string;
  setDateRange: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  openExpId: string | number | null;
  setOpenExpId: (id: string | number | null) => void;
  setEditingExpense: (exp: Expense | null) => void;
  setShowExpModal: (b: boolean) => void;
  setEditingSettle: (exp: Expense | null) => void;
  setShowSettleModal: (b: boolean) => void;
  setShowConvertModalId: (id: string | number | null) => void;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  groups: Group[];
  deleteExpense: (id: string | number) => void;
  selectedTag: string;
  setSelectedTag: (s: string) => void;
  groupUniqueTags: string[];
}

export const ExpenseList: React.FC<ExpenseListProps> = ({
  setView,
  filtered,
  me,
  selectedGroup,
  selectedId,
  dateRange,
  setDateRange,
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
  openExpId,
  setOpenExpId,
  setEditingExpense,
  setShowExpModal,
  setEditingSettle,
  setShowSettleModal,
  setShowConvertModalId,
  setExpenses,
  setGroups,
  groups,
  deleteExpense,
  selectedTag,
  setSelectedTag,
  groupUniqueTags,
}) => {
  const [showFilters, setShowFilters] = useState(false);

  const sorted = [...filtered].sort(
    (a, b) => b.date.localeCompare(a.date) || parseExpenseId(b.id) - parseExpenseId(a.id)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '8px', paddingRight: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', position: 'relative', width: '100%' }}>
          {/* Search bar — always visible */}
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
                padding: '0 12px 0 34px',
                borderRadius: '24px',
                border: '2px solid #F1F5F9',
                outline: 'none',
                fontWeight: 600,
                margin: 0,
                background: 'var(--w)',
                color: '#475569',
                boxSizing: 'border-box',
                verticalAlign: 'top',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

            <button
              onClick={() => setShowFilters(!showFilters)}
              title="Filter Activities"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: '38px',
                height: '38px',
                padding: 0,
                opacity: showFilters ? 1 : 0.55,
                transition: '0.2s all',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '18px', height: '18px' }}>
                <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <StyledDropdown
                fullWidth
                ariaLabel="Filter by date"
                value={dateRange}
                onChange={setDateRange}
                buttonStyle={elFilterBtnStyle}
                options={[
                  { value: 'all', label: 'Any Time' },
                  { value: '7d', label: 'Last 7 Days' },
                  { value: '30d', label: 'Last 30 Days' },
                ]}
              />
              <StyledDropdown
                fullWidth
                ariaLabel="Filter by member"
                value={filter}
                onChange={setFilter}
                buttonStyle={elFilterBtnStyle}
                options={[
                  { value: 'all', label: 'All Members' },
                  ...(selectedGroup.members || []).map((m) => ({ value: m, label: m })),
                ]}
              />
              {groupUniqueTags.length > 0 && (
                <StyledDropdown
                  fullWidth
                  ariaLabel="Filter by tag"
                  value={selectedTag}
                  onChange={setSelectedTag}
                  buttonStyle={elFilterBtnStyle}
                  options={[
                    { value: 'all', label: 'All Tags' },
                    ...groupUniqueTags.map((tag) => ({ value: tag, label: `#${tag}` })),
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {sorted.length === 0 ? (
          <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--g)', fontWeight: 700 }}>
            No activity yet 🍕
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sorted.map((e) => (
              <ExpenseRow
                key={e.id}
                e={e}
                me={me}
                selectedGroup={selectedGroup}
                selectedId={selectedId}
                openExpId={openExpId}
                setOpenExpId={setOpenExpId}
                setEditingExpense={setEditingExpense}
                setShowExpModal={setShowExpModal}
                setEditingSettle={setEditingSettle}
                setShowSettleModal={setShowSettleModal}
                setShowConvertModalId={setShowConvertModalId}
                setExpenses={setExpenses}
                setGroups={setGroups}
                groups={groups}
                deleteExpense={deleteExpense}
              />
            ))}
            <div style={{ height: '80px' }} />
          </div>
        )}
      </div>


    </div>
  );
};
