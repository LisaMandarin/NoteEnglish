export type CompressedImage = { base64: string; mimeType: string };

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("無法讀取圖片檔案。"));
    img.src = url;
  });
}

// Downscale the image to MAX_DIMENSION and re-encode as JPEG so OCR payloads stay small.
export async function fileToCompressedBase64(file: File): Promise<CompressedImage> {
  const objectUrl: string = URL.createObjectURL(file);
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
      throw new Error("無法處理圖片檔案。");
    }
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl: string = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64: string = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { base64, mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
