// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/**
 * Rules for Kjappen, the multiplayer quiz show.
 *
 * Pure and shared: the Edge Function decides everything, but the browser has to draw
 * the same countdown and the same scores between polls. Keeping one copy of the rules
 * means a client can never disagree with the server about what phase a game is in.
 *
 * A round runs lobby → countdown → question → answering → reveal → question … → done.
 * Every phase that can time out carries an end time, so a game that nobody is looking
 * at is still in a well-defined state when someone comes back to it.
 */
import { matchKey, normalizeName } from "./names.ts";

export const MAX_PLAYERS = 4;
export const QUESTIONS_PER_GAME = 5;
export const READY_SECONDS = 5;
export const BUZZ_SECONDS = 30;
export const ANSWER_SECONDS = 15;
export const REVEAL_SECONDS = 6;
/**
 * The contestant portraits, by file number in `public/kjappen/`.
 *
 * The art sheet holds six figures, and the first of them is the host - he stands at the
 * side of the stage introducing every question, so he is not dealt to a player. Dealing
 * him out would put two of the same man on screen, one hosting and one competing. Add 1
 * to this list if you would rather have him play too; nothing else has to change.
 */
export const AVATAR_POOL = [2, 3, 4, 5, 6] as const;
export const HOST_AVATAR = 1;

/**
 * Deal a portrait nobody in this game already has.
 *
 * Done on the server when a player takes a seat, so every screen shows the same face on
 * the same player and a reconnect does not reshuffle anyone. The pool is larger than the
 * table, so `taken` can never use it up; the fallback only exists so a game that somehow
 * outgrew the pool still gets a picture instead of a blank.
 */
export function dealAvatar(taken: readonly number[], random: () => number = Math.random): number {
  const free = AVATAR_POOL.filter((a) => !taken.includes(a));
  const from = free.length ? free : AVATAR_POOL;
  return from[Math.floor(random() * from.length)];
}

export const CORRECT_POINTS = 100;
export const WRONG_POINTS = -100;

export type Phase = "lobby" | "countdown" | "question" | "answering" | "reveal" | "done";

export type GameState = {
  phase: Phase;
  /** 0 in the lobby, then 1..QUESTIONS_PER_GAME. */
  round: number;
  /** Player who won the buzz for this question, if anyone did. */
  buzzedBy: string | null;
  /** When the current phase runs out, epoch milliseconds. Null when nothing is ticking. */
  endsAt: number | null;
};

export type Outcome =
  | { kind: "correct"; playerId: string; delta: number }
  | { kind: "wrong"; playerId: string; delta: number }
  | { kind: "timeout"; playerId: string; delta: number }
  | { kind: "nobody"; playerId: null; delta: 0 };

export type Step = { state: GameState; outcome: Outcome | null };

export const PHASE_SECONDS: Record<Phase, number | null> = {
  lobby: null,
  countdown: READY_SECONDS,
  question: BUZZ_SECONDS,
  answering: ANSWER_SECONDS,
  reveal: REVEAL_SECONDS,
  done: null,
};

/** Whole seconds left, floored at zero, for a countdown the player can read. */
export function secondsLeft(endsAt: number | null, now: number): number {
  if (endsAt == null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Join codes people read aloud over a table. No 0/O or 1/I/L, and no vowels - Y included, since it is one in Norwegian - so the
 * generator cannot produce a word, or a character somebody has to spell out twice.
 */
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789";
export function newCode(random: () => number = Math.random, length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}
export const isCode = (value: string) => /^[BCDFGHJKMNPQRSTVWXZ23456789]{4,6}$/.test(value);

/**
 * Does the typed answer count? Exact/spacing-insensitive matches are preferred. For
 * multi-word accepted names we also allow extra whole name tokens in the player's
 * answer: "Harald Martin Brattbakk" must count when the source says "Harald Brattbakk".
 * This is deliberately not fuzzy substring matching, so short/numeric answers stay exact.
 */
export function isCorrectAnswer(accepted: string[], guess: string): boolean {
  const value = normalizeName(guess);
  if (!value) return false;
  if (accepted.some((a) => normalizeName(a) === value) || accepted.some((a) => matchKey(a) === matchKey(guess))) return true;

  const guessed = value.split(" ");
  return accepted.some((a) => {
    const normalized = normalizeName(a);
    if (!normalized || /^\d+$/.test(normalized)) return false;
    const tokens = normalized.split(" ");
    if (tokens.length < 2 || guessed.length <= tokens.length) return false;
    let at = 0;
    for (const token of guessed) if (token === tokens[at]) at++;
    return at === tokens.length;
  });
}

const startQuestion = (round: number, now: number): GameState => ({
  phase: "question",
  round,
  buzzedBy: null,
  endsAt: now + BUZZ_SECONDS * 1000,
});

/** Synchronized five-second show countdown before the first question opens. */
export function ready(now: number): GameState {
  return { phase: "countdown", round: 1, buzzedBy: null, endsAt: now + READY_SECONDS * 1000 };
}

/** Opens the first question immediately. Kept as the pure round primitive. */
export function start(now: number): GameState {
  return startQuestion(1, now);
}

/** First press wins. The caller is responsible for making that race atomic. */
export function buzz(state: GameState, playerId: string, now: number): GameState {
  if (state.phase !== "question" || state.buzzedBy) return state;
  return { ...state, phase: "answering", buzzedBy: playerId, endsAt: now + ANSWER_SECONDS * 1000 };
}

/** The answer the buzzing player typed. Right or wrong, the question is over. */
export function answer(state: GameState, correct: boolean, now: number): Step {
  if (state.phase !== "answering" || !state.buzzedBy) return { state, outcome: null };
  return {
    state: { ...state, phase: "reveal", endsAt: now + REVEAL_SECONDS * 1000 },
    outcome: correct
      ? { kind: "correct", playerId: state.buzzedBy, delta: CORRECT_POINTS }
      : { kind: "wrong", playerId: state.buzzedBy, delta: WRONG_POINTS },
  };
}

/**
 * Apply whatever time has done to the game since anyone last looked.
 *
 * Every transition is driven from here rather than from a timer, because there is no
 * process between requests: the game only moves when someone asks about it, and it has
 * to land in the same place whether that is a second late or ten minutes late. Looping
 * matters for the same reason - a reveal that expired while the tab was closed must not
 * hold the game up once the tab is back.
 */
export function settle(state: GameState, now: number, questionCount = QUESTIONS_PER_GAME): Step {
  let current = state;
  let outcome: Outcome | null = null;
  for (let guard = 0; guard < questionCount * 3 + 4; guard++) {
    if (current.endsAt == null || now < current.endsAt) return { state: current, outcome };
    if (current.phase === "countdown") {
      // Everybody gets the same start instant because the question clock begins at the
      // stored countdown deadline, not whenever a particular browser happens to poll.
      current = startQuestion(current.round, current.endsAt);
    } else if (current.phase === "question") {
      // Nobody dared. No points either way, and the answer is shown anyway.
      outcome = outcome ?? { kind: "nobody", playerId: null, delta: 0 };
      current = { ...current, phase: "reveal", endsAt: current.endsAt + REVEAL_SECONDS * 1000 };
    } else if (current.phase === "answering") {
      // Buzzing and then saying nothing costs the same as being wrong: otherwise the
      // safe move is to grab every question and stay silent to keep the others out.
      outcome = outcome ?? { kind: "timeout", playerId: current.buzzedBy!, delta: WRONG_POINTS };
      current = { ...current, phase: "reveal", endsAt: current.endsAt + REVEAL_SECONDS * 1000 };
    } else if (current.phase === "reveal") {
      current =
        current.round >= questionCount
          ? { phase: "done", round: current.round, buzzedBy: null, endsAt: null }
          : startQuestion(current.round + 1, current.endsAt);
    } else {
      return { state: current, outcome };
    }
  }
  return { state: current, outcome };
}

export type Standing = { id: string; name: string; score: number; seat: number };

/** Highest score wins; a draw is a draw and is reported as one. */
export function winners(players: Standing[]): Standing[] {
  if (!players.length) return [];
  const best = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === best).sort((a, b) => a.seat - b.seat);
}
