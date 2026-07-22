import { NextResponse } from "next/server";
import stations from "@/data/stations.json";
export function GET() { return NextResponse.json({ count: stations.length, stations }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }); }
