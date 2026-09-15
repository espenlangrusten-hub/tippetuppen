/**
 * Stage furniture for Kjappen: logo, host and podiums.
 *
 * Drawn here rather than shipped as images. Vector art stays sharp on a phone, weighs
 * nothing, and takes the theme's colours - and the reference pictures the game was
 * sketched from are somebody else's work, so the show gets its own face.
 */

export function KjappenLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" className={className} role="img" aria-label="Kjappen">
      <defs>
        <pattern id="kj-dots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#e8654a" fillOpacity=".55" />
        </pattern>
      </defs>
      <circle cx="110" cy="110" r="105" fill="#1f3d3a" />
      <circle cx="110" cy="110" r="99" fill="#e8654a" />
      <circle cx="110" cy="110" r="92" fill="#f2efe2" />
      <path d="M18 110a92 92 0 0 1 184 0z" fill="#7fb6d6" />
      <circle cx="110" cy="110" r="92" fill="url(#kj-dots)" />
      <circle cx="110" cy="110" r="92" fill="none" stroke="#1f3d3a" strokeWidth="7" />
      <text
        x="110" y="132" textAnchor="middle"
        fontFamily="var(--font-display)" fontSize="60" fontWeight="700"
        fill="#f2c14e" stroke="#1f3d3a" strokeWidth="7" paintOrder="stroke"
        letterSpacing="-1"
      >
        KJAPPEN
      </text>
    </svg>
  );
}

/** Four-point sparkle, the kind that sits in the corners of a game-show backdrop. */
const Sparkle = ({ x, y, r, o }: { x: number; y: number; r: number; o: number }) => (
  <path
    d={`M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`}
    fill="#fff" fillOpacity={o}
  />
);

/**
 * The host. A generic cartoon presenter - big hair, dark suit, pointing at whoever
 * buzzed - not a likeness of anybody.
 */
export function Host({ talking }: { talking: boolean }) {
  return (
    <svg viewBox="0 0 200 300" className={`kj-host ${talking ? "kj-host-talking" : ""}`} role="img" aria-label="Programlederen">
      <ellipse cx="100" cy="288" rx="58" ry="9" fill="#1b1040" fillOpacity=".45" />
      {/* legs and shoes */}
      <path d="M78 196h18v82H78zM104 196h18v82h-18z" fill="#151c33" />
      <path d="M72 274h26a5 5 0 0 1 5 5v7H72zM102 274h26a5 5 0 0 1 5 5v7h-31z" fill="#0c1020" />
      {/* jacket */}
      <path d="M100 104c-22 0-38 13-38 32v66h76v-66c0-19-16-32-38-32z" fill="#1b2340" />
      <path d="M100 104l-20 8 20 26 20-26z" fill="#f4f1ea" />
      <path d="M78 112c-10 5-16 14-16 24v66h20l6-70z" fill="#222c52" />
      <path d="M122 112c10 5 16 14 16 24v66h-20l-6-70z" fill="#222c52" />
      <path d="M100 126l-6 8 6 36 6-36z" fill="#93a9d6" />
      {/* left arm, pointing at the audience */}
      <path d="M66 120c-13 8-20 22-19 38l3 22 17-3-2-20c-1-9 3-16 9-21z" fill="#1b2340" />
      <circle cx="56" cy="188" r="13" fill="#f3bd94" />
      <path d="M44 184h-16a5 5 0 0 0 0 10h16z" fill="#f3bd94" />
      {/* right arm, finger in the air */}
      <path d="M134 120c14 7 22 20 22 36v14l-18 2v-14c0-9-4-16-10-21z" fill="#1b2340" />
      <circle cx="147" cy="168" r="13" fill="#f3bd94" />
      <path d="M143 158v-24a5 5 0 0 1 10 0v24z" fill="#f3bd94" />
      {/* head */}
      <path d="M86 92h28v18H86z" fill="#e8ab7f" />
      <ellipse cx="100" cy="66" rx="33" ry="37" fill="#f6c39d" />
      <path d="M100 14c25 0 43 16 43 33 0 9-4 15-7 18 1-19-13-29-36-29S63 46 64 65c-3-3-7-9-7-18 0-17 18-33 43-33z" fill="#d9a44f" />
      <circle cx="67" cy="36" r="16" fill="#d9a44f" /><circle cx="133" cy="36" r="16" fill="#d9a44f" />
      <circle cx="80" cy="20" r="17" fill="#e3b660" /><circle cx="120" cy="20" r="17" fill="#e3b660" />
      <circle cx="100" cy="13" r="18" fill="#e3b660" />
      <path d="M79 52q9-6 18-1M103 51q9-5 18 1" stroke="#b98a3d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="88" cy="64" r="4.5" fill="#1b2340" /><circle cx="112" cy="64" r="4.5" fill="#1b2340" />
      <g className="kj-mouth">
        <path d="M85 80q15 18 30 0q-15 9-30 0z" fill="#7a2230" />
        <path d="M89 80h22v6H89z" fill="#fff" />
      </g>
    </svg>
  );
}

export function StageBackdrop() {
  return (
    <svg viewBox="0 0 400 260" className="kj-backdrop" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="kj-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d3fd4" /><stop offset="1" stopColor="#4a2597" />
        </linearGradient>
        <radialGradient id="kj-glow" cx="50%" cy="38%" r="55%">
          <stop offset="0" stopColor="#a87bff" stopOpacity=".75" /><stop offset="1" stopColor="#a87bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="260" fill="url(#kj-sky)" />
      <ellipse cx="200" cy="100" rx="210" ry="150" fill="url(#kj-glow)" />
      <path d="M26 0l74 260H40L4 40z" fill="#fff" fillOpacity=".07" />
      <path d="M374 0l-74 260h60l36-220z" fill="#fff" fillOpacity=".07" />
      <Sparkle x={52} y={54} r={17} o={0.5} />
      <Sparkle x={348} y={78} r={14} o={0.42} />
      <Sparkle x={330} y={186} r={19} o={0.3} />
      <Sparkle x={70} y={172} r={11} o={0.32} />
    </svg>
  );
}

export type PodiumPlayer = { id: string; name: string; score: number; seat: number; host?: boolean };

/**
 * Four contestants who look like four different people.
 *
 * Seat decides the look, so the same player keeps the same face for the whole round and
 * everybody sees the same one. Hair and shirt carry the difference; the face is shared,
 * because four hand-drawn faces would drift apart and none of them should resemble
 * anyone real.
 */
const LOOKS = [
  { shirt: "#e8654a", shirtDark: "#c44a32", hair: "#3b2a1c", skin: "#f6c39d" },
  { shirt: "#4f9de8", shirtDark: "#3579bd", hair: "#d9a44f", skin: "#eab183" },
  { shirt: "#5bbd7a", shirtDark: "#3f9159", hair: "#8c3b2a", skin: "#c98d63" },
  { shirt: "#f2c14e", shirtDark: "#cf9c2c", hair: "#1f1a17", skin: "#8d5a3b" },
];

export function Contestant({ player, you, buzzed, ready }: { player: PodiumPlayer; you: boolean; buzzed: boolean; ready: boolean }) {
  const look = LOOKS[(player.seat - 1) % LOOKS.length];
  return (
    <div className={`kj-contestant ${buzzed ? "kj-contestant-buzzed" : ""} ${ready ? "kj-contestant-ready" : ""}`}>
      <div className="kj-scoreboard">
        <span className="kj-scoreboard-name">{player.name}{you && <em> (deg)</em>}</span>
        <span className="kj-scoreboard-score">{player.score}</span>
      </div>
      <svg viewBox="0 0 100 150" className="kj-figure" role="img" aria-label={player.name}>
        <ellipse cx="50" cy="145" rx="26" ry="5" fill="#1b1040" fillOpacity=".4" />
        {/* legs and shoes */}
        <path d="M38 104h10v34H38zM52 104h10v34H52z" fill="#26304f" />
        <path d="M34 136h14a4 4 0 0 1 4 4v3H34zM48 136h14a4 4 0 0 1 4 4v3H48z" fill="#141b30" />
        {/* body */}
        <path d="M50 62c-16 0-27 9-27 22v26h54V84c0-13-11-22-27-22z" fill={look.shirt} />
        <path d="M31 66c-5 4-8 10-8 18v26h9l3-42zM69 66c5 4 8 10 8 18v26h-9l-3-42z" fill={look.shirtDark} />
        <path d="M50 62l-8 5 8 11 8-11z" fill="#fff" fillOpacity=".85" />
        {/* Two arms drawn, one shown: swapping a whole limb is predictable in a way a
            rotation about a guessed pivot is not. */}
        <g className="kj-arm-down">
          <path d="M72 72c8 4 13 12 13 22v12h-10V96c0-6-2-10-6-13z" fill={look.shirtDark} />
          <circle cx="80" cy="108" r="7.5" fill={look.skin} />
        </g>
        <g className="kj-arm-up">
          <path d="M72 72c9 2 15 7 17 14l-6 2-8 22-9-4 8-24c-1-3-3-5-6-6z" fill={look.shirtDark} />
          <circle cx="86" cy="80" r="7.5" fill={look.skin} />
        </g>
        <g>
          <path d="M28 72c-8 4-13 12-13 22v12h10V96c0-6 2-10 6-13z" fill={look.shirtDark} />
          <circle cx="20" cy="108" r="7.5" fill={look.skin} />
        </g>
        {/* head */}
        <path d="M44 52h12v12H44z" fill={look.skin} />
        <ellipse cx="50" cy="36" rx="20" ry="22" fill={look.skin} />
        <path d="M50 12c14 0 24 9 24 19 0 5-2 9-4 11 1-11-8-16-20-16s-21 5-20 16c-2-2-4-6-4-11 0-10 10-19 24-19z" fill={look.hair} />
        <circle cx="43" cy="36" r="3" fill="#1b2340" /><circle cx="57" cy="36" r="3" fill="#1b2340" />
        <path d="M42 45q8 8 16 0q-8 4-16 0z" fill="#7a2230" />
      </svg>
    </div>
  );
}

/** Kahoot-style sweep: a bar that empties while the next question is on its way. */
export function NextQuestionBar({ seconds, keyed }: { seconds: number; keyed: number | string }) {
  return (
    <div className="kj-sweep" aria-hidden="true">
      <div key={keyed} className="kj-sweep-fill" style={{ animationDuration: `${seconds}s` }} />
    </div>
  );
}

/** The verdict, thrown across the whole screen so nobody misses it. */
export function Verdict({ correct }: { correct: boolean }) {
  return (
    <div className={`kj-verdict ${correct ? "kj-verdict-right" : "kj-verdict-wrong"}`} role="status">
      <span>{correct ? "RIKTIG SVAR" : "FEIL SVAR"}</span>
    </div>
  );
}
