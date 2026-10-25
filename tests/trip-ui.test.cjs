const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'..');
async function waitFor(fn){for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('UI did not reach expected state');}
function fixture(){
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,ctx=dom.getInternalVMContext(),errors=[],writes=[];let saved=null,rows=[];
 w.LLAdmin={isAdmin:()=>true,refresh:async()=>true,showLogin:()=>errors.push('Admin sign-in required')};w.structuredClone=structuredClone;w.alert=msg=>errors.push(String(msg));w.confirm=()=>true;w.setInterval=()=>0;w.localStorage.setItem('ll-intro-seen-845','1');
 w.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(base,'release.json'),'utf8'))});
 w.supabase={createClient:()=>({from:table=>new Query(table),channel:()=>({on(){return this;},subscribe(){return this;}}),rpc:async(name,args)=>{
  writes.push({name,args});
  if(name==='ll_save_trip_configuration'){
   if(args.p_expected_revision!==(saved?.revision||0))return {data:null,error:{message:'Another admin changed this setup. Refresh before saving.'}};
   saved={event_id:args.p_event_id,settings:structuredClone(args.p_settings),revision:(saved?.revision||0)+1};return {data:[structuredClone(saved)],error:null};
  }
  if(name==='ll_save_trip_scores'){for(const r of args.p_scores){rows=rows.filter(x=>!(x.match_id===r.match_id&&x.hole===r.hole&&x.scorer_id===r.scorer_id));if(r.gross!==null)rows.push({...r,event_id:args.p_event_id});}return {data:{saved:args.p_scores.length},error:null};}
  return {data:null,error:{message:'Unknown test operation'}};
 }})};
 class Query{constructor(table){this.table=table;this.single=false;}select(){return this;}eq(){return this;}order(){return this;}in(){return this;}maybeSingle(){this.single=true;return this;}then(resolve,reject){let data=[];if(this.table==='trip_configurations')data=this.single?saved:saved?[saved]:[];if(this.table==='trip_score_entries')data=rows;return Promise.resolve({data:structuredClone(data),error:null}).then(resolve,reject);}}
 for(const file of ['data.js','app.js','finance-core.js','finances.js','trip-core.js','trip-manager.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),ctx,{filename:file});
 return {dom,w,ctx,errors,writes,get saved(){return saved;},get rows(){return rows;},remoteChange(){saved.revision++;},get(selector){return w.document.querySelector(selector);},change(selector,value){const el=w.document.querySelector(selector);assert.ok(el,selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));el.dispatchEvent(new w.Event('input',{bubbles:true}));},async click(selector){const e=w.document.querySelector(selector);assert.ok(e,selector);e.click();await new Promise(r=>setTimeout(r,5));}};
}
async function teams(f){await waitFor(()=>f.w.LLTripManager);f.w.sessionStorage.setItem('ll-admin-ok','1');f.w.setAdminTab('teams');await waitFor(()=>f.get('#tripTeamA'));f.change('#tripTeamA','The Eagles');f.change('#tripTeamB','The Owls');const roster=[...f.w.document.querySelectorAll('[data-roster-id]')];roster.forEach((row,i)=>{f.change(`[data-roster-id="${row.dataset.rosterId}"] [data-roster-active]`,i<8);f.change(`[data-roster-id="${row.dataset.rosterId}"] [data-roster-team]`,i<4?'a':i<8?'b':'');});await f.click('#tripSaveSetup');await waitFor(()=>f.saved?.revision===1);}
test('admin saves custom teams, round formats, dates, courses and pairings without touching 2026',async()=>{
 const f=fixture();try{
 await teams(f);assert.equal(f.saved.settings.teams.a,'The Eagles');assert.equal(f.saved.settings.rounds[0].matches.length,2);
 f.w.setAdminTab('rounds');f.change('[data-round-editor="1"] [data-round-format]','singles');await f.click('#tripSaveSetup');await waitFor(()=>f.saved.revision===2);assert.equal(f.saved.settings.rounds[0].matches.length,4);assert.equal(f.saved.settings.rounds[0].matches[0].a.length,1);
 f.w.setAdminTab('schedule');f.change('[data-schedule-round="1"] [data-default-date]','2027-09-24');f.change('[data-schedule-round="1"] [data-default-time]','08:20');f.change('[data-trip-course="r1"]','brights');assert.match(f.get('[data-trip-tee="r1"]').textContent,/Long\/Intermediate/);await f.click('#tripSaveSetup');await waitFor(()=>f.saved.revision===3);assert.equal(f.saved.settings.rounds[0].tee,'Long/Intermediate');
 f.w.setAdminTab('pairings');const first=f.saved.settings.rounds[0].matches[0].id;f.change(`[data-trip-pairing="${first}"] [data-pair-side="a"]`,f.saved.settings.players.find(p=>p.team==='a').id);f.change(`[data-trip-pairing="${first}"] [data-pair-side="b"]`,f.saved.settings.players.find(p=>p.team==='b').id);await f.click('#tripSaveSetup');await waitFor(()=>f.saved.revision===4);
 assert.ok(f.writes.every(x=>x.args.p_event_id==='lake-lure-2027'));
 f.change('#tripYearChoice','2027');await waitFor(()=>f.get('#upcomingTripRoot h1')?.textContent==='The next chapter');assert.match(f.get('#upcomingTripRoot').textContent,/The Eagles/);
 await f.click('nav button[data-v="matches"]');assert.match(f.get('#upcomingTripRoot').textContent,/Bright/);assert.match(f.get('#tripWeather').textContent,/closer to match day/);
 await f.click('[data-trip-match]');assert.ok(f.get('#tripScoreMatch'));assert.equal(f.w.document.querySelectorAll('[data-trip-scorer]').length,2);
 f.w.document.querySelectorAll('[data-trip-scorer]').forEach((input,i)=>f.change(`[data-trip-scorer="${input.dataset.tripScorer}"]`,String(4+i)));await f.click('#tripSaveHole');assert.equal(f.rows.length,2);assert.equal(f.get('#tripScoreHole').value,'2');assert.ok(f.rows.every(r=>r.event_id==='lake-lure-2027'));
 }finally{f.dom.window.close();}
});
test('add player validates name/index and rejects a duplicate without a write',async()=>{
 const f=fixture();try{await teams(f);f.change('#tripNewName','New Golf Friend');f.change('#tripNewIndex','7.4');f.change('#tripNewTeam','a');await f.click('#tripAddPlayerButton');await waitFor(()=>f.saved.revision===2);assert.equal(f.saved.settings.players.find(p=>p.name==='New Golf Friend').index,7.4);const before=f.writes.length;f.change('#tripNewName','new golf friend');f.change('#tripNewIndex','5');await f.click('#tripAddPlayerButton');assert.equal(f.writes.length,before);assert.match(f.get('#tripAdminMessage').textContent,/already listed/);}finally{f.dom.window.close();}
});
test('concurrent admin changes keep the unsaved form and reject stale revisions',async()=>{
 const f=fixture();try{await teams(f);f.change('#tripTeamA','Unsaved team');f.remoteChange();await f.click('#tripSaveSetup');assert.match(f.get('#tripAdminMessage').textContent,/Another admin/);assert.equal(f.saved.settings.teams.a,'The Eagles');assert.equal(f.get('#tripTeamA').value,'Unsaved team');}finally{f.dom.window.close();}
});
