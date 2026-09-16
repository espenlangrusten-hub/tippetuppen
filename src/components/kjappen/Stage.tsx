/**
 * Kjappen stage primitives. The game rules live elsewhere; this file only renders the
 * studio, host, contestants, board, buzzer, timers and finale.
 */
import Image from "next/image";
import { BASE_PATH } from "@/lib/site";

const art = (file: string) => `${BASE_PATH}/kjappen/${file}`;

export type PodiumPlayer = { id: string; name: string; score: number; seat: number; avatar: number; host?: boolean };

export function KjappenLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div className={`kj-logo ${className}`}>
      <Image src={art("logo.webp")} alt="Kjappen" width={760} height={601} priority={priority} sizes="(max-width: 760px) 80vw, 460px" />
    </div>
  );
}

export function StageBackdrop() {
  return (
    <div className="kj-set" aria-hidden="true">
      <div className="kj-set-rays" />
      <div className="kj-set-halftone" />
      <div className="kj-set-glow" />
      <div className="kj-studio-grid" />
      <div className="kj-stage-orbit kj-stage-orbit-a" />
      <div className="kj-stage-orbit kj-stage-orbit-b" />
      <div className="kj-beam kj-beam-l" />
      <div className="kj-beam kj-beam-r" />
      <div className="kj-light-poles">
        {Array.from({ length: 8 }).map((_, i) => <span key={i} />)}
      </div>
      <div className="kj-pixels">
        {PIXELS.map((p, i) => (
          <span key={i} style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, background: p.c, animationDelay: `${p.d}s` }} />
        ))}
      </div>
    </div>
  );
}

export function Crowd() {
  return (
    <div className="kj-crowd" aria-hidden="true">
      <Image src={art("crowd.webp")} alt="" width={620} height={166} sizes="40vw" />
      <Image src={art("crowd.webp")} alt="" width={620} height={166} sizes="40vw" className="kj-crowd-flip" />
    </div>
  );
}

const PIXELS = [
  { x: 6, y: 12, s: 14, c: "#ffd24a", d: 0 }, { x: 11, y: 20, s: 10, c: "#29e0ff", d: 0.7 },
  { x: 4, y: 31, s: 12, c: "#29e0ff", d: 1.4 }, { x: 14, y: 8, s: 9, c: "#ff2fa0", d: 2.1 },
  { x: 91, y: 10, s: 13, c: "#29e0ff", d: 0.4 }, { x: 95, y: 22, s: 10, c: "#ffd24a", d: 1.1 },
  { x: 87, y: 30, s: 12, c: "#ffd24a", d: 1.8 }, { x: 93, y: 40, s: 9, c: "#ff2fa0", d: 2.5 },
  { x: 2, y: 46, s: 10, c: "#ff2fa0", d: 3.0 }, { x: 97, y: 52, s: 11, c: "#29e0ff", d: 2.6 },
];

export function SidePanel({ title, lines, className = "" }: { title: string; lines: string[]; className?: string }) {
  return (
    <div className={`kj-panel ${className}`}>
      <span className="kj-panel-title">{title}</span>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

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

export function Host({ talking, says, fact }: { talking: boolean; says: string; fact?: string | null }) {
  return (
    <div className={`kj-host ${talking ? "kj-host-live" : ""}`}>
      <div className="kj-host-frame">
        <Image src={art("host-full.webp")} alt="Programlederen" width={1024} height={1536} sizes="(max-width: 760px) 64px, 180px" priority />
        <span className="kj-host-plate">Programleder</span>
      </div>
      <div className="kj-bubble">
        <p>{says}</p>
        {fact && <p className="kj-bubble-fact">{fact}</p>}
      </div>
    </div>
  );
}

type BoardTimer = { left: number; of: number; label: string };
type BoardVariant = "default" | "lobby" | "countdown" | "winner";

export function QuestionBoard({
  category, question, round, of, timer, countdown, variant = "default",
}: {
  category: string;
  question: string;
  round: number;
  of: number;
  timer?: BoardTimer;
  countdown?: number;
  variant?: BoardVariant;
}) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const timerProgress = timer ? timer.left / Math.max(1, timer.of) : 0;

  return (
    <div className={`kj-board kj-board-${variant}`}>
      {variant === "countdown" ? (
        <div className="kj-ready-board">
          <span className="kj-ready-kicker">{category}</span>
          <strong className="kj-ready-title">Gjør dere klare</strong>
          <span className="kj-ready-number">{countdown ?? 0}</span>
          <span className="kj-ready-sub">Første spørsmål starter om {countdown ?? 0} sek</span>
        </div>
      ) : variant === "winner" ? (
        <div className="kj-winner-board">
          <span className="kj-winner-crown" aria-hidden="true">♛</span>
          <span className="kj-winner-laurel" aria-hidden="true">❧</span>
          <strong>Vi har en <em>vinner</em></strong>
          <span className="kj-winner-laurel kj-winner-laurel-r" aria-hidden="true">❧</span>
        </div>
      ) : (
        <>
          <div className="kj-board-head">
            <div className="kj-board-strip">
              <span className="kj-board-ball" aria-hidden="true">⚽</span>
              <span>{category}</span>
              {round > 0 && <span className="kj-board-round">Spørsmål {round}/{of}</span>}
            </div>
            {timer && (
              <div className={`kj-board-timer ${timer.left <= 5 ? "kj-board-timer-low" : ""}`} role="timer" aria-label={`${timer.label}: ${timer.left} sekunder`}>
                <svg viewBox="0 0 60 60" aria-hidden="true">
                  <circle cx="30" cy="30" r={r} className="kj-board-timer-track" />
                  <circle cx="30" cy="30" r={r} className="kj-board-timer-hand" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - timerProgress) }} />
                </svg>
                <span>{timer.left}</span>
              </div>
            )}
          </div>
          <p className="kj-board-question">{question}</p>
        </>
      )}
    </div>
  );
}

export function Contestant({
  player, you, buzzed, dimmed, ready, delta,
}: {
  player: PodiumPlayer; you: boolean; buzzed: boolean; dimmed: boolean; ready: boolean; delta?: number | null;
}) {
  const cls = [
    "kj-contestant",
    `kj-contestant-seat-${player.seat}`,
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
        <span className="kj-podium-name">{player.name}{you && <em> · deg</em>}</span>
        <span className="kj-podium-score">{player.score}</span>
        {buzzed && <span className="kj-player-status">Klar til å svare!</span>}
      </div>
    </div>
  );
}

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

export function Buzzer({ label, sub, onPress, disabled, taken }: {
  label: string; sub?: string; onPress: () => void; disabled?: boolean; taken?: boolean;
}) {
  return (
    <div className={`kj-buzzer-rig ${taken ? "kj-buzzer-taken" : ""}`}>
      <button type="button" className="kj-buzzer" onClick={onPress} disabled={disabled} aria-label={label}>
        <span className="kj-buzzer-top">
          <span className="kj-buzzer-shine" aria-hidden="true" />
          <span className="kj-buzzer-label">KJAPPEN</span>
        </span>
        <span className="kj-buzzer-base" aria-hidden="true" />
      </button>
      <span className="kj-buzzer-status">
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

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

export function NextQuestionBar({ seconds, keyed }: { seconds: number; keyed: number | string }) {
  return (
    <div className="kj-sweep">
      <span className="kj-sweep-text">Neste spørsmål</span>
      <div className="kj-sweep-track"><div key={keyed} className="kj-sweep-fill" style={{ animationDuration: `${seconds}s` }} /></div>
    </div>
  );
}

export function Verdict({ correct }: { correct: boolean }) {
  return (
    <div className={`kj-verdict ${correct ? "kj-verdict-right" : "kj-verdict-wrong"}`} role="status">
      <span>{correct ? "RIKTIG SVAR" : "FEIL SVAR"}</span>
    </div>
  );
}

export function SaidBubble({ text }: { text: string }) {
  return <span className="kj-said">{text}</span>;
}

export function WinnerStage({ champions, rest }: { champions: PodiumPlayer[]; rest: PodiumPlayer[] }) {
  const placed = [...rest].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <div className="kj-final">
      <div className="kj-confetti" aria-hidden="true">
        {CONFETTI.map((p, i) => (
          <span key={i} style={{ left: `${p.x}%`, background: p.c, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }} />
        ))}
      </div>
      <div className="kj-final-spotlight" aria-hidden="true" />
      <div className="kj-final-champs">
        {champions.map((w) => (
          <div key={w.id} className="kj-champ">
            <span className="kj-champ-cup" aria-hidden="true">🏆</span>
            <div className="kj-champ-frame">
              <Image src={art(`avatar-${w.avatar}.webp`)} alt="" width={496} height={382} sizes="(max-width: 760px) 60vw, 300px" />
            </div>
            <span className="kj-champ-name">{w.name}</span>
            <span className="kj-champ-score">{w.score}</span>
            <span className="kj-champ-label">Vinner!</span>
          </div>
        ))}
      </div>
      {placed.length > 0 && (
        <ul className="kj-final-rest">
          {placed.map((p, i) => (
            <li key={p.id}>
              <span className="kj-final-place">{i + 2}. plass</span>
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

const CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 37) % 100,
  c: ["#ffd24a", "#29e0ff", "#ff2fa0", "#7cf46b", "#ff8a1e"][i % 5],
  d: (i % 9) * 0.32,
  t: 2.4 + ((i * 7) % 18) / 10,
}));
