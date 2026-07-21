import JSZip from "jszip";

/** 1 MiB — multi-file exports are packaged as a ZIP when total size exceeds this. */
export const ZIP_THRESHOLD_BYTES = 1 * 1024 * 1024;

export interface NamedFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBytes(
  bytes: Uint8Array,
  fileName: string,
  mime: string
) {
  const buffer = new Uint8Array(bytes).slice().buffer;
  downloadBlob(new Blob([buffer], { type: mime }), fileName);
}

/**
 * Download one or more files. A single file always downloads as-is.
 * Multiple files whose combined size exceeds 1MB are packed into a ZIP;
 * otherwise each file is downloaded individually.
 */
export async function downloadFiles(
  files: NamedFile[],
  zipBaseName: string
) {
  if (files.length === 0) return;

  if (files.length === 1) {
    const f = files[0];
    downloadBytes(f.bytes, f.name, f.mime);
    return;
  }

  const total = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);
  if (total > ZIP_THRESHOLD_BYTES) {
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.name, f.bytes);
    }
    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    downloadBytes(zipBytes, `${zipBaseName}.zip`, "application/zip");
    return;
  }

  for (const f of files) {
    downloadBytes(f.bytes, f.name, f.mime);
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
