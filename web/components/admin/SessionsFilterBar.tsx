import Link from "next/link";

type FilterValue = string;
type FilterOption = { value: FilterValue; label: string };

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

const METRICS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All metrics" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

type Props = {
  basePath: string;
  status: string;
  metrics: string;
};

function buildHref(basePath: string, params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function FilterPills({
  basePath,
  options,
  current,
  paramKey,
  otherParams,
}: {
  basePath: string;
  options: FilterOption[];
  current: string;
  paramKey: string;
  otherParams: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = current === opt.value;
        return (
          <Link
            key={opt.value}
            href={buildHref(basePath, { ...otherParams, [paramKey]: opt.value })}
            className={
              active
                ? "rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--lime)]"
                : "rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            }
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SessionsFilterBar({ basePath, status, metrics }: Props) {
  return (
    <div className="mb-4 flex flex-wrap gap-4">
      <FilterPills
        basePath={basePath}
        options={STATUS_OPTIONS}
        current={status}
        paramKey="status"
        otherParams={{ metrics }}
      />
      <FilterPills
        basePath={basePath}
        options={METRICS_OPTIONS}
        current={metrics}
        paramKey="metrics"
        otherParams={{ status }}
      />
    </div>
  );
}
