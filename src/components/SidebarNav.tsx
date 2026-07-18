import React from 'react';

interface SidebarNavProps {
  view: string;
  setView: (v: string) => void;
  setIsSidebarOpen: (b: boolean) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  view,
  setView,
  setIsSidebarOpen,
}) => {
  const navItems = [
    { id: 'summary', n: 'Home', e: '🏠', c: ['#60A5FA', '#3B82F6'] },
    { id: 'friends', n: 'Friends', e: '👥', c: ['#34D399', '#10B981'] },
    { id: 'activity', n: 'Activity', e: '⚡', c: ['#FBBF24', '#F59E0B'] },
    { id: 'analytics', n: 'Analytics', e: '📈', c: ['#A78BFA', '#8B5CF6'] },
  ];

  return (
    <div style={{ width: '100%', marginBottom: '24px' }}>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 950,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          padding: '0 16px',
          marginBottom: '12px',
        }}
      >
        Navigation
      </p>
      <div
        className="nav-list"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {navItems.map((it) => {
          const isActive = view === it.id;
          return (
            <div
              key={it.id}
              tabIndex={0}
              className={`nav-btn ${isActive ? 'active' : ''}`}
              style={{
                width: '100%',
                height: '48px',
                position: 'relative',
                background: isActive
                  ? `linear-gradient(135deg, ${it.c[0]} 0%, ${it.c[1]} 100%)`
                  : 'transparent',
                color: isActive ? 'white' : '#64748B',
                border: isActive ? 'none' : '1.5px solid transparent',
                boxShadow: isActive ? `0 10px 15px -3px ${it.c[0]}66` : 'none',
                fontWeight: 900,
                borderRadius: '14px',
                transition: '0.3s all',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
              onClick={() => {
                setView(it.id);
                setIsSidebarOpen(false);
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  filter: isActive ? 'brightness(0) invert(1)' : 'none',
                }}
              >
                {it.e}
              </span>
              <span>{it.n}</span>
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-12px',
                    width: '4px',
                    height: '24px',
                    background: it.c[1],
                    borderRadius: '4px 0 0 4px',
                    animation: 'pop 0.3s ease-out',
                  }}
                ></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
