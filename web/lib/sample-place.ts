import { areaId, cellIndex } from "@/lib/area";
import type { Comment } from "@/lib/types";

/** Local comments for demo mode. They stay in the cells they were written in. */
export function samplePlace(
  latitude: number,
  longitude: number,
): Record<string, Comment[]> {
  const lat = cellIndex(latitude);
  const lng = cellIndex(longitude);
  const here = areaId(latitude, longitude);
  const north = `${lat + 1}:${lng}`;
  const east = `${lat}:${lng + 1}`;
  let n = 0;

  const note = (text: string, hoursAgo: number): Comment => {
    n += 1;
    return {
      id: `sample-${n}`,
      text,
      createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
    };
  };

  return {
    [here]: [note("The light just turned.", 2)],
    [north]: [
      note("Someone is tuning a radio under the tree.", 6),
      note("Two dogs, one umbrella.", 1),
    ],
    [east]: [
      note("The bakery is out of egg tarts.", 20),
      note("Rain started. Three people under the awning.", 5),
      note("A red umbrella is still on the bench.", 1),
    ],
  };
}
