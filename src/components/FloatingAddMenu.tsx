import React, { useRef } from 'react';

interface FloatingAddMenuProps {
  view: string;
  setView: (v: string) => void;
  setSelectedId: (id: string | number | null) => void;
  setEditingExpense: (e: any) => void;
  setAutoOpenScanner: (b: boolean) => void;
  setShowExpModal: (b: boolean) => void;
  me: string;
  onRequireSignIn?: () => boolean;
  selectedId?: string | number | null;
}

export const FloatingAddMenu: React.FC<FloatingAddMenuProps> = ({
  setEditingExpense,
  setAutoOpenScanner,
  setShowExpModal,
  setView,
  view,
  setSelectedId,
  me,
  onRequireSignIn,
  selectedId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleAddExpense = (scan: boolean) => {
    // Account-first: guests are nudged to sign in instead of adding/scanning.
    if (onRequireSignIn && !onRequireSignIn()) return;

    const defaultGroupId = view === 'detail' && selectedId ? selectedId : 'STANDALONE';
    setEditingExpense({ id: null, gId: defaultGroupId, title: '', amt: 0, date: new Date().toISOString().split('T')[0], splitters: [], paid: me });
    setAutoOpenScanner(scan);
    setShowExpModal(true);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', bottom: '96px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }}
    >
      {/* Floating Scan Button — active inside group view */}
      <button
        onClick={() => handleAddExpense(true)}
        style={{
          width: '48px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
          border: 'none',
          color: '#FFFFFF',
          boxShadow: '0 6px 16px rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        title="Scan Receipt"
        aria-label="Scan Receipt"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
          <path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" />
        </svg>
      </button>

      {/* The Main Round trigger button — Add Expense */}
      <button
        onClick={() => handleAddExpense(false)}
        style={{
          width: '48px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          border: 'none',
          color: '#FFFFFF',
          boxShadow: '0 6px 16px rgba(5, 150, 105, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        title="Add Expense"
        aria-label="Add Expense"
      >
        {/* Receipt (wavy top & bottom) with a "+" merged at the bottom-right; the
            receipt is trimmed away around the plus (mask) so it reads clearly. */}
        <svg viewBox="0 0 24 24" style={{ width: '26px', height: '26px' }}>
          <defs>
            <mask id="addExpReceiptCut">
              <rect width="24" height="24" fill="#fff" />
              <circle cx="16.6" cy="18.4" r="6.4" fill="#000" />
            </mask>
          </defs>
          <g mask="url(#addExpReceiptCut)" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3 L4.4 3.9 L5.8 3 L7.2 3.9 L8.6 3 L10 3.9 L11.4 3 L12.8 3.9 L14 3 L14 18.4 L12.6 19.3 L11.2 18.4 L9.8 19.3 L8.4 18.4 L7 19.3 L5.6 18.4 L4.2 19.3 L3 18.4 Z" />
            <path d="M5.8 7.5h5.4 M5.8 10.3h5.4" />
          </g>
          <path stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" d="M16.6 15v6.8 M13.2 18.4h6.8" />
        </svg>
      </button>
    </div>
  );
};
