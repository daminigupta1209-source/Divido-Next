import React from 'react';

interface SidebarProfileProps {
  view: string;
  setView: (v: string) => void;
  userName: string;
  setIsSidebarOpen: (b: boolean) => void;
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'demo';
}

export const SidebarProfile: React.FC<SidebarProfileProps> = ({
  view,
  setView,
  userName,
  setIsSidebarOpen,
  syncStatus,
}) => {
  const getSyncState = () => {
    switch (syncStatus) {
      case 'offline':
        return {
          color: '#64748B', // Grey
          label: 'Offline Mode',
          pulse: false,
        };
      case 'demo':
        return {
          color: '#F59E0B', // Amber
          label: 'Guest / Demo',
          pulse: false,
        };
      case 'syncing':
        return {
          color: '#3B82F6', // Blue
          label: 'Syncing...',
          pulse: true,
        };
      case 'synced':
      default:
        return {
          color: '#10B981', // Green
          label: 'Cloud Synced',
          pulse: true,
        };
    }
  };

  const syncState = getSyncState();

  return (
    <div
      className={`profile-section ${view === 'profile' ? 'active' : ''}`}
      style={{
        width: '100%',
        padding: '12px',
        background: 'var(--w)',
        borderRadius: '18px',
        border: '1.5px solid #F1F5F9',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '32px',
        cursor: 'pointer',
      }}
      onClick={() => {
        setView('profile');
        setIsSidebarOpen(false);
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          background: '#F0FDF4',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          border: '1.5px solid #DCFCE7',
        }}
      >
        🐼
      </div>
      <div style={{ flex: 1 }}>
        <h4 className="nunito" style={{ fontSize: '13px', color: '#1E293B' }}>
          {userName.split(' ')[0]}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
          <span
            className={syncState.pulse ? 'pulse-dot' : ''}
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: syncState.color,
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: '9px',
              fontWeight: 900,
              color: syncState.color,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            {syncState.label}
          </span>
        </div>
      </div>
      <div style={{ fontSize: '12px', opacity: 0.3 }}>⚙️</div>
    </div>
  );
};
