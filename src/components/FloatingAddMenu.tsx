import React, { useRef, useEffect } from 'react';
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
  showGlobalAddMenu,
  setShowGlobalAddMenu,
  view,
  setView,
  setSelectedId,
  setEditingExpense,
  setAutoOpenScanner,
  setShowExpModal,
  groups,
  setGroups,
  me,
  myDefaultCurrency,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (showGlobalAddMenu && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowGlobalAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showGlobalAddMenu, setShowGlobalAddMenu]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', bottom: '96px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}
    >
      {showGlobalAddMenu && (
        <div
          className="card shadow-lg animate-fade-in"
          style={{
            padding: '8px',
            borderRadius: '16px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '150px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            animation: 'slideUp 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
            marginBottom: '4px',
          }}
        >

          <button
            onClick={() => {
              setShowGlobalAddMenu(false);
              setEditingExpense(null);
              setAutoOpenScanner(true);
              if (view !== 'detail') setSelectedId('STANDALONE');
              setShowExpModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              border: 'none',
              background: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#475569',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.color = '#1E293B';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#475569';
            }}
          >
            Scan Bill
          </button>
          <button
            onClick={() => {
              setShowGlobalAddMenu(false);
              const id = Date.now();
              setGroups([...groups, { id, name: '', members: [me], currency: myDefaultCurrency }]);
              setSelectedId(id);
              setView('detail');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              border: 'none',
              background: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#475569',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.color = '#1E293B';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#475569';
            }}
          >
            Create Group
          </button>
        </div>
      )}

      {/* The Main Round trigger button */}
      <button
        onClick={() => setShowGlobalAddMenu(!showGlobalAddMenu)}
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
          fontSize: '24px',
          fontWeight: 'bold',
          cursor: 'pointer',
          transform: showGlobalAddMenu ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: '0.2s all cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        title="Add Options"
      >
        ＋
      </button>
    </div>
  );
};
