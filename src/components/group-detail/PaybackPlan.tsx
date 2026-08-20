import React from 'react';
import { BalanceDisplay } from '../BalanceDisplay';
import { SimplifiedTransaction } from '../../lib/calculations';

interface PaybackPlanProps {
  showPaybackPlan: boolean;
  setShowPaybackPlan: (b: boolean) => void;
  savedTransCount: number;
  finalTransactions: SimplifiedTransaction[];
  myTrans: SimplifiedTransaction[];
  otherTrans: SimplifiedTransaction[];
  me: string;
  selectedId: string | number | null;
  setGlobalSettleData: (data: { name: string; gId?: string | number | null } | null) => void;
}

export const PaybackPlan: React.FC<PaybackPlanProps> = ({
  showPaybackPlan,
  setShowPaybackPlan,
  savedTransCount,
  finalTransactions,
  myTrans,
  otherTrans,
  me,
  selectedId,
  setGlobalSettleData,
}) => {
  if (!showPaybackPlan) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={() => setShowPaybackPlan(false)}
    >
      <div
        className="card shadow-lg"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--w)',
          borderRadius: '24px',
          border: '1.5px solid #F1F5F9',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '90%',
          maxWidth: '420px',
          boxSizing: 'border-box',
          animation: 'balancePopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="nunito" style={{ margin: 0, fontSize: '20px', fontWeight: 950, color: 'var(--t)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Payback Plan 🚀
          </h3>
          <button
            onClick={() => setShowPaybackPlan(false)}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--g)',
              opacity: 0.6,
            }}
          >
            ✕
          </button>
        </div>

        {savedTransCount > 0 && (
          <div style={{
            padding: '10px 14px',
            background: '#ECFDF5',
            border: '1.5px solid #A7F3D0',
            borderRadius: '12px',
            fontSize: '11px',
            color: '#065F46',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.05)',
            alignSelf: 'flex-start'
          }}>
            <span>⚡</span>
            <span>Debt Simplification saved {savedTransCount} payment{savedTransCount > 1 ? 's' : ''}!</span>
          </div>
        )}

        {finalTransactions.length === 0 ? (
          <p style={{ fontWeight: '800', textAlign: 'center', color: 'var(--g)', padding: '24px 12px', margin: 0 }}>
            Everyone is settled! 🌈
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
            {/* DASHED BOX WRAPPER FOR YOUR SETTLEMENTS */}
            <div
              style={{
                background: 'rgba(189,224,254,0.05)',
                padding: '16px',
                borderRadius: '16px',
                border: '1.1px dashed var(--b)',
              }}
            >
              <h5
                style={{
                  fontSize: '10px',
                  fontWeight: 900,
                  color: 'var(--g)',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginTop: 0,
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Your Settlements{' '}
                <img
                  src="/divido_laughing_cat_mascot_1778063273427.png"
                  style={{ width: '18px', height: '18px', borderRadius: '50%' }}
                />
              </h5>

              {myTrans.length === 0 ? (
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--g)', opacity: 0.8, margin: 0 }}>
                  You have no direct settlements.
                </p>
              ) : (
                myTrans.map((t, idx) => {
                  const isIpay = t.from === me;
                  const opposite = isIpay ? t.to : t.from;
                  const displayBalances = isIpay
                    ? Object.fromEntries(Object.entries(t.balances).map(([curr, val]) => [curr, -(val as number)]))
                    : t.balances;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setGlobalSettleData({
                          name: opposite,
                          gId: selectedId,
                        });
                        setShowPaybackPlan(false);
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 12px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: '0.2s all',
                        borderBottom: idx === myTrans.length - 1 ? 'none' : '1px dashed rgba(189,224,254,0.3)',
                      }}
                      className="hover-bg hover-up-mini"
                    >
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--t)' }}>
                          {t.from === me ? 'You' : t.from} ──▶ {t.to === me ? 'You' : t.to}
                        </div>
                      </div>
                      <BalanceDisplay balances={displayBalances} align="right" style={{ fontSize: '16px', fontWeight: '900' }} />
                    </div>
                  );
                })
              )}
            </div>

            {/* OTHER FRIENDS SECTION */}
            {otherTrans.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <h5
                  style={{
                    fontSize: '10px',
                    fontWeight: 900,
                    color: 'var(--g)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginTop: 0,
                    marginBottom: '12px',
                  }}
                >
                  Other Friends 👥
                </h5>
                {otherTrans.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: idx === otherTrans.length - 1 ? 'none' : '1px dashed rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: '800', opacity: 0.7, color: 'var(--t)' }}>
                      {t.from} ──▶ {t.to}
                    </div>
                    <BalanceDisplay balances={t.balances} align="right" style={{ fontSize: '14px', fontWeight: '900' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '4px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-green hover-up"
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 900,
              borderRadius: '12px',
              cursor: 'pointer'
            }}
            onClick={() => setShowPaybackPlan(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
