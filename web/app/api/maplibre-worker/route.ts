import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const file = path.join(
    process.cwd(),
    "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
  );
  const body = await readFile(file);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
    },
  });
}
