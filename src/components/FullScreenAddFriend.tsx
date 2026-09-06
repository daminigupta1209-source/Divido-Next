import React, { useState, useRef, useEffect } from 'react';
import { isValidEmail } from '../lib/identity';

interface FriendSelection {
  name: string;
  email: string;
  identity: string;
}

interface FullScreenAddFriendProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFriends: (friends: FriendSelection[]) => void;
  existingMembers: string[];
  suggestions: { name: string; email: string; identity?: string; pastMember?: boolean }[];
}

export const FullScreenAddFriend: React.FC<FullScreenAddFriendProps> = ({
  isOpen,
  onClose,
  onAddFriends,
  existingMembers,
  suggestions
}) => {
  const [addVal, setAddVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<FriendSelection[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const qRaw = addVal.trim();
  const q = qRaw.toLowerCase();
  
  // Show suggestions matching the search
  const shown = suggestions
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    .slice(0, 8);
    
  // Check if exactly this name is already in the group or picked
  const existsInGroup = existingMembers.some(
    (m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === q
  );
  const exactSug = suggestions.some((s) => s.name.toLowerCase() === q);
  const alreadyPicked = selectedFriends.some((f) => f.name.toLowerCase() === q);
  const canAddNew = qRaw.length > 0 && !existsInGroup && !exactSug && !alreadyPicked;

  const selKey = (s: { name: string; identity?: string }) => (s.identity || s.name).toLowerCase();
  const isSelected = (s: { name: string; identity?: string }) => selectedFriends.some((f) => selKey(f) === selKey(s));
  
  const toggleSelect = (s: { name: string; email: string; identity?: string }) => {
    setSelectedFriends((prev) => 
      prev.some((f) => selKey(f) === selKey(s)) 
        ? prev.filter((f) => selKey(f) !== selKey(s)) 
        : [...prev, { name: s.name, email: s.email, identity: s.identity || '' }]
    );
  };

  const handleAddNew = () => {
    const em = emailVal.trim();
    if (em && !isValidEmail(em)) { 
      alert("That doesn't look like a valid email. Leave it blank or fix it."); 
      return; 
    }
    toggleSelect({ name: qRaw, email: em, identity: '' });
    setAddVal('');
    setEmailVal('');
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const commitSelected = () => {
    onAddFriends(selectedFriends);
    setSelectedFriends([]);
    setAddVal('');
    setEmailVal('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 10001, overflowY: 'auto', padding: '20px 16px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t)', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', marginLeft: '-6px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--t)', margin: 0 }}>Add friend</h1>
        </div>
        <button
          type="button"
          onClick={commitSelected}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#10B981',
            cursor: 'pointer',
            padding: '8px',
            marginRight: '-8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'all 0.2s',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>

      {/* Search / type a name */}
      <div 
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '36px',
          borderRadius: '10px',
          border: '1.5px solid #E2E8F0',
          background: 'var(--w)',
          padding: '0 12px 0 16px',
          boxSizing: 'border-box',
          width: '100%',
          cursor: 'text',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          id="dv-member-add"
          autoFocus
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          data-1p-ignore
          data-lpignore="true"
          placeholder="Search or type a new name"
          value={addVal}
          onChange={(e) => setAddVal(e.target.value)}
          onKeyDown={(e) => { 
            if (e.key === 'Escape') { onClose(); }
            if (e.key === 'Enter' && canAddNew) { e.preventDefault(); handleAddNew(); }
          }}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--t)',
            padding: '0 10px',
            margin: 0,
            outline: 'none',
            minWidth: 0,
            lineHeight: 'normal',
          }}
        />
        {canAddNew && (
          <button
            onClick={handleAddNew}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Email Box directly under name box if canAddNew */}
      {canAddNew && (
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '36px',
            borderRadius: '10px',
            border: '1.5px solid #E2E8F0',
            background: 'var(--w)',
            padding: '0 16px',
            boxSizing: 'border-box',
            width: '100%',
            marginTop: '-14px',
          }}
        >
          <input
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            data-1p-ignore
            data-lpignore="true"
            placeholder="Email (optional)"
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNew(); } }}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '13px',
              fontWeight: 500,
              color: '#334155',
              padding: 0,
              margin: 0,
              outline: 'none',
              minWidth: 0,
              lineHeight: 'normal',
            }}
          />
        </div>
      )}

      {/* Ticked friends, shown as removable pills */}
      {selectedFriends.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {selectedFriends.map((f) => (
            <span key={selKey(f)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: '999px', padding: '5px 8px 5px 6px', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{f.name.charAt(0).toUpperCase()}</span>
              {f.name}
              <span onClick={() => toggleSelect(f)} style={{ cursor: 'pointer', color: '#059669', fontWeight: 700, marginLeft: '2px' }}>✕</span>
            </span>
          ))}
        </div>
      )}

      {/* + Add as new button */}
      {canAddNew && (
        <button
          onClick={handleAddNew}
          style={{ width: '100%', padding: '13px', borderRadius: '14px', border: '1.5px dashed #10B981', background: 'transparent', color: '#059669', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          + Add “{qRaw}” as new
        </button>
      )}

      {shown.length > 0 && (
        <div>
          <p style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left' }}>
            Recently split with
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shown.map((s) => {
              const on = isSelected(s);
              return (
                <button
                  key={s.email || s.name}
                  type="button"
                  onClick={() => toggleSelect({ name: s.name, email: s.email, identity: s.identity })}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: on ? '#ECFDF5' : 'var(--w)', border: `1.5px solid ${on ? '#A7F3D0' : '#F1F5F9'}`, borderRadius: '14px', padding: '12px 14px', cursor: 'pointer', transition: '0.15s all ease' }}
                >
                  <span style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      {s.pastMember && (
                        <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: '999px', padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Left · re-invite</span>
                      )}
                    </span>
                    {s.email && <span style={{ display: 'block', fontSize: '11px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>}
                  </span>
                  {on ? (
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  ) : (
                    <span style={{ color: '#6366F1', fontSize: '20px', fontWeight: 700, flexShrink: 0 }}>+</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shown.length === 0 && !canAddNew && selectedFriends.length === 0 && (
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8', textAlign: 'center' }}>
          Type a name to add someone new.
        </p>
      )}

      {selectedFriends.length > 0 && (
        <button
          onClick={commitSelected}
          style={{ width: '100%', padding: '15px', borderRadius: '14px', border: 'none', background: '#10B981', color: '#FFFFFF', fontWeight: 700, fontSize: '15px', cursor: 'pointer', marginTop: 'auto' }}
        >
          Add {selectedFriends.length} {selectedFriends.length === 1 ? 'friend' : 'friends'}
        </button>
      )}
    </div>
  );
};
