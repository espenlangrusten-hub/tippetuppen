import { describe, expect, it } from "vitest";
import { isOffensiveUsername } from "../src/lib/username-filter";

describe("isOffensiveUsername", () => {
  it.each([
    "faen", "Faenskap", "fitte123", "JævlaIdiot", "jaevla", "kukhue", "Pikkhode", "horebukk",
    "fuck", "MotherFucker", "f.u.c.k", "f_u_c_k", "fuuuuck", "FUCK_YOU", "f4en", "sh1t", "$hit",
    "bigFitte", "xXnazistXx", "nazi", "NIGGER", "niiiggger", "neger_99", "Rasshøl", "drittsekk",
    "Slut", "homo", "Bitch_please", "SATAN666", "knulle", "Hitler1945", "pedofil", "k.u.k.hue", "s_l_u_t", "h-o-r-e",
  ])("refuses %s", (name) => {
    expect(isOffensiveUsername(name)).toBe(true);
  });

  // Ordinary names that contain a blocked word inside them must pass.
  it.each([
    "Thoresen", "Kassen", "Glassmo", "Nazir", "Sluttspill", "Dickson", "Nigeria", "Assen", "Hassan",
    "Massimo", "Shiitake", "Cocktail", "Sexton", "Kristoffer", "Haaland", "Ødegaard", "Bjørnebye",
    "Åge", "Mathias_10", "OleGunnar20", "Saxe", "Pulsen", "Tittelsen", "Fanebærer", "Homoeopat",
  ])("allows %s", (name) => {
    expect(isOffensiveUsername(name)).toBe(false);
  });
});
