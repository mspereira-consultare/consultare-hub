import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "daily report route alive",
    timestamp: new Date().toISOString(),
  });
}
