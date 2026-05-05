import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 text-2xl font-light">Sign-in link invalid.</h1>
        <p className="mb-8 text-stone-600">
          The reset link expired or was already used. Request a new one and try
          again.
        </p>
        <Link
          href="/auth/forgot"
          className="inline-block rounded-md bg-stone-900 px-6 py-3 text-base font-medium text-white"
        >
          Request a new reset link
        </Link>
        <p className="mt-6 text-sm text-stone-500">
          Or{" "}
          <Link
            href="/"
            className="underline underline-offset-2 hover:text-stone-700"
          >
            sign in with email and password
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
