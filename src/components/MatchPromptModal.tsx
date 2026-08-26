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
          maxHeight: '85vh',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
          <div style={{ fontSize: '32px' }}>✨</div>
          <h2  style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '4px 0 0 0', textAlign: 'center' }}>
            {prompt.newMemberName} joined!
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748B', fontWeight: 600, textAlign: 'center', lineHeight: 1.4 }}>
            Link them to one of your pending placeholders to merge their expenses correctly.
          </p>
        </div>

        {/* Placeholder options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {prompt.pendingPlaceholders.map((p) => (
            <button
              key={p.id}
              onClick={() => onMatch(prompt.newMemberRecordId, p.id)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1.5px solid #F1F5F9',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#F5F3FF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#F1F5F9'; e.currentTarget.style.background = '#F8FAFC'; }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: '#EEF2FF', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '14px', flexShrink: 0,
              }}>
                👤
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{p.name}</div>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#7C3AED', flexShrink: 0 }}>
                Link →
              </div>
            </button>
          ))}
        </div>

        {/* Not a placeholder */}
        <button
          onClick={() => onMatch(prompt.newMemberRecordId, null)}
          style={{
            width: '100%', padding: '10px', borderRadius: '12px',
            border: '1.5px solid #E2E8F0', background: '#fff',
            fontSize: '12px', fontWeight: 600, color: '#64748B',
            cursor: 'pointer',
          }}
        >
          No, they are a new person
        </button>

        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', fontSize: '11px',
            color: '#94A3B8', cursor: 'pointer', fontWeight: 700,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
