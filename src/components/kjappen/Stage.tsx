/**
 * The Kjappen stage: every piece of scenery the quiz show is built from.
 *
 * The show has a drawn identity - a logo, a host and six contestant portraits, in
 * `public/kjappen/` - and the rule here is that anything that exists as artwork is used
 * as artwork. CSS draws the set around it: the backdrop, the neon, the podiums, the
 * question board and the buzzer, because those have to stretch to whatever screen the
 * game is on and to light up when the game says so.
 *
 * Nothing in this file knows the rules. It is handed a phase and a roster and draws
 * them; the Edge Function decides what any of it means.
 */
import Image from "next/image";
import { BASE_PATH } from "@/lib/site";
import { HOST_AVATAR } from "@/lib/kjappen";

const art = (file: string) => `${BASE_PATH}/kjappen/${file}`;

export type PodiumPlayer = { id: string; name: string; score: number; seat: number; avatar: number; host?: boolean };

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The wordmark, as drawn. Its own purple starburst is part of the artwork, so the CSS
 * feathers the edges instead of trying to cut the badge out of it - the stage behind is
 * the same purple, and the two blend rather than showing a seam.
 */
export function KjappenLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div className={`kj-logo ${className}`}>
      <Image src={art("logo.webp")} alt="Kjappen" width={760} height={601} priority={priority} sizes="(max-width: 760px) 80vw, 460px" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Backdrop                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The set behind everything: rays, halftone, spotlights and pixel confetti. All
 * decoration, none of it announced to a screen reader.
 */
export function StageBackdrop() {
  return (
    <div className="kj-set" aria-hidden="true">
      <div className="kj-set-rays" />
      <div className="kj-set-halftone" />
      <div className="kj-set-glow" />
      <div className="kj-beam kj-beam-l" />
      <div className="kj-beam kj-beam-r" />
      <div className="kj-pixels">
        {PIXELS.map((p, i) => (
          <span key={i} style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, background: p.c, animationDelay: `${p.d}s` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * The front row, in front of the players and level with the buzzer.
 *
 * A sibling of the backdrop rather than a child of it: the backdrop is behind
 * everything, and the crowd has to be in front. One strip of artwork used twice, with
 * the right side mirrored so the two halves are not a repeat anybody can spot.
 */
export function Crowd() {
  return (
    <div className="kj-crowd" aria-hidden="true">
      <Image src={art("crowd.webp")} alt="" width={620} height={166} sizes="40vw" />
      <Image src={art("crowd.webp")} alt="" width={620} height={166} sizes="40vw" className="kj-crowd-flip" />
    </div>
  );
}

/** Scattered LED squares, the kind taped to the back wall of an eighties game show. */
const PIXELS = [
  { x: 6, y: 12, s: 14, c: "#ffd24a", d: 0 }, { x: 11, y: 20, s: 10, c: "#29e0ff", d: 0.7 },
  { x: 4, y: 31, s: 12, c: "#29e0ff", d: 1.4 }, { x: 14, y: 8, s: 9, c: "#ff2fa0", d: 2.1 },
  { x: 91, y: 10, s: 13, c: "#29e0ff", d: 0.4 }, { x: 95, y: 22, s: 10, c: "#ffd24a", d: 1.1 },
  { x: 87, y: 30, s: 12, c: "#ffd24a", d: 1.8 }, { x: 93, y: 40, s: 9, c: "#ff2fa0", d: 2.5 },
  { x: 2, y: 46, s: 10, c: "#ff2fa0", d: 3.0 }, { x: 97, y: 52, s: 11, c: "#29e0ff", d: 2.6 },
];

/* -------------------------------------------------------------------------- */
/* Side panels                                                                 */
/* -------------------------------------------------------------------------- */

/** One of the LED boards flanking the logo. Words stacked in pixel type. */
export function SidePanel({ title, lines, className = "" }: { title: string; lines: string[]; className?: string }) {
  return (
    <div className={`kj-panel ${className}`}>
      <span className="kj-panel-title">{title}</span>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

/** The right-hand board: the table, tallest score first, in the show's own type. */
export function ScorePanel({ players, className = "" }: { players: PodiumPlayer[]; className?: string }) {
  const table = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <div className={`kj-panel kj-panel-score ${className}`}>
      <span className="kj-panel-title">Stillingen</span>
      <ul>
        {table.map((p) => (
          <li key={p.id}><span className="kj-panel-name">{p.name}</span><span className="kj-panel-num">{p.score}</span></li>
        ))}
        {!table.length && <li><span className="kj-panel-name">Ingen ennå</span></li>}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Host                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The host and what he is saying.
 *
 * He stands at the side of the stage the whole way through, which is why his portrait
 * is kept out of the pack dealt to players - two of the same man, one hosting and one
 * competing, would read as a bug rather than as a joke.
 */
export function Host({ talking, says, fact }: { talking: boolean; says: string; fact?: string | null }) {
  return (
    <div className={`kj-host ${talking ? "kj-host-live" : ""}`}>
      <div className="kj-bubble">
        <p>{says}</p>
        {fact && <p className="kj-bubble-fact">{fact}</p>}
      </div>
      <div className="kj-host-frame">
        <Image src={art(`avatar-${HOST_AVATAR}.webp`)} alt="Programlederen" width={496} height={382} sizes="(max-width: 760px) 30vw, 180px" priority />
        <span className="kj-host-plate">Programleder</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Question board                                                              */
/* -------------------------------------------------------------------------- */

/** The big screen in the middle: category strip over the question itself. */
export function QuestionBoard({ category, question, round, of }: { category: string; question: string; round: number; of: number }) {
  return (
    <div className="kj-board">
      <div className="kj-board-strip">
        <span>{category}</span>
        {round > 0 && <span className="kj-board-round">{round}/{of}</span>}
      </div>
      <p className="kj-board-question">{question}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contestants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A contestant: the dealt portrait, lit from the stage, over a neon podium carrying the
 * name and the score.
 *
 * The name on the podium is the player's, never the one printed on the reference art -
 * the portraits were cropped above their name plates for exactly this reason.
 */
export function Contestant({
  player, you, buzzed, dimmed, ready, delta,
}: {
  player: PodiumPlayer; you: boolean; buzzed: boolean; dimmed: boolean; ready: boolean; delta?: number | null;
}) {
  const cls = [
    "kj-contestant",
    buzzed && "kj-contestant-buzzed",
    dimmed && "kj-contestant-dim",
    ready && "kj-contestant-ready",
    you && "kj-contestant-you",
  ].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {delta != null && delta !== 0 && (
        <span key={`${player.id}-${delta}`} className={`kj-delta ${delta > 0 ? "kj-delta-up" : "kj-delta-down"}`}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
      <div className="kj-booth">
        <Image src={art(`avatar-${player.avatar}.webp`)} alt="" width={496} height={382} sizes="(max-width: 760px) 24vw, 190px" />
        {buzzed && <span className="kj-booth-flash" aria-hidden="true" />}
      </div>
      <div className="kj-podium">
        <span className="kj-podium-name">{player.name}{you && <em> (deg)</em>}</span>
        <span className="kj-podium-score">{player.score}</span>
      </div>
    </div>
  );
}

/** A podium with nobody behind it yet. */
export function EmptySeat() {
  return (
    <div className="kj-contestant kj-contestant-empty">
      <div className="kj-booth"><span className="kj-booth-wait">?</span></div>
      <div className="kj-podium">
        <span className="kj-podium-name">Ledig</span>
        <span className="kj-podium-score">–</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buzzer                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The buzzer from the reference picture, as the control you actually press.
 *
 * Built from stacked elements rather than an image so the press is real: the top plate
 * travels down into the base on :active and the whole thing is one button, which keeps
 * it reachable from a keyboard and readable to a screen reader.
 */
export function Buzzer({ label, sub, onPress, disabled, taken }: {
  label: string; sub?: string; onPress: () => void; disabled?: boolean; taken?: boolean;
}) {
  return (
    <div className={`kj-buzzer-rig ${taken ? "kj-buzzer-taken" : ""}`}>
      <button type="button" className="kj-buzzer" onClick={onPress} disabled={disabled}>
        <span className="kj-buzzer-top">
          <span className="kj-buzzer-shine" aria-hidden="true" />
          <span className="kj-buzzer-label">{label}</span>
        </span>
        <span className="kj-buzzer-base" aria-hidden="true" />
      </button>
      {sub && <span className="kj-buzzer-sub">{sub}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Clock                                                                       */
/* -------------------------------------------------------------------------- */

/** The countdown board: a ring that drains, with the seconds in pixel type. */
export function Clock({ left, of, label, className = "" }: { left: number; of: number; label: string; className?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const low = left <= 5;
  return (
    <div className={`kj-clock ${low ? "kj-clock-low" : ""} ${className}`} role="timer" aria-live="off">
      <span className="kj-clock-label">{label}</span>
      <div className="kj-clock-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} className="kj-clock-track" />
          <circle cx="60" cy="60" r={r} className="kj-clock-hand" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - left / Math.max(1, of)) }} />
        </svg>
        <span className="kj-clock-num">{left}</span>
      </div>
      <span className="kj-clock-unit">sekunder</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Between questions, verdicts, winner                                         */
/* -------------------------------------------------------------------------- */

/** A bar that empties while the next question is on its way. */
export function NextQuestionBar({ seconds, keyed }: { seconds: number; keyed: number | string }) {
  return (
    <div className="kj-sweep">
      <span className="kj-sweep-text">Neste spørsmål</span>
      <div className="kj-sweep-track"><div key={keyed} className="kj-sweep-fill" style={{ animationDuration: `${seconds}s` }} /></div>
    </div>
  );
}

/** The verdict, thrown across the whole stage so nobody misses it. */
export function Verdict({ correct }: { correct: boolean }) {
  return (
    <div className={`kj-verdict ${correct ? "kj-verdict-right" : "kj-verdict-wrong"}`} role="status">
      <span>{correct ? "RIKTIG SVAR" : "FEIL SVAR"}</span>
    </div>
  );
}

/** What the player typed, in a bubble over their own podium. */
export function SaidBubble({ text }: { text: string }) {
  return <span className="kj-said">{text}</span>;
}

/** The finale: the winner under a spotlight, everybody else in a line underneath. */
export function WinnerStage({ champions, rest }: { champions: PodiumPlayer[]; rest: PodiumPlayer[] }) {
  return (
    <div className="kj-final">
      <div className="kj-confetti" aria-hidden="true">
        {CONFETTI.map((p, i) => (
          <span key={i} style={{ left: `${p.x}%`, background: p.c, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }} />
        ))}
      </div>
      <div className="kj-final-champs">
        {champions.map((w) => (
          <div key={w.id} className="kj-champ">
            <span className="kj-champ-cup" aria-hidden="true">🏆</span>
            <div className="kj-champ-frame">
              <Image src={art(`avatar-${w.avatar}.webp`)} alt="" width={496} height={382} sizes="(max-width: 760px) 60vw, 300px" />
            </div>
            <span className="kj-champ-name">{w.name}</span>
            <span className="kj-champ-score">{w.score}</span>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <ul className="kj-final-rest">
          {rest.map((p) => (
            <li key={p.id}>
              <Image src={art(`avatar-${p.avatar}.webp`)} alt="" width={496} height={382} sizes="80px" />
              <span className="kj-final-name">{p.name}</span>
              <span className="kj-final-score">{p.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37) % 100,
  c: ["#ffd24a", "#29e0ff", "#ff2fa0", "#7cf46b", "#ff8a1e"][i % 5],
  d: (i % 9) * 0.32,
  t: 2.4 + ((i * 7) % 18) / 10,
}));
