/** Pitch positions. Shared by the database schema, the Next app and the Deno Edge Function. */
export const POSITIONS = ["GK", "RB", "CB", "LB", "RWB", "LWB", "DM", "CM", "RM", "LM", "AM", "RW", "LW", "SS", "CF"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Keeper",
  RB: "Høyreback",
  CB: "Midtstopper",
  LB: "Venstreback",
  RWB: "Høyre wingback",
  LWB: "Venstre wingback",
  DM: "Defensiv midtbane",
  CM: "Sentral midtbane",
  RM: "Høyre midtbane",
  LM: "Venstre midtbane",
  AM: "Offensiv midtbane",
  RW: "Høyre ving",
  LW: "Venstre ving",
  SS: "Hengende spiss",
  CF: "Spiss",
};
