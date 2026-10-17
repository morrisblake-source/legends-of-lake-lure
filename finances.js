/* Shared ledger UI. Sandbox storage is isolated from Supabase. */
(function(){
'use strict';
const F=window.LLFinance, host=document.getElementById('financeRoot');if(!host)return;
const demo=window.LL_FINANCE_SANDBOX===true, KEY='ll-finances-sandbox-v1', EVENT='lake-lure-2026';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],editing=null,busy=false,ready=false,dirty=false,loadBusy=false;
let roster='';
let people=()=>[...LL.players].sort((a,b)=>a.name.localeCompare(b.name));
const name=id=>people().find(p=>p.id===id)?.name||id;
const selected=group=>[...host.querySelectorAll(`[data-fin-group="${group}"]:checked`)].map(x=>x.value);
const el=id=>document.getElementById(id);
const options=()=>'<option value="">Select player</option>'+people().map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
const checks=group=>`<div class="financeChecks">${people().map(p=>`<label><input type="checkbox" data-fin-group="${group}" value="${escape(p.id)}"><span>${escape(p.name)}</span></label>`).join('')}</div>`;
host.innerHTML=`<div class="financeHeading"><div><small>THE WEEKEND LEDGER</small><h1>Finances</h1><p>Split the bill. Record the bet. Settle up Sunday.</p></div><span class="financeBadge">${demo?'SANDBOX':'2026 CUP'}</span></div>
${demo?'<div class="financeNotice"><b>Test mode</b> · Entries stay in this browser and do not affect the real weekend balances.</div>':''}
<details class="card financeBalances"><summary>Weekend Balances <span id="financeBalanceSummary">No entries yet</span></summary><p class="muted">All active expenses and bets combined. Positive balances get money back; negative balances owe.</p><div id="financeBalanceList"></div></details>
<div class="card financeComposer"><div class="financeSectionHead"><h2 id="financeFormTitle">New request</h2><button id="financeReset" type="button">Clear</button></div>
<form id="financeForm"><div class="financeFields"><label>Your name<select id="financeAuthor" required>${options()}</select></label><label>Request type<select id="financeKind"><option value="split">Split Cost</option><option value="bet">Bet</option></select></label></div>
<label>Description<input id="financeDescription" maxlength="160" required placeholder="Saturday groceries, Sunday match…"></label>
<div id="financeBetModeWrap" hidden><label>Bet type<select id="financeBetMode"><option value="individual">Individual — 1 vs 1</option><option value="team">Team — multiple players</option></select></label></div>
<label><span id="financeAmountLabel">Total bill you paid</span><div class="financeMoney"><span>$</span><input id="financeAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required></div></label>
<div id="financeSplitGroup"><fieldset><legend>Who is sharing the cost?</legend><p class="muted">You paid the bill and are automatically included. Check everyone else sharing it.</p>${checks('participants')}</fieldset></div>
<div id="financeBetGroup" hidden><fieldset><legend>Who contributes / owes?</legend><p class="muted">For a prize pool, select everyone contributing, including any winners.</p>${checks('payers')}</fieldset><fieldset><legend>Who gets paid?</legend><p class="muted">Team bets can include the same players in both lists. Winnings are split equally.</p>${checks('recipients')}</fieldset></div>
<div class="financePreview" id="financePreview" aria-live="polite">Choose your name, add an amount, and select players to preview the split.</div>
<div id="financeMessage" role="status" aria-live="polite"></div><button id="financeSave" class="primary" type="submit" disabled>Create Request</button><button id="financeCancelEdit" type="button" hidden>Cancel edit</button></form></div>
<div class="financeSectionHead financeLogHeading"><h2>Request log</h2><button id="financeRefresh" type="button">Refresh</button></div><div id="financeLog"></div>${demo?'<button id="financeClearDemo" class="financeTextButton" type="button">Clear sandbox entries</button>':''}`;
function message(text,error=false){el('financeMessage').textContent=text;el('financeMessage').className=error?'financeError':'financeSuccess';}
function syncRoster(){
  const signature=people().map(p=>p.id+':'+p.name).join('|');if(signature===roster)return;roster=signature;
  const author=el('financeAuthor').value,values=Object.fromEntries(['participants','payers','recipients'].map(g=>[g,selected(g)]));
  el('financeAuthor').innerHTML=options();el('financeAuthor').value=author;
  for(const group of ['participants','payers','recipients']){
    const grid=host.querySelector(`[data-fin-group="${group}"]`)?.closest('.financeChecks');
    if(grid){grid.outerHTML=checks(group);host.querySelectorAll(`[data-fin-group="${group}"]`).forEach(x=>x.checked=values[group].includes(x.value));}
  }
}
function input(){return {author:el('financeAuthor').value,kind:el('financeKind').value,description:el('financeDescription').value,amount:el('financeAmount').value,betMode:el('financeBetMode').value,participants:selected('participants'),payers:selected('payers'),recipients:selected('recipients')};}
function groups(){
  const split=el('financeKind').value==='split',author=el('financeAuthor').value;
  el('financeSplitGroup').hidden=!split;el('financeBetGroup').hidden=split;el('financeBetModeWrap').hidden=split;
  el('financeAmountLabel').textContent=split?'Total bill you paid':'Amount EACH contributor owes';
  host.querySelectorAll('[data-fin-group="participants"]').forEach(x=>{x.disabled=x.value===author;if(x.disabled)x.checked=true;else if(x.dataset.auto==='1')x.checked=false;x.dataset.auto=x.disabled?'1':'0';});
  const payers=selected('payers'),recipients=selected('recipients'),team=el('financeBetMode').value==='team';
  host.querySelectorAll('[data-fin-group="payers"]').forEach(x=>x.disabled=!team&&recipients.includes(x.value)&&!x.checked);
  host.querySelectorAll('[data-fin-group="recipients"]').forEach(x=>x.disabled=!team&&payers.includes(x.value)&&!x.checked);
}
function betBreakdown(c,id){return `<small class="financeAllocation">Contributes ${F.money(c.payers.includes(id)?c.amount_cents:0)} · Receives ${F.money(c.shares[id]||0)}</small>`;}
function preview(){
  groups();el('financeSave').disabled=!ready||busy;
  try{
    const c=F.calculate(input()),split=c.kind==='split';
    const rows=split?c.participants.map(id=>`<div><span>${escape(name(id))}${id===c.author?' · paid the bill':''}</span><b>${F.money(c.shares[id])} share</b></div>`):c.participants.map(id=>`<div><span>${escape(name(id))}${betBreakdown(c,id)}</span><b>${c.net[id]<0?'Net owes':c.net[id]>0?'Net gets':'Even ·'} ${F.money(Math.abs(c.net[id]))}</b></div>`);
    el('financePreview').innerHTML=`<small>BEFORE YOU SAVE</small><h3>${split?`${F.money(c.total_cents)} split ${c.participants.length} ways`:`${c.payers.length} × ${F.money(c.amount_cents)} = ${F.money(c.total_cents)} owed`}</h3>${rows.join('')}${split?`<p>${escape(name(c.author))} gets back <b>${F.money(c.net[c.author])}</b>.</p>`:''}<p class="muted">${new Set(Object.values(c.shares)).size>1?'Extra cents are assigned in player ID order so every cent is accounted for.':''}</p>`;
  }catch(e){el('financePreview').textContent=e.message;el('financeSave').disabled=true;}
}
function render(){
  const net=F.balances(records),active=records.filter(r=>!r.cancelled),outstanding=Object.values(net).filter(n=>n>0).reduce((a,b)=>a+b,0);
  el('financeBalanceSummary').textContent=`${active.length} request${active.length===1?'':'s'} · ${F.money(outstanding)} to settle`;
  const ids=[...new Set([...people().map(p=>p.id),...Object.keys(net)])];
  el('financeBalanceList').innerHTML=ids.map(id=>`<div class="financeBalanceRow"><span>${escape(name(id))}</span><b class="${(net[id]||0)>0?'financeCredit':(net[id]||0)<0?'financeDebit':''}">${net[id]>0?'Gets back ':net[id]<0?'Owes ':'Settled · '}${F.money(Math.abs(net[id]||0))}</b></div>`).join('');
  const who=el('financeAuthor').value,admin=!demo&&sessionStorage.getItem('ll-admin-ok')==='1';
  el('financeLog').innerHTML=records.length?records.map(r=>{
    const c=F.calculate(r.input),canEdit=who===r.created_by||admin;
    return `<details class="card financeEntry ${r.cancelled?'financeCancelled':''}" data-fin-entry="${escape(r.id)}"><summary><span><small>${c.kind==='split'?'SPLIT COST':c.betMode==='team'?'TEAM BET':'BET'}${r.cancelled?' · CANCELLED':''}</small><b>${escape(c.description)}</b><span>${escape(name(r.created_by))} · ${new Date(r.created_at).toLocaleDateString([],{month:'short',day:'numeric'})}</span></span><strong>${F.money(c.total_cents)}</strong></summary><div class="financeEntryBody"><p>${c.kind==='split'?`${escape(name(c.author))} paid ${F.money(c.total_cents)}. Their own share is ${F.money(c.shares[c.author])}.`:`Each contributor owes ${F.money(c.amount_cents)}. ${F.money(c.total_cents)} total is divided among ${c.recipients.length} winner${c.recipients.length===1?'':'s'}.`}</p>${c.participants.map(id=>`<div class="financeBalanceRow"><span>${escape(name(id))}${c.kind==='bet'?betBreakdown(c,id):''}</span><b>${c.net[id]>0?'Gets back':c.net[id]<0?'Owes':'Net'} ${F.money(Math.abs(c.net[id]))}</b></div>`).join('')}<p class="muted">Entered ${new Date(r.created_at).toLocaleString()}${r.revision>1?` · Revised ${r.revision-1} time${r.revision===2?'':'s'}`:''}</p>${(r.history||[]).length?`<details><summary>Change history</summary>${r.history.map(h=>`<p class="muted">${escape(h.action)} by ${escape(name(h.by))} · ${new Date(h.at).toLocaleString()}<br>${escape(h.input.description)} · ${F.money(F.calculate(h.input).total_cents)}</p>`).join('')}</details>`:''}${canEdit&&!r.cancelled?'<div class="financeActions"><button data-fin-action="edit" type="button">Edit request</button><button data-fin-action="cancel" type="button">Cancel request</button></div>':!r.cancelled?'<p class="muted">Select the creator’s name above to correct this request. Names are self-selected.</p>':''}</div></details>`;
  }).join(''):'<div class="card financeEmpty"><b>A clean scorecard.</b><p>No expenses or bets entered yet.</p></div>';
}
function reset(){editing=null;el('financeForm').reset();host.querySelectorAll('[data-fin-group]').forEach(x=>{x.checked=false;x.dataset.auto='0';});el('financeFormTitle').textContent='New request';el('financeSave').textContent='Create Request';el('financeCancelEdit').hidden=true;dirty=false;message('');preview();render();}
async function load(){
  if(loadBusy||busy)return;syncRoster();loadBusy=true;el('financeRefresh').disabled=true;
  try{
    let rows;
    if(demo){rows=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(rows))throw Error('Sandbox storage is invalid.');}
    else{const q=await sb.from('finance_requests').select('*').eq('event_id',EVENT).order('created_at',{ascending:false});if(q.error)throw q.error;rows=q.data||[];}
    rows.forEach(r=>F.calculate(r.input));records=rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));ready=true;message('');render();
  }catch(e){ready=false;message(demo?'Could not load sandbox entries: '+e.message:'Shared finances is not available yet. The Finances database setup must be approved and installed before requests can be saved.',true);}
  finally{loadBusy=false;el('financeRefresh').disabled=false;preview();}
}
async function persist(next,previous){
  if(demo){
    const fresh=JSON.parse(localStorage.getItem(KEY)||'[]'),old=fresh.find(r=>r.id===next.id);
    if(previous&&old?.revision!==previous.revision)throw Error('This entry changed in another tab. Refresh and try again.');
    const updated=previous?fresh.map(r=>r.id===next.id?next:r):[next,...fresh];localStorage.setItem(KEY,JSON.stringify(updated));
  }else{
    let q=previous?sb.from('finance_requests').update(next).eq('event_id',EVENT).eq('id',next.id).eq('revision',previous.revision):sb.from('finance_requests').insert(next);
    const result=await q.select('id');if(result.error)throw result.error;if(result.data?.length!==1)throw Error('This entry changed. Refresh and try again.');
  }
}
el('financeForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!ready)return;
  try{
    const value=input();F.calculate(value);const previous=editing?records.find(r=>r.id===editing):null;
    if(editing&&!previous)throw Error('The original entry is unavailable. Refresh and try again.');
    if(previous&&value.author!==previous.created_by&&!(!demo&&sessionStorage.getItem('ll-admin-ok')==='1'))throw Error('Select the creator’s name to edit this request.');
    const now=new Date().toISOString(),next={id:previous?.id||crypto.randomUUID(),event_id:EVENT,created_by:previous?.created_by||value.author,input:value,cancelled:false,created_at:previous?.created_at||now,updated_at:now,revision:(previous?.revision||0)+1,history:previous?[...(previous.history||[]),{action:'Edited',by:value.author,at:now,input:previous.input}]:[]};
    busy=true;preview();await persist(next,previous);busy=false;reset();await load();message(previous?'Request updated.':'Request added to the weekend ledger.');
  }catch(e){busy=false;message(e.message,true);preview();}
});
host.addEventListener('change',e=>{
  if(e.target.matches('[data-fin-group]')&&el('financeBetMode').value==='individual'&&e.target.checked){const group=e.target.dataset.finGroup;if(group!=='participants')host.querySelectorAll(`[data-fin-group="${group}"]`).forEach(x=>{if(x!==e.target)x.checked=false;});}
  if(e.target.id==='financeBetMode'&&e.target.value==='individual'){for(const group of ['payers','recipients']){const first=selected(group)[0];host.querySelectorAll(`[data-fin-group="${group}"]`).forEach(x=>x.checked=x.value===first);}}
  dirty=true;preview();if(e.target.id==='financeAuthor')render();
});
el('financeForm').addEventListener('input',()=>{dirty=true;preview();});
el('financeReset').onclick=()=>{if(!dirty||confirm('Clear the unsaved request?'))reset();};el('financeCancelEdit').onclick=reset;
el('financeRefresh').onclick=load;
el('financeLog').addEventListener('click',async e=>{
  const button=e.target.closest('[data-fin-action]');if(!button||busy)return;
  const row=records.find(r=>r.id===button.closest('[data-fin-entry]').dataset.finEntry);if(!row)return;
  if(button.dataset.finAction==='edit'){
    if(dirty&&!confirm('Replace the unsaved form with this request?'))return;
    reset();editing=row.id;const i=row.input;
    el('financeAuthor').value=i.author;el('financeKind').value=i.kind;el('financeDescription').value=i.description;el('financeAmount').value=i.amount;el('financeBetMode').value=i.betMode||'individual';
    for(const group of ['participants','payers','recipients'])host.querySelectorAll(`[data-fin-group="${group}"]`).forEach(x=>x.checked=(i[group]||[]).includes(x.value));
    el('financeFormTitle').textContent='Edit request';el('financeSave').textContent='Save Changes';el('financeCancelEdit').hidden=false;dirty=true;preview();el('financeFormTitle').scrollIntoView({behavior:'smooth',block:'center'});
  }else if(confirm('Cancel this request? It will remain in the log but stop affecting balances.')){
    busy=true;preview();
    try{const now=new Date().toISOString();await persist({...row,cancelled:true,updated_at:now,revision:row.revision+1,history:[...(row.history||[]),{action:'Cancelled',by:el('financeAuthor').value,at:now,input:row.input}]},row);busy=false;if(editing===row.id)reset();await load();message('Request cancelled.');}
    catch(error){busy=false;message(error.message,true);preview();}
  }
});
if(demo){el('financeClearDemo').onclick=()=>{if(confirm('Clear all sandbox entries in this browser?')){localStorage.removeItem(KEY);reset();load();}};window.addEventListener('storage',e=>{if(e.key===KEY)load();});}
window.LLFinances={load,isDirty:()=>dirty};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
preview();load();
})();
