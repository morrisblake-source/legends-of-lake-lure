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
      if(input.betMode==='individual'&&payers.some(id=>recipients.includes(id)))throw Error('A player cannot be on both sides of an individual bet.');
      if(!['individual','team'].includes(input.betMode))throw Error('Choose individual or team bet.');
      if(input.betMode==='individual'&&(payers.length!==1||recipients.length!==1))throw Error('Individual bets need one player on each side.');
      total=amount*payers.length;
      if(total>MAX)throw Error('The total bet cannot exceed $1,000,000.00.');
      shares=divide(total,recipients);participants=ids([...payers,...recipients]);
      net=Object.fromEntries(participants.map(id=>[id,(shares[id]||0)-(payers.includes(id)?amount:0)]));
    }else throw Error('Choose Split Cost or Bet.');
    return {kind:input.kind,author,description:String(input.description).trim(),amount_cents:amount,total_cents:total,participants,recipients,payers,shares,net,betMode:input.kind==='bet'?input.betMode:null};
  }
  function balances(records){const net={};for(const r of records){if(r.cancelled)continue;const c=calculate(r.input);for(const [id,n]of Object.entries(c.net))net[id]=(net[id]||0)+n;}return net;}
  // Every connected payment group must sum to zero. Maximizing the number
  // of disjoint zero-sum groups therefore minimizes payments: n - groups.
  // Subset DP finds that exact maximum, rather than a greedy approximation.
  function settle(net){
    const entries=Object.entries(net).sort(([a],[b])=>a.localeCompare(b));
    if(entries.some(([,v])=>!Number.isSafeInteger(v)))throw Error('Balances must be whole cents.');
    const active=entries.filter(([,v])=>v!==0),n=active.length;
    const total=active.filter(([,v])=>v>0).reduce((s,[,v])=>s+v,0);
    const owed=active.filter(([,v])=>v<0).reduce((s,[,v])=>s-v,0);
    if(!Number.isSafeInteger(total)||!Number.isSafeInteger(owed)||total!==owed)throw Error('Balances do not balance. Refresh the ledger and try again.');
    if(!n)return {payments:[],total_cents:0,transaction_count:0};
    if(n>20)throw Error('Exact settlement supports up to 20 players with a nonzero balance.');
    const size=1<<n,sums=new Float64Array(size),groups=new Uint8Array(size),parent=new Uint8Array(size);
    for(let mask=1;mask<size;mask++){
      const low=mask&-mask,index=31-Math.clz32(low);
      sums[mask]=sums[mask^low]+active[index][1];
      let best=-1;
      for(let bits=mask;bits;bits&=bits-1){
        const bit=bits&-bits,i=31-Math.clz32(bit),score=groups[mask^bit];
        if(score>best){best=score;parent[mask]=i;}
      }
      groups[mask]=best+(sums[mask]===0?1:0);
    }
    const order=[];for(let mask=size-1;mask;){const i=parent[mask];order.push(i);mask^=1<<i;}order.reverse();
    const partitions=[];let partition=[],sum=0;
    for(const i of order){partition.push(active[i]);sum+=active[i][1];if(sum===0){partitions.push(partition);partition=[];}}
    const payments=[];
    for(const part of partitions){
      const debtors=part.filter(([,v])=>v<0).map(([id,v])=>({id,amount:-v}));
      const creditors=part.filter(([,v])=>v>0).map(([id,v])=>({id,amount:v}));
      let d=0,c=0;
      while(d<debtors.length&&c<creditors.length){
        const amount=Math.min(debtors[d].amount,creditors[c].amount);
        payments.push({from:debtors[d].id,to:creditors[c].id,amount_cents:amount});
        debtors[d].amount-=amount;creditors[c].amount-=amount;
        if(!debtors[d].amount)d++;if(!creditors[c].amount)c++;
      }
    }
    return {payments,total_cents:total,transaction_count:payments.length};
  }
  return {cents,money,calculate,balances,settle};

});
