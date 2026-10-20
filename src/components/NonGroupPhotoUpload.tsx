import React from 'react';
import { createPortal } from 'react-dom';

export type NonGroupPhoto = { url: string; caption: string; saveOnly: boolean };

// Non-Group Photos tab upload: pick an image, then the same "Process
// Attachment" choice a group's gallery gives (Split Expense / Save to Gallery).
// 'button' = the empty-state CTA, 'tile' = the dashed "+" grid tile.
export const NonGroupPhotoUpload: React.FC<{
  variant: 'button' | 'tile';
  onSave: (photo: NonGroupPhoto) => void;
}> = ({ variant, onSave }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = React.useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = React.useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedPhoto(reader.result as string);
      setPhotoCaption('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const close = () => setSelectedPhoto(null);
  const finish = (saveOnly: boolean) => {
    if (!selectedPhoto) return;
    onSave({ url: selectedPhoto, caption: photoCaption, saveOnly });
    close();
  };

  const actionBtn: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    borderRadius: '14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  };

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            background: '#10B981',
            color: '#FFFFFF',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload Photo</span>
        </button>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="hover-up-mini"
          title="Add photo"
          style={{
            aspectRatio: '1',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8FAFC',
            border: '2px dashed #CBD5E1',
            color: '#94A3B8',
            boxSizing: 'border-box',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {selectedPhoto && createPortal(
        <div
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '380px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1E293B', letterSpacing: '-0.3px' }}>
                Process Attachment
              </h3>
              <button
                onClick={close}
                style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px', color: '#94A3B8', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                width: '100%',
                maxHeight: '180px',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #F1F5F9',
              }}
            >
              <img src={selectedPhoto} alt="Selected preview" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>Caption (optional)</label>
              <input
                type="search"
                placeholder="e.g. Dinner receipt, Event photo..."
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #E2E8F0',
                  fontSize: '13px',
                  fontWeight: 700,
                  outline: 'none',
                  color: '#334155',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#10B981'}
                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => finish(false)}
                className="hover-up-mini"
                style={{ ...actionBtn, background: '#10B981', color: '#FFFFFF', border: 'none', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
              >
                Split Expense
              </button>
              <button
                onClick={() => finish(true)}
                className="hover-up-mini"
                style={{ ...actionBtn, background: '#FFFFFF', color: '#475569', border: '1.5px solid #E2E8F0' }}
              >
                Save to Gallery
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
