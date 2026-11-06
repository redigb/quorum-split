const MAX_SIDE = 1600;

/**
 * Reduce la foto antes de subirla: una foto de celular pesa 3-8 MB, y eso revienta el límite del
 * servidor (4.5 MB) y el del lector (4 MB en base64), además de tardar. 1600 px alcanzan para leer un ticket.
 * Si algo falla, devuelve el archivo original y que decida el servidor.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "receipt.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
