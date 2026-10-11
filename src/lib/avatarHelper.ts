/**
 * Downscale and center-crop uploaded avatar image to compact WebP/JPEG data URL.
 * Produces an optimized ~5-15 KB square image suitable for offline storage.
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function processAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('Image file is too large (maximum 10 MB).'));
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      reject(new Error('Please select a valid raster image file (JPG, PNG, or WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        const width = img.width;
        const height = img.height;

        // Center square crop
        const size = Math.min(width, height);
        const startX = (width - size) / 2;
        const startY = (height - size) / 2;

        canvas.width = Math.min(size, maxSize);
        canvas.height = Math.min(size, maxSize);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing context unavailable.'));
          return;
        }

        ctx.drawImage(
          img,
          startX,
          startY,
          size,
          size,
          0,
          0,
          canvas.width,
          canvas.height
        );

        try {
          // Attempt WebP export, fallback to JPEG
          const dataUrl = canvas.toDataURL('image/webp', 0.85);
          resolve(dataUrl);
        } catch {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
