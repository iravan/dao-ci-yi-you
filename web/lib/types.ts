export type Comment = {
  id: string;
  text: string;
  createdAt: string;
};

export type BusyCell = {
  area: string;
  count: number;
  south: number;
  west: number;
};

export type Fix = {
  latitude: number;
  longitude: number;
};

export type Provider = "apple" | "google" | "facebook";
