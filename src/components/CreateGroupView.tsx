import React, { useState, useRef, useEffect } from 'react';
import { worldCurrencies } from '../lib/utils';
import { Group } from '../lib/types';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';

interface CreateGroupViewProps {
  me: string;
  myDefaultCurrency: string;
  onCancel: () => void;
  onCreateGroup: (groupData: { name: string; currency: string; members: string[]; emoji: string; createdDate?: string }) => void;
  groups: Group[];
  userName: string;
  editingGroup?: Group;
  onManageMembers?: () => void;
}

export const CreateGroupView: React.FC<CreateGroupViewProps> = ({
  me,
  myDefaultCurrency,
  onCancel,
  onCreateGroup,
  groups,
  userName,
  editingGroup,
  onManageMembers,
}) => {
  const [title, setTitle] = useState(editingGroup ? editingGroup.name : '');
  const [selectedEmoji, setSelectedEmoji] = useState((editingGroup && editingGroup.emoji) ? editingGroup.emoji : ''); // Stores base64 group DP URL only; empty means show name initials
  const [selectedCurrency, setSelectedCurrency] = useState(editingGroup ? editingGroup.currency : (myDefaultCurrency || '₹'));
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [participants, setParticipants] = useState<string[]>(editingGroup ? editingGroup.members : [me]);

  // Read-only member rows for Edit mode, tagged by category. Actions (remove /
  // remind / invite-again) live on the group members card, opened via
  // "Manage members" — so Edit Group stays a clean settings + info screen.
  const meClean = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').trim().toLowerCase();
  const editMemberRows = editingGroup
    ? (editingGroup.members || []).map((m) => {
        const isLeft = /\s*\(left\)$/i.test(m);
        const clean = m.replace(/\s*\(Left\)$/i, '');
        const isMe = clean.toLowerCase() === meClean;
        const isPending = (editingGroup.pendingMembers || []).includes(m);
        const status = isMe ? 'Admin' : isLeft ? 'Left' : isPending ? 'Pending' : 'Joined';
        return { name: clean, status };
      })
    : [];
  const statusChip = (status: string): React.CSSProperties => {
    const map: Record<string, { c: string; bg: string }> = {
      Admin: { c: '#7C3AED', bg: '#EDE9FE' },
      Joined: { c: '#059669', bg: '#D1FAE5' },
      Pending: { c: '#B45309', bg: '#FEF3C7' },
      Left: { c: '#64748B', bg: '#F1F5F9' },
    };
    const cfg = map[status] || map.Joined;
    return { fontSize: '10px', fontWeight: 600, color: cfg.c, background: cfg.bg, padding: '2px 9px', borderRadius: '999px', flexShrink: 0 };
  };
  const [nameError, setNameError] = useState('');
  const [createdDate, setCreatedDate] = useState(() => editingGroup?.createdDate || new Date().toISOString().split('T')[0]);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const year2Digits = String(date.getFullYear()).slice(-2);
    return `${day} ${month} ${year2Digits}'`;
  };

  const currencyInfo = worldCurrencies.find((c) => c.s === selectedCurrency) || { s: '₹', n: 'Indian Rupee', c: 'INR' };

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autofocus title input on mount
  useEffect(() => {
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setSelectedEmoji(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Focus the newly-added name field so the user can type immediately.
  const lastFieldRef = useRef<HTMLInputElement>(null);
  const [focusLastField, setFocusLastField] = useState(false);
  useEffect(() => {
    if (focusLastField) {
      lastFieldRef.current?.focus();
      setFocusLastField(false);
    }
  }, [focusLastField, participants.length]);

  const handleAddParticipant = () => {
    setParticipants([...participants, '']);
    setFocusLastField(true);
  };

  const handleParticipantChange = (index: number, val: string) => {
    const updated = [...participants];
    updated[index] = val;
    setParticipants(updated);
  };

  const handleRemoveParticipant = (index: number) => {
    if (index === 0) return; // Cannot remove yourself
    const updated = participants.filter((_, i) => i !== index);
    setParticipants(updated);
  };

  // In EDIT mode, members that already existed when the screen opened are
  // read-only here — renaming or removing them must go through the member list
  // (which safely rewrites expenses on rename and tombstones/preserves balance
  // on remove). This screen only manages newly-added rows. In CREATE mode there
  // are no existing members, so everything is editable.
  const isExistingMember = (name: string) =>
    !!editingGroup && (editingGroup.members || []).includes(name);

  // Shake the Group Name box when the user tries to save without a name, so
  // it's obvious what's blocking them (rather than the tick silently doing nothing).
  const [shakeName, setShakeName] = useState(false);
  const [shakeFriends, setShakeFriends] = useState(false);

  // Names must be unique within a group (case-insensitive, ignoring surrounding
  // space and any (Left)/(You)/(me) suffix). Flag any participant row that
  // repeats an earlier one so we can highlight it and block save.
  const normName = (n: string) => n.replace(/\s*\((left|you|me)\)$/i, '').trim().toLowerCase();
  const duplicateIndices = (() => {
    const seen = new Set<string>();
    const dups = new Set<number>();
    participants.forEach((p, i) => {
      const key = normName(p);
      if (!key) return;
      if (seen.has(key)) dups.add(i);
      else seen.add(key);
    });
    return dups;
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setShakeName(true);
      titleInputRef.current?.focus();
      setTimeout(() => setShakeName(false), 450);
      return;
    }

    // Check duplicate group name
    const isDuplicate = groups.some(
      (g) => g.name.toLowerCase() === trimmedTitle.toLowerCase() && (!editingGroup || String(g.id) !== String(editingGroup.id))
    );
    if (isDuplicate) {
      setNameError('This group name already exists! 🏘️');
      return;
    }

    // Block save if two friends share a name — each needs a different one.
    if (duplicateIndices.size > 0) {
      setShakeFriends(true);
      setTimeout(() => setShakeFriends(false), 450);
      return;
    }

    // Filter out empty participant names and map duplicates/unnamed
    const cleanMembers = participants
      .map((p, idx) => {
        const val = p.trim();
        if (idx === 0) return val || me;
        return val;
      })
      .filter((p) => p !== '');

    // Make unique members list
    const uniqueMembers = Array.from(new Set(cleanMembers));

    onCreateGroup({
      name: trimmedTitle,
      currency: selectedCurrency,
      members: uniqueMembers,
      emoji: selectedEmoji,
      createdDate: createdDate,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="content-width-limit"
      style={{
        padding: '20px 16px',
        boxSizing: 'border-box',
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--t)',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              marginLeft: '-6px',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--t)', margin: 0,  }}>
            {editingGroup ? 'Edit Group' : 'New Group'}
          </h1>
        </div>

        {/* Submit Tick Button — always clickable; when the name is empty it
            shakes the Group Name box instead of silently doing nothing. */}
        <button
          type="submit"
          style={{
            background: 'none',
            border: 'none',
            color: '#10B981',
            cursor: 'pointer',
            padding: '4px 0px',
            marginRight: '-6px',
            opacity: title.trim() ? 1 : 0.6,
            display: 'inline-flex',
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
        
        {/* GROUP NAME SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Group Name
          </label>
          <div className={shakeName ? 'shake' : ''} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* DP Upload Circle Container */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '1.5px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              {selectedEmoji && (selectedEmoji.startsWith('data:image/') || selectedEmoji.startsWith('http')) ? (
                <img
                  src={selectedEmoji}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt="Group DP"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94A3B8' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

              <input
                ref={titleInputRef}
                type="search"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setNameError('');
                }}
                placeholder="E.g. City Trip"
                required
                style={{
                  flex: 1,
                  height: '54px',
                  borderRadius: '16px',
                  background: '#FFFFFF',
                  border: nameError ? '2px solid #EF4444' : '1.5px solid var(--border)',
                  padding: '0 16px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--t)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  
                  marginTop: 0,
                }}
              />
            </div>
          {nameError && (
            <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, marginTop: '6px', display: 'block' }}>
              {nameError}
            </span>
          )}
        </div>

        {/* OPTIONS SECTION (CURRENCY) */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Currency
          </label>
          <div
            onClick={() => setShowCurrencyPicker(true)}
            style={{
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '1.5px solid var(--border)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--bg)',
                  border: '1.5px solid var(--border)',
                  color: 'var(--t)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  flexShrink: 0,
                  
                }}
              >
                {currencyInfo?.s || '₹'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t)', textAlign: 'left' }}>
                  {currencyInfo?.n || 'Indian Rupee'}
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#A09586', marginTop: '2px', textAlign: 'left' }}>
                  {currencyInfo?.c || 'INR'} — {currencyInfo?.s || '₹'}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '20px', color: '#CFC6BB', fontWeight: 600, userSelect: 'none' }}>›</span>
          </div>
        </div>

        {/* PARTICIPANTS / MEMBERS SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Friends
          </label>

          {editingGroup ? (
            /* EDIT MODE — read-only member list tagged by category; manage on the members card */
            <>
              <div
                style={{
                  borderRadius: '16px',
                  background: '#FFFFFF',
                  border: '1.5px solid var(--border)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                }}
              >
                {editMemberRows.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '11px 12px',
                      borderBottom: i < editMemberRows.length - 1 ? '1px solid #F1F5F9' : 'none',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: row.status === 'Left' ? 'var(--g)' : 'var(--t)',  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.name}
                    </span>
                    <span style={statusChip(row.status)}>{row.status}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onManageMembers && onManageMembers()}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '11px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--border)',
                  background: '#FFFFFF',
                  color: '#2563EB',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Manage members →
              </button>
            </>
          ) : (
            /* CREATE MODE — editable list to add initial members */
            <div
              className={shakeFriends ? 'shake' : ''}
              style={{
                borderRadius: '16px',
                background: '#FFFFFF',
                border: '1.5px solid var(--border)',
                padding: '8px 8px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
              }}
            >
              {participants.map((participant, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--bg)',
                    borderRadius: '12px',
                    padding: '4px 12px',
                    border: duplicateIndices.has(index) ? '1.5px solid #EF4444' : '1.5px solid transparent',
                  }}
                >
                  <input
                    type="search"
                    ref={index === participants.length - 1 ? lastFieldRef : null}
                    value={index === 0 ? `${(participant && participant !== me ? participant : userName).replace(/\s*\(you\)$/i, '')} (You)` : participant}
                    placeholder={index === 0 ? "Your name" : `Friend ${index + 1}`}
                    onChange={(e) => handleParticipantChange(index, e.target.value)}
                    disabled={index === 0 || isExistingMember(participant)}
                    style={{
                      flex: 1,
                      height: '36px',
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: index === 0 ? 'var(--g)' : 'var(--t)',
                      
                    }}
                  />
                  {index > 0 && !isExistingMember(participant) && (
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {/* Add Friend button — orange pill, centered. Clicking it adds a
                  new name field and focuses it so the user can type right away. */}
              <button
                type="button"
                onClick={handleAddParticipant}
                style={{
                  background: '#F97316',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '8px 22px',
                  borderRadius: '999px',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: '13.5px',
                  letterSpacing: '0.2px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  alignSelf: 'center',
                  margin: '8px auto 0',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.background = '#EA580C';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = '#F97316';
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1, color: '#FFFFFF', display: 'flex', alignItems: 'center' }}>+</span>
                <span style={{ color: '#FFFFFF', lineHeight: 1, display: 'flex', alignItems: 'center' }}>Friend</span>
              </button>
              {duplicateIndices.size > 0 && (
                <p style={{ margin: '10px 4px 0', fontSize: '12px', fontWeight: 700, color: '#EF4444', textAlign: 'center' }}>
                  Each friend needs a different name.
                </p>
              )}
            </div>
          )}
        </div>

        {/* DATE SECTION (SMALL PILL BADGE AT BOTTOM LEFT) */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px', padding: '0 4px' }}>
          <div
            onClick={() => {
              if (dateInputRef.current) {
                try {
                  dateInputRef.current.showPicker();
                } catch (e) {
                  dateInputRef.current.focus();
                  dateInputRef.current.click();
                }
              }
            }}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '1.5px solid var(--border)',
              padding: '10px 14px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--t)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t)',  }}>
                {formatDateLabel(createdDate)}
              </span>
            </div>

            <input
              ref={dateInputRef}
              type="date"
              value={createdDate}
              onChange={(e) => setCreatedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0.01,
                cursor: 'pointer',
                zIndex: 2,
              }}
            />
          </div>
        </div>

      <SearchableCurrencyPicker
        show={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        current={selectedCurrency}
        onSelect={(symbol) => {
          setSelectedCurrency(symbol);
          setShowCurrencyPicker(false);
        }}
      />
    </form>
  );
};
