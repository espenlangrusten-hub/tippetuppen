import { describe, it, expect } from "vitest";
import { loadDataset } from "@/data/load";
import { isPlayable } from "@/data/straffespark";
import { normalizeName } from "@/lib/names";
import {
  ANSWER_SECONDS, BUZZ_SECONDS, REVEAL_SECONDS, QUESTIONS_PER_GAME,
  answer, buzz, isCode, isCorrectAnswer, newCode, secondsLeft, settle, start, winners,
  type GameState,
} from "@/lib/kjappen";

const T0 = 1_700_000_000_000;
const sec = (n: number) => n * 1000;

describe("running a round", () => {
  it("opens the first question with the full buzzer window", () => {
    const s = start(T0);
    expect(s).toEqual({ phase: "question", round: 1, buzzedBy: null, endsAt: T0 + sec(BUZZ_SECONDS) });
    expect(secondsLeft(s.endsAt, T0)).toBe(BUZZ_SECONDS);
  });

  it("gives the buzzer to the first press and starts the answer clock", () => {
    const s = buzz(start(T0), "p1", T0 + sec(4));
    expect(s.phase).toBe("answering");
    expect(s.buzzedBy).toBe("p1");
    expect(secondsLeft(s.endsAt, T0 + sec(4))).toBe(ANSWER_SECONDS);
  });

  it("ignores a second press once someone has it", () => {
    const first = buzz(start(T0), "p1", T0 + sec(4));
    expect(buzz(first, "p2", T0 + sec(4.1))).toEqual(first);
  });

  it("pays 100 for right and takes 100 for wrong", () => {
    const buzzed = buzz(start(T0), "p1", T0 + sec(2));
    expect(answer(buzzed, true, T0 + sec(5)).outcome).toEqual({ kind: "correct", playerId: "p1", delta: 100 });
    expect(answer(buzzed, false, T0 + sec(5)).outcome).toEqual({ kind: "wrong", playerId: "p1", delta: -100 });
    expect(answer(buzzed, true, T0 + sec(5)).state.phase).toBe("reveal");
  });
});

describe("what the clock does when nobody is looking", () => {
  it("shows the answer and pays nobody when the buzzer window runs out", () => {
    const step = settle(start(T0), T0 + sec(BUZZ_SECONDS + 1));
    expect(step.state.phase).toBe("reveal");
    expect(step.outcome).toEqual({ kind: "nobody", playerId: null, delta: 0 });
  });

  it("charges the player who buzzed and then said nothing", () => {
    // Otherwise the winning strategy is to grab every question and stay silent.
    const buzzed = buzz(start(T0), "p1", T0 + sec(2));
    const step = settle(buzzed, T0 + sec(2 + ANSWER_SECONDS + 1));
    expect(step.state.phase).toBe("reveal");
    expect(step.outcome).toEqual({ kind: "timeout", playerId: "p1", delta: -100 });
  });

  it("moves on to the next question after the reveal", () => {
    const revealing = answer(buzz(start(T0), "p1", T0 + sec(2)), true, T0 + sec(5)).state;
    const step = settle(revealing, T0 + sec(5 + REVEAL_SECONDS + 1));
    expect(step.state).toMatchObject({ phase: "question", round: 2, buzzedBy: null });
  });

  it("catches up through several phases at once after a closed tab", () => {
    // A game left alone for an hour must land where it would have landed, not freeze.
    const step = settle(start(T0), T0 + sec(3600));
    expect(step.state.phase).toBe("done");
    expect(step.state.round).toBe(QUESTIONS_PER_GAME);
    expect(step.state.endsAt).toBeNull();
  });

  it("reports the first thing the clock decided, not the last", () => {
    // The screen that catches up should say what happened to the question it was on.
    const buzzed = buzz(start(T0), "p1", T0 + sec(2));
    expect(settle(buzzed, T0 + sec(3600)).outcome).toMatchObject({ kind: "timeout", playerId: "p1" });
  });

  it("leaves a running phase alone", () => {
    const s: GameState = start(T0);
    expect(settle(s, T0 + sec(5))).toEqual({ state: s, outcome: null });
  });

  it("stops at the last question instead of starting a sixth", () => {
    const last: GameState = { phase: "reveal", round: QUESTIONS_PER_GAME, buzzedBy: "p1", endsAt: T0 };
    expect(settle(last, T0 + sec(60)).state.phase).toBe("done");
  });
});

describe("answers and codes", () => {
  it("accepts the alias and the spacing variant", () => {
    const accepted = ["HamKam", "Hamarkameratene"];
    expect(isCorrectAnswer(accepted, "hamkam")).toBe(true);
    expect(isCorrectAnswer(accepted, "ham kam")).toBe(true);
    expect(isCorrectAnswer(accepted, "  Hamarkameratene ")).toBe(true);
    expect(isCorrectAnswer(accepted, "Molde")).toBe(false);
    expect(isCorrectAnswer(accepted, "   ")).toBe(false);
  });

  it("makes codes people can read aloud", () => {
    // No 0/O, 1/I/L or vowels: nothing to spell out twice, and no accidental words.
    for (let i = 0; i < 200; i++) {
      const code = newCode();
      expect(code).toHaveLength(4);
      expect(isCode(code)).toBe(true);
      expect(code).not.toMatch(/[AEIOUYL01]/);
    }
    expect(isCode("ABCD")).toBe(false);
    expect(isCode("BC2")).toBe(false);
  });
});

describe("who won", () => {
  const p = (id: string, score: number, seat: number) => ({ id, name: id, score, seat });

  it("is whoever has most points", () => {
    expect(winners([p("a", 100, 1), p("b", 300, 2), p("c", -100, 3)]).map((w) => w.id)).toEqual(["b"]);
  });

  it("reports a draw as a draw", () => {
    expect(winners([p("a", 200, 1), p("b", 200, 2)]).map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("copes with everyone in the red", () => {
    expect(winners([p("a", -100, 1), p("b", -300, 2)]).map((w) => w.id)).toEqual(["a"]);
  });
});

describe("Kjappen's own question bank", () => {
  const bank = loadDataset().kjappen;

  it("holds the forty new questions, each asked once", () => {
    expect(bank.length).toBeGreaterThanOrEqual(39);
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => normalizeName(q.prompt))).size).toBe(bank.length);
  });

  it("keeps every unsourced question out of play", () => {
    // Written from memory until a verifier has opened the page that confirms them.
    for (const q of bank) if (q.status === "recall") expect(isPlayable(q), q.id).toBe(false);
  });

  it("tells the verifier what would settle each one", () => {
    for (const q of bank) {
      if (q.status !== "recall") continue;
      expect(q.verify?.subject, q.id).toBeTruthy();
      expect(q.verify?.mustMention.length, q.id).toBeGreaterThan(0);
    }
  });

  it("has an answer you can actually type, and no alias that accepts nothing new", () => {
    for (const q of bank) {
      expect(normalizeName(q.answer.label), q.id).toBeTruthy();
      const keys = [q.answer.label, ...q.answer.aliases].map(normalizeName);
      expect(new Set(keys).size, `${q.id} repeats a spelling`).toBe(keys.length);
    }
  });

  it("does not ask anything Straffespark already asks", () => {
    const ds = loadDataset();
    const asked = new Set(ds.straffespark.flatMap((q) => (q.kind === "trivia" ? [normalizeName(q.prompt)] : [])));
    for (const q of bank) expect(asked.has(normalizeName(q.prompt)), q.id).toBe(false);
  });
});
