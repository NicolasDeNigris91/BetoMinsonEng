import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { ok: true, dbLatencyMs: Date.now() - t0 },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (err) {
    console.error("[health] db check failed", err);
    return NextResponse.json(
      { ok: false, error: "db_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
