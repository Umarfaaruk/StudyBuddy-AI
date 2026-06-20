/**
 * Image helpers for the vision (Camera Q&A / Ask-Doubt image) flow.
 *
 * Groq's vision model rejects oversized payloads and the serverless proxy caps
 * the request body at ~4.4 MB. A photo snapped on a phone or a screenshot saved
 * from the internet is often several MB, which previously caused the request to
 * silently fail. `compressImage` downscales + re-encodes to JPEG so the base64
 * payload stays small and well within limits, while keeping enough detail for
 * the model to read diagrams and text.
 */

/** Longest-edge the image is resized down to before encoding. */
const DEFAULT_MAX_DIM = 1280;
/** JPEG quality (0–1). 0.85 keeps text/diagrams legible at a small size. */
const DEFAULT_QUALITY = 0.85;

/**
 * Resize a data-URL image so its longest edge is at most `maxDim`, then encode
 * it as JPEG. Transparent areas are flattened onto white (so transparent PNGs
 * don't become black). Returns the original source unchanged if the browser
 * canvas APIs are unavailable. Never throws for a valid image.
 */
export function compressImage(
  src: string,
  maxDim: number = DEFAULT_MAX_DIM,
  quality: number = DEFAULT_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width === 0 || height === 0) {
        resolve(src);
        return;
      }

      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }

      // Flatten transparency onto white so diagrams stay readable as JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        // toDataURL can throw on tainted canvases — fall back to the original.
        resolve(src);
      }
    };
    img.onerror = () => reject(new Error("Could not read that image. Please try a different file."));
    img.src = src;
  });
}

/** Read a File into a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file. Please try again."));
    reader.readAsDataURL(file);
  });
}
