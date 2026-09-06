// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/** Pitch positions. Shared by the database schema, the Next app and the Deno Edge Function. */
export const POSITIONS = ["GK", "RB", "CB", "LB", "RWB", "LWB", "DF", "DM", "CM", "RM", "LM", "AM", "MF", "RW", "LW", "SS", "CF", "FW"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Keeper",
  RB: "Høyreback",
  CB: "Midtstopper",
  LB: "Venstreback",
  RWB: "Høyre wingback",
  LWB: "Venstre wingback",
  DF: "Forsvar",
  DM: "Defensiv midtbane",
  CM: "Sentral midtbane",
  RM: "Høyre midtbane",
  LM: "Venstre midtbane",
  AM: "Offensiv midtbane",
  MF: "Midtbane",
  RW: "Høyre ving",
  LW: "Venstre ving",
  SS: "Hengende spiss",
  CF: "Spiss",
  FW: "Angrep",
};
