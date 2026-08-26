import React from 'react';

interface SidebarProfileProps {
  view: string;
  setView: (v: string) => void;
  userName: string;
  setIsSidebarOpen: (b: boolean) => void;
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'demo';
  profilePhoto?: string;
}

export const SidebarProfile: React.FC<SidebarProfileProps> = ({
  view,
  setView,
  userName,
  setIsSidebarOpen,
  profilePhoto,
}) => {
  const initials = userName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
          fontSize: '14px',
          fontWeight: 600,
          color: '#16A34A',
          border: '1.5px solid #DCFCE7',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {profilePhoto ? (
          <img src={profilePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials
        )}
      </div>
      <div style={{ flex: 1 }}>
        <h4  style={{ fontSize: '13px', color: '#1E293B' }}>
          {userName.split(' ')[0]}
        </h4>
      </div>
      <div style={{ fontSize: '12px', opacity: 0.3 }}>⚙️</div>
    </div>
  );
};
