import React from 'react';
import { GROUP_COLORS, getEmoji } from '../lib/utils';

import { Group } from '../lib/types';
import { supabase } from '../lib/supabaseClient';
import { SidebarProfile } from './SidebarProfile';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  userName: string;
  me: string;
  groups: Group[];
  selectedId: string | number | null;
  setSelectedId: (id: string | number | null) => void;
  expenses: any[];
  isGroupsExpanded: boolean;
  setIsGroupsExpanded: (b: boolean) => void;
  handleRenameGroup: (id: string | number) => void;
  handleDeleteGroup: (id: string | number) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setConfirmState: (state: any) => void;
  setIsAuthenticated: (b: boolean) => void;
  defaultCurrency: string;
  handleLogout: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (b: boolean) => void;
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'demo';
  profilePhoto?: string;
  onRequireSignIn?: () => boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  setView,
  userName,
  me,
  groups,
  selectedId,
  setSelectedId,
  expenses,
  isGroupsExpanded,
  setIsGroupsExpanded,
  handleRenameGroup,
  handleDeleteGroup,
  setGroups,
  setConfirmState,
  setIsAuthenticated,
  defaultCurrency,
  handleLogout,
  isSidebarOpen,
  setIsSidebarOpen,
  syncStatus,
  profilePhoto,
  onRequireSignIn,
}) => {
  const getSyncState = () => {
    switch (syncStatus) {
      case 'offline':
        return {
          color: '#64748B', // Grey
          label: 'No internet connection',
          pulse: false,
        };
      case 'demo':
        return {
          color: '#F59E0B', // Amber
          label: 'Demo Mode',
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

  // Line-style nav icons matching the bottom navigation bar (stroke + currentColor
  // so they follow the active/inactive text color automatically).
  const navIcon = (id: string) => {
    const common = {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      style: { width: '20px', height: '20px', display: 'block' } as React.CSSProperties,
    };
    switch (id) {
      case 'summary': // Home — house
        return (
          <svg {...common}>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M9.5 20v-6h5v6" />
          </svg>
        );
      case 'groups': // Your Groups — people
        return (
          <svg {...common}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="3.5" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.5a3.5 3.5 0 0 1 0 7" />
          </svg>
        );
      case 'friends': // Settle All — swap arrows
        return (
          <svg {...common}>
            <path d="M4 8h13" />
            <path d="m14 5 3 3-3 3" />
            <path d="M20 16H7" />
            <path d="m10 13-3 3 3 3" />
          </svg>
        );
      case 'activity': // All Activities — clock/history
        return (
          <svg {...common}>
            <path d="M12 8v4l2.5 2" />
            <path d="M3.5 9a9 9 0 1 1-.5 5" />
            <path d="M3 5v4h4" />
          </svg>
        );
      case 'analytics': // Analytics — line chart
        return (
          <svg {...common}>
            <path d="M3 3v18h18" />
            <path d="m7 14 4-4 3 3 5-6" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <aside
      className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
      style={{
        borderRight: '1.5px solid #F1F5F9',
        background: 'linear-gradient(to bottom, #FFFFFF 0%, #F8FAFC 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: '40px',
          padding: '0 10px',
        }}
        onClick={() => {
          setView('summary');
          setIsSidebarOpen(false);
        }}
      >
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '24px',
            overflow: 'hidden',
            border: '4px solid #FEF3C7',
            background: 'var(--w)',
            boxShadow: '0 12px 24px -8px rgba(251, 191, 36, 0.4)',
            position: 'relative',
            marginBottom: '16px',
            transition: '0.3s all',
          }}
          className="hover-up"
        >
          <img
            src="/divido_laughing_cat_mascot_1778063273427.png"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              animation: 'laugh-bounce 2s infinite ease-in-out',
            }}
            alt="Mascot"
          />
        </div>
        <div
          className="nunito"
          style={{
            fontSize: '24px',
            fontWeight: 950,
            color: '#0F172A',
            letterSpacing: '-1.5px',
            textAlign: 'center',
          }}
        >
          Divido <span style={{ color: '#F59E0B' }}>✨</span>
        </div>
      </div>

      <SidebarProfile
        view={view}
        setView={setView}
        userName={userName}
        setIsSidebarOpen={setIsSidebarOpen}
        syncStatus={syncStatus}
        profilePhoto={profilePhoto}
      />

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
          {(() => {
            const it = {
              id: 'summary',
              n: 'Home',
              e: '🏠',
              c: ['#60A5FA', '#3B82F6'],
            };
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {navIcon(it.id)}
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
          })()}

          <div style={{ width: '100%', marginTop: '8px', marginBottom: '8px' }}>
            <div
              tabIndex={0}
              className={`nav-btn`}
              style={{
                width: '100%',
                height: '48px',
                padding: '0 16px',
                borderRadius: '14px',
                marginBottom: '4px',
                background: isGroupsExpanded
                  ? 'linear-gradient(135deg, #6366F1 0%, #4F46E6 100%)'
                  : 'white',
                color: isGroupsExpanded ? 'white' : '#6366F1',
                border:
                  '1.5px solid ' + (isGroupsExpanded ? 'transparent' : '#EEF2FF'),
                boxShadow: isGroupsExpanded
                  ? '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
                  : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 900,
              }}
              onClick={() => setIsGroupsExpanded(!isGroupsExpanded)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{navIcon('groups')}</span> Your Groups
              </div>
              <span
                style={{
                  fontSize: '10px',
                  transform: isGroupsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: '0.3s all',
                }}
              >
                ▼
              </span>
            </div>

            {isGroupsExpanded && (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  paddingLeft: '8px',
                  borderLeft: '2.5px solid #FDE68A',
                  marginLeft: '12px',
                  marginTop: '8px',
                  marginBottom: '12px',
                }}
              >
                {[
                  { id: 'STANDALONE', name: 'Non-Group Expenses', emoji: '👤' },
                  ...groups.filter(
                    (g) =>
                      g.name.trim() !== '' ||
                      expenses.some((e) => String(e.gId) === String(g.id)) ||
                      g.members.length > 1 ||
                      (g.id === selectedId && view === 'detail')
                  ),
                ].map((g, i) => {
                  const c =
                    g.id === 'STANDALONE'
                      ? { bg: '#F5F3FF', border: '#C4B5FD', text: '#5B21B6' }
                      : GROUP_COLORS[i % GROUP_COLORS.length];
                  const isActive = selectedId === g.id && view === 'detail';
                  return (
                    <div
                      key={g.id}
                      tabIndex={0}
                      className={`group-item ${isActive ? 'active' : ''}`}
                      style={{
                        background: isActive ? c.bg : 'transparent',
                        border: isActive
                          ? `1.5px solid ${c.border}`
                          : '1.5px solid transparent',
                        color: isActive ? c.text : '#64748B',
                        fontWeight: 'bold',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        fontSize: '12px',
                        boxShadow: isActive ? `0 4px 12px ${c.border}44` : 'none',
                        transition: '0.2s all',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onClick={() => {
                        setSelectedId(g.id);
                        setView('detail');
                        setIsSidebarOpen(false);
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {g.emoji && (g.emoji.startsWith('data:image/') || g.emoji.startsWith('http')) ? (
                          <img src={g.emoji} style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" />
                        ) : (
                          <span style={{ flexShrink: 0 }}>{g.emoji || getEmoji(g.name)}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span
                          style={{ cursor: 'pointer', fontSize: '12px', opacity: 0.6 }}
                          className="hover-up"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameGroup(g.id);
                          }}
                        >
                          ✏️
                        </span>
                        <span
                          style={{
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#DB2777',
                            opacity: 0.8,
                          }}
                          className="hover-up"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(g.id);
                          }}
                        >
                          🗑️
                        </span>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    if (onRequireSignIn && !onRequireSignIn()) return;
                    const id = Date.now() + Math.random();
                    setGroups([
                      ...groups,
                      { id, name: '', members: [me], currency: defaultCurrency },
                    ]);
                    setSelectedId(id);
                    setView('detail');
                    setIsSidebarOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: 'rgba(16, 185, 129, 0.05)',
                    color: '#059669',
                    border: '1.5px dashed #10B981',
                    fontSize: '13px',
                    fontWeight: 950,
                    cursor: 'pointer',
                    width: 'calc(100% - 12px)',
                    transition: '0.2s all',
                    marginTop: '8px',
                  }}
                  className="hover-up"
                >
                  <span className="add-group-icon" style={{ marginRight: '4px' }}>
                    <svg className="add-group-svg" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path className="user-primary" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="2.5" />
                      <circle className="user-primary-head" cx="8.5" cy="7" r="4" strokeWidth="2.5" />
                      <path className="user-secondary" d="M22 21v-2a4 4 0 0 0-3-3.87" strokeWidth="2.5" />
                      <path className="user-secondary-head" d="M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="2.5" />
                      <circle className="plus-badge" cx="19" cy="8" r="4.5" />
                      <path className="plus-line" d="M19 6.5v3M17.5 8h3" />
                    </svg>
                  </span>
                  <span>New Group</span>
                </button>
              </div>
            )}
          </div>

          {[
            { id: 'friends', n: 'Settle All', e: '🤝', c: ['#10B981', '#059669'] },
            { id: 'activity', n: 'All Activities', e: '📜', c: ['#2DD4BF', '#14B8A6'] },
            { id: 'analytics', n: 'Analytics', e: '📈', c: ['#A78BFA', '#8B5CF6'] },
          ].map((it) => {
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {navIcon(it.id)}
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

      <div style={{ marginTop: 'auto', width: '100%', padding: '20px 0' }}>
        <div
          className="nav-btn"
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #FDBA74 0%, #F97316 100%)',
            color: 'white',
            fontWeight: 950,
            boxShadow: '0 10px 15px -3px rgba(249, 115, 22, 0.2)',
            justifyContent: 'center',
            borderRadius: '14px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
          onClick={handleLogout}
        >
          Logout
        </div>
      </div>
    </aside>
  );
};
