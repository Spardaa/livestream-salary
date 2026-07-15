import { DEFAULTS } from "../config/constants";

/** 读 File 为 dataURL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("读取图片失败"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/**
 * 压缩图片为 JPEG dataURL（最长边 ≤ maxDim），省 token、避免 payload 超限。
 * 截图为不透明图，转 JPEG 无损观感。
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = DEFAULTS.imageMaxDim,
  quality = 0.85,
): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  const img = await loadImage(raw);
  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
