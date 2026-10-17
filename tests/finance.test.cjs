const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance-core.js');
const split={kind:'split',author:'blake',description:'Groceries',amount:'120',participants:['chad','adam','greg']};
const bet={kind:'bet',author:'blake',description:'Sunday match',amount:'20',betMode:'team',payers:['adam','greg'],recipients:['blake','chad']};
const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
test('payer shares equally in a total bill; payer checkbox cannot double-charge',()=>{
 const c=F.calculate({...split,participants:[...split.participants,'blake','blake']});
 assert.deepEqual(c.net,{adam:-3000,blake:9000,chad:-3000,greg:-3000});
 assert.equal(sum(c.net),0);assert.equal(c.total_cents,12000);
});
test('team bet is $20 per loser, not $40 per loser',()=>{
 const c=F.calculate(bet);assert.equal(c.total_cents,4000);
 assert.deepEqual(c.net,{adam:-2000,blake:2000,chad:2000,greg:-2000});
});
test('uneven cents are conserved and independent of selection order',()=>{
 const a=F.calculate({...split,amount:'10',participants:['chad','adam']});
 const b=F.calculate({...split,amount:'10',participants:['adam','chad']});
 assert.deepEqual(a,b);assert.equal(sum(a.shares),1000);assert.equal(a.shares.adam,334);assert.equal(sum(a.net),0);
});
test('unequal-sized teams distribute winnings exactly',()=>{
 const c=F.calculate({...bet,amount:'0.01',payers:['adam'],recipients:['blake','chad','greg']});
 assert.equal(c.total_cents,1);assert.equal(sum(c.net),0);assert.equal(sum(c.shares),1);
});
test('individual bet validates both sides and rejects overlap',()=>{
 assert.throws(()=>F.calculate({...bet,betMode:'individual'}),/one player/);
 const c=F.calculate({...bet,betMode:'individual',payers:['adam'],recipients:['blake']});assert.equal(c.net.blake,2000);
 assert.throws(()=>F.calculate({...bet,payers:['blake']}),/both sides/);
 assert.throws(()=>F.calculate({...bet,recipients:[]}),/who gets paid/);
});
test('amount and participant validation rejects bad requests',()=>{
 for(const x of ['-1','0','1.005','NaN','Infinity','1e3','1000000.01','',null])assert.throws(()=>F.cents(x));
 assert.equal(F.cents('0.01'),1);assert.equal(F.cents('25.5'),2550);assert.equal(F.cents('1000000'),100000000);
 assert.throws(()=>F.calculate({...split,author:''}),/name/);
 assert.throws(()=>F.calculate({...split,description:' '}),/description/);
 assert.throws(()=>F.calculate({...split,participants:[]}),/other player/);
 assert.throws(()=>F.calculate({...bet,amount:'1000000'}),/total bet/);
});
test('combined balances, edits and cancellations use active current requests only',()=>{
 const rows=[{input:split},{input:bet}];let b=F.balances(rows);
 assert.equal(b.blake,11000);assert.equal(b.adam,-5000);assert.equal(sum(b),0);
 rows[1].input={...bet,amount:'10'};assert.equal(F.balances(rows).blake,10000);
 rows[0].cancelled=true;b=F.balances(rows);assert.equal(b.blake,1000);assert.equal(sum(b),0);
 assert.deepEqual(F.balances([]),{});
});
test('many amounts and group sizes always conserve cents',()=>{
 for(let n=2;n<=18;n++)for(const amount of ['0.01','0.02','1','10.99','1234.57']){
  const participants=Array.from({length:n-1},(_,i)=>'p'+i);
  const c=F.calculate({...split,participants,amount});assert.equal(sum(c.net),0);assert.equal(sum(c.shares),F.cents(amount));
  assert.ok(Math.max(...Object.values(c.shares))-Math.min(...Object.values(c.shares))<=1);
 }
});
test('Finances tab follows Players and integration scripts load in dependency order',()=>{
 const fs=require('node:fs'),p=require('node:path');const html=fs.readFileSync(p.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/<button data-v="players">Players<\/button><button data-v="finances">Finances<\/button>/);
 assert.ok(html.indexOf('src="app.js')<html.indexOf('src="finance-core.js'));
 assert.ok(html.indexOf('src="finance-core.js')<html.indexOf('src="finances.js'));
});
