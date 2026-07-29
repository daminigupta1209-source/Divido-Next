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
}

export const FloatingAddMenu: React.FC<FloatingAddMenuProps> = ({
  setView,
  setSelectedId,
  groups,
  setGroups,
  me,
  myDefaultCurrency,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);

  const createGroup = () => {
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
      {/* The Main Round trigger button — creates a new group directly */}
      <button
        onClick={createGroup}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)',
          border: 'none',
          color: '#FFFFFF',
          boxShadow: '0 8px 20px rgba(234, 88, 12, 0.35)',
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
