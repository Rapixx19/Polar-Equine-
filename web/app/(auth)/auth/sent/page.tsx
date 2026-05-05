import Link from "next/link";

type SearchParams = Promise<{ email?: string }>;

export default async function MagicLinkSentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;
  const display = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-4xl">📬</div>
        <p className="mb-2 text-stone-700">We&apos;ve sent a magic link to:</p>
        {display ? (
          <p className="mb-6 break-all font-medium">{display}</p>
        ) : (
          <p className="mb-6 text-stone-500">(your inbox)</p>
        )}
        <p className="mb-8 text-sm text-stone-600">
          Open the email and tap the link to log in. The link works once and expires in 1 hour.
        </p>

        <Link
          href="/"
          className="inline-block text-sm text-stone-700 underline underline-offset-4 hover:text-stone-900"
        >
          Try a different email
        </Link>

        <section className="mt-12 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm text-stone-700">
          <p className="mb-2 font-medium">iPhone users — known V.0 friction</p>
          <p className="mb-2">
            The magic link will open in Safari, which doesn&apos;t support Bluetooth. To finish:
          </p>
          <ol className="ml-4 list-decimal space-y-1 text-stone-600">
            <li>Tap the link in your email</li>
            <li>When Safari shows you&apos;re logged in, copy the URL</li>
            <li>Open Bluefy</li>
            <li>Paste and go</li>
          </ol>
          <p className="mt-2 text-xs text-stone-500">
            You&apos;ll only need to do this once per device.
          </p>
        </section>
      </div>
    </main>
  );
}
