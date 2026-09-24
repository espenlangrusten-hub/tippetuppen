// GENERATED FILE – do not edit. Source: src/lib/<name>. Run `npm run sync:shared`.
/** Shared scoring and state machine. Payloads stay on the server; publicState is an allowlist. */
export const GENIUS_SIZE = 4;
export type GeniusQuestion = {
  id: string; coachId: string; category: string; prompt: string; options: string[];
  answerIndex: number; fact: string; difficulty: number;
  sources: { title: string; url: string }[];
};
export type GeniusPayload = { status: string; questions: GeniusQuestion[] };
export type GeniusAnswer = { option: number; correct: boolean; offensive: boolean; helped: boolean; delta: number };
export type GeniusState = { index: number; phase: "question" | "reveal" | "done"; answers: GeniusAnswer[]; offensiveUsed: boolean; helpUsed: boolean; hidden: number[] };
export type GeniusAction = { action: "answer" | "help" | "next"; index: number; option?: number; offensive?: boolean };
export const initialGeniusState = (): GeniusState => ({ index: 0, phase: "question", answers: [], offensiveUsed: false, helpUsed: false, hidden: [] });
export const geniusTotal = (state: GeniusState) => state.answers.reduce((sum, a) => sum + a.delta, 0);
export const geniusPoints = (state: GeniusState) => Math.min(100, Math.max(0, geniusTotal(state)));

export function advanceGenius(state: GeniusState, payload: GeniusPayload, input: GeniusAction): boolean {
  if (payload.questions.length !== GENIUS_SIZE || input.index !== state.index || state.phase === "done") return false;
  const q = payload.questions[state.index];
  if (input.action === "next") {
    if (state.phase !== "reveal") return false;
    if (state.index === GENIUS_SIZE - 1) state.phase = "done";
    else { state.index++; state.phase = "question"; state.hidden = []; }
    return true;
  }
  if (state.phase !== "question") return false;
  if (input.action === "help") {
    if (state.helpUsed) return false;
    state.helpUsed = true;
    // Stable for every player; the two hidden choices are always wrong.
    state.hidden = q.options.map((_, i) => i).filter(i => i !== q.answerIndex).slice(0, 2);
    return true;
  }
  if (input.action !== "answer" || !Number.isInteger(input.option) || input.option! < 0 || input.option! >= q.options.length || state.hidden.includes(input.option!)) return false;
  const helped = state.hidden.length > 0;
  const offensive = input.offensive === true;
  if (offensive && (state.offensiveUsed || helped)) return false;
  const correct = input.option === q.answerIndex;
  const delta = offensive ? (correct ? 50 : -25) : correct ? (helped ? 10 : 25) : 0;
  state.answers.push({ option: input.option!, correct, offensive, helped, delta });
  if (offensive) state.offensiveUsed = true;
  state.phase = "reveal";
  return true;
}

export function publicGeniusState(state: GeniusState, payload: GeniusPayload) {
  const q = payload.questions[state.index];
  const revealed = state.phase !== "question";
  return {
    index: state.index, phase: state.phase, total: geniusTotal(state), points: geniusPoints(state),
    offensiveUsed: state.offensiveUsed, helpUsed: state.helpUsed, hidden: state.hidden,
    answers: state.answers,
    question: state.phase === "done" ? null : { category: q.category, prompt: q.prompt, options: q.options },
    reveal: revealed ? { answerIndex: q.answerIndex, answer: q.options[q.answerIndex], fact: q.fact, sources: q.sources } : null,
    recap: state.phase === "done" ? payload.questions.map((item, i) => ({ prompt: item.prompt, answer: item.options[item.answerIndex], fact: item.fact, ...state.answers[i] })) : null,
  };
}
export type GeniusPublic = ReturnType<typeof publicGeniusState>;
export type GeniusResponse = GeniusPublic & { ok: true; attemptId: string; date: string; number: number; ranked: boolean; userId: string | null };
