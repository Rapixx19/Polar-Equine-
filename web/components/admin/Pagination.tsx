import Link from "next/link";

type Props = {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  searchParams?: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  page: number,
  searchParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, v);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({ basePath, page, pageSize, total, searchParams = {} }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-[var(--text-muted)]">
      <span>
        Page {page} of {totalPages} <span className="text-[var(--text-faint)]">· {total} total</span>
      </span>
      <div className="flex gap-2">
        {prev ? (
          <Link
            href={buildHref(basePath, prev, searchParams)}
            className="rounded-md border border-[var(--border)] px-3 py-1 hover:text-[var(--text)]"
          >
            ← Prev
          </Link>
        ) : (
          <span className="rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text-faint)]">
            ← Prev
          </span>
        )}
        {next ? (
          <Link
            href={buildHref(basePath, next, searchParams)}
            className="rounded-md border border-[var(--border)] px-3 py-1 hover:text-[var(--text)]"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-md border border-[var(--border)] px-3 py-1 text-[var(--text-faint)]">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
