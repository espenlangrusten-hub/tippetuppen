import type { MonthCopy } from "@/lib/monthlyLeague";

/**
 * Last month's winner in gold, or - until there is one - the promise of a gold name.
 *
 * Sits above the table it belongs to, on the front page and on /liga alike, so the two
 * never disagree about who won.
 */
export function MonthChampion({ copy }: { copy: MonthCopy }) {
  if (copy.champion) {
    return (
      <div className="league-champion">
        <p className="league-champion-kicker">{copy.champion.kicker}</p>
        <p className="league-champion-name">{copy.champion.name}</p>
        <p className="league-champion-points">{copy.champion.points}</p>
      </div>
    );
  }
  return (
    <div className="league-champion league-champion-open">
      <p className="league-champion-kicker">Månedens Tippetupp</p>
      <p className="league-champion-wait">{copy.noChampion}</p>
    </div>
  );
}

/** Where the month stands, in one line. Gold when the race is in its last week. */
export function MonthPulse({ copy }: { copy: MonthCopy }) {
  return (
    <p className={copy.pulse.urgent ? "league-pulse league-pulse-urgent" : "league-pulse"}>
      {copy.pulse.urgent && <span className="league-pulse-dot" aria-hidden="true" />}
      {/* Separate elements, so the flex gap sets the spacing rather than a text space. */}
      <b>{copy.pulse.lead}</b><span>{copy.pulse.rest}</span>
    </p>
  );
}
