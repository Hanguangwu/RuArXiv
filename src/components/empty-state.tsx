import Link from "next/link";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper-raised)] px-6 py-12 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-ink-soft)]">
        {description}
      </p>
      {action && (
        <Link href={action.href} className="btn btn-outline btn-sm mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}
