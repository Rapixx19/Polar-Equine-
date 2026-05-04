import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/auth/service-role";
import { claimAndDispatch } from "@/lib/cron/compute-runner";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const result = await claimAndDispatch(supabase);
  return NextResponse.json(result);
}
