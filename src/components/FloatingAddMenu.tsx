import React, { useRef } from 'react';
import { Group } from '../lib/types';

interface FloatingAddMenuProps {
  showGlobalAddMenu: boolean;
  setShowGlobalAddMenu: (b: boolean) => void;
  view: string;
  setView: (v: string) => void;
  setSelectedId: (id: string | number | null) => void;
  setEditingExpense: (e: any) => void;
  setAutoOpenScanner: (b: boolean) => void;
  setShowExpModal: (b: boolean) => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  me: string;
  myDefaultCurrency: string;
  isSignedIn?: boolean;
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
  groups,
  setGroups,
  me,
  myDefaultCurrency,
  onRequireSignIn,
  selectedId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);

  const createGroup = () => {
    // Account-first: guests are nudged to sign in instead of creating a group.
    if (onRequireSignIn && !onRequireSignIn()) return;

    // Guard against accidental double-taps creating two groups at once.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setTimeout(() => { creatingRef.current = false; }, 1000);

    // Fractional id (timestamp + random) so two groups can never collide on the same millisecond.
    const id = Date.now() + Math.random();
    setGroups([...groups, { id, name: '', members: [me], currency: myDefaultCurrency }]);
    setSelectedId(id);
    setView('detail');
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', bottom: '96px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}
    >
      {/* Floating Scan Button — active inside group view */}
      <button
        onClick={() => {
          // Account-first: guests are nudged to sign in instead of scanning.
          if (onRequireSignIn && !onRequireSignIn()) return;

          const defaultGroupId = view === 'detail' && selectedId ? selectedId : 'STANDALONE';
          setEditingExpense({ id: null, gId: defaultGroupId, title: '', amt: 0, date: new Date().toISOString().split('T')[0], splitters: [], paid: me });
          setAutoOpenScanner(true);
          setShowExpModal(true);
        }}
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
        title="Scan Receipt"
        aria-label="Scan Receipt"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
          <path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" />
        </svg>
      </button>

      {/* The Main Round trigger button — creates a new group directly */}
      <button
        onClick={createGroup}
        style={{
          width: '48px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)',
          border: 'none',
          color: '#FFFFFF',
          boxShadow: '0 6px 16px rgba(234, 88, 12, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        title="New group"
        aria-label="New group"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4c.96 0 1.84 .338 2.53 .901" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M16 19h6" />
          <path d="M19 16v6" />
        </svg>
      </button>
    </div>
  );
};
