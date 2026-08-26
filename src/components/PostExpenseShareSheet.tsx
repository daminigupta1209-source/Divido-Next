import React, { useEffect, useState } from 'react';
import { Group, Expense } from '../lib/types';
import { escManager } from '../lib/escManager';
import { ShareGrid } from './ShareGrid';

export interface UnregisteredMemberShare {
  name: string;
  shareAmount: number;
}

export function getUnregisteredParticipantShares(
  expense: Expense,
  group?: Group,
  meName?: string
): UnregisteredMemberShare[] {
  if (!expense || !expense.splitters || expense.splitters.length === 0) return [];

  const meClean = meName ? meName.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase() : '';

  const guestMembers: string[] = [];
  const pendingSet = new Set(((group && group.pendingMembers) || []).map(p => p.toLowerCase()));
  const identities = (group && group.memberIdentities) || {};

  expense.splitters.forEach(m => {
    const cleanM = m.replace(/\s*\(Left\)$/i, '').trim();
    const cleanMLower = cleanM.toLowerCase();
    if (!cleanMLower || cleanMLower === meClean) return;

    // A splitter is considered an unregistered/guest participant if:
    // 1. They are in pendingMembers, OR
    // 2. They do not have a registered email identity
    const isPending = pendingSet.has(cleanMLower);
    const identity = identities[m] || identities[cleanM];
    const isRegisteredAccount = identity && typeof identity === 'string' && identity.includes('@') && identity !== m && identity !== cleanM;
    const isGuest = isPending || !isRegisteredAccount;

    if (isGuest && !guestMembers.includes(cleanM)) {
      guestMembers.push(cleanM);
    }
  });

  if (guestMembers.length === 0) return [];

  const totalAmt = expense.amt || 0;
  const numSplitters = expense.splitters.length || 1;

  return guestMembers.map(name => {
    let shareAmount = 0;
    if (expense.mode === 'Equally' || !expense.mode) {
      shareAmount = totalAmt / numSplitters;
    } else if (expense.mode === 'Unequally') {
      shareAmount = expense.shares?.[name] || 0;
    } else if (expense.mode === 'Percentage') {
      shareAmount = (totalAmt * (expense.shares?.[name] || 0)) / 100;
    } else {
      shareAmount = totalAmt / numSplitters;
    }
    return { name, shareAmount };
  });
}

interface PostExpenseShareSheetProps {
  expense: Expense;
  group: Group;
  unregisteredShares: UnregisteredMemberShare[];
  onClose: () => void;
}

export const PostExpenseShareSheet: React.FC<PostExpenseShareSheetProps> = ({
  expense,
  group,
  unregisteredShares,
  onClose,
}) => {
  const [showShareGrid, setShowShareGrid] = useState(false);

  useEffect(() => {
    const unregister = escManager.register(onClose);
    return unregister;
  }, [onClose]);

  // Auto-dismiss after 20 seconds so user has plenty of time to view & share
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 20000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!unregisteredShares || unregisteredShares.length === 0) return null;

  const totalOwedByGuests = unregisteredShares.reduce((acc, s) => acc + s.shareAmount, 0);
  const currencySymbol = expense.currency || group?.currency || '₹';

  const groupParam = group?.id && group.id !== 'STANDALONE' ? `?joinGroupId=${group.id}` : '';
  const inviteLink = `${window.location.origin}/${groupParam}`;

  const generateShareText = () => {
    const guestNames = unregisteredShares.map(s => s.name).join(', ');
    const firstGuest = unregisteredShares[0];
    const amountText = unregisteredShares.length === 1
      ? `${currencySymbol}${firstGuest.shareAmount.toFixed(2)} your share`
      : `${currencySymbol}${totalOwedByGuests.toFixed(2)} total share`;

    const groupNameStr = group?.name && group.name !== 'Non-Group Expenses' ? ` to ${group.name}` : '';
    return `Hey ${guestNames}! Added "${expense.title}" (${amountText}) on Divido 💸\nJoin our group${groupNameStr} to track & settle:\n${inviteLink}`;
  };

  const shareText = generateShareText();
  const encodedMsg = encodeURIComponent(shareText);

  const canNativeShare = typeof navigator !== 'undefined' && !!(navigator as any).share;
  const handleNativeShare = async () => {
    try {
      await (navigator as any).share({
        title: group?.name ? `Join "${group.name}" on Divido` : 'Join Divido',
        text: shareText,
        url: inviteLink,
      });
      onClose();
    } catch {
      /* User cancelled or share failed */
    }
  };

  const handleWhatsAppShare = () => {
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
    onClose();
  };

  const unregisteredText = unregisteredShares.length === 1
    ? `${unregisteredShares[0].name} is not on Divido yet`
    : `${unregisteredShares.length} members are not on Divido yet`;

  return (
    <>
      <style>{`
        @keyframes postExpSlideUp {
          0% { transform: translate(-50%, 60px); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes invitePulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '92%',
          maxWidth: '440px',
          zIndex: 25000,
          animation: 'postExpSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: '#0F172A',
            color: '#FFFFFF',
            borderRadius: '24px',
            padding: '20px 22px',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.6), 0 0 0 1.5px rgba(245, 158, 11, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Top Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                }}
              >
                📲
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {/* PROMINENT HIGH-CONTRAST HEADLINE */}
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#FCD34D', // Bright amber highlight
                    letterSpacing: '-0.2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{unregisteredText}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                  Expense recorded! Send a 1-tap invite link
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 'bold',
                marginTop: '-2px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Unregistered Member breakdown pill list */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.4) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '16px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {unregisteredShares.map((item) => (
              <div
                key={item.name}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>👤</span>
                  <span style={{ fontWeight: 600, color: '#F8FAFC' }}>
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      background: 'rgba(245, 158, 11, 0.25)',
                      color: '#FCD34D',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Guest
                  </span>
                </div>
                <span style={{ fontWeight: 600, color: '#10B981', fontSize: '14px' }}>
                  {currencySymbol}{item.shareAmount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          {!showShareGrid ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleWhatsAppShare}
                style={{
                  flex: 1,
                  padding: '13px',
                  borderRadius: '14px',
                  border: 'none',
                  background: '#25D366',
                  color: '#FFFFFF',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)',
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.5l5.797-1.452A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.658-.497-5.188-1.367l-.372-.214-3.437.813.874-3.329-.242-.384A9.954 9.954 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Share Invite Link
              </button>

              {canNativeShare ? (
                <button
                  onClick={handleNativeShare}
                  style={{
                    padding: '13px 16px',
                    borderRadius: '14px',
                    border: 'none',
                    background: '#6366F1',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  More...
                </button>
              ) : (
                <button
                  onClick={() => setShowShareGrid(true)}
                  style={{
                    padding: '13px 16px',
                    borderRadius: '14px',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#E2E8F0',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  More Apps
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: '#1E293B', padding: '10px', borderRadius: '16px' }}>
              <ShareGrid message={shareText} url={inviteLink} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
