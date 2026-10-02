import React, { useState, useRef, useEffect } from 'react';
import { isValidEmail, dismissPerson, dismissedPersonKey } from '../lib/identity';

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
  // My own name in this list, so a same-name clash with ME can be explained.
  myName?: string;
  suggestions: { name: string; email: string; identity?: string; pastMember?: boolean }[];
  // Non-group mode: split is always between exactly two people (you + one
  // other), so picking a person commits immediately and closes — no ticking
  // several friends, no separate "Add N friends" confirm step.
  singleSelect?: boolean;
  title?: string;
  // Profile photos keyed by lowercase email (shared member_avatars table).
  memberAvatars?: Record<string, string>;
  // Emails already used by people in this group (not in suggestions), so a
  // new person can't reuse one.
  existingEmails?: Record<string, string>;
}

const Avatar: React.FC<{ name: string; email?: string; avatars?: Record<string, string>; size: number; bg: string; color: string }> = ({ name, email, avatars, size, bg, color }) => {
  const url = (email && avatars?.[email.trim().toLowerCase()]) || '';
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0, overflow: 'hidden' };
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover' }} />;
  }
  return (
    <span style={{ ...box, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.round(size * 0.37)}px`, fontWeight: 700 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
};

export const FullScreenAddFriend: React.FC<FullScreenAddFriendProps> = ({
  isOpen,
  onClose,
  onAddFriends,
  existingMembers,
  myName,
  suggestions,
  singleSelect = false,
  title = 'Add friend',
  memberAvatars,
  existingEmails,
}) => {
  const [addVal, setAddVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<FriendSelection[]>([]);
  // Rows the user removed via the trash icon this session — hidden immediately
  // for feedback; dismissPerson() also persists it so it stays gone next time.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [emailErr, setEmailErr] = useState('');
  const emailBoxRef = useRef<HTMLDivElement>(null);

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
    .filter((s) => !hidden.has(dismissedPersonKey(s)))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    .slice(0, 8);

  const deleteSuggestion = (s: { name: string; email: string; identity?: string }) => {
    dismissPerson(s);
    setHidden((prev) => new Set(prev).add(dismissedPersonKey(s)));
  };
    
  // Check if exactly this name is already in the group or picked
  const existsInGroup = existingMembers.some(
    (m) => m.replace(/\s*\(Left\)$/i, '').trim().toLowerCase() === q
  );
  // A different person may share a name with someone already known. They can
  // be added, but only with their own (not-yet-used) email — email is what
  // keeps the two apart.
  const sameNameSugs = suggestions.filter((s) => s.name.toLowerCase() === q);
  const alreadyPicked = selectedFriends.some((f) => f.name.toLowerCase() === q);
  // Same name inside THIS group: expenses store people by name text, so the
  // new person gets a short email tag ("Damini Gupta (dg.work)") to keep the
  // two separate in balances. Their profile name replaces it when they join.
  const inGroupClash = existsInGroup || alreadyPicked;
  const clashesWithMe = !!myName && myName.replace(/s*(me)$/i, '').trim().toLowerCase() === q;
  // Plain-language reason shown whenever an email is required.
  const needsEmailReason = clashesWithMe
    ? `"${qRaw}" is your own name here. Add their email so Divido can tell the two of you apart, otherwise your balances would get mixed up.`
    : inGroupClash
    ? `There is already a "${qRaw}" in this group. Add the new person's email so their balances stay separate.`
    : `You already have a friend called "${qRaw}". Add the new person's email so Divido knows it's someone else.`;
  const needsEmail = inGroupClash || sameNameSugs.length > 0;
  const canAddNew = qRaw.length > 0;

  const norm = (s: string) => s.trim().toLowerCase();
  const takenNames = new Set([
    ...existingMembers.map((m) => norm(m.replace(/\s*\(Left\)$/i, ''))),
    ...selectedFriends.map((f) => norm(f.name)),
  ]);
  const newPersonName = (em: string): string => {
    if (!inGroupClash) return qRaw;
    const base = `${qRaw} (${em.split('@')[0]})`;
    let name = base;
    for (let i = 2; takenNames.has(norm(name)); i++) name = `${base} ${i}`;
    return name;
  };

  const showEmailError = (msg: string) => {
    setEmailErr(msg);
    emailBoxRef.current?.animate(
      [0, -6, 6, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 400, easing: 'ease' }
    );
    emailRef.current?.focus();
  };

  // Returns an error message, or '' if the typed new person can be added.
  const newPersonError = (em: string): string => {
    if (em && !isValidEmail(em)) return 'Enter a valid email';
    if (needsEmail && !em) return `Email needed: ${needsEmailReason}`;
    if (em) {
      const e = norm(em);
      if (sameNameSugs.some((s) => s.email && norm(s.email) === e)) {
        return `Same email as the ${qRaw} you already have`;
      }
      const groupPeople = Object.entries(existingEmails || {}).map(([name, email]) => ({ name, email }));
      const owner = [...groupPeople, ...suggestions, ...selectedFriends].find((s) => s.email && norm(s.email) === e);
      if (owner) return `Already used by ${owner.name}`;
    }
    return '';
  };

  const selKey = (s: { name: string; identity?: string }) => (s.identity || s.name).toLowerCase();
  const isSelected = (s: { name: string; identity?: string }) => selectedFriends.some((f) => selKey(f) === selKey(s));
  
  const commitOne = (s: { name: string; email: string; identity?: string }) => {
    onAddFriends([{ name: s.name, email: s.email, identity: s.identity || '' }]);
    setSelectedFriends([]);
    setAddVal('');
    setEmailVal(''); setEmailErr('');
  };

  const toggleSelect = (s: { name: string; email: string; identity?: string }) => {
    if (singleSelect) { commitOne(s); return; }
    setSelectedFriends((prev) =>
      prev.some((f) => selKey(f) === selKey(s))
        ? prev.filter((f) => selKey(f) !== selKey(s))
        : [...prev, { name: s.name, email: s.email, identity: s.identity || '' }]
    );
  };

  const handleAddNew = () => {
    const em = emailVal.trim();
    const err = newPersonError(em);
    if (err) { showEmailError(err); return; }
    const name = newPersonName(em);
    if (singleSelect) { commitOne({ name, email: em, identity: '' }); return; }
    toggleSelect({ name, email: em, identity: '' });
    setAddVal('');
    setEmailVal(''); setEmailErr('');
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const commitSelected = () => {
    let toCommit = selectedFriends;
    const em = emailVal.trim();
    
    // If the user typed a valid new name but clicked the top-right tick directly
    // instead of the inline '+' button, auto-commit what they typed.
    if (canAddNew && qRaw) {
      const err = newPersonError(em);
      if (err) { showEmailError(err); return; }
      toCommit = [...toCommit, { name: newPersonName(em), email: em, identity: '' }];
    }
    
    onAddFriends(toCommit);
    setSelectedFriends([]);
    setAddVal('');
    setEmailVal(''); setEmailErr('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 10001, overflowY: 'auto', padding: '20px 16px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t)', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', marginLeft: '-6px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--t)', margin: 0 }}>{title}</h1>
        </div>
        {!singleSelect && (
        <button
          type="button"
          onClick={commitSelected}
          aria-label="Done"
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
        )}
      </div>

      {/* Search / type a name */}
      <div 
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '50px',
          borderRadius: '12px',
          border: '1.5px solid #E2E8F0',
          background: 'var(--w)',
          padding: '0 12px 0 16px',
          flexShrink: 0,
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
          onChange={(e) => { setAddVal(e.target.value); setEmailErr(''); }}
          onKeyDown={(e) => { 
            if (e.key === 'Escape') { onClose(); }
            if (e.key === 'Enter' && canAddNew) { e.preventDefault(); handleAddNew(); }
          }}
          style={{
            flex: 1,
            height: '100%',
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--t)',
            padding: '0 10px',
            margin: 0,
            outline: 'none',
            minWidth: 0,
            lineHeight: 'normal',
            WebkitAppearance: 'none',
            appearance: 'none',
            boxSizing: 'border-box',
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
                color: '#3B82F6', // Blue color
                padding: 0,
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
        )}
      </div>

      {/* Email Box directly under name box if canAddNew */}
      {canAddNew && (
        <div
          ref={emailBoxRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '50px',
            borderRadius: '12px',
            border: `1.5px solid ${emailErr ? '#EF4444' : '#E2E8F0'}`,
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
            placeholder={needsEmail ? 'Email (required)' : 'Email (optional)'}
            value={emailVal}
            ref={emailRef}
            onChange={(e) => { setEmailVal(e.target.value); if (emailErr) setEmailErr(''); }}
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
      {canAddNew && (
        emailErr ? (
          <p style={{ margin: '-8px 4px 0', fontSize: '12px', color: '#DC2626', fontWeight: 600, lineHeight: 1.35 }}>
            {emailErr}
          </p>
        ) : needsEmail ? (
          <p style={{ margin: '-8px 4px 0', fontSize: '11px', color: '#B45309', lineHeight: 1.35 }}>
            {needsEmailReason}
          </p>
        ) : (
          <p style={{ margin: '-8px 4px 0', fontSize: '11px', color: '#94A3B8', lineHeight: 1.35 }}>
            💡 Add their email and they join instantly when they sign in — no “pick your name” step, and it avoids mix-ups if two friends share a name.
          </p>
        )
      )}

      {/* Ticked friends, shown as removable pills */}
      {selectedFriends.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {selectedFriends.map((f) => (
            <span key={selKey(f)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: '999px', padding: '5px 8px 5px 6px', fontSize: '13px', fontWeight: 600, maxWidth: '100%', boxSizing: 'border-box' }}>
              <Avatar name={f.name} email={f.email} avatars={memberAvatars} size={22} bg="#10B981" color="#fff" />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
                {f.email && <span style={{ color: '#059669', fontWeight: 400, fontSize: '11.5px' }}> · {f.email}</span>}
              </span>
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
                  onClick={() => {
                    const picking = !on;
                    toggleSelect({ name: s.name, email: s.email, identity: s.identity });
                    // Picking someone from the list finishes that search — clear it so
                    // the "add as new" name + email fields (meant for a typed new
                    // person) don't linger as if they belonged to the pick.
                    if (picking) { setAddVal(''); setEmailVal(''); setEmailErr(''); }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: on ? '#ECFDF5' : 'var(--w)', border: `1.5px solid ${on ? '#A7F3D0' : '#F1F5F9'}`, borderRadius: '14px', padding: '12px 14px', cursor: 'pointer', transition: '0.15s all ease' }}
                >
                  <Avatar name={s.name} email={s.email} avatars={memberAvatars} size={38} bg="#EEF2FF" color="#4338CA" />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: s.pastMember ? '#94A3B8' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: s.pastMember ? 'line-through' : 'none' }}>{s.name}</span>
                    {s.email && <span style={{ display: 'block', fontSize: '11px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>}
                  </span>
                  {/* Trash — remove this person from the recents list. Nested
                      inside the row button, so it stops propagation to avoid
                      also toggling selection. */}
                  <span
                    role="button"
                    aria-label={`Remove ${s.name} from recents`}
                    onClick={(e) => { e.stopPropagation(); deleteSuggestion({ name: s.name, email: s.email, identity: s.identity }); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', color: '#CBD5E1', flexShrink: 0, cursor: 'pointer' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </span>
                  {on ? (
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  ) : (
                    <span style={{ color: '#6366F1', fontSize: '26px', fontWeight: 700, flexShrink: 0, marginRight: '8px', lineHeight: 1 }}>+</span>
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
