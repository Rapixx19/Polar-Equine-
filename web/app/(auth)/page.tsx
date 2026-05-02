export default function WelcomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-4xl font-light tracking-tight">La Fattoria</h1>
        <p className="mb-2 text-stone-600">
          Research data collection for sport-horse welfare.
        </p>
        <p className="text-sm text-stone-500">
          Sign-in arrives in Slice 3. Until then, hit <code>/api/smoke</code> to verify the
          web → algo bearer round-trip.
        </p>
      </div>
    </main>
  );
}
