import type { DemoPerson } from "./demo-bill";

export function Avatar({
  person,
  size = 28,
  className = "",
}: {
  person: DemoPerson;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      translate="no"
      className={`inline-grid shrink-0 place-items-center rounded-full font-mono font-semibold text-white ring-2 ring-paper ${className}`}
      style={{ width: size, height: size, background: person.hue, fontSize: size * 0.42 }}
    >
      {person.name[0]}
    </span>
  );
}
