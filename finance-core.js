/* Exact-cent ledger calculations, shared by the site and offline tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LLFinance=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const MAX=100000000;
  function cents(value){
    const text=String(value).trim();
    if(!/^\d+(\.\d{1,2})?$/.test(text))throw Error('Enter a positive dollar amount with at most two decimal places.');
    const [d,c='']=text.split('.'),n=Number(d)*100+Number(c.padEnd(2,'0'));
    if(!Number.isSafeInteger(n)||n<=0||n>MAX)throw Error('Enter an amount between $0.01 and $1,000,000.00.');
    return n;
  }
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
  function ids(values){if(!Array.isArray(values))throw Error('Choose players.');return [...new Set(values)].filter(x=>typeof x==='string'&&x).sort();}
  function divide(total,people){
    if(!people.length)throw Error('Choose at least one player.');
    return Object.fromEntries(people.map((id,i)=>[id,Math.floor(total/people.length)+(i<total%people.length?1:0)]));
  }
  function calculate(input){
    const amount=cents(input.amount),author=input.author;
    if(!author)throw Error('Select your name.');
    if(!String(input.description||'').trim())throw Error('Add a description.');
    if(String(input.description).trim().length>160)throw Error('Keep the description under 160 characters.');
    let participants,recipients,payers,shares,net,total;
    if(input.kind==='split'){
      participants=ids([author,...ids(input.participants||[])]);
      if(participants.length<2)throw Error('Select at least one other player sharing the bill.');
      total=amount;shares=divide(total,participants);recipients=[author];payers=participants.filter(x=>x!==author);
      net=Object.fromEntries(participants.map(id=>[id,(id===author?total:0)-shares[id]]));
    }else if(input.kind==='bet'){
      payers=ids(input.payers||[]);recipients=ids(input.recipients||[]);
      if(!payers.length||!recipients.length)throw Error('Choose who owes and who gets paid.');
      if(payers.some(id=>recipients.includes(id)))throw Error('A player cannot be on both sides of the same bet.');
      if(!['individual','team'].includes(input.betMode))throw Error('Choose individual or team bet.');
      if(input.betMode==='individual'&&(payers.length!==1||recipients.length!==1))throw Error('Individual bets need one player on each side.');
      total=amount*payers.length;
      if(total>MAX)throw Error('The total bet cannot exceed $1,000,000.00.');
      shares=divide(total,recipients);participants=ids([...payers,...recipients]);
      net=Object.fromEntries(participants.map(id=>[id,payers.includes(id)?-amount:shares[id]]));
    }else throw Error('Choose Split Cost or Bet.');
    return {kind:input.kind,author,description:String(input.description).trim(),amount_cents:amount,total_cents:total,participants,recipients,payers,shares,net,betMode:input.kind==='bet'?input.betMode:null};
  }
  function balances(records){const net={};for(const r of records){if(r.cancelled)continue;const c=calculate(r.input);for(const [id,n]of Object.entries(c.net))net[id]=(net[id]||0)+n;}return net;}
  return {cents,money,calculate,balances};
});
