/** Esqueleto con la forma de las pantallas de la app (rótulo, título grande, tarjeta y filas): al cargar no hay saltos. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="fade-in">
      <div className="skeleton h-3 w-28 rounded-full" />
      <div className="skeleton mt-4 h-14 w-4/5 rounded-2xl sm:h-16" />
      <div className="skeleton mt-3 h-14 w-3/5 rounded-2xl sm:h-16" />
      <div className="skeleton mt-8 h-40 rounded-3xl" />
      <div className="mt-6 space-y-2">
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
      </div>
    </div>
  );
}
