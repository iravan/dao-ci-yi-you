import type { BusyCell } from "./types";

/**
 * Degrees. `GET /api/config` decides the live value. This one is used until
 * the API answers and on the static demo build.
 */
export const DEFAULT_STEP = Number(process.env.NEXT_PUBLIC_AREA_STEP) || 0.001;

/** Hide the line grid above this many cells on one axis. Busy cells still draw. */
export const GRID_CELL_CAP = 80;

export type Cell = {
  latCell: number;
  lngCell: number;
};

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function cellIndex(value: number, step: number): number {
  const scaled = value / step;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < 1e-6) return nearest;
  return Math.floor(scaled);
}

/** `floor(lat / step):floor(lng / step)`. Preview for drawing. Rust recomputes this. */
export function areaId(
  latitude: number,
  longitude: number,
  step: number,
): string {
  return `${cellIndex(latitude, step)}:${cellIndex(longitude, step)}`;
}

export function parseArea(area: string): Cell | null {
  const parts = area.split(":");
  if (parts.length !== 2) return null;
  const latCell = Number(parts[0]);
  const lngCell = Number(parts[1]);
  if (!Number.isInteger(latCell) || !Number.isInteger(lngCell)) return null;
  return { latCell, lngCell };
}

export function southwest(
  cell: Cell,
  step: number,
): { latitude: number; longitude: number } {
  return {
    latitude: cell.latCell * step,
    longitude: cell.lngCell * step,
  };
}

/** Decimal places the step deserves: `0.001` needs three, `0.01` needs two. */
function cornerDecimals(step: number): number {
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
}

/** Southwest corner, which is the stable name of a block. */
export function formatBlock(area: string, step: number): string {
  const cell = parseArea(area);
  if (!cell) return area;
  const { latitude, longitude } = southwest(cell, step);
  const digits = cornerDecimals(step);
  const ns = latitude >= 0 ? "N" : "S";
  const ew = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(digits)}°${ns}  ${Math.abs(longitude).toFixed(digits)}°${ew}`;
}

function ring(cell: Cell, step: number): GeoJSON.Position[] {
  const { latitude, longitude } = southwest(cell, step);
  const north = latitude + step;
  const east = longitude + step;
  return [
    [longitude, latitude],
    [east, latitude],
    [east, north],
    [longitude, north],
    [longitude, latitude],
  ];
}

export function polygonCollection(
  areas: string[],
  step: number,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const area of areas) {
    const cell = parseArea(area);
    if (!cell) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring(cell, step)] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function gridCollection(
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  },
  step: number,
): GeoJSON.FeatureCollection {
  if (bounds.west > bounds.east || bounds.south > bounds.north) return EMPTY;

  const latStart = cellIndex(bounds.south, step);
  const latEnd = cellIndex(bounds.north, step);
  const lngStart = cellIndex(bounds.west, step);
  const lngEnd = cellIndex(bounds.east, step);
  const latCount = latEnd - latStart + 1;
  const lngCount = lngEnd - lngStart + 1;
  if (
    latCount < 1 ||
    lngCount < 1 ||
    latCount > GRID_CELL_CAP ||
    lngCount > GRID_CELL_CAP
  ) {
    return EMPTY;
  }

  const south = latStart * step;
  const north = (latEnd + 1) * step;
  const west = lngStart * step;
  const east = (lngEnd + 1) * step;
  const features: GeoJSON.Feature[] = [];

  for (let lat = latStart; lat <= latEnd + 1; lat += 1) {
    const y = lat * step;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [west, y],
          [east, y],
        ],
      },
    });
  }

  for (let lng = lngStart; lng <= lngEnd + 1; lng += 1) {
    const x = lng * step;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [x, south],
          [x, north],
        ],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Point on the north edge, centered, where the count label sits. */
export function labelPoint(
  area: string,
  step: number,
): { longitude: number; latitude: number } | null {
  const cell = parseArea(area);
  if (!cell) return null;
  const { latitude, longitude } = southwest(cell, step);
  return {
    longitude: longitude + step / 2,
    latitude: latitude + step,
  };
}

export function busyFromCounts(
  counts: Record<string, number>,
  step: number,
): BusyCell[] {
  const cells: BusyCell[] = [];
  for (const [area, count] of Object.entries(counts)) {
    if (count < 2) continue;
    const cell = parseArea(area);
    if (!cell) continue;
    const corner = southwest(cell, step);
    cells.push({
      area,
      count,
      south: corner.latitude,
      west: corner.longitude,
    });
  }
  return cells;
}
