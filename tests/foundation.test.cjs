const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CURRENT=app.match(/const APP_RELEASE="([^"]+)"/)[1];
const releaseCode = app.slice(app.indexOf('const APP_RELEASE='), app.indexOf('const sb='));

function browser({version='99.2', url='https://example.test/legends-of-lake-lure/?intro=1#cup', storage=new Map(), blocked=false}={}) {
  const navigations=[];
  let response={ok:true,json:async()=>({version})};
  const context=vm.createContext({URL, Date, window:{}, document:{activeElement:null},
    scoreViewActive:()=>false, sessionStorage:{
      getItem:key=>{if(blocked)throw Error('storage blocked');return storage.get(key);},
      setItem:(key,value)=>{if(blocked)throw Error('storage blocked');storage.set(key,value);}
    }, location:{href:url,replace:value=>navigations.push(value)},
    fetch:async()=>{if(response instanceof Error)throw response;return response;}
  });
  vm.runInContext(releaseCode,context);
  return {context, storage, navigations, run:code=>vm.runInContext(code,context),
    respond:value=>{response=value;}};
}

test('current release never reloads; malformed or failed checks are harmless', async()=>{
  const b=browser({version:CURRENT});
  await b.run('checkAppRelease()');
  for (const version of [null,42,'',{},'  ']) {
    b.respond({ok:true,json:async()=>({version})});
    await b.run('checkAppRelease()');
  }
  b.respond({ok:false}); await b.run('checkAppRelease()');
  b.respond(Error('offline')); await b.run('checkAppRelease()');
  b.respond({ok:true,json:async()=>{throw Error('invalid JSON');}}); await b.run('checkAppRelease()');
  assert.equal(b.navigations.length,0);
  assert.equal(b.run('releaseCheckBusy'),false);
});

test('stale app reloads once, preserving the route, and later releases can update', async()=>{
  const b=browser();
  await b.run('checkAppRelease()'); await b.run('checkAppRelease()');
  assert.equal(b.navigations.length,1);
  const target=new URL(b.navigations[0]);
  assert.equal(target.searchParams.get('intro'),'1');
  assert.equal(target.hash,'#cup');
  assert.equal(target.searchParams.get('release'),'99.2');
  const stale=browser({storage:b.storage});
  await stale.run('checkAppRelease()'); assert.equal(stale.navigations.length,0);
  stale.respond({ok:true,json:async()=>({version:'99.3'})});
  await stale.run('checkAppRelease()'); assert.equal(stale.navigations.length,1);
  stale.respond({ok:true,json:async()=>({version:'99.2'})});
  await stale.run('checkAppRelease()'); assert.equal(stale.navigations.length,1);
});

test('URL guard prevents a reload loop even with blocked sessionStorage', async()=>{
  const b=browser({blocked:true}); await b.run('checkAppRelease()');
  const stale=browser({blocked:true,url:b.navigations[0]});
  await stale.run('checkAppRelease()'); await stale.run('checkAppRelease()');
  assert.equal(stale.navigations.length,0);
});

test('score entry and focused controls defer updates until navigation is safe', async()=>{
  for (const tag of ['INPUT','TEXTAREA','SELECT','score']) {
    const b=browser();
    if(tag==='score')b.context.scoreViewActive=()=>true;
    else b.context.document.activeElement={tagName:tag};
    await b.run('checkAppRelease()'); b.run('applyPendingRelease()');
    assert.equal(b.navigations.length,0);
    b.context.document.activeElement=null; b.context.scoreViewActive=()=>false;
    b.run('applyPendingRelease()'); b.run('applyPendingRelease()');
    assert.equal(b.navigations.length,1);
  }
});

test('a matching release clears a deferred outdated update', async()=>{
  const b=browser(); b.context.scoreViewActive=()=>true;
  await b.run('checkAppRelease()');
  b.respond({ok:true,json:async()=>({version:CURRENT})}); await b.run('checkAppRelease()');
  b.context.scoreViewActive=()=>false; b.run('applyPendingRelease()');
  assert.equal(b.navigations.length,0);
});

test('overlapping release checks share a single in-flight request', async()=>{
  const b=browser(); let resolve, requests=0;
  b.context.fetch=()=>{requests++;return new Promise(r=>{resolve=r;});};
  const first=b.run('checkAppRelease()'); await b.run('checkAppRelease()');
  assert.equal(requests,1);
  resolve({ok:true,json:async()=>({version:CURRENT})}); await first;
});

test('release files agree and referenced local assets exist',()=>{
  const version=JSON.parse(fs.readFileSync(path.join(root,'release.json'))).version;
  assert.equal(app.match(/const APP_RELEASE="([^"]+)"/)[1],version);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if(/^https?:/.test(url))continue;
    assert.ok(fs.existsSync(path.join(root,url.split('?')[0])),`Missing ${url}`);
  }
  for(const asset of ['app.js','data.js','styles.css','manifest.webmanifest']) {
    assert.ok(html.includes(`${asset}?v=${version.replaceAll('.','')}`));
  }
});

test('manifest stays within the GitHub Pages project and icons have declared dimensions',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest')));
  const base=new URL('https://example.test/legends-of-lake-lure/');
  assert.equal(new URL(manifest.start_url,base).href,base.href);
  assert.equal(new URL(manifest.scope,base).href,base.href);
  for(const icon of manifest.icons) {
    const png=fs.readFileSync(path.join(root,icon.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
});

test('unsaved finance drafts defer release updates after focus moves away',async()=>{
 const b=browser();b.context.window.LLFinances={isDirty:()=>true};
 await b.run('checkAppRelease()');assert.equal(b.navigations.length,0);
 b.context.window.LLFinances.isDirty=()=>false;b.run('applyPendingRelease()');
 assert.equal(b.navigations.length,1);
});
