import type { BusyCell } from "@/lib/types";

/** Degrees. Matches the server cell size. The server still decides the area on every request. */
export const STEP = 0.001;

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

export function cellIndex(value: number): number {
  return Math.floor(value / STEP);
}

/** `floor(lat / step):floor(lng / step)`. Preview for drawing. Rust recomputes this. */
export function areaId(latitude: number, longitude: number): string {
  return `${cellIndex(latitude)}:${cellIndex(longitude)}`;
}

export function parseArea(area: string): Cell | null {
  const parts = area.split(":");
  if (parts.length !== 2) return null;
  const latCell = Number(parts[0]);
  const lngCell = Number(parts[1]);
  if (!Number.isInteger(latCell) || !Number.isInteger(lngCell)) return null;
  return { latCell, lngCell };
}

export function southwest(cell: Cell): { latitude: number; longitude: number } {
  return {
    latitude: cell.latCell * STEP,
    longitude: cell.lngCell * STEP,
  };
}

/** Southwest corner, which is the stable name of a block. */
export function formatBlock(area: string): string {
  const cell = parseArea(area);
  if (!cell) return area;
  const { latitude, longitude } = southwest(cell);
  const ns = latitude >= 0 ? "N" : "S";
  const ew = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(3)}°${ns}  ${Math.abs(longitude).toFixed(3)}°${ew}`;
}

function ring(cell: Cell): GeoJSON.Position[] {
  const { latitude, longitude } = southwest(cell);
  const north = latitude + STEP;
  const east = longitude + STEP;
  return [
    [longitude, latitude],
    [east, latitude],
    [east, north],
    [longitude, north],
    [longitude, latitude],
  ];
}

export function polygonCollection(areas: string[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const area of areas) {
    const cell = parseArea(area);
    if (!cell) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring(cell)] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function gridCollection(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): GeoJSON.FeatureCollection {
  if (bounds.west > bounds.east || bounds.south > bounds.north) return EMPTY;

  const latStart = cellIndex(bounds.south);
  const latEnd = cellIndex(bounds.north);
  const lngStart = cellIndex(bounds.west);
  const lngEnd = cellIndex(bounds.east);
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

  const south = latStart * STEP;
  const north = (latEnd + 1) * STEP;
  const west = lngStart * STEP;
  const east = (lngEnd + 1) * STEP;
  const features: GeoJSON.Feature[] = [];

  for (let lat = latStart; lat <= latEnd + 1; lat += 1) {
    const y = lat * STEP;
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
    const x = lng * STEP;
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
export function labelPoint(area: string): { longitude: number; latitude: number } | null {
  const cell = parseArea(area);
  if (!cell) return null;
  const { latitude, longitude } = southwest(cell);
  return {
    longitude: longitude + STEP / 2,
    latitude: latitude + STEP,
  };
}

export function busyFromCounts(
  counts: Record<string, number>,
): BusyCell[] {
  const cells: BusyCell[] = [];
  for (const [area, count] of Object.entries(counts)) {
    if (count < 2) continue;
    const cell = parseArea(area);
    if (!cell) continue;
    const corner = southwest(cell);
    cells.push({
      area,
      count,
      south: corner.latitude,
      west: corner.longitude,
    });
  }
  return cells;
}
