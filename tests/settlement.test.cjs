const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance-core.js');
function verify(net,plan){
 const received=Object.fromEntries(Object.keys(net).map(id=>[id,0]));
 for(const p of plan.payments){assert.ok(Number.isSafeInteger(p.amount_cents)&&p.amount_cents>0);assert.ok(net[p.from]<0);assert.ok(net[p.to]>0);received[p.from]-=p.amount_cents;received[p.to]+=p.amount_cents;}
 assert.deepEqual(received,Object.fromEntries(Object.entries(net).map(([id,v])=>[id,v||0])));
 assert.equal(plan.transaction_count,plan.payments.length);
 assert.equal(plan.total_cents,Object.values(net).filter(v=>v>0).reduce((s,v)=>s+v,0));
 assert.equal(plan.payments.reduce((s,p)=>s+p.amount_cents,0),plan.total_cents);
}
// Independent exhaustive debt-matching search used only as a small-case oracle.
function minimum(values){
 const a=values.filter(v=>v!==0);
 function search(start){while(start<a.length&&a[start]===0)start++;if(start===a.length)return 0;let best=Infinity;const tried=new Set();for(let i=start+1;i<a.length;i++)if(a[i]*a[start]<0&&!tried.has(a[i])){tried.add(a[i]);a[i]+=a[start];best=Math.min(best,1+search(start+1));a[i]-=a[start];}return best;}
 return search(0);
}
test('empty and fully netted ledgers need no payments',()=>{
 assert.deepEqual(F.settle({}),{payments:[],total_cents:0,transaction_count:0});
 verify({a:0,b:0},F.settle({a:0,b:0}));
});
test('exact solution improves on largest-first greedy matching',()=>{
 const net={a:-600,b:-400,c:-400,d:800,e:600},copy={...net};
 const p=F.settle(net);verify(net,p);assert.equal(p.transaction_count,3);assert.deepEqual(net,copy);
});
test('one debtor or creditor settles through the needed direct payments',()=>{
 for(const net of [{a:-900,b:400,c:500},{a:900,b:-400,c:-500}]){const p=F.settle(net);verify(net,p);assert.equal(p.transaction_count,2);}
});
test('12-person prize pool settles to four winners in eight payments',()=>{
 const payers=Array.from({length:12},(_,i)=>'p'+i),input={kind:'bet',author:'p0',description:'Pool',amount:'20',betMode:'team',payers,recipients:payers.slice(0,4)};
 const net=F.balances([{input}]),plan=F.settle(net);verify(net,plan);assert.equal(plan.transaction_count,8);assert.equal(plan.total_cents,16000);
});
test('odd cents, zero balances and reversed input order preserve exact results',()=>{
 const net={a:-1,b:-2,c:1,d:2,e:0},plan=F.settle(net);verify(net,plan);assert.equal(plan.transaction_count,2);
 assert.deepEqual(F.settle(Object.fromEntries(Object.entries(net).reverse())),plan);
});
test('unequal group totals fail safely; fractional and unsafe cents are rejected',()=>{
 for(const net of [{a:1},{a:1,b:-2},{a:1.5,b:-1.5},{a:NaN},{a:Infinity},{a:9007199254740992,b:-9007199254740992}])assert.throws(()=>F.settle(net));
});
test('exact count matches exhaustive independent oracle over varied small ledgers',()=>{
 let seed=512;function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 for(let k=0;k<150;k++){
  const values=Array.from({length:2+random(7)},()=>random(19)-9);values.push(-values.reduce((a,b)=>a+b,0));
  const net=Object.fromEntries(values.map((v,i)=>['p'+i,v])),plan=F.settle(net);verify(net,plan);assert.equal(plan.transaction_count,minimum(values),JSON.stringify(values));
 }
});
test('20-player supported group returns a provably minimal ten-payment plan',()=>{
 const net={};for(let i=1;i<=10;i++){net['d'+i]=-i;net['c'+i]=i;}
 const p=F.settle(net);verify(net,p);assert.equal(p.transaction_count,10);
});
test('edits and cancellations generate new plans from current balances',()=>{
 const base={kind:'bet',author:'a',description:'Bet',amount:'20',betMode:'individual',payers:['b'],recipients:['a']};
 const records=[{input:base}],first=F.settle(F.balances(records));assert.equal(first.total_cents,2000);
 records[0].input={...base,amount:'10'};assert.equal(F.settle(F.balances(records)).total_cents,1000);
 records[0].cancelled=true;assert.equal(F.settle(F.balances(records)).transaction_count,0);
});
