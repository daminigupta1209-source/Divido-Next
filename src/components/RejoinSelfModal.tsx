import React from 'react';

// The user's own "rejoin this group" prompt. Presentational only: the parent
// computes the derived flags (whether a request is already pending, whether the
// group has no active admin) and owns the async rejoin/request handler, so the
// self-rejoin Supabase logic never leaves App.tsx.
interface RejoinSelfModalProps {
  hasPendingRejoin: boolean;
  noActiveAdmin: boolean;
  adminLabel: React.ReactNode;
  onClose: () => void;
  onRejoin: () => void;
}

export function RejoinSelfModal({ hasPendingRejoin, noActiveAdmin, adminLabel, onClose, onRejoin }: RejoinSelfModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="card shadow-xl"
        style={{
          width: '90%',
          maxWidth: '340px',
          padding: '24px 20px',
          borderRadius: '24px',
          position: 'relative',
          animation: 'slideUp 0.3s ease-out',
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.05)',
          textAlign: 'center',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '18px',
            border: 'none',
            background: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            color: '#64748B',
            opacity: 0.6,
          }}
        >
          ✕
        </button>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: hasPendingRejoin ? '#FEF3C7' : '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          {hasPendingRejoin ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a4 4 0 0 1 0 8h-1" /></svg>
          )}
        </div>
        <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
          {hasPendingRejoin ? 'Waiting for approval' : noActiveAdmin ? 'Rejoin instantly?' : 'Rejoin this group?'}
        </h3>
        <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: '0 0 20px 0', lineHeight: 1.4 }}>
          {hasPendingRejoin
            ? <>Your request was sent to the group admin{adminLabel}. You'll get access once it's approved.</>
            : noActiveAdmin
            ? <>No one's active in this group right now, so you'll rejoin straight away and become the admin.</>
            : <>The group admin{adminLabel} needs to approve.</>}
        </p>
        {hasPendingRejoin ? (
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
          >
            Got it
          </button>
        ) : (
          <button
            onClick={onRejoin}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: '#059669',
              color: 'white',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: '0.2s all',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)',
            }}
          >
            {noActiveAdmin ? 'Rejoin now' : 'Send request'}
          </button>
        )}
      </div>
    </div>
  );
}
