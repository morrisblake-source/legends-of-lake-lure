/* Supabase verifies identity; database policies decide every admin write. */
(function(){
'use strict';
const senderReady=false; // Set true after custom SMTP delivery is configured and verified.
const redirect='https://morrisblake-source.github.io/legends-of-lake-lure/';
let role=null,email='',busy=false,request=0;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const overlay=document.createElement('div');overlay.id='adminSignIn';overlay.className='pinOverlay';overlay.hidden=true;document.body.append(overlay);
const tools=document.createElement('div');tools.className='adminAccount';document.querySelector('#modal h2').after(tools);
function isAdmin(){return role==='owner'||role==='admin';}
function sync(){
 sessionStorage.removeItem('ll-admin-ok');
 document.getElementById('admin').textContent=isAdmin()?'⚙ Admin':'Sign in as Admin';
 tools.innerHTML=isAdmin()?`<small>${escape(email)}${role==='owner'?' · Owner':''}</small><div>${role==='owner'?'<button id=adminAccess>Admin Access</button>':''}<button id=adminSignOut>Sign out</button></div>`:'';
 document.getElementById('adminAccess')?.addEventListener('click',access);
 document.getElementById('adminSignOut')?.addEventListener('click',signOut);
 if(!isAdmin()){document.getElementById('modal').classList.remove('on');sessionStorage.removeItem('ll-scoring-unlocked-2026');}
}
async function refresh(){
 const token=++request;
 try{
  const user=await sb.auth.getUser();if(user.error)throw user.error;
  if(!user.data.user){if(token===request){role=null;email='';sync();}return false;}
  const response=await sb.rpc('ll_admin_session');if(response.error)throw response.error;
  if(token!==request)return isAdmin();
  role=['owner','admin'].includes(response.data)?response.data:null;email=user.data.user.email||'';sync();return isAdmin();
 }catch(error){if(token===request){role=null;email='';sync();}return false;}
}
function showLogin(message=''){
 overlay.hidden=false;overlay.innerHTML=`<form class=pinBox><button type=button id=adminLoginClose aria-label="Close sign-in">×</button><h3>Sign in as Admin</h3><p>Use an approved email address. You’ll stay signed in on this device until you sign out or your session expires.</p><label>Email<input id=adminEmail type=email autocomplete=email required maxlength=254></label><button class=primary id=adminEmailLink>Send sign-in link</button><p id=adminLoginMessage role=status>${escape(message)}</p></form>`;
 overlay.querySelector('form').onsubmit=sendLink;document.getElementById('adminLoginClose').onclick=()=>overlay.hidden=true;
 document.getElementById('adminEmail').focus();
}
async function sendLink(event){
 event.preventDefault();if(busy)return;const input=document.getElementById('adminEmail'),message=document.getElementById('adminLoginMessage'),button=document.getElementById('adminEmailLink');
 const value=input.value.trim().toLowerCase();if(!input.checkValidity()){input.reportValidity();return;}
 busy=true;button.disabled=true;message.textContent='Sending…';
 try{const r=await sb.auth.signInWithOtp({email:value,options:{emailRedirectTo:redirect,shouldCreateUser:true}});if(r.error)throw r.error;message.textContent='Check your email for the sign-in link. Only approved emails can open Admin.';}
 catch(error){message.textContent=error.message||'Could not send the sign-in link. Try again.';}
 finally{busy=false;button.disabled=false;}
}
async function open(){
 if(!await refresh()){showLogin('Sign in with an approved email to manage the trip.');return;}
 overlay.hidden=true;renderMedia();document.getElementById('modal').classList.add('on');setAdminTab('pairings');
}
async function signOut(){
 const r=await sb.auth.signOut({scope:'local'});if(r.error){alert(r.error.message);return;}
 request++;role=null;email='';sync();overlay.hidden=true;renderMedia();renderCTP();
}
async function access(){
 if(role!=='owner')return;saveAdmin.style.display='none';am.innerHTML='<p>Loading approved admins…</p>';
 const r=await sb.rpc('ll_list_admins');if(r.error){am.textContent=r.error.message;await refresh();return;}
 am.innerHTML=`<h3>Admin Access</h3><p>Only the owner can add or remove admins. Approved admins can manage trip setup.</p>${senderReady?'':'<p class=tripError>Email delivery for additional admins still needs setup. Owner sign-in is available.</p>'}<div>${r.data.map(a=>`<div class=adminAccessRow><span>${escape(a.email)}<small>${a.role==='owner'?'Owner · cannot be removed':'Admin'}</small></span>${a.role==='owner'?'':`<button data-remove-admin="${escape(a.email)}">Remove</button>`}</div>`).join('')}</div><form id=adminAddEmail><label>New admin email<input id=adminNewEmail type=email required maxlength=254 autocomplete=off></label><button class=primary>Add approved email</button></form><p id=adminAccessMessage role=status></p>`;
 am.querySelectorAll('[data-remove-admin]').forEach(b=>b.onclick=async()=>{if(confirm(`Remove admin access for ${b.dataset.removeAdmin}?`))await change(b.dataset.removeAdmin,true);});
 document.getElementById('adminAddEmail').onsubmit=async e=>{e.preventDefault();await change(document.getElementById('adminNewEmail').value,false);};
}
async function change(value,remove){
 const r=await sb.rpc('ll_change_admin',{p_email:value.trim().toLowerCase(),p_remove:remove});
 if(r.error){document.getElementById('adminAccessMessage').textContent=r.error.message;await refresh();return;}
 await access();document.getElementById('adminAccessMessage').textContent=remove?'Admin access removed.':(senderReady?'Email approved. They can now request a sign-in link from the website.':'Email approved. Email delivery for additional admins still needs setup.');
}
window.LLAdmin={isAdmin,isOwner:()=>role==='owner',refresh,open,showLogin};
window.openAdmin=open;document.getElementById('admin').onclick=open;
// Defer Supabase calls outside its auth callback to avoid locking the auth client.
sb.auth.onAuthStateChange((event)=>{if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))setTimeout(async()=>{const ok=await refresh();if(event==='SIGNED_IN'){if(ok)await open();else showLogin('This email does not have admin access. Ask the owner to approve it.');}},0);});
refresh();window.addEventListener('focus',()=>refresh());setInterval(()=>{if(!document.hidden&&isAdmin())refresh();},60000);
const callbackError=new URLSearchParams(location.hash.slice(1)).get('error_description');
if(callbackError){history.replaceState(null,'',location.pathname+location.search);showLogin(callbackError);}
})();
