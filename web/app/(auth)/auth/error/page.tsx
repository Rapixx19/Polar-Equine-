import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 text-2xl font-light">Link expired or invalid.</h1>
        <p className="mb-8 text-stone-600">
          Magic links work once and expire after 1 hour. Request a new one.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-stone-900 px-6 py-3 text-base font-medium text-white"
        >
          Request a new link
        </Link>
      </div>
    </main>
  );
}
