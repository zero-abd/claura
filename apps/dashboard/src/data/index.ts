// Data layer entry point. Views import from here; nothing else knows which source is active.
//
//   data()                      the active DataSource (scripted by default)
//   setDataSource(source)       swap in a LiveSource (or a test double)
//   registerSource / selectSource   named sources for ?source=live style switches
export * from "./types";
export * from "./format";
export * from "./source";
export { agentIdentities, approverOf, buildRoster, roster, summarize, type Person, type RosterSummary } from "./roster";
export { ScriptedSource, EPOCH } from "./scripted";

import { ScriptedSource } from "./scripted";
import { registerSource, setDataSource } from "./source";

const scripted = new ScriptedSource();
registerSource("scripted", () => scripted);
setDataSource(scripted);
/** The scripted source, for scripted-only actions (identity switch, simulated enrollment). */
export const scriptedSource = scripted;
