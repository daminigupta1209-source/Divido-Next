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
  onNewGroup?: () => void;
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
  onNewGroup,
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
          
          {!isPastMember && (
            <button
              onClick={() => { handleClose(); onConvertCurrency(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                padding: '12px 8px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#000000',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: '#64748B' }}>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Convert Currency
            </button>
          )}

          <button
            onClick={() => { handleClose(); onExportData(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '12px',
              padding: '12px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: '#000000',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: '#64748B' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Data
          </button>

          <button
            onClick={() => { handleClose(); onShareLink?.(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '12px',
              padding: '12px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: '#000000',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: '#64748B' }}>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share Link
          </button>

          {onNewGroup && (
            <button
              onClick={() => { handleClose(); onNewGroup(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                padding: '12px 8px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#000000',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: '#64748B' }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Group
            </button>
          )}

          {(isActiveMember || isPastMember) && (
            <button
              onClick={() => { handleClose(); onLeaveOrDeleteGroup(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                padding: '12px 8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#EF4444',
                transition: 'background-color 0.15s',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: '#EF4444' }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {isActiveMember ? (activeMembersCount > 1 ? 'Leave Group' : 'Delete Group') : 'Delete Group for Me'}
            </button>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};
