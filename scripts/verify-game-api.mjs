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

  // Gullordet never exposes the answer through /today. The server owns the dictionary,
  // validates guesses, resumes one ranked attempt and only reveals the word when done.
  const gull=(await req('/today?game=gullordet')).puzzle;
  assert.equal(gull.wordLength,5);
  assert.equal(gull.puzzleId,undefined);
  const gullStarts=await Promise.all([
    req('/gullordet/start',{number:gull.number},token),
    req('/gullordet/start',{number:gull.number},token),
  ]);
  assert.equal(gullStarts[0].attemptId,gullStarts[1].attemptId);
  assert.equal(gullStarts[0].answer,undefined);
  assert.equal((await req('/gullordet/guess',{attemptId:gullStarts[0].attemptId,guess:'ZZZZZ'},token)).error,'not-in-list');
  const [gullAnswer]=await db`
    select w.word
    from tippetuppen.schedule s
    join tippetuppen.gullordet_puzzle_words gp on gp.puzzle_id=s.puzzle_id
    join tippetuppen.gullordet_words w on w.id=gp.word_id
    where s.game='gullordet' and s.number=${gull.number}`;
  const gullSolved=await req('/gullordet/guess',{attemptId:gullStarts[0].attemptId,guess:gullAnswer.word},token);
  assert.equal(gullSolved.finished,true);
  assert.equal(gullSolved.won,true);
  assert.equal(gullSolved.score,100);
  assert.equal(gullSolved.answer,gullAnswer.word);
  const [gullLeague]=await db`select raw_score,league_points from tippetuppen.league_results where user_id=${user.user.id} and game='gullordet'`;
  assert.equal(gullLeague.raw_score,100); assert.equal(gullLeague.league_points,100);

  // Profile fields are private account data; avatars remain locked until 2,000 lifetime points.
  const profileBefore=await req('/profile',undefined,token);
  assert.equal(profileBefore.ok,true);
  assert.equal(profileBefore.profile.avatarUnlocked,false);
  assert.equal((await req('/profile/update',{name:'QA Spiller',email:name+'@example.test',avatarId:7},token)).error,'avatar-locked');
  const savedProfile=await req('/profile/update',{name:'QA Spiller',email:name+'@example.test',avatarId:null},token);
  assert.equal(savedProfile.profile.name,'QA Spiller');
  assert.equal(savedProfile.profile.email,name+'@example.test');

  await db`update tippetuppen.league_results set league_points=2100 where user_id=${user.user.id} and game='mangler-xi'`;
  const unlocked=await req('/profile',undefined,token);
  assert.equal(unlocked.profile.avatarUnlocked,true);
  assert.equal(unlocked.profile.avatarAvailable,true);
  const withAvatar=await req('/profile/update',{name:'QA Spiller',email:name+'@example.test',avatarId:7},token);
  assert.equal(withAvatar.profile.avatarId,7);
  assert.equal(withAvatar.profile.avatarAvailable,false);

  // A second authenticated profile can join a private league by code.
  const friendName=name+'-venn';
  const friend=await req('/auth/register',{username:friendName,password});
  assert.equal(friend.ok,true,JSON.stringify(friend)); created.push(friend.user.id);
  const made=await req('/friend-league/create',{name:'QA-venneliga'},token);
  assert.equal(made.ok,true,JSON.stringify(made));
  assert.match(made.league.code,/^[A-Z2-9]{6}$/);
  assert.equal(made.league.isOwner,true);
  const joined=await req('/friend-league/join',{code:made.league.code},friend.token);
  assert.equal(joined.ok,true);
  assert.equal(joined.league.rows.length,2);
  assert.equal(joined.league.rows.some(r=>r.username===name && r.avatarId===7),true);
  const friendList=await req('/friend-leagues',undefined,friend.token);
  assert.equal(friendList.leagues.length,1);
  assert.equal(friendList.leagues[0].code,made.league.code);
  const renamed=await req('/friend-league/rename',{code:made.league.code,name:'QA-gjengen'},token);
  assert.equal(renamed.league.name,'QA-gjengen');
  assert.equal((await req('/friend-league/rename',{code:made.league.code,name:'Nope'},friend.token)).error,'forbidden');
  assert.equal((await req('/friend-league/leave',{code:made.league.code},friend.token)).ok,true);

  // Password changes rotate the current session and invalidate every older one.
  const changed=await req('/profile/password',{currentPassword:password,newPassword:password+'-ny'},token);
  assert.equal(changed.ok,true,JSON.stringify(changed));
  assert.notEqual(changed.token,token);
  assert.equal((await req('/auth/me',undefined,token)).ok,false);
  assert.equal((await req('/auth/me',undefined,changed.token)).ok,true);
  await req('/auth/logout',{},changed.token);
  await req('/auth/logout',{},friend.token);
  assert.equal((await req('/auth/me',undefined,changed.token)).ok,false);
  console.log('API integration passed: login, profile, 2,000-point avatar unlock, friend leagues, password rotation, ranked games and logout.');
} finally {
  await db`delete from tippetuppen.events where visitor=${eventVisitor}`;
  for(const id of created) await db`delete from tippetuppen.users where id=${id}`;
  await db.end();
}
