import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({ ok: true, service: "volta-core", version: "0.3.0", time: new Date().toISOString() }); }
