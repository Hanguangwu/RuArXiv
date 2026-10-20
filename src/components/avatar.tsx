import { initials } from "@/lib/serialize";

export function Avatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const dimension = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full border border-[var(--color-line)] object-cover ${className}`}
        style={dimension}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-paper-sunk)] font-medium text-[var(--color-ink-soft)] ${className}`}
      style={{ ...dimension, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
}: {
  people: Array<{ name: string; avatarUrl?: string | null }>;
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <span className="flex -space-x-1.5">
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          src={person.avatarUrl}
          name={person.name}
          size={22}
          className="ring-2 ring-[var(--color-paper)]"
        />
      ))}
    </span>
  );
}
