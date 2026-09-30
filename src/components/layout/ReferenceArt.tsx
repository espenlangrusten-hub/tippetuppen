import { BASE_PATH } from "@/lib/site";

// Art-only windows into the supplied design sheets. Keeping the originals intact
// avoids recompression; text, controls and user data are always rendered as HTML.
const windows = {
  homeHero: ["home", 550, 74, 868, 339],
  leagueHero: ["league", 550, 74, 868, 205],
  xiHero: ["xi", 630, 74, 788, 213],
  xi: ["home", 74, 483, 251, 132],
  goal: ["home", 342, 483, 248, 132],
  mystery: ["home", 606, 483, 238, 132],
  penalty: ["home", 861, 484, 246, 131],
  kjappen: ["home", 1123, 484, 253, 131],
  friends: ["home", 778, 765, 267, 221],
  trophy: ["home", 1210, 882, 167, 103],
  profile: ["league", 32, 796, 461, 84],
  cheer: ["xi", 1202, 684, 190, 152],
  ball: ["xi", 1270, 875, 120, 120],
  ground: ["xi", 706, 306, 247, 128],
} as const;

export function ReferenceArt({ name, className = "" }: { name: keyof typeof windows; className?: string }) {
  const [sheet, x, y, width, height] = windows[name];
  return <span className={`reference-art ${className}`} aria-hidden="true" style={{ display: "block", position: "relative", overflow: "hidden", width: "100%", height: "100%" }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`${BASE_PATH}/design/reference/${sheet}.jpg`} alt="" draggable={false} style={{ position: "absolute", maxWidth: "none", width: `${1448 / width * 100}%`, height: `${1086 / height * 100}%`, left: `${-x / width * 100}%`, top: `${-y / height * 100}%` }} />
  </span>;
}
