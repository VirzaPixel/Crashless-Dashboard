export const PHOTO_MAX_DIMENSION = 1280;
export const PHOTO_QUALITY = 0.78;
export const PHOTO_MIME_TYPE = 'image/jpeg';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    img.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Gagal mengompresi gambar.'));
      },
      mimeType,
      quality,
    );
  });
}

function getOutputSize(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Kompres gambar di browser: resize sisi terpanjang ke maxDimension
 * lalu encode JPEG. Mengembalikan File baru (*.jpg).
 */
export async function compressImage(
  file,
  { maxDimension = PHOTO_MAX_DIMENSION, quality = PHOTO_QUALITY } = {},
) {
  if (!(file instanceof Blob)) {
    throw new Error('File gambar tidak valid.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('File dokumentasi harus berupa gambar.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = getOutputSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDimension);

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const alreadySmall = sourceWidth <= maxDimension && sourceHeight <= maxDimension;
    const isJpeg = file.type === 'image/jpeg';

    // Lewati encode ulang kalau sudah kecil & JPEG — hemat waktu & kualitas.
    if (alreadySmall && isJpeg) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak mendukung kompresi gambar.');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, PHOTO_MIME_TYPE, quality);
    const baseName = (file.name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, {
      type: PHOTO_MIME_TYPE,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
