// War Room: static copy that is not table data (channel blurbs, the banner, example notification obligations).
// People, messages, tasks, decisions and the brief come from the data layer (src/data): scripted today, live later.
import type { ChannelId } from "./data/types";

export type { ChannelId };

export const BANNER = "Out-of-band channel · not on the corporate network · email and phones not required";

export interface Channel {
  id: ChannelId;
  blurb: string;
}
export const CHANNELS: Channel[] = [
  { id: "#command", blurb: "Incident commander, agents and responders" },
  { id: "#legal", blurb: "Counsel and notification obligations" },
  { id: "#exec", blurb: "Executives. Plain-language updates only" },
  { id: "#comms-pr", blurb: "Holding statements and press" },
  { id: "#vendors", blurb: "Cloud vendor and suppliers" },
];

export interface Obligation {
  name: string;
  rule: string;
  big: string;
  unit: string;
}
// Examples only. Always labelled "example obligations, confirm with counsel" in the UI.
export const OBLIGATIONS_LABEL = "example obligations, confirm with counsel";
export const OBLIGATIONS: Obligation[] = [
  { name: "SEC 8-K Item 1.05", rule: "Within 4 business days after a materiality determination", big: "4", unit: "business days" },
  { name: "GDPR", rule: "72 hours to the supervisory authority, once personal data is involved", big: "72", unit: "hours" },
];
