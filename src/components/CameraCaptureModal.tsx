import React, { useEffect, useRef, useState } from 'react';

interface CameraCaptureModalProps {
  show: boolean;
  onClose: () => void;
  /** Called with a JPEG data URL once a photo is captured. */
  onCapture: (dataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({ show, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    setError('');
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        setError('Could not open the camera. Check permissions, or use "Upload photo or file" instead.');
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [show]);

  if (!show) return null;

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onCapture(dataUrl);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 7000 }}
    >
      <div
        className="card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '340px', maxWidth: '92vw', background: 'var(--w)', borderRadius: '20px', padding: '16px', position: 'relative', boxSizing: 'border-box' }}
      >
        <div
          onClick={onClose}
          style={{ position: 'absolute', top: '12px', right: '14px', cursor: 'pointer', fontSize: '18px', lineHeight: 1, color: 'var(--g)', opacity: 0.4, zIndex: 2 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
        >
          ✕
        </div>

        {error ? (
          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--g)', lineHeight: 1.5 }}>
            📷 {error}
          </div>
        ) : (
          <>
            <div style={{ borderRadius: '14px', overflow: 'hidden', background: '#0F172A', aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <button
                onClick={capture}
                title="Capture photo"
                style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '4px solid #10B981',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                }}
                className="hover-up"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
