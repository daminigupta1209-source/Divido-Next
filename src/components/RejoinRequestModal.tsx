// Admin-facing "X wants to rejoin Y" confirmation dialog. Presentational only:
// the actual approve/decline logic (Supabase writes, local state reconciliation)
// stays in the parent and is passed in as onApprove / onDecline, so the fragile
// membership mutations are never moved out of App.tsx.

export interface AdminRejoinRequest {
  id: string;
  groupId: string | number;
  groupName: string;
  placeholderName: string;
  requestName: string;
  requestEmail: string;
}

interface RejoinRequestModalProps {
  request: AdminRejoinRequest;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export function RejoinRequestModal({ request, onApprove, onDecline, onClose }: RejoinRequestModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="card shadow-xl"
        style={{
          width: '90%',
          maxWidth: '360px',
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
        <h3 className="nunito" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0' }}>
          Rejoin Request
        </h3>
        <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 650, margin: '0 0 20px 0', lineHeight: 1.4 }}>
          {request.requestName} wants to rejoin {request.groupName}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onDecline}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: '#64748B',
              color: 'white',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: '0.2s all',
            }}
          >
            Decline
          </button>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: '#059669',
              color: 'white',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: '0.2s all',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)',
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
