import { UserFacingError } from './errors';

const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/**
 * Resizes a photo to at most `maxDim` px and re-encodes it as JPEG.
 * Keeps uploads small on venue Wi-Fi and strips EXIF metadata (including GPS location).
 */
export async function prepareImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new UserFacingError('Please choose a photo.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new UserFacingError('That photo is too large (max 30 MB).');
  }

  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UserFacingError('Your browser could not process this photo.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new UserFacingError('Your browser could not process this photo.');
  return blob;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img> decoding (older Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new UserFacingError('This photo format is not supported. Please choose a JPG or PNG.'));
      img.src = url;
    });
  } finally {
    // Revoke after the image has decoded.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Random id that also works outside secure contexts (e.g. LAN testing over http). */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Not a secure context.
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
