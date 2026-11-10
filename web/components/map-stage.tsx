"use client";

import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  GeoJSONSource,
  Map,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  areaId,
  gridCollection,
  labelPoint,
  polygonCollection,
} from "@/lib/area";
import type { BusyCell } from "@/lib/types";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
setWorkerUrl(`${basePath}/maplibre-gl-worker.mjs`);

type Label = {
  area: string;
  count: number;
  x: number;
  y: number;
};

type MapStageProps = {
  busy: BusyCell[];
  selectedArea: string | null;
  writableArea: string | null;
  focus: string | null;
  onSelect: (area: string) => void;
  onSettle: (bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }) => void;
  onGrid: (visible: boolean) => void;
};

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export default function MapStage({
  busy,
  selectedArea,
  writableArea,
  focus,
  onSelect,
  onSettle,
  onGrid,
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState<Map | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const busyRef = useRef(busy);
  const onSelectRef = useRef(onSelect);
  const onSettleRef = useRef(onSettle);
  const onGridRef = useRef(onGrid);

  useEffect(() => {
    busyRef.current = busy;
    onSelectRef.current = onSelect;
    onSettleRef.current = onSettle;
    onGridRef.current = onGrid;
  }, [busy, onSelect, onSettle, onGrid]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new Map({
      container,
      // Stand-in until a signed-in GPS fix. On land, so the grid is readable.
      center: [-0.0005, 51.4775],
      zoom: 16,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });

    map.addControl(new AttributionControl({ compact: false }), "bottom-left");
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.getCanvas().style.cursor = "pointer";

    map.on("load", () => {
      map.resize();
      map.addSource("busy", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "busy",
        type: "fill",
        source: "busy",
        paint: { "fill-color": "#c44736", "fill-opacity": 0.22 },
      });
      map.addSource("grid", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "grid",
        type: "line",
        source: "grid",
        paint: {
          "line-color": "#241f1a",
          "line-opacity": 0.28,
          "line-width": 1,
        },
      });
      map.addSource("selected", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "selected",
        type: "line",
        source: "selected",
        paint: {
          "line-color": "#241f1a",
          "line-width": 2,
          "line-dasharray": [1.4, 1.1],
        },
      });
      map.addSource("writable", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "writable",
        type: "line",
        source: "writable",
        paint: { "line-color": "#c44736", "line-width": 2.5 },
      });
      setMapReady(map);
    });

    map.on("click", (event) => {
      onSelectRef.current(areaId(event.lngLat.lat, event.lngLat.lng));
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(null);
    };
  }, []);

  useEffect(() => {
    const map = mapReady;
    if (!map) return;

    let frame = 0;
    const draw = (settle: boolean) => {
      const bounds = map.getBounds();
      const box = {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      };
      const grid = gridCollection(box);
      geojsonSource(map, "grid").setData(grid);
      onGridRef.current(grid.features.length > 0);
      if (settle) onSettleRef.current(box);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLabels(projectLabels(map, busyRef.current));
      });
    };

    const onMove = () => draw(false);
    const onMoveEnd = () => draw(true);
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    draw(true);
    return () => {
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
      cancelAnimationFrame(frame);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapReady;
    if (!map) return;
    geojsonSource(map, "busy").setData(
      polygonCollection(busy.map((cell) => cell.area)),
    );
    const frame = requestAnimationFrame(() => {
      setLabels(projectLabels(map, busy));
    });
    return () => cancelAnimationFrame(frame);
  }, [mapReady, busy]);

  useEffect(() => {
    const map = mapReady;
    if (!map) return;
    const selected =
      selectedArea && selectedArea !== writableArea ? [selectedArea] : [];
    geojsonSource(map, "selected").setData(polygonCollection(selected));
    geojsonSource(map, "writable").setData(
      polygonCollection(writableArea ? [writableArea] : []),
    );
  }, [mapReady, selectedArea, writableArea]);

  useEffect(() => {
    const map = mapReady;
    if (!map || !focus) return;
    const [latitude, longitude] = focus.split(",").map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(map.getZoom(), 16),
    });
  }, [mapReady, focus]);

  return (
    <div className="map-stage">
      <div ref={containerRef} className="map-canvas" />
      <div className="count-layer" aria-hidden>
        {labels.map((label) => (
          <span
            key={label.area}
            className="count-label"
            style={{ left: label.x, top: label.y }}
          >
            {label.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function geojsonSource(map: Map, id: string): GeoJSONSource {
  const source = map.getSource(id);
  if (!source || source.type !== "geojson") {
    throw new Error(`Missing GeoJSON source ${id}`);
  }
  return source as GeoJSONSource;
}

function projectLabels(map: Map, busy: BusyCell[]): Label[] {
  const labels: Label[] = [];
  for (const cell of busy) {
    const point = labelPoint(cell.area);
    if (!point) continue;
    const projected = map.project([point.longitude, point.latitude]);
    labels.push({
      area: cell.area,
      count: cell.count,
      x: projected.x,
      y: projected.y,
    });
  }
  return labels;
}
