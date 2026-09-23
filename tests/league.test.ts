import { describe,it,expect } from 'vitest';
import { advanceXi,xiScore,type XiState } from '../supabase/functions/_shared/league';
const initial=():XiState=>({attempts:Array(11).fill(0),solved:Array(11).fill(false)});
describe('league XI state',()=>{
  it('awards zero for giving up with no correct answers and 100 for eleven first guesses',()=>{
    const empty=initial(); advanceXi(empty,null,false,true,false); expect(xiScore(empty).points).toBe(0);
    const perfect=initial(); for(let i=0;i<11;i++) advanceXi(perfect,i,true,false,false);
    expect(xiScore(perfect).points).toBe(100);
  });
  it('keeps solved-shirt points and bonus when giving up, with zero for remaining shirts',()=>{
    const s=initial();
    advanceXi(s,0,true,false,false);
    advanceXi(s,1,false,false,false);
    advanceXi(s,1,true,false,false);
    advanceXi(s,2,false,false,false);
    const before=xiScore(s);
    advanceXi(s,null,false,true,false);
    expect(s.finished).toBe(true);
    expect(xiScore(s)).toEqual(before);
    expect(before).toEqual({found:2,attempts:4,raw:209,points:18});
    expect(advanceXi(s,2,true,false,false)).toBe(false);
  });
  it('does not credit a correct seventh guess',()=>{
    const s=initial(); for(let i=0;i<6;i++) expect(advanceXi(s,0,false,false,false)).toBe(true);
    expect(advanceXi(s,0,true,false,false)).toBe(false); expect(s.solved[0]).toBe(false);
  });
  it('charges for one hint and prevents attempts after finishing',()=>{
    const s=initial(); expect(advanceXi(s,0,false,false,true)).toBe(true);
    expect(advanceXi(s,0,false,false,true)).toBe(false); expect(s.attempts[0]).toBe(1);
    advanceXi(s,null,false,true,false); expect(advanceXi(s,1,true,false,false)).toBe(false);
  });
  it('lets a signed-in player buy several facts, one guess each, and still the letter once', ()=>{
    // The letter and the facts shared one flag, so a signed-in player got exactly one hint
    // per shirt: the second fact, or the letter after a fact, came back 409 "finished".
    const s=initial();
    expect(advanceXi(s,0,false,false,'fact')).toBe(true);
    expect(advanceXi(s,0,false,false,'fact')).toBe(true);
    expect(advanceXi(s,0,false,false,'letter')).toBe(true);
    expect(advanceXi(s,0,false,false,'letter')).toBe(false);
    expect(s.attempts[0]).toBe(3);
  });
  it('never sells a hint that leaves no guess to use it on', ()=>{
    const s=initial(); for(let i=0;i<5;i++) advanceXi(s,0,false,false,'fact');
    expect(s.attempts[0]).toBe(5);
    expect(advanceXi(s,0,false,false,'fact')).toBe(false);
    expect(advanceXi(s,0,true,false,false)).toBe(true); expect(s.solved[0]).toBe(true);
  });
  it('still reads a bare true as the letter, for callers written before facts', ()=>{
    const s=initial(); advanceXi(s,0,false,false,true);
    expect(advanceXi(s,0,false,false,'letter')).toBe(false);
  });
});
