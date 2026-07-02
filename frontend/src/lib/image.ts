export type CompressedImage = { base64: string; mimeType: string };

// Errors raised while reading/decoding the image locally (before any network
// call). Their messages are already user-facing and actionable, so callers
// should show them as-is instead of mapping them to a generic fallback.
export class ImagePrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePrepError";
  }
}

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

// HEIC/HEIF isn't decodable by <canvas> in most browsers (only Safari), so we
// convert it to JPEG in the browser first. Detect by MIME type when present, or
// fall back to the filename extension since HEIC files often report an empty type.
function isHeic(file: File): boolean {
  const type: string = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  if (type.startsWith("image/")) return false;
  return /\.(heic|heif)$/i.test(file.name);
}

// Convert a HEIC/HEIF file to a JPEG File so the shared canvas path can decode it.
async function heicToJpegFile(file: File): Promise<File> {
  let converted: Blob | Blob[];
  try {
    // Lazy-load the heavy heic2any/libheif bundle only when a HEIC is picked.
    const { default: heic2any } = await import("heic2any");
    converted = await heic2any({ blob: file, toType: "image/jpeg", quality: JPEG_QUALITY });
  } catch {
    throw new ImagePrepError("無法轉換 HEIC 圖片，請先在裝置上轉存為 JPG 或 PNG 後再試。");
  }
  const blob: Blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImagePrepError("無法讀取此圖片，格式可能不支援。請改用 JPG 或 PNG。"));
    img.src = url;
  });
}

// Downscale the image to MAX_DIMENSION and re-encode as JPEG so OCR payloads stay small.
export async function fileToCompressedBase64(file: File): Promise<CompressedImage> {
  const source: File = isHeic(file) ? await heicToJpegFile(file) : file;

  const objectUrl: string = URL.createObjectURL(source);
  try {
    const img: HTMLImageElement = await loadImage(objectUrl);
    const scale: number = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width: number = Math.round(img.naturalWidth * scale);
    const height: number = Math.round(img.naturalHeight * scale);

    const canvas: HTMLCanvasElement = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
    if (!ctx) {
      throw new ImagePrepError("無法處理圖片檔案。");
    }
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl: string = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64: string = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { base64, mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
