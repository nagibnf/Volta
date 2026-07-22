import { NextResponse } from "next/server";
import vehicles from "@/data/vehicles.json";
export function GET() { return NextResponse.json({ count: vehicles.length, vehicles }, { headers: { "Cache-Control": "public, s-maxage=3600" } }); }
