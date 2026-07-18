export const checkIfDemoMode = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return !url || url.includes('your-project-id') || !key || key.includes('your-supabase-anon-key');
};
