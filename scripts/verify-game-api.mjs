// Integration checks against the local API and its actual PostgreSQL connection.
import assert from 'node:assert/strict';
import postgres from 'postgres';
const base = 'http://127.0.0.1:8000/api';
const db = postgres('postgres://postgres@127.0.0.1:5544/postgres');
const created = [];
const req = async (path, data, token) => {
  const response = await fetch(base + path, {method:data ? 'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-session-token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return response.json();
};
try {
  const name = 'qa-' + Date.now();
  const password = crypto.randomUUID();
  const user = await req('/auth/register',{username:name,password});
  assert.equal(user.ok,true,JSON.stringify(user)); created.push(user.user.id);
  const token=user.token;
  assert.equal((await req('/auth/register',{username:name.toUpperCase(),password})).error,'taken');
  assert.equal((await req('/auth/login',{username:name,password})).ok,true);
  assert.equal((await req('/auth/login',{username:name,password:'wrong'})).ok,false);
  const puzzle=(await req('/today?game=finn-spilleren')).puzzle;
  assert.match(puzzle.puzzleId,/^finn-[a-f0-9]{32}$/);
  const starts=await Promise.all([req('/finn-spilleren/start',{puzzleId:puzzle.puzzleId},token),req('/finn-spilleren/start',{puzzleId:puzzle.puzzleId},token)]);
  assert.equal(starts[0].attemptId,starts[1].attemptId);
  const attemptId=starts[0].attemptId;
  await req('/finn-spilleren/next',{attemptId},token);
  const resumed=await req('/finn-spilleren/start',{puzzleId:puzzle.puzzleId},token);
  assert.equal(resumed.hintNumber,2); assert.equal(resumed.hints.length,2);
  assert.equal((await req('/finn-spilleren/guess',{attemptId,guess:'nobody'})).ok,false);
  const result=await req('/finn-spilleren/guess',{attemptId,guess:'nobody'},token);
  assert.equal(result.result.score,0);
  const replay=await req('/finn-spilleren/guess',{attemptId,guess:result.result.answer},token);
  assert.deepEqual(replay.result,result.result);
  assert.deepEqual((await req('/finn-spilleren/start',{puzzleId:puzzle.puzzleId},token)).result,result.result);
  const future=await db`select p.id from tippetuppen.puzzles p join tippetuppen.schedule s on s.puzzle_id=p.id where s.game='mangler-xi' and s.date>(now() at time zone 'Europe/Oslo')::date::text limit 1`;
  assert.equal((await req('/reveal',{puzzleId:future[0].id})).ok,false);
  const xi=(await req('/today?game=mangler-xi')).puzzle;
  await req('/reveal',{puzzleId:xi.puzzleId},token);
  const [score]=await db`select raw_score,league_points from tippetuppen.league_results where user_id=${user.user.id} and game='mangler-xi'`;
  assert.equal(score.raw_score,0); assert.equal(score.league_points,0);
  const mal=(await req('/today?game=maalloes')).puzzle;
  assert.deepEqual(await req('/maalloes/answer',{puzzleId:mal.puzzleId,text:'anything'}),{ok:true,pending:true});
  const answers=Array.from({length:5},(_,i)=>({text:'invalid'+i,id:null}));
  const first=await req('/maalloes/submit',{puzzleId:mal.puzzleId,answers},token);
  assert.equal(first.total,500);
  assert.equal(first.board.filter(x=>x.score===0).length,1);
  const second=await req('/maalloes/submit',{puzzleId:mal.puzzleId,answers:first.board.slice(0,5).map(x=>({text:x.label,id:x.id}))},token);
  assert.deepEqual(second,first);
  await req('/auth/logout',{},token);
  assert.equal((await req('/auth/me',undefined,token)).ok,false);
  console.log('API integration passed: login, uniqueness, ownership, concurrent start, resume, locked answer, future protection, give-up scoring, fixed Målløs result, logout.');
} finally {
  for(const id of created) await db`delete from tippetuppen.users where id=${id}`;
  await db.end();
}
