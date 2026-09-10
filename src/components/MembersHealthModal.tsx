import React from 'react';
import { BalanceDisplay } from './BalanceDisplay';

// Read-only "Members Health" overlay: lists every member of the selected group
// with their net balance. Presentational only — all balance math is passed in
// via getMemberBalance so the canonical engine stays the single source.
interface MembersHealthModalProps {
  members: string[];
  selectedId: string | number | null;
  me: string;
  getMemberBalance: (groupId: string | number | null, memberName: string) => Record<string, number>;
  onClose: () => void;
}

export const MembersHealthModal: React.FC<MembersHealthModalProps> = ({
  members, selectedId, me, getMemberBalance, onClose,
}) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <h2 className="nunito" style={{ marginBottom: '32px' }}>
          Members Health 👥
        </h2>
        {members.map((m) => {
          const mBalance = getMemberBalance(selectedId, m);
          return (
            <div
              key={m}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg)',
                borderRadius: '18px',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>
                {m} {m === me && '(You)'}
              </div>
              <BalanceDisplay
                balances={mBalance}
                style={{ fontWeight: 900, color: '#000000', textAlign: 'right' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
