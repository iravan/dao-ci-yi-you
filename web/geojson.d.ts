declare namespace GeoJSON {
  type Position = number[];

  interface GeoJsonObject {
    type: string;
  }

  interface Point extends GeoJsonObject {
    type: "Point";
    coordinates: Position;
  }

  interface LineString extends GeoJsonObject {
    type: "LineString";
    coordinates: Position[];
  }

  interface Polygon extends GeoJsonObject {
    type: "Polygon";
    coordinates: Position[][];
  }

  type Geometry = Point | LineString | Polygon;

  interface Feature<G extends Geometry | null = Geometry, P = Record<string, unknown> | null>
    extends GeoJsonObject {
    type: "Feature";
    geometry: G;
    properties: P;
  }

  interface FeatureCollection<
    G extends Geometry | null = Geometry,
    P = Record<string, unknown> | null,
  > extends GeoJsonObject {
    type: "FeatureCollection";
    features: Array<Feature<G, P>>;
  }

  type GeoJSON = Geometry | Feature | FeatureCollection;
}
