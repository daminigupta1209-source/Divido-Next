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
  onEditGroup: () => void;
  onEditUserProfile: () => void;
  onOpenAnalytics?: () => void;
  onShareLink?: () => void;
  userMetadata?: Record<string, any>;
}

export const GroupSettingsModal: React.FC<GroupSettingsModalProps> = ({
  group,
  me,
  onClose,
  onSimplifyToggle,
  onConvertCurrency,
  onExportData,
  onLeaveOrDeleteGroup,
  onEditGroup,
  onEditUserProfile,
  onOpenAnalytics,
  onShareLink,
  userMetadata = {},
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
        backgroundColor: isVisible ? 'rgba(0, 0, 0, 0.4)' : 'transparent',
        transition: 'background-color 0.3s ease',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#FFFFFF',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          padding: '20px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '-8px' }}>
          <div style={{ width: '40px', height: '5px', background: '#E2E8F0', borderRadius: '10px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 8px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#000000' }}>Simplify Debts</span>
              <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748B', marginTop: '2px' }}>Minimizes total transactions</span>
            </div>
            <div
              onClick={onSimplifyToggle}
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '20px',
                background: group.simplifyDebts ? '#000000' : '#E2E8F0',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  position: 'absolute',
                  top: '2px',
                  left: group.simplifyDebts ? '18px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
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
                justifyContent: 'flex-start',
                padding: '16px 8px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#000000',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Convert Currency
            </button>
          )}

          <button
            onClick={() => { handleClose(); onExportData(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '16px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: '#000000',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Export Data
          </button>

          <button
            onClick={() => { handleClose(); onShareLink?.(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
              padding: '16px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: '#000000',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Share Link
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: '#000000' }}>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>

          {(isActiveMember || isPastMember) && (
            <button
              onClick={() => { handleClose(); onLeaveOrDeleteGroup(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '16px 8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#EF4444',
                transition: 'background-color 0.15s',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
