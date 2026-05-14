// Surfaces the admin's "next focus" message on the rider's /home.
// Admin edits this from the dashboard tailor drawer; the rider sees it
// as a small prompt above the recording flow. Nothing renders if empty.

export function NextFocusBanner({ message }: { message: string | null }) {
  if (!message || message.trim() === "") return null;
  return (
    <section
      aria-label="Note from admin"
      className="mb-4 rounded-2xl border border-[var(--lime)]/60 bg-[var(--lime)]/10 p-4"
    >
      <p className="text-[10px] uppercase tracking-wide text-[var(--lime)]">Next focus</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]">{message}</p>
    </section>
  );
}
