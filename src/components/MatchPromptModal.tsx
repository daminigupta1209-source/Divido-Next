import React from 'react';
import { PendingMatchPrompt } from '../lib/types';

interface Props {
  prompt: PendingMatchPrompt;
  onMatch: (newMemberRecordId: string, placeholderId: string | null) => void;
  onDismiss: () => void;
}

export const MatchPromptModal: React.FC<Props> = ({ prompt, onMatch, onDismiss }) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }}>
      <div
        className="modal-content"
        style={{
          width: '320px',
          padding: '24px 20px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '28px', textAlign: 'center' }}>🎉</div>
          <h2 className="nunito" style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'center' }}>
            {prompt.newMemberName} just joined!
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748B', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
            Is this someone you were already tracking? Match them to a placeholder so their expenses link up correctly.
          </p>
        </div>

        {/* Placeholder options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Your pending friends
          </p>
          {prompt.pendingPlaceholders.map((p) => (
            <button
              key={p.id}
              onClick={() => onMatch(prompt.newMemberRecordId, p.id)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1.5px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.background = '#EEF2FF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC'; }}
            >
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px',
                background: '#EEF2FF', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '16px', flexShrink: 0,
              }}>
                ⏳
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Pending placeholder</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: '#6366F1' }}>
                Yes, this is them →
              </div>
            </button>
          ))}
        </div>

        {/* Not a placeholder */}
        <button
          onClick={() => onMatch(prompt.newMemberRecordId, null)}
          style={{
            width: '100%', padding: '11px', borderRadius: '12px',
            border: '1.5px solid #E2E8F0', background: '#fff',
            fontSize: '13px', fontWeight: 700, color: '#64748B',
            cursor: 'pointer',
          }}
        >
          No — {prompt.newMemberName} is a new person
        </button>

        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', fontSize: '12px',
            color: '#94A3B8', cursor: 'pointer', fontWeight: 600,
          }}
        >
          Remind me later
        </button>
      </div>
    </div>
  );
};
