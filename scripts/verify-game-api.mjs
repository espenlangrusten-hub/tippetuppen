// Integration checks against the local API and its actual PostgreSQL connection.
import assert from 'node:assert/strict';
import postgres from 'postgres';
const base = 'http://127.0.0.1:8000/api';
const db = postgres('postgres://postgres@127.0.0.1:5544/postgres', {connect_timeout: 10, connection: {statement_timeout: 15000}});
const created = [];
const eventVisitor = 'qa-stats-' + crypto.randomUUID();
const req = async (path, data, token) => {
  console.log('Checking', path);
  const response = await fetch(base + path, {signal: AbortSignal.timeout(20000), method:data ? 'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-session-token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return response.json();
};
try {
  assert.equal((await fetch(base+'/admin/stats')).status,401);
  const stats = async (suffix='') => {
    const response=await fetch(base+'/admin/stats'+suffix,{headers:{'x-admin-key':'local-ci-admin-stats-only'}});
    assert.equal(response.status,200);
    return response.json();
  };
  const before=await stats();
  assert.equal(before.daily.length,30);
  for(const game of ['mangler-xi','maalloes','finn-spilleren']) {
    for(const offset of [0,0,-1,-40,1]) {
      await db`insert into tippetuppen.events(day,name,game,visitor,props)
        values(to_char((now() at time zone 'Europe/Oslo')::date+${offset}::int,'YYYY-MM-DD'),'game_start',${game},${eventVisitor},'{}'::jsonb)`;
    }
  }
  await db`insert into tippetuppen.events(day,name,game,visitor,props)
    values(to_char(now() at time zone 'Europe/Oslo','YYYY-MM-DD'),'game_start','finn-spilleren',${eventVisitor},'{"path":"/admin/"}'::jsonb)`;
  const after=await stats();
  assert.equal(after.todayVisitors,before.todayVisitors+1);
  assert.equal(after.visitorDays,before.visitorDays+2);
  for(const game of ['mangler-xi','maalloes','finn-spilleren']) {
    const old=before.games.find(g=>g.game===game);
    const current=after.games.find(g=>g.game===game);
    assert.equal(Number(current.starts),Number(old?.starts??0)+3);
    assert.equal(Number(current.player_days),Number(old?.player_days??0)+2);
    assert.equal(Number(current.today_players),Number(old?.today_players??0)+1);
  }
  assert.equal((await stats('?days=invalid')).daily.length,30);
  const name = 'qa-' + Date.now();
  const password = crypto.randomUUID();
  const user = await req('/auth/register',{username:name,password});
  assert.equal(user.ok,true,JSON.stringify(user)); created.push(user.user.id);
  const token=user.token;
  const unranked=await req('/leaderboard',undefined,token);
  assert.equal(unranked.me,null);
  assert.equal(typeof unranked.registered,'number');
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
  // A wrong guess buys the next hint and lowers the pot; it does not end the round.
  const wrong=await req('/finn-spilleren/guess',{attemptId,guess:'nobody'},token);
  assert.equal(wrong.finished,false); assert.equal(wrong.correct,false);
  assert.equal(wrong.hintNumber,3); assert.equal(wrong.hints.length,3);
  assert.equal(wrong.potential,60); assert.deepEqual(wrong.guesses,['nobody']);
  // Only the last hint being guessed away ends it. The round opened on hint 1 and one
  // hint was taken with /next, so four wrong guesses is what it takes from here.
  await req('/finn-spilleren/guess',{attemptId,guess:'nobody'},token);
  await req('/finn-spilleren/guess',{attemptId,guess:'nobody'},token);
  const result=await req('/finn-spilleren/guess',{attemptId,guess:'nobody'},token);
  assert.equal(result.finished,true);
  assert.equal(result.hintNumber,5);
  assert.equal(result.result.score,0);
  assert.equal(result.guesses.length,4);
  const replay=await req('/finn-spilleren/guess',{attemptId,guess:result.result.answer},token);
  assert.deepEqual(replay.result,result.result);
  assert.deepEqual((await req('/finn-spilleren/start',{puzzleId:puzzle.puzzleId},token)).result,result.result);
  const future=await db`select p.id from tippetuppen.puzzles p join tippetuppen.schedule s on s.puzzle_id=p.id where s.game='mangler-xi' and s.date>(now() at time zone 'Europe/Oslo')::date::text limit 1`;
  assert.equal((await req('/reveal',{puzzleId:future[0].id})).ok,false);
  const xi=(await req('/today?game=mangler-xi')).puzzle;
  const [xiData]=await db`select payload from tippetuppen.puzzles where id=${xi.puzzleId}`;
  const solved=await req('/guess',{puzzleId:xi.puzzleId,index:0,guess:xiData.payload.players[0].answer},token);
  assert.equal(solved.solved,true);
  await req('/reveal',{puzzleId:xi.puzzleId},token);
  const [score]=await db`select raw_score,league_points from tippetuppen.league_results where user_id=${user.user.id} and game='mangler-xi'`;
  assert.equal(score.raw_score,105); assert.equal(score.league_points,9);
  assert.equal((await req('/guess',{puzzleId:xi.puzzleId,index:1,guess:xiData.payload.players[1].answer},token)).ok,false);
  await req('/reveal',{puzzleId:xi.puzzleId},token);
  const [savedXi]=await db`select raw_score,league_points from tippetuppen.league_results where user_id=${user.user.id} and game='mangler-xi'`;
  assert.deepEqual(savedXi,score);
  const mal=(await req('/today?game=maalloes')).puzzle;
  assert.deepEqual(await req('/maalloes/answer',{puzzleId:mal.puzzleId,text:'anything'}),{ok:true,pending:true});
  const answers=Array.from({length:5},(_,i)=>({text:'invalid'+i,id:null}));
  const first=await req('/maalloes/submit',{puzzleId:mal.puzzleId,answers},token);
  assert.equal(first.total,500);
  assert.equal(first.board.filter(x=>x.score===0).length,1);
  const second=await req('/maalloes/submit',{puzzleId:mal.puzzleId,answers:first.board.slice(0,5).map(x=>({text:x.label,id:x.id}))},token);
  assert.deepEqual(second,first);
  const ownBoard=await req('/leaderboard',undefined,token);
  assert.equal(ownBoard.me.username,name);
  assert.deepEqual(ownBoard.rows.find(r=>r.username===name),ownBoard.me);
  const competitors=Array.from({length:105},(_,i)=>({id:crypto.randomUUID(),username:`${name}-r${String(i).padStart(3,'0')}`}));
  created.push(...competitors.map(c=>c.id));
  await db`insert into tippetuppen.users ${db(competitors.map(c=>({...c,username_normalized:c.username,password_hash:'test-only',password_salt:'test-only'})))}`;
  await db`insert into tippetuppen.league_results(user_id,puzzle_id,game,date,raw_score,league_points,details)
    select u.id, s.puzzle_id, s.game, s.date, 100, 100, '{}'::jsonb from tippetuppen.users u
    cross join tippetuppen.schedule s where u.id in ${db(competitors.map(c=>c.id))} and s.puzzle_id=${xi.puzzleId}`;
  const outside=await req('/leaderboard',undefined,token);
  assert.equal(outside.rows.length,100);
  assert.equal(outside.me.rank,ownBoard.me.rank+105);
  assert.equal(outside.rows.some(r=>r.username===name),false);
  assert.equal(outside.rows[0].rank,1); assert.equal(outside.rows[99].rank,100);
  assert.equal(outside.registered,ownBoard.registered+105);
  assert.equal((await req('/leaderboard')).me,null);
  assert.equal((await req('/leaderboard',undefined,'invalid-session')).me,null);
  await req('/auth/logout',{},token);
  assert.equal((await req('/auth/me',undefined,token)).ok,false);
  console.log('API integration passed: login, uniqueness, ownership, concurrent start, resume, locked answer, future protection, give-up scoring, fixed Målløs result, logout.');
} finally {
  await db`delete from tippetuppen.events where visitor=${eventVisitor}`;
  for(const id of created) await db`delete from tippetuppen.users where id=${id}`;
  await db.end();
}
