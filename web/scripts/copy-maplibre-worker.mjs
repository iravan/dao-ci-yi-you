import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
const target = path.join(process.cwd(), "public/maplibre-gl-worker.mjs");
const worker = await readFile(source, "utf8");

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, worker.replace(/\n\/\/# sourceMappingURL=.*$/, "\n"));
