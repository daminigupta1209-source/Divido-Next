import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If credentials are not provided (e.g. initial run), it will still initialize
// but auth/sync requests will fail gracefully with warnings in console.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key');

/**
 * Uploads a data URL (base64 encoded image/file) to Supabase Storage bucket 'expense-attachments'.
 * Returns the public URL of the uploaded object, or the original dataUrl as fallback.
 */
export async function uploadAttachment(dataUrl: string, folderName = 'attachments'): Promise<string> {
  // If it's not a data URL (e.g. already a public URL or standard placeholder), return it directly
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  // If supabase is not configured, fallback to original dataUrl
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return dataUrl;
  }

  try {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return dataUrl;
    
    const mimeType = match[1];
    const base64Data = match[2];

    // Decode base64 to Blob
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Generate unique name
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extension}`;
    const filePath = `${folderName}/${fileName}`;

    // Upload to 'expense-attachments' bucket
    const { error } = await supabase.storage
      .from('expense-attachments')
      .upload(filePath, blob, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      return dataUrl; // fallback to base64
    }

    // Get and return public URL
    const { data: publicUrlData } = supabase.storage
      .from('expense-attachments')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Failed to upload attachment to Supabase Storage:', err);
    return dataUrl; // fallback
  }
}

