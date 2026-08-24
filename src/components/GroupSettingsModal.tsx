import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group } from '../lib/types';
import { escManager } from '../lib/escManager';

interface GroupSettingsModalProps {
  group: Group;
  me: string;
  onClose: () => void;
  onSimplifyToggle: () => void;
  onConvertCurrency: () => void;
  onExportData: () => void;
  onLeaveOrDeleteGroup: () => void;
}

export const GroupSettingsModal: React.FC<GroupSettingsModalProps> = ({
  group,
  me,
  onClose,
  onSimplifyToggle,
  onConvertCurrency,
  onExportData,
  onLeaveOrDeleteGroup,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const unregister = escManager.register(() => {
      handleClose();
    });
    return unregister;
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
  const isActiveMember = group?.members?.some(m => {
    const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return cleanM === cleanMe && !m.toLowerCase().endsWith(' (left)');
  });
  const isPastMember = group?.members?.some(m => {
    const cleanM = m.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
    return cleanM === cleanMe && m.toLowerCase().endsWith(' (left)');
  });
  const activeMembersCount = (group?.members || []).filter(m => !m.toLowerCase().endsWith(' (left)')).length;

  return createPortal(
    <div
      style={{
        zIndex: 5000,
        backgroundColor: '#FFFFFF',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
          padding: '24px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Header with Back Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#0F172A' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="nunito" style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Group Settings</h1>
        </div>

        {/* Profile Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--nav-bg)',
              color: 'var(--purple-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 900,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {group.emoji && (group.emoji.startsWith('data:image/') || group.emoji.startsWith('http')) ? (
              <img src={group.emoji} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            ) : (
              group.name?.charAt(0).toUpperCase() || '👤'
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <h2 className="nunito" style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {group.name || 'Untitled Group'}
            </h2>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginTop: '2px' }}>
              {activeMembersCount} {activeMembersCount === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>

        {/* Settings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', borderRadius: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Simplify Debts</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8' }}>Minimizes total transactions</span>
            </div>
            <div
              onClick={onSimplifyToggle}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '24px',
                background: group.simplifyDebts ? '#10B981' : '#CBD5E1',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  position: 'absolute',
                  top: '2px',
                  left: group.simplifyDebts ? '22px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
            </div>
          </div>

          {!isPastMember && (
            <button
              onClick={() => { handleClose(); onConvertCurrency(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px',
                background: '#F8FAFC',
                borderRadius: '16px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 800,
                color: '#1E293B',
                textAlign: 'left',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            >
              Convert Currency
            </button>
          )}

          <button
            onClick={() => { handleClose(); onExportData(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px',
              background: '#F8FAFC',
              borderRadius: '16px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 800,
              color: '#1E293B',
              textAlign: 'left',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#F8FAFC')}
          >
            Export Data
          </button>

          {(isActiveMember || isPastMember) && (
            <button
              onClick={() => { handleClose(); onLeaveOrDeleteGroup(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px',
                background: '#FEF2F2',
                borderRadius: '16px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 800,
                color: '#DC2626',
                textAlign: 'left',
                transition: 'background-color 0.15s',
                marginTop: '12px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#FEF2F2')}
            >
              {isActiveMember ? (activeMembersCount > 1 ? 'Leave Group' : 'Delete Group') : 'Delete Group for Me'}
            </button>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};
