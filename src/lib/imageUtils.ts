// Memory-safe image downscaling.
//
// Native phone cameras produce very large photos (often 10+ MB / 12+ MP).
// Decoding those at full size — especially via a base64 data URL + <img> —
// spikes memory and crashes the web app on lower-RAM phones ("low memory").
// createImageBitmap decodes straight from the File/Blob without an intermediate
// base64 string and lets us downscale, and we close() it to free memory right
// after drawing. The result is a small JPEG data URL safe to preview, send to
// the AI, and store as an attachment.

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function downscaleImageFile(
  file: File,
  maxDim = 1280,
  quality = 0.7
): Promise<string> {
  // Non-images (e.g. PDFs) can't be drawn to a canvas — pass through.
  if (!file.type.startsWith('image/')) {
    return readAsDataURL(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return readAsDataURL(file);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const url = canvas.toDataURL('image/jpeg', quality);
    // Release the canvas backing store promptly.
    canvas.width = 0;
    canvas.height = 0;
    return url;
  } catch {
    // Older browser or decode failure — fall back to the raw file.
    return readAsDataURL(file);
  }
}
