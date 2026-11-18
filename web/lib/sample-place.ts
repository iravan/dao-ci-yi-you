import { areaId, cellIndex } from "@/lib/area";
import type { Comment } from "@/lib/types";
import type { Translate } from "@/lib/i18n";

/** Local comments for demo mode. They stay in the cells they were written in. */
export function samplePlace(
  latitude: number,
  longitude: number,
  step: number,
  t: Translate,
): Record<string, Comment[]> {
  const lat = cellIndex(latitude, step);
  const lng = cellIndex(longitude, step);
  const here = areaId(latitude, longitude, step);
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
    [here]: [note(t("demo.note1"), 2)],
    [north]: [note(t("demo.note2"), 6), note(t("demo.note3"), 1)],
    [east]: [
      note(t("demo.note4"), 20),
      note(t("demo.note5"), 5),
      note(t("demo.note6"), 1),
    ],
  };
}
