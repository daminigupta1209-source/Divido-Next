-- Add is_deleted flag for soft-deleting expenses via long press in Activity Studio
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
