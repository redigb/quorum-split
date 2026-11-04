import { Pic } from "./Pic";
import type { Photo } from "./photos";

/**
 * Foto enmarcada. `.shot-inner` es más alto que el marco para que GSAP pueda moverla
 * (parallax) sin mostrar bordes. Sin JS se ve centrada.
 */
export function Shot({
  photo,
  sizes,
  className = "",
  decorative = false,
}: {
  photo: Photo;
  sizes: string;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <div className={`shot ${className}`}>
      <div className="shot-inner">
        <Pic src={photo.src} alt={decorative ? "" : photo.alt} fill sizes={sizes} className="object-cover" />
      </div>
    </div>
  );
}
