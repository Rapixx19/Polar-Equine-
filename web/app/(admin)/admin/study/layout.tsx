import type { ReactNode } from "react";

import { StudyTabs } from "@/components/admin/StudyTabs";

export default function StudyLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-light">Study management</h1>
        <span className="text-xs text-[var(--text-faint)]">Read-only · slice 12.A</span>
      </header>
      <StudyTabs />
      {children}
    </section>
  );
}
