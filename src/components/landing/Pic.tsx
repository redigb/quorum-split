import Image, { type ImageProps } from "next/image";

/**
 * Imagen de la landing. Las fotos ya vienen a 1200px/q72 en /public, así que:
 * - `unoptimized`: sin variantes del optimizador (antes pedía hasta 3840px) y cada archivo se descarga una sola vez.
 * - `eager`: lazy-loading nunca dispara dentro de contenedores ocultos, fijados o en 3D (tornado, rastro, hover).
 */
export function Pic(props: Omit<ImageProps, "unoptimized" | "loading" | "priority" | "preload">) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} unoptimized loading="eager" decoding="async" />;
}
