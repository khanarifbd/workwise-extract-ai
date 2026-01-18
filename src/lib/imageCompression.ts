/**
 * Image compression utilities for mobile uploads
 * Compresses images before upload to reduce file sizes and speed up transfers
 */

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  mimeType?: 'image/jpeg' | 'image/webp';
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.8,
  mimeType: 'image/jpeg',
};

/**
 * Compress an image file using canvas
 * @param file The original image file
 * @param options Compression options
 * @returns Promise<File> The compressed file
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip compression for already small files (< 500KB) and non-images
  if (file.size < 500 * 1024 || !file.type.startsWith('image/')) {
    return file;
  }

  // Skip compression for GIFs (would lose animation)
  if (file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      resolve(file); // Fall back to original if canvas not supported
      return;
    }

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      const maxW = opts.maxWidth!;
      const maxH = opts.maxHeight!;

      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw with high quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // Fall back to original
            return;
          }

          // Only use compressed version if it's actually smaller
          if (blob.size >= file.size) {
            resolve(file);
            return;
          }

          // Create new file with original name
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            {
              type: opts.mimeType,
              lastModified: Date.now(),
            }
          );

          console.log(
            `Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`
          );

          resolve(compressedFile);
        },
        opts.mimeType,
        opts.quality
      );
    };

    img.onerror = () => {
      console.error('Failed to load image for compression');
      resolve(file); // Fall back to original
    };

    // Load image from file
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve(file); // Fall back to original
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compress multiple images in parallel with concurrency control
 * @param files Array of image files
 * @param options Compression options
 * @param maxConcurrent Maximum concurrent compressions (default: 2 for mobile)
 * @param onProgress Progress callback
 * @returns Promise<File[]> Array of compressed files
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {},
  maxConcurrent: number = 2,
  onProgress?: (completed: number, total: number) => void
): Promise<File[]> {
  const results: File[] = [];
  let completed = 0;

  // Process in chunks to avoid memory issues on mobile
  for (let i = 0; i < files.length; i += maxConcurrent) {
    const chunk = files.slice(i, i + maxConcurrent);
    const compressed = await Promise.all(
      chunk.map((file) => compressImage(file, options))
    );
    results.push(...compressed);
    completed += chunk.length;
    onProgress?.(completed, files.length);

    // Small delay between chunks to prevent memory pressure
    if (i + maxConcurrent < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return results;
}

/**
 * Get total size savings from compression
 */
export function calculateSavings(originalFiles: File[], compressedFiles: File[]): {
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
} {
  const originalSize = originalFiles.reduce((sum, f) => sum + f.size, 0);
  const compressedSize = compressedFiles.reduce((sum, f) => sum + f.size, 0);
  const savedBytes = originalSize - compressedSize;
  const savedPercent = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

  return { originalSize, compressedSize, savedBytes, savedPercent };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
