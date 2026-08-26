import React, { useState } from 'react';
import { Group, Expense } from '../lib/types';
import { StyledDropdown } from './StyledDropdown';
import { formatDate } from '../lib/utils';

interface GroupGalleryProps {
  selectedId: string | number | null;
  groups: Group[];
  expenses: Expense[];
  me: string;
  setView: (v: string) => void;
  setEditingExpense: (exp: Expense | null) => void;
  setShowExpModal: (b: boolean) => void;
  setEditingSettle: (exp: Expense | null) => void;
  setShowSettleModal: (b: boolean) => void;
  onPhotoViewerChange?: (isOpen: boolean) => void;
  searchQuery?: string;
  showFilters?: boolean;
  setShowFilters?: (b: boolean) => void;
}

const galleryFilterBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '20px',
  border: '1.5px solid #E2E8F0',
  fontSize: '12px',
  fontWeight: 600,
  background: 'var(--w, #fff)',
  color: '#475569',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};

export const GroupGallery: React.FC<GroupGalleryProps> = ({
  selectedId,
  groups,
  expenses,
  me,
  setView,
  setEditingExpense,
  setShowExpModal,
  setEditingSettle,
  setShowSettleModal,
  onPhotoViewerChange,
  searchQuery: propSearchQuery,
  showFilters: propShowFilters,
  setShowFilters: propSetShowFilters,
}) => {
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

  React.useEffect(() => {
    if (onPhotoViewerChange) {
      onPhotoViewerChange(activePhotoIndex !== null);
    }
  }, [activePhotoIndex, onPhotoViewerChange]);

  // Filter states
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [localShowFilters, setLocalShowFilters] = useState(false);
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const showFilters = propShowFilters !== undefined ? propShowFilters : localShowFilters;
  const setShowFilters = propSetShowFilters !== undefined ? propSetShowFilters : setLocalShowFilters;
  const [filterType, setFilterType] = useState('all'); // 'all', 'expenses', 'settlements'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  const activeGroup = groups.find((g) => String(g.id) === String(selectedId));
  const groupName = activeGroup ? activeGroup.name : 'Unknown Group';

  // Extract unique tags for this group's expenses
  const groupExpenses = expenses.filter((e) => String(e.gId) === String(selectedId));
  const uniqueTags = Array.from(new Set(groupExpenses.flatMap((e) => e.tags || [])));

  // Filtered photos
  const filteredPhotos = groupExpenses
    .filter((e) => {
      if (e.paid === 'SYSTEM') return false;
      if (!e.attachments || e.attachments.length === 0) return false;

      // 1. Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = e.title?.toLowerCase().includes(q);
        const paidMatch = e.paid?.toLowerCase().includes(q);
        const tagMatch = e.tags?.some((t) => t.toLowerCase().includes(q));
        if (!titleMatch && !paidMatch && tagMatch === false) return false;
      }

      // 2. Type filter
      const isSettlement = e.category === '✅' || e.title?.includes('✅ Settlement') || e.title?.toLowerCase().includes('settlement');
      if (filterType === 'expenses' && isSettlement) return false;
      if (filterType === 'settlements' && !isSettlement) return false;

      // 3. Date filter
      if (dateFilter !== 'all') {
        const expDate = new Date(e.date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') {
          const todayStr = now.toISOString().split('T')[0];
          if (e.date !== todayStr) return false;
        } else if (dateFilter === 'week') {
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (expDate < oneWeekAgo) return false;
        } else if (dateFilter === 'month') {
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (expDate < oneMonthAgo) return false;
        } else if (dateFilter === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            if (expDate < start) return false;
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            if (expDate > end) return false;
          }
        }
      }

      // 4. Tag filter
      if (selectedTag !== 'all') {
        if (!e.tags || !e.tags.includes(selectedTag)) return false;
      }

      return true;
    })
    .flatMap((e) =>
      (e.attachments || []).map((url) => ({
        url,
        expense: e,
      }))
    );

  const handleViewExpense = (e: Expense) => {
    setActivePhotoIndex(null);
    if (e.category === '✅') {
      setEditingSettle(e);
      setShowSettleModal(true);
    } else {
      setEditingExpense(e);
      setShowExpModal(true);
    }
  };

  // Keep each photo's flat index (the lightbox navigates over the flat list),
  // then group by date so the grid reads as dated sections rather than a scatter.
  const indexedPhotos = filteredPhotos.map((p, idx) => ({ ...p, idx }));
  const photosByDate = Array.from(
    indexedPhotos
      .reduce((map, p) => {
        const key = p.expense.date || '';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
        return map;
      }, new Map<string, typeof indexedPhotos>())
      .entries()
  ).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="content-width-limit" style={{ paddingBottom: '24px', boxSizing: 'border-box' }}>
      {/* Search and filter row - matching Activities */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '8px', paddingRight: '8px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', position: 'relative', width: '100%' }}>
          {/* Search bar */}
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
              placeholder="Search photos..."
              value={searchQuery}
              onChange={(e) => propSearchQuery !== undefined ? {} : setLocalSearchQuery(e.target.value)}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              title="Filter Photos"
              style={{
                background: showFilters ? '#F0FDF4' : 'none',
                border: showFilters ? '1.5px solid #BBF7D0' : 'none',
                padding: '8px',
                cursor: 'pointer',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: showFilters ? '#16A34A' : '#64748B',
                width: '38px',
                height: '38px',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {showFilters && (
        <div style={{ display: 'flex', gap: '8px', animation: 'fadeIn 0.2s ease-out', marginBottom: '16px', flexWrap: 'wrap' }}>
          <StyledDropdown
            fullWidth
            ariaLabel="Filter by type"
            value={filterType}
            onChange={setFilterType}
            buttonStyle={galleryFilterBtnStyle}
            options={[
              { value: 'all', label: 'All Photos' },
              { value: 'expenses', label: 'Expenses Only' },
              { value: 'settlements', label: 'Settlements Only' },
            ]}
          />
          <StyledDropdown
            fullWidth
            ariaLabel="Filter by date"
            value={dateFilter}
            onChange={setDateFilter}
            buttonStyle={galleryFilterBtnStyle}
            options={[
              { value: 'all', label: 'Any Time' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
              { value: 'custom', label: 'Custom Range' },
            ]}
          />
          {uniqueTags.length > 0 && (
            <StyledDropdown
              fullWidth
              ariaLabel="Filter by tag"
              value={selectedTag}
              onChange={setSelectedTag}
              buttonStyle={galleryFilterBtnStyle}
              options={[
                { value: 'all', label: 'All Tags' },
                ...uniqueTags.map((tag) => ({ value: tag, label: `#${tag}` })),
              ]}
            />
          )}
        </div>
      )}

      {/* Custom Date Range Picker */}
      {showFilters && dateFilter === 'custom' && (
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
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>From</span>
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
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>To</span>
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

      {/* Photo count summary */}
      {filteredPhotos.length > 0 && (
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 14px 2px' }}>
          {filteredPhotos.length} photo{filteredPhotos.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Grid gallery content — grouped by date, captioned tiles */}
      <div style={{ flex: 1 }}>
        {filteredPhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--w)', borderRadius: '24px', border: '1.5px solid #F1F5F9' }}>
            <button
              type="button"
              onClick={() => {
                (document.getElementById('mobile-gallery-upload-input') as HTMLInputElement)?.click();
              }}
              style={{
                background: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload Photo</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {photosByDate.map(([date, photos], dateIndex) => (
              <div key={date || 'undated'}>
                {/* Date section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', marginLeft: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                    {date ? formatDate(date) : 'Undated'}
                  </span>
                  <span style={{ height: '1px', flex: 1, background: '#F1F5F9' }} />
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#B0A79C' }}>{photos.length}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '8px' }}>
                  {/* Add-more tile — same size as a photo, shown in the newest group */}
                  {dateIndex === 0 && (
                    <div
                      onClick={() => (document.getElementById('mobile-gallery-upload-input') as HTMLInputElement)?.click()}
                      className="hover-up-mini"
                      title="Add photo"
                      style={{
                        aspectRatio: '1',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#F8FAFC',
                        border: '2px dashed #CBD5E1',
                        color: '#94A3B8',
                      }}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                  )}
                  {photos.map((photo) => (
                    <div
                      key={photo.idx}
                      onClick={() => setActivePhotoIndex(photo.idx)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        position: 'relative',
                        background: '#F8FAFC',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                      }}
                      className="hover-up-mini"
                    >
                      <img
                        src={photo.url}
                        alt={photo.expense.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {/* Caption overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          padding: '16px 8px 6px',
                          background: 'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))',
                          color: '#fff',
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {photo.expense.title}
                        </div>
                        <div style={{ fontSize: '9px', fontWeight: 700, opacity: 0.85 }}>
                          {photo.expense.currency || '₹'}{photo.expense.amt}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activePhotoIndex !== null && filteredPhotos[activePhotoIndex] && (
        <div
          style={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0, left: 0,
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setActivePhotoIndex(null)}
        >
          <button
            onClick={() => setActivePhotoIndex(null)}
            style={{
              position: 'absolute', top: '24px', right: '24px',
              background: '#F1F5F9', border: 'none', color: '#475569', fontSize: '20px', cursor: 'pointer',
              width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            }}
          >
            ✕
          </button>

          <div
            style={{
              color: '#1E293B',
              marginBottom: '20px',
              textAlign: 'center',
              maxWidth: '420px',
              padding: '0 16px',
              flexShrink: 0
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>
              {filteredPhotos[activePhotoIndex].expense.title}
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
              Paid by {filteredPhotos[activePhotoIndex].expense.paid} • {filteredPhotos[activePhotoIndex].expense.currency || '₹'}{filteredPhotos[activePhotoIndex].expense.amt}
            </p>
          </div>

          <div
            style={{
              width: '100%',
              height: '62vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={filteredPhotos[activePhotoIndex].url}
              alt="fullscreen attachment"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: '0',
                boxShadow: 'none'
              }}
            />
          </div>

          <div
            style={{
              marginTop: '20px',
              textAlign: 'center',
              flexShrink: 0
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleViewExpense(filteredPhotos[activePhotoIndex].expense)}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: '#10B981',
                color: '#FFFFFF',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              View Expense Details
            </button>
          </div>

          {filteredPhotos.length > 1 && (
            <>
              {/* Left side screen arrow */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIndex((prev) => (prev === 0 ? filteredPhotos.length - 1 : prev! - 1));
                }}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '0',
                  width: '48px',
                  height: '48px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.2s, color 0.2s',
                  zIndex: 1010,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.2)';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                  e.currentTarget.style.color = '#475569';
                }}
                aria-label="Previous Photo"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {/* Right side screen arrow */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIndex((prev) => (prev === filteredPhotos.length - 1 ? 0 : prev! + 1));
                }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '0',
                  width: '48px',
                  height: '48px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.2s, color 0.2s',
                  zIndex: 1010,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.2)';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                  e.currentTarget.style.color = '#475569';
                }}
                aria-label="Next Photo"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};