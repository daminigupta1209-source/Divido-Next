// Fresh sign-in with no cached data yet: show a friendly branded splash (the
// Divido cat) until the first cloud load finishes — so users never see an
// empty "Your Groups" and get scared. Returning users with cached groups skip
// this entirely. The parent gates when this renders.
export function BootSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '18px',
      background: 'var(--bg)', zIndex: 10000,
    }}>
      <div style={{
        width: '96px', height: '96px', borderRadius: '24px', overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
        animation: 'divido-splash-pulse 1.4s ease-in-out infinite',
      }}>
        <img src="/divido_laughing_cat_mascot_1778063273427.png" alt="Divido" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--t)', letterSpacing: '-0.3px' }}>Divido</div>
      <style>{`@keyframes divido-splash-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }`}</style>
    </div>
  );
}
