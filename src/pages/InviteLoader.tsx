// While an invite link is being resolved, show a lightweight loader instead of
// the home feed — otherwise the home screen flashes for a beat before the
// claim card appears once the Supabase round-trip completes.
export function InviteLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '18px',
      background: 'var(--bg)', color: 'var(--t)', zIndex: 10000,
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '50%',
        border: '4px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366F1',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '14px', fontWeight: 700, opacity: 0.7 }}>Opening your invite…</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
