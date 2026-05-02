import { algoFetch } from "@/lib/api-client";

export async function GET(): Promise<Response> {
  try {
    const r = await algoFetch("/health");
    if (!r.ok) {
      return Response.json(
        { ok: false, where: "algo", status: r.status },
        { status: 502 },
      );
    }
    const algo = await r.json();
    return Response.json({ ok: true, algo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return Response.json({ ok: false, where: "web", error: message }, { status: 500 });
  }
}
