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
 assert.throws(()=>F.calculate({...bet,betMode:'individual',payers:['blake'],recipients:['blake']}),/both sides/);
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

test('12 contributors at $20 with four contributing winners nets each winner $40',()=>{
 const payers=Array.from({length:12},(_,i)=>'player'+String(i).padStart(2,'0'));
 const recipients=payers.slice(0,4),input={...bet,payers,recipients};
 const c=F.calculate(input);assert.equal(c.total_cents,24000);assert.equal(c.participants.length,12);
 for(const id of recipients){assert.equal(c.shares[id],6000);assert.equal(c.net[id],4000);}
 for(const id of payers.slice(4))assert.equal(c.net[id],-2000);
 assert.equal(sum(c.net),0);assert.deepEqual(F.balances([{input}]),c.net);
 assert.deepEqual(F.balances([{input,cancelled:true}]),{});
});

test('overlapping pools conserve odd cents and allow all contributors to win',()=>{
 const c=F.calculate({...bet,amount:'0.01',payers:['a','b','c'],recipients:['a','b']});
 assert.deepEqual(c.net,{a:1,b:0,c:-1});assert.equal(sum(c.net),0);
 const even=F.calculate({...bet,payers:['a','b'],recipients:['a','b']});
 assert.deepEqual(even.net,{a:0,b:0});
});

test('team form permits selecting contributors as recipients; individual overlap can be unchecked',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const ui=fs.readFileSync(path.join(__dirname,'../finances.js'),'utf8');
 const code=ui.slice(ui.indexOf('function groups(){'),ui.indexOf('function betBreakdown('));
 const payers=Array.from({length:12},(_,i)=>({value:'p'+i,checked:true,disabled:false}));
 const recipients=payers.map(x=>({value:x.value,checked:false,disabled:true}));
 const fields={financeKind:{value:'bet'},financeAuthor:{value:'p0'},financeBetMode:{value:'team'},financeSplitGroup:{},financeBetGroup:{},financeBetModeWrap:{},financeAmountLabel:{}};
 const sets={payers,recipients,participants:[]};
 const context=vm.createContext({el:id=>fields[id],selected:g=>sets[g].filter(x=>x.checked).map(x=>x.value),host:{querySelectorAll:selector=>sets[selector.match(/data-fin-group="([^"]+)"/)[1]]}});
 vm.runInContext(code,context);vm.runInContext('groups()',context);
 assert.ok(recipients.every(x=>!x.disabled));
 for(const x of recipients.slice(0,4))x.checked=true;
 vm.runInContext('groups()',context);assert.ok(payers.every(x=>!x.disabled));assert.ok(recipients.every(x=>!x.disabled));
 fields.financeBetMode.value='individual';vm.runInContext('groups()',context);
 assert.equal(recipients[0].disabled,false);assert.equal(payers[0].disabled,false);
});
