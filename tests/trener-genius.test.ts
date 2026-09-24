import { describe, expect, it } from "vitest";
import { advanceGenius, geniusPoints, geniusTotal, initialGeniusState, publicGeniusState, type GeniusPayload } from "../src/lib/trener-genius";
import { buildGeniusPuzzles } from "../src/server/puzzles/trenerGenius";
const payload: GeniusPayload = { status:"single_source", questions:Array.from({length:4},(_,i)=>({id:`secret-${i}`,coachId:`coach-${i}`,category:"Gullåret",prompt:`Spørsmål ${i}`,options:["A","B","C","D"],answerIndex:2,fact:"SECRET_FACT",difficulty:2,sources:[{title:"SECRET_SOURCE",url:"https://example.com"}]})) };
function play(answers: {correct:boolean;offensive?:boolean;help?:boolean}[]) {
  const state=initialGeniusState();
  answers.forEach((a,i)=>{if(a.help) expect(advanceGenius(state,payload,{action:"help",index:i})).toBe(true);
    expect(advanceGenius(state,payload,{action:"answer",index:i,option:a.correct?2:3,offensive:a.offensive})).toBe(true);
    expect(advanceGenius(state,payload,{action:"next",index:i})).toBe(true);});
  return state;
}
describe("Trener Genius",()=>{
  it("implements the agreed score examples and caps only the final total",()=>{
    expect(geniusPoints(play([{correct:true},{correct:true},{correct:true},{correct:true}]))).toBe(100);
    expect(geniusPoints(play([{correct:true},{correct:false},{correct:true,offensive:true},{correct:true}]))).toBe(100);
    expect(geniusPoints(play([{correct:false,offensive:true},{correct:true},{correct:true},{correct:true}]))).toBe(50);
    expect(geniusTotal(play([{correct:true,offensive:true},{correct:true},{correct:true},{correct:true}]))).toBe(125);
    expect(geniusPoints(play([{correct:false,offensive:true},{correct:false},{correct:false},{correct:false}]))).toBe(0);
    expect(geniusPoints(play([{correct:true,help:true},{correct:true},{correct:true},{correct:true}]))).toBe(85);
  });
  it("does not leak answers, future questions, facts, sources or source IDs",()=>{
    const view=JSON.stringify(publicGeniusState(initialGeniusState(),payload));
    expect(view).not.toMatch(/SECRET|secret-|coach-|answerIndex|Spørsmål 1/);
  });
  it("rejects repeated tactics, combined help, hidden choices, double submits and stale next",()=>{
    const s=initialGeniusState();
    expect(advanceGenius(s,payload,{action:"answer",index:0,option:9})).toBe(false);
    expect(advanceGenius(s,payload,{action:"help",index:0})).toBe(true);
    expect(s.hidden).not.toContain(2);
    expect(advanceGenius(s,payload,{action:"help",index:0})).toBe(false);
    expect(advanceGenius(s,payload,{action:"answer",index:0,option:s.hidden[0]})).toBe(false);
    expect(advanceGenius(s,payload,{action:"answer",index:0,option:2,offensive:true})).toBe(false);
    expect(advanceGenius(s,payload,{action:"answer",index:0,option:2})).toBe(true);
    expect(advanceGenius(s,payload,{action:"answer",index:0,option:3})).toBe(false);
    expect(s.answers).toHaveLength(1);
    expect(publicGeniusState(s,payload).reveal?.answer).toBe("C");
    expect(advanceGenius(s,payload,{action:"next",index:0})).toBe(true);
    expect(advanceGenius(s,payload,{action:"next",index:0})).toBe(false);
    expect(advanceGenius(s,payload,{action:"answer",index:1,option:2,offensive:true})).toBe(true);
    advanceGenius(s,payload,{action:"next",index:1});
    expect(advanceGenius(s,payload,{action:"answer",index:2,option:2,offensive:true})).toBe(false);
  });
  it("makes reproducible reviewed rounds without repeats or duplicated coaches",()=>{
    const rounds=buildGeniusPuzzles();
    expect(rounds).toEqual(buildGeniusPuzzles());
    expect(rounds.length).toBeGreaterThanOrEqual(6);
    const ids=rounds.flatMap(r=>r.payload.questions.map(q=>q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for(const {payload:p} of rounds){
      expect(p.questions.map(q=>q.difficulty)).toEqual([1,2,2,3]);
      expect(new Set(p.questions.map(q=>q.coachId)).size).toBe(4);
      for(const q of p.questions){expect(q.options).toHaveLength(4);expect(q.options[q.answerIndex]).toBeTruthy();expect(q.sources.length).toBeGreaterThan(0);}
    }
  });
});
