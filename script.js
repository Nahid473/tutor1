const KEY={wrong:'mcq_more_practice_v2',hist:'mcq_history_v2'};
const IMP_KEY='mcq_important_v1',N10_KEY='mcq_need10_v1',N10=10; // N10 = how many correct answers finish a "10x practice" question
const PAGE=50,SEEN_KEY='mcq_seen_v1',SEENK_KEY='mcq_seenk_v1'; // PAGE = questions shown on one screen; SEEN_KEY = ids of questions already given in earlier exams

function get(k,f){try{const v=JSON.parse(localStorage.getItem(k));return v==null?f:v}catch(e){return f}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
// Built-in questions are loaded from the data/*.js files (window.QUESTION_BANK).
const CUSTOM_KEY='mcq_custom_v1',TIMER_KEY='mcq_timer_pref_v1';
let custom=get(CUSTOM_KEY,[]);if(!Array.isArray(custom))custom=[];

/* ---------- Question data: small shard files loaded on demand (see build-shards.js) ---------- */
const MAN=window.MANIFEST||{v:0,cats:[]},SH={},PEND={},LRU=[];
const BADQ={},FRESH={};let loadFail=new Set();
// Called by every q-*.js file. Invalid questions are skipped (they used to crash the exam), and a file that calls
// __shard several times with the same key is merged instead of keeping only the last call.
window.__shard=(k,c,s,a)=>{
 const ids=new Set(FRESH[k]?SH[k].map(q=>q.id):[]),ok=FRESH[k]?SH[k]:[];let bad=0;
 (Array.isArray(a)?a:[]).forEach(q=>{
  const good=q&&Number.isFinite(q.id)&&typeof q.q==='string'&&q.q.trim()&&!ids.has(q.id)&&(q.t==='text'
   ?Array.isArray(q.ans)&&q.ans.some(x=>typeof x==='string'&&x.trim())
   :Array.isArray(q.o)&&q.o.length>=2&&Number.isInteger(q.a)&&q.a>=0&&q.a<q.o.length);
  if(!good){bad++;console.warn('Skipped invalid or duplicate question',k,q&&q.id);return}
  ids.add(q.id);q.cat=c;q.sub=s;if(q.e==null)q.e='';
  if(q.t==='text')q.ans=q.ans.filter(x=>typeof x==='string'&&x.trim());
  ok.push(q);
 });
 if(bad)BADQ[k]=(BADQ[k]||0)+bad;
 FRESH[k]=true;SH[k]=ok;
};
// loads a lesson: the whole file, or only the id range of that lesson when one file holds several lessons
async function loadLesson(sh,retry){const a=await loadShard(sh.k,retry);return sh.r?a.filter(q=>q.id>=sh.lo&&q.id<=sh.hi):a}
// one broken or missing file no longer stops the whole exam: try twice, then skip that file and report it
async function loadLessonSafe(x){
 try{return await loadLesson(x)}catch(e){
  try{return await loadLesson(x,true)}catch(e2){loadFail.add(x.k);return[]}
 }
}
function loadShard(k,retry){
 if(SH[k]){const i=LRU.indexOf(k);if(i>-1)LRU.splice(i,1);LRU.push(k);return Promise.resolve(SH[k])}
 if(PEND[k])return PEND[k];
 return PEND[k]=new Promise((res,rej)=>{
  const el=document.createElement('script');el.src=(MAN.p===undefined?'data/':MAN.p)+k+'.js?v='+MAN.v+(retry?'&r='+Date.now():'');
  el.onload=()=>{el.remove();delete PEND[k];delete FRESH[k];if(!SH[k])return rej(new Error('Bad shard '+k));LRU.push(k);while(LRU.length>60)delete SH[LRU.shift()];res(SH[k])};
  el.onerror=()=>{el.remove();delete PEND[k];rej(new Error('Could not load '+k))};
  document.head.appendChild(el);
 });
}
// CAT = [{c:'Category',subs:[{n,total,base,shards:[{k,c,t,lo,hi}],custom:[]}]}]  (counts only, no question text)
let CAT=[];
function rebuildCatalog(){
 const m=new Map(),sub=(c,n)=>{let cc=m.get(c);if(!cc){cc=new Map();m.set(c,cc)}let x=cc.get(n);if(!x){x={n,shards:[],custom:[],base:0,lessons:[]};cc.set(n,x)}return x};
 (MAN.cats||[]).forEach(c=>c.s.forEach(s=>{const x=sub(c.c,s.n);x.shards=s.k;x.base=s.k.reduce((a,b)=>a+b.c,0);s.k.forEach(k=>{
  // one file can hold several lessons: k.ls=[{l:name,c:count,lo:firstId,hi:lastId}]
  if(Array.isArray(k.ls))k.ls.forEach(L=>x.lessons.push({name:L.l||('Lesson '+(x.lessons.length+1)),shard:{k:k.k,c:L.c,t:L.t||0,lo:L.lo,hi:L.hi,r:1},custom:[],total:L.c}));
  else x.lessons.push({name:k.l||('Lesson '+(x.lessons.length+1)),shard:k,custom:[],total:k.c});
 })}));
 custom.forEach(q=>{const x=sub(q.cat,q.sub),ln=q.lesson||'General';let l=x.lessons.find(y=>!y.shard&&y.name===ln);if(!l){l={name:ln,shard:null,custom:[],total:0};x.lessons.push(l)}l.custom.push(q);l.total++;x.custom.push(q)});
 CAT=[...m].map(([c,mm])=>({c,subs:[...mm.values()].map(x=>({...x,total:x.base+x.custom.length}))}));
}
rebuildCatalog();
function cats(){return CAT.map(x=>x.c)}
function subsOf(c){const x=CAT.find(y=>y.c===c);return x?x.subs:[]}
function catTotal(c){return subsOf(c).reduce((a,s)=>a+s.total,0)}
function totalQ(){return CAT.reduce((a,x)=>a+catTotal(x.c),0)}
let wrong=get(KEY.wrong,{}), history=get(KEY.hist,[]);
let seen=get(SEEN_KEY,{});if(!seen||typeof seen!=='object'||Array.isArray(seen))seen={};
let seenK=get(SEENK_KEY,{});if(!seenK||typeof seenK!=='object'||Array.isArray(seenK))seenK={};
// same question text + same correct answer = the same question, even when it sits in two files
function qkey(q){return hashStr(q.q.trim()+'|'+(isText(q)?q.ans[0]:q.o[q.a])).toString(36)}
function isSeen(q){return !!(seen[q.id]||seenK[qkey(q)])}
let important=get(IMP_KEY,{}),need10=get(N10_KEY,{});
if(!important||typeof important!=='object'||Array.isArray(important))important={};
if(!need10||typeof need10!=='object'||Array.isArray(need10))need10={};
let session=null,lastBatch=null;
// ---- skipped questions: added when you leave a question unanswered (exam, timer run-out or Daily 50)
const SKIP_KEY='mcq_skipped_v1';let skipQs=get(SKIP_KEY,{});if(!skipQs||typeof skipQs!=='object'||Array.isArray(skipQs))skipQs={};
let skT;function saveSkip(){updateBadges();clearTimeout(skT);skT=setTimeout(()=>put(SKIP_KEY,skipQs),50)}
function addSkip(q){const s=skipQs[q.id]=skipQs[q.id]||{id:q.id,count:0,addedAt:Date.now()};s.q=q;s.count++;saveSkip()}
function dropSkip(id){if(skipQs[id]){delete skipQs[id];saveSkip()}}

function qs(id){return document.getElementById(id)}
function toggleMenu(force){
 const m=qs('navMenu'),b=qs('burger'),open=force!==undefined?force:!m.classList.contains('open');
 m.classList.toggle('open',open);b.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open));
}
function closeMenu(){toggleMenu(false)}
document.addEventListener('click',e=>{if(!e.target.closest('#topbar'))closeMenu();if(!e.target.closest('#lessonBox'))toggleLessonPanel(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();toggleLessonPanel(false)}});
window.addEventListener('resize',()=>{if(window.innerWidth>860)closeMenu()});
function show(id,fromPop){
 if(daily&&!daily.submitted&&tmr&&qs('daily').classList.contains('active')){daily.left=Math.max(1000,tmr.endTs-Date.now());put(DAILY_KEY,daily)}
 stopTimer();
 const nv=(id==='exam'||id==='result')?'home':id;
 document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===nv));
 closeMenu();
 document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));qs(id).classList.add('active');
 if(id==='home')refreshHome(); if(id==='daily')renderDaily(); if(id==='bank')renderBank(); if(id==='practice')renderPractice(); if(id==='history')renderHistory(); if(id==='manage')renderManage();
 if(!fromPop&&!(window.history.state&&window.history.state.v===id)){navIdx++;try{window.history.pushState({v:id,i:navIdx},'')}catch(e){}}
 window.scrollTo(0,0);
}
/* ---------- Back navigation (in-app Back button + phone/browser back) ---------- */
let navIdx=0;
try{window.history.replaceState({v:'home',i:0},'')}catch(e){}
function goBack(){if(navIdx>0)window.history.back();else show('home')}
window.addEventListener('popstate',e=>{
 const st=e.state||{v:'home',i:0};
 // leaving a running exam: ask first (a popstate cannot be cancelled, so the entry is put back if the person stays)
 if(qs('exam').classList.contains('active')&&st.v!=='exam'&&!confirm('Leave this exam? Answers on this page that are not submitted will be lost.')){navIdx++;try{window.history.pushState({v:'exam',i:navIdx},'')}catch(x){}return}
 navIdx=st.i||0;
 // exam / result screens cannot be rebuilt from history, so they fall back to the dashboard
 let v=st.v||'home';if((v==='exam'||v==='result')&&!(qs(v).classList.contains('active')))v='home';
 show(v,true);
});
function loadCats(){
 qs('cat').innerHTML=CAT.map(x=>`<option value="${esc(x.c)}">${esc(x.c)} (${catTotal(x.c).toLocaleString()})</option>`).join('');loadSubs();
}
function loadSubs(){
 const c=qs('cat').value;
 qs('sub').innerHTML=`<option value="ALL">All sub-categories (${catTotal(c).toLocaleString()})</option>`+subsOf(c).map(x=>`<option value="${esc(x.n)}">${esc(x.n)} (${x.total.toLocaleString()})</option>`).join('');
 loadLessons();
}
// flat list of the lessons of the chosen sub-category (or of every sub-category), each tagged with its sub-category name
function allLessons(c,s){return subsOf(c).filter(x=>s==='ALL'||x.n===s).flatMap(x=>x.lessons.map(l=>({l,sub:x.n})))}
function loadLessons(){
 const c=qs('cat').value,s=qs('sub').value,box=qs('lessonBox'),list=allLessons(c,s);
 if(!list.length){box.style.display='none';qs('lessonList').innerHTML='';return}
 box.style.display='block';toggleLessonPanel(false);
 qs('lessonList').innerHTML=list.map((x,i)=>`<label class="opt"><input type="checkbox" class="lchk" value="${i}" checked onchange="lessonChange()"><span>${s==='ALL'?`<span class="muted">${esc(x.sub)} ›</span> `:''}${esc(x.l.name)} <span class="badge">${x.l.total.toLocaleString()}</span></span></label>`).join('');
 lessonChange();
}
function lessonChange(){
 const list=allLessons(qs('cat').value,qs('sub').value),ch=[...document.querySelectorAll('.lchk')],on=ch.filter(e=>e.checked);
 qs('lessonAll').checked=on.length===ch.length;
 qs('lessonBtnTxt').textContent=on.length===ch.length?`All lessons (${ch.length})`:on.length===0?'No lesson selected':`${on.length} of ${ch.length} lessons selected`;
 qs('lessonInfo').textContent=`${on.reduce((a,e)=>a+(list[+e.value]?list[+e.value].l.total:0),0).toLocaleString()} questions in ${on.length} of ${ch.length} lessons`;
}
function toggleLessonPanel(force){const p=qs('lessonPanel'),open=force!==undefined?force:p.style.display==='none';p.style.display=open?'block':'none';qs('lessonBtn').setAttribute('aria-expanded',String(open))}
function toggleLessons(on){document.querySelectorAll('.lchk').forEach(e=>e.checked=on);lessonChange()}
// null = every lesson; otherwise the array of chosen lesson numbers (positions in allLessons)
function lessonSel(){
 if(qs('lessonBox').style.display==='none')return null;
 const ch=[...document.querySelectorAll('.lchk')],on=ch.filter(e=>e.checked).map(e=>+e.value);
 return on.length===ch.length?null:on;
}
// lessons that make up a selection
function lessonsOf(c,s,idx){
 const flat=allLessons(c,s).map(x=>x.l);
 return idx?flat.filter((_,i)=>idx.includes(i)):flat;
}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function isText(q){return q.t==='text'}
function isSkip(q,a){return a==null||a===''}
const BN='০১২৩৪৫৬৭৮৯';
function norm(s){return String(s).toLowerCase().normalize('NFKC').replace(/[\u200c\u200d]/g,'').replace(/[০-৯]/g,d=>BN.indexOf(d)).replace(/[^\p{L}\p{N}\p{M}\s]/gu,' ').replace(/\s+/g,' ').trim()}
// a/an/the are ignored, but an answer that is only "A" (e.g. the unit ampere) must stay
function normA(s){const n=norm(s),t=n.replace(/\b(the|a|an)\b/g,' ').replace(/\s+/g,' ').trim();return t||n}
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
// Typed answers: capitals, punctuation, a/an/the, Bangla/English digits and sub-/superscripts are ignored.
// One typo is forgiven only in longer answers WITHOUT numbers, so a wrong date or year is never accepted.
function matchText(q,a){
 const u=normA(a);if(!u)return false;
 return (q.ans||[]).some(x=>{const k=normA(x);return u===k||(k.length>=6&&!/\d/.test(k)&&lev(u,k)<=1)});
}
function isRight(q,a){if(isSkip(q,a))return false;return isText(q)?matchText(q,a):a===q.a}
function rightText(q){return isText(q)?esc(q.ans[0])+(q.ans.length>1?` <span class="muted">(also accepted: ${q.ans.slice(1).map(esc).join(', ')})</span>`:''):esc(q.o[q.a])}
function yourText(q,a){return isSkip(q,a)?'Skipped':isText(q)?esc(a):esc(q.o[a])}
function answerUI(q,pre,o){
 o=o||{};const dis=o.dis?'disabled':'';
 if(isText(q))return `<input type="text" class="ansinput" id="${pre}t_${q.id}" placeholder="Type your answer…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(o.sel==null?'':o.sel)}" ${dis} oninput="${o.tx||''}" onkeydown="ansKey(event,'${pre}',${q.id})">`;
 return `<div class="opts">${q.o.map((x,j)=>`<label class="opt${o.cls?o.cls(j):''}"><input type="radio" name="${pre}_${q.id}" value="${j}" ${dis} ${o.sel===j?'checked':''} ${o.mc?`onchange="${o.mc(j)}"`:''}><span>${esc(x)}</span></label>`).join('')}</div>`;
}
function readDom(q,pre){
 if(isText(q)){const el=qs(pre+'t_'+q.id);const v=el?el.value.trim():'';return v===''?null:v}
 const el=document.querySelector(`input[name="${pre}_${q.id}"]:checked`);return el?+el.value:null;
}
function ansKey(e,pre,id){
 if(e.key!=='Enter')return;e.preventDefault();
 if(pre==='q'){if(session&&session.tmode==='q')primaryAction();else checkText(id)}
 else if(pre==='p')practiceAnswer(id);
 else if(pre==='d')dailyCheck(id);
}
function feedbackHTML(q,a){
 const ok=isRight(q,a);
 return `<div class="fb" style="margin-top:10px">${ok?'<div class="correct">✅ Correct!</div>':`<div class="bad">❌ Wrong. Your answer: ${esc(a)}</div><div class="correct">Correct answer: ${rightText(q)}</div>`}<div class="explain"><b>Explanation:</b> ${esc(q.e)}</div></div>`;
}
function checkText(id){
 const q=session.questions.find(x=>x.id===id);if(!q||session.checked[id])return;
 const a=readDom(q,'q');if(a==null)return toast('Type your answer first.');
 session.checked[id]=true;session.ans[id]=a;
 const inp=qs('qt_'+id);if(inp)inp.disabled=true;
 const b=qs('qchk_'+id);if(b)b.style.display='none';
 qs('fb_q_'+id).innerHTML=feedbackHTML(q,a);
 if(session.tmode==='q'){stopTimer();qs('submitBtn').textContent=session.bi>=batchOf().length-1?'Submit →':'Next →'}
}
function batchOf(){return session.questions.slice(session.index,session.index+PAGE)}
function getAns(q){return session.tmode==='q'?(session.ans[q.id]??null):readDom(q,'q')}

let starting=false;
// Only the shard files of the chosen lessons are loaded.
// order='random' -> random new questions; order='present' -> new questions in their original order (continues where you stopped).
// If the selection has fewer new questions than requested, old ones fill the rest and a fresh round starts (recycled=true).
async function buildPool(c,s,idx,ty,n,order){
 const ok=q=>ty==='all'||(ty==='text')===isText(q),useful=x=>ty==='all'||(ty==='text'?x.t>0:x.t<x.c);
 loadFail=new Set();
 const ls=lessonsOf(c,s,idx),rnd=order==='random',all=[],fresh=[];
 const keys=new Set(),add=q=>{if(!ok(q))return;const k=qkey(q);if(keys.has(k))return;keys.add(k);all.push(q);if(!isSeen(q))fresh.push(q)};
 const customQ=ls.flatMap(l=>l.custom);
 let sh=ls.filter(l=>l.shard&&useful(l.shard)).map(l=>l.shard);
 if(rnd){customQ.forEach(add);sh=shuffle(sh)}
 const lim=rnd?Math.max(n*3,60):n;
 for(let i=0;i<sh.length&&fresh.length<lim;i+=4){
  (await Promise.all(sh.slice(i,i+4).map(x=>loadLessonSafe(x)))).forEach(a=>a.forEach(add));
 }
 if(!rnd&&fresh.length<n)customQ.forEach(add);
 const arr=a=>rnd?shuffle(a):a;
 if(fresh.length>=n)return{list:arr(fresh).slice(0,n),recycled:false,reset:[],failed:[...loadFail]};
 // not enough unseen questions: every shard of this selection is loaded here, so `all` is complete
 // some new questions are left: show ONLY those (fewer than requested is fine)
 if(fresh.length>0)return{list:arr(fresh),recycled:false,reset:[],failed:[...loadFail]};
 // nothing new at all: start a fresh round so the selection can be practised again
 const old=arr(all).slice(0,n);
 return{list:old,recycled:old.length>0,reset:old.length?all:[],failed:[...loadFail]};
}
// How many questions of this selection have not been given in any exam yet
async function countFresh(c,s,idx,ty){
 const ok=q=>ty==='all'||(ty==='text')===isText(q),useful=x=>ty==='all'||(ty==='text'?x.t>0:x.t<x.c);
 const ls=lessonsOf(c,s,idx);
 const keys=new Set();let k=0;
 const cnt=q=>{if(!ok(q))return;const h=qkey(q);if(keys.has(h))return;keys.add(h);if(!isSeen(q))k++};
 ls.flatMap(l=>l.custom).forEach(cnt);
 const sh=ls.filter(l=>l.shard&&useful(l.shard)).map(l=>l.shard);
 for(let i=0;i<sh.length;i+=4)(await Promise.all(sh.slice(i,i+4).map(x=>loadLessonSafe(x)))).forEach(a=>a.forEach(cnt));
 return k;
}
async function startExam(){
 if(starting)return;
 const c=qs('cat').value,s=qs('sub').value,n=Math.min(+qs('count').value||10,1000),ty=qs('qtype').value,order=qs('qorder').value,les=lessonSel();
 if(les&&!les.length)return toast('Select at least one lesson.');
 starting=true;toast('Loading questions…',15000);
 let res;
 try{res=await buildPool(c,s,les,ty,n,order)}catch(e){starting=false;return toast('Could not load questions. Check your connection and try again.')}
 starting=false;hideToast();
 const selected=res.list;
 if(!selected.length)return toast(res.failed.length?'Could not load: '+res.failed.join(', ')+'. Check the file names and your connection.':'No questions available for this selection.',5000);
 if(res.recycled)res.reset.forEach(q=>{delete seen[q.id];delete seenK[qkey(q)]}); // every question of this selection was used: start a new round
 selected.forEach(q=>{seen[q.id]=1;seenK[qkey(q)]=1});put(SEEN_KEY,seen);put(SEENK_KEY,seenK);
 const tmode=qs('timerMode').value;let tval=+qs('timerVal').value;
 if(tmode==='q')tval=Math.max(5,Math.min(3600,Math.round(tval)||60));
 else if(tmode==='all')tval=Math.max(1,Math.min(600,Math.round(tval)||30));
 if(tmode!=='off'){qs('timerVal').value=tval}
 put(TIMER_KEY,{mode:tmode,val:tval});
 newSession(selected,{ty,n,les,order,cat:c,sub:s},+qs('negative').value,tmode,tval);
 const badN=Object.values(BADQ).reduce((a,b)=>a+b,0);
 if(res.failed.length)toast('⚠ '+res.failed.length+' question file(s) could not be loaded ('+res.failed.join(', ')+'). The rest was used.',6000);
 else if(badN)toast('⚠ '+badN+' invalid question(s) were skipped. Open check.html to find them.',6000);
 else if(res.recycled)toast('You have completed all new questions in this selection — starting a fresh round.',4000);
 else if(selected.length<n)toast('Only '+selected.length+' new questions were left in this selection.',4000);
}
function newSession(selected,meta,neg,tmode,tval){
 session=Object.assign({id:Date.now(),questions:selected,index:0,neg,totalCorrect:0,totalWrong:0,totalSkip:0,totalRaw:0,totalScore:0,tmode,tval,remaining:tmode==='all'?tval*60000:0,bi:0,ans:{},over:false},meta);
 renderBatch();show('exam');beginTimers();
}
function timerUi(setDefault){
 const m=qs('timerMode').value,box=qs('timerValBox'),inp=qs('timerVal');
 box.style.display=m==='off'?'none':'block';
 if(m==='q'){qs('timerValLbl').textContent='Seconds per question';inp.min=5;inp.max=3600;if(setDefault)inp.value=60}
 if(m==='all'){qs('timerValLbl').textContent='Total minutes for the whole exam';inp.min=1;inp.max=600;if(setDefault)inp.value=30}
}
function restoreTimerPref(){
 const p=get(TIMER_KEY,null);if(!p)return;
 if(['off','q','all'].includes(p.mode)){qs('timerMode').value=p.mode;timerUi(false);if(p.mode!=='off')qs('timerVal').value=p.val}
}
function qCard(q,num){
 return `<div class="q" data-q="${q.id}"><div class="qnum">Question ${num} ${isText(q)?'<span class="badge">Short answer</span>':''}</div><div class="qtext">${esc(q.q)}</div>${mkBar(q)}${answerUI(q,'q',{mc:j=>'countAnswered()',tx:'countAnswered()'})}${isText(q)?`<button class="btn good" id="qchk_${q.id}" style="margin-top:10px" onclick="checkText(${q.id})">Submit answer</button><div id="fb_q_${q.id}"></div>`:''}</div>`;
}
function renderNav(){
 const nav=qs('qnav');
 if(session.tmode==='q'){nav.style.display='none';return}
 const s=session.index;nav.style.display='grid';
 nav.innerHTML=batchOf().map((q,i)=>`<button type="button" class="qn" id="qn_${q.id}" onclick="jumpQ(${q.id})" aria-label="Go to question ${s+i+1}">${s+i+1}</button>`).join('');
}
function jumpQ(id){const el=document.querySelector(`.q[data-q="${id}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
function renderBatch(){
 const start=session.index,end=Math.min(start+PAGE,session.questions.length),batch=batchOf();
 session.bi=0;session.ans={};session.checked={};renderNav();
 qs('batchInfo').textContent=`${session.cat} • ${session.sub==='ALL'?'All sub-categories':session.sub}`;
 if(session.tmode==='q'){renderOne();return}
 qs('batchTitle').textContent=session.questions.length>PAGE?`Questions ${start+1}–${end} of ${session.questions.length}`:`${session.questions.length} Question${session.questions.length>1?'s':''}`;
 qs('submitBtn').textContent=`Submit ${batch.length} Question${batch.length>1?'s':''} →`;
 qs('stickyHint').textContent=session.tmode==='all'?'Whole-exam timer is running (it pauses between batches).':'Answer all you can, then submit.';
 qs('batchBar').style.width=((end/session.questions.length)*100)+'%';
 qs('questions').innerHTML=batch.map((q,i)=>qCard(q,start+i+1)).join('');
 qs('answeredInfo').textContent=`0 / ${batch.length} answered`;
}
function renderOne(){
 const start=session.index,batch=batchOf(),q=batch[session.bi],num=start+session.bi+1,last=session.bi>=batch.length-1;
 qs('batchTitle').textContent=`Question ${num} / ${session.questions.length}`;
 qs('submitBtn').textContent=isText(q)?'Submit answer →':(last?'Submit →':'Next →');
 qs('stickyHint').textContent=`${session.tval}s per question — unanswered questions are skipped when time runs out.`;
 qs('batchBar').style.width=((num-1)/session.questions.length*100)+'%';
 qs('questions').innerHTML=qCard(q,num);
 qs('answeredInfo').textContent=`${session.bi+1} of ${batch.length} on this page`;
 const t=qs('qt_'+q.id);if(t)setTimeout(()=>t.focus(),50);
}
function primaryAction(){
 if(session.tmode!=='q'){submitBatch();return}
 const q=batchOf()[session.bi];
 if(isText(q)&&!session.checked[q.id]&&readDom(q,'q')!=null){checkText(q.id);return}
 advanceOne();
}
function advanceOne(){
 stopTimer();
 const batch=batchOf(),q=batch[session.bi];
 session.ans[q.id]=readDom(q,'q');
 if(session.bi>=batch.length-1){submitBatch();return}
 session.bi++;renderOne();startQTimer();window.scrollTo(0,0);
}
function startQTimer(){startTimer('timerBadge',Date.now()+session.tval*1000,()=>{toast("⏰ Time's up for this question");advanceOne()})}
function beginTimers(){
 if(session.tmode==='q')startQTimer();
 else if(session.tmode==='all')startTimer('timerBadge',Date.now()+session.remaining,()=>{toast("⏰ Time's up!");submitBatch(true)});
 else qs('timerBadge').style.display='none';
}
function countAnswered(){
 if(session.tmode==='q')return;
 const batch=batchOf();
 let n=0;
 batch.forEach(q=>{const d=readDom(q,'q')!=null;if(d)n++;const b=qs('qn_'+q.id);if(b)b.classList.toggle('done',d)});
 qs('answeredInfo').textContent=`${n} / ${batch.length} answered`;
}
function submitBatch(timeUp){
 const left=stopTimer();if(session.tmode==='all'&&left!=null)session.remaining=left;
 const batch=batchOf(),out=[];
 batch.forEach(q=>{
  const ans=getAns(q),skipped=isSkip(q,ans),correct=isRight(q,ans);
  if(correct)session.totalCorrect++; else if(!skipped)session.totalWrong++; else session.totalSkip++;
  if(!correct&&!skipped)addWrong(q);
  if(skipped)addSkip(q);else dropSkip(q.id);
  if(correct&&wrong[q.id]){delete wrong[q.id];saveWrong()}
  if(correct&&need10[q.id]){if(bumpN10(q.id)==='done')session.n10done=(session.n10done||0)+1}
  out.push({q,ans:skipped?null:ans,correct,skipped});
 });
 if(timeUp===true){session.totalSkip+=session.questions.length-(session.index+batch.length);session.over=true}
 session.totalRaw=session.totalCorrect-(session.totalWrong*session.neg);
 session.totalScore=Math.max(0,session.totalRaw);
 lastBatch=out;
 renderResult();
 show('result');
}
function renderResult(){
 const total=session.questions.length,done=session.over?total:Math.min(session.index+PAGE,total),percent=Math.round((session.totalScore/done)*100);
 qs('finalPercent').textContent=Math.max(0,percent)+'%';
 qs('resultTitle').textContent=done<total?'Part Result':'Final Result';
 qs('resultText').textContent=session.over?`⏰ Time's up! Unanswered questions were counted as skipped (${total} total).`:done<total?`Part ${Math.floor(session.index/PAGE)+1} completed (${done} of ${total} questions so far).`:`You completed all ${total} selected questions.`;
 qs('rCorrect').textContent=session.totalCorrect;qs('rWrong').textContent=session.totalWrong;qs('rSkip').textContent=session.totalSkip;qs('rScore').textContent=session.totalScore.toFixed(2);
 const deg=Math.max(0,Math.min(360,percent*3.6));qs('ring').style.background=`conic-gradient(#7181ff 0deg,#8b5cf6 ${deg}deg,#263858 ${deg}deg)`;
 qs('nextBtn').style.display=done<total?'inline-block':'none';qs('nextBtn').textContent=`Next ${Math.min(PAGE,total-done)} Questions →`;
 qs('repeatBtn').style.display='none';
 if(done>=total){
  saveHistory();
  const sid=session.id;
  if(session.n10done)toast('🎉 '+session.n10done+' question(s) finished their '+N10+'× practice!',4000);
  if(!session.special)countFresh(session.cat,session.sub,session.les,session.ty).then(k=>{
   if(!session||session.id!==sid||!qs('result').classList.contains('active'))return;
   const b=qs('repeatBtn');
   if(k>0){b.textContent=`Next ${Math.min(k,session.n)} New MCQs →`;b.style.display='inline-block'}
   else qs('resultText').textContent+=' All new questions in this selection are completed.';
  }).catch(()=>{});
 }
 const nSk=lastBatch.filter(x=>x.skipped).length;
 qs('batchWrong').innerHTML=(nSk?`<div class="card" style="margin-top:12px">⏭ ${nSk} skipped question${nSk>1?'s were':' was'} added to <b>More Practice › Skipped</b>.</div>`:'')+lastBatch.filter(x=>!x.correct&&!x.skipped).map(x=>wrongCard(x.q,x.ans,'This question has been added to More Practice.')).join('');
}
function nextBatch(){session.index+=PAGE;renderBatch();show('exam');beginTimers()}
function wrongCard(q,ans,note){
 return `<div class="wrong"><b>❌ ${esc(q.q)}</b><div class="bad">Your answer: ${yourText(q,ans)}</div><div class="correct">Correct answer: ${rightText(q)}</div><div class="explain"><b>Explanation:</b> ${esc(q.e)}</div>${mkBar(q)}${note?`<div class="muted" style="margin-top:7px">${note}</div>`:''}</div>`;
}
function addWrong(q){
 const w=wrong[q.id]=wrong[q.id]||{id:q.id,attempts:0,wrong:0,addedAt:Date.now()};
 w.q=q;w.wrong++;w.attempts++;saveWrong();
}
let swT;
function saveWrong(){updateBadges();clearTimeout(swT);swT=setTimeout(()=>put(KEY.wrong,wrong),50)}
let practiceLimit=20,ptab='wrong',pfCat='',pfSub='';
async function resolveWrong(){ // old saved entries have no question text: find it by id
 const miss=Object.values(wrong).filter(w=>!w.q);
 for(const w of miss){
  const id=+w.id;let f=custom.find(q=>q.id===id);
  if(!f){for(const x of CAT.flatMap(c=>c.subs.flatMap(s=>s.shards)).filter(x=>id>=x.lo&&id<=x.hi)){f=(await loadShard(x.k)).find(q=>q.id===id);if(f)break}}
  if(f)w.q=f;
 }
 if(miss.length)saveWrong();
}
function setTab(t){ptab=t;pfCat='';pfSub='';practiceLimit=20;renderPractice()}
function setPfCat(v){pfCat=v;pfSub='';practiceLimit=20;renderPractice()}
function setPfSub(v){pfSub=v;practiceLimit=20;renderPractice()}
// questions of a tab; kind = 'wrong' | 'imp' | 'n10'
function kindStore(kind){return kind==='imp'?important:kind==='n10'?need10:kind==='skip'?skipQs:wrong}
function kindQs(kind){return Object.values(kindStore(kind)).filter(w=>w.q).map(w=>reg(w.q))}
function qCat(q){return q.cat||'Other'}
function qSub(q){return q.sub||'General'}
function pFiltered(list){return list.filter(q=>(!pfCat||qCat(q)===pfCat)&&(!pfSub||pfSub==='ALL'||qSub(q)===pfSub))}
function count(list,f){const m=new Map();list.forEach(q=>{const k=f(q);m.set(k,(m.get(k)||0)+1)});return m}
// Category -> Sub-category filter above the list
function renderPracticeFilter(all){
 const box=qs('practiceFilter');
 if(!all.length){box.innerHTML='';return}
 const cm=count(all,qCat);if(pfCat&&!cm.has(pfCat)){pfCat='';pfSub=''}
 const inCat=pfCat?all.filter(q=>qCat(q)===pfCat):[],sm=count(inCat,qSub);if(pfSub&&pfSub!=='ALL'&&!sm.has(pfSub))pfSub='';
 box.innerHTML=`<div><label>Category</label><select onchange="setPfCat(this.value)"><option value="">Select category…</option>${[...cm].map(([k,n])=>`<option value="${esc(k)}"${k===pfCat?' selected':''}>${esc(k)} (${n})</option>`).join('')}</select></div>
 <div><label>Sub-category</label><select onchange="setPfSub(this.value)" ${pfCat?'':'disabled'}><option value="">${pfCat?'Select sub-category…':'Choose a category first'}</option>${pfCat?`<option value="ALL"${pfSub==='ALL'?' selected':''}>All sub-categories (${inCat.length})</option>`:''}${[...sm].map(([k,n])=>`<option value="${esc(k)}"${k===pfSub?' selected':''}>${esc(k)} (${n})</option>`).join('')}</select></div>`;
}
function tabStore(){return kindStore(ptab)}
async function renderPractice(more){
 if(more!==true)practiceLimit=20;
 try{await resolveWrong()}catch(e){}
 const every=kindQs(ptab);renderPracticeFilter(every);
 const ready=!!(pfCat&&pfSub),all=ready?pFiltered(every):[],items=all.slice(0,practiceLimit);
 document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===ptab));
 updateBadges();
 const desc={wrong:'Wrong answers stay here until you answer that exact question correctly. Once correct, it is automatically removed.',
  imp:'Questions you starred with ☆ Important during an exam. They stay here until you un-star them.',
  skip:'Questions you left unanswered (or ran out of time on) in exams and Daily 50. Answer one here and it is removed from this list.',
  n10:'Questions you marked “Need '+N10+'× practice”. Answer each one correctly '+N10+' times (here or in any exam) and it is finished.'};
 qs('practiceDesc').textContent=desc[ptab];
 qs('practiceActions').innerHTML=all.length?`<button class="btn primary" onclick="startMarked('${ptab}')">▶ Start exam from these ${all.length} question${all.length>1?'s':''}${pfCat?' ('+esc(pfCat)+(pfSub&&pfSub!=='ALL'?' › '+esc(pfSub):'')+')':''}</button>`:'';
 if(every.length&&!ready){qs('practiceList').innerHTML='<div class="card empty">👆 Select a <b>category</b> and then a <b>sub-category</b> to see your questions.<br><span class="muted">'+every.length+' question'+(every.length>1?'s are':' is')+' waiting in this tab.</span></div>';return}
 if(!all.length&&every.length){qs('practiceList').innerHTML='<div class="card empty">No questions in this category / sub-category.</div>';return}
 if(!all.length){qs('practiceList').innerHTML={wrong:'<div class="card empty">🎉 No questions need more practice.<br>Answer a question incorrectly in an exam and it will appear here.</div>',
  skip:'<div class="card empty">⏭ No skipped questions.<br>Questions you leave unanswered in an exam or Daily 50 will appear here.</div>',
  imp:'<div class="card empty">⭐ No important questions yet.<br>Tap “☆ Important” on any question during an exam.</div>',
  n10:'<div class="card empty">🔁 Nothing to practise '+N10+' times yet.<br>Tap “🔁 Need '+N10+'× practice” on any question during an exam.</div>'}[ptab];return}
 const badge=q=>ptab==='wrong'?`<div class="badge">Wrong ${wrong[q.id].wrong} time${wrong[q.id].wrong>1?'s':''}</div>`
  :ptab==='skip'?`<div class="badge">⏭ Skipped ${skipQs[q.id].count} time${skipQs[q.id].count>1?'s':''}</div>`
  :ptab==='n10'?`<div class="badge">🔁 ${N10-need10[q.id].left} / ${N10} done • ${need10[q.id].left} correct answer${need10[q.id].left>1?'s':''} to go</div>`:'<div class="badge">⭐ Important</div>';
 qs('practiceList').innerHTML=items.map(q=>`
 <div class="card" style="margin-bottom:12px">
  ${badge(q)}${isText(q)?' <span class="badge">Short answer</span>':''}
  <div class="qtext" style="margin-top:9px">${esc(q.q)}</div>
  ${mkBar(q)}
  ${answerUI(q,'p')}
  <button class="btn primary" style="margin-top:10px" onclick="practiceAnswer(${q.id})">Check Answer</button>
  <div id="pr_${q.id}"></div>
 </div>`).join('')+(all.length>items.length?`<div style="text-align:center;margin:14px 0"><button class="btn" onclick="practiceLimit+=20;renderPractice(true)">Show more (${all.length-items.length} left)</button></div>`:'');
}
function practiceAnswer(id){
 const rec=tabStore()[id],q=rec&&rec.q;if(!q)return;const a=readDom(q,'p');
 if(a==null)return toast(isText(q)?'Type your answer first.':'Select an answer first.');
 const box=qs('pr_'+id),ok=isRight(q,a);
 const wrongMsg=`<div class="bad" style="margin-top:10px">❌ Not correct.</div><div class="correct">Correct answer: ${rightText(q)}</div><div class="explain">${esc(q.e)}</div>`;
 if(ptab==='wrong'){
  if(ok){delete wrong[id];saveWrong();box.innerHTML=`<div class="correct" style="margin-top:10px">✅ Correct! Removed from More Practice.</div><div class="explain">${esc(q.e)}</div>`;setTimeout(()=>renderPractice(true),900)}
  else{wrong[id].wrong++;wrong[id].attempts++;saveWrong();box.innerHTML=wrongMsg.replace('Not correct.','Still needs practice.');refreshHome()}
 }else if(ptab==='n10'){
  if(ok){const r=bumpN10(id);box.innerHTML=r==='done'?`<div class="correct" style="margin-top:10px">🎉 ${N10} of ${N10} done — this question is finished!</div><div class="explain">${esc(q.e)}</div>`:`<div class="correct" style="margin-top:10px">✅ Correct! ${need10[id].left} more to go.</div><div class="explain">${esc(q.e)}</div>`;setTimeout(()=>renderPractice(true),1100)}
  else box.innerHTML=wrongMsg;
 }else if(ptab==='skip'){
  dropSkip(id);
  if(ok)box.innerHTML=`<div class="correct" style="margin-top:10px">✅ Correct! Removed from Skipped.</div><div class="explain">${esc(q.e)}</div>`;
  else{addWrong(q);box.innerHTML=wrongMsg.replace('Not correct.','Not correct — moved to Wrong answers.')}
  setTimeout(()=>renderPractice(true),ok?900:1800);refreshHome();
 }else{
  box.innerHTML=ok?`<div class="correct" style="margin-top:10px">✅ Correct!</div><div class="explain">${esc(q.e)}</div>`:wrongMsg;
 }
}
// ---- marks: ⭐ Important and 🔁 Need 10x practice (buttons sit on every question card)
const QREG={};
function reg(q){QREG[q.id]=q;return q}
let smT;
function saveMarks(){updateBadges();clearTimeout(smT);smT=setTimeout(()=>{put(IMP_KEY,important);put(N10_KEY,need10)},50)}
function mkBar(q){
 reg(q);const i=!!important[q.id],n=need10[q.id];
 return `<div class="mkbar"><button type="button" class="mk${i?' on':''}" data-imp="${q.id}" onclick="toggleImp(${q.id})">${i?'⭐ Important':'☆ Important'}</button><button type="button" class="mk${n?' on':''}" data-n10="${q.id}" onclick="toggleN10(${q.id})">${n?'🔁 '+n.left+' more to go':'🔁 Need '+N10+'× practice'}</button></div>`;
}
function refreshMk(id){
 const i=!!important[id],n=need10[id];
 document.querySelectorAll(`[data-imp="${id}"]`).forEach(b=>{b.classList.toggle('on',i);b.textContent=i?'⭐ Important':'☆ Important'});
 document.querySelectorAll(`[data-n10="${id}"]`).forEach(b=>{b.classList.toggle('on',!!n);b.textContent=n?'🔁 '+n.left+' more to go':'🔁 Need '+N10+'× practice'});
}
function afterMark(kind){if(qs('practice').classList.contains('active')&&ptab===kind)setTimeout(()=>renderPractice(true),350)}
function toggleImp(id){
 const q=QREG[id];if(!q)return;
 if(important[id]){delete important[id];toast('Removed from Important')}
 else{important[id]={id,q,addedAt:Date.now()};toast('⭐ Marked as important')}
 saveMarks();refreshMk(id);afterMark('imp');
}
function toggleN10(id){
 const q=QREG[id];if(!q)return;
 if(need10[id]){delete need10[id];toast('Removed from '+N10+'× practice')}
 else{need10[id]={id,q,left:N10,addedAt:Date.now()};toast('🔁 Added: answer it correctly '+N10+' times in More Practice or in any exam',3200)}
 saveMarks();refreshMk(id);afterMark('n10');
}
// a correct answer counts one step; after N10 correct answers the question is finished and removed
function bumpN10(id){
 const r=need10[id];if(!r)return null;
 r.left--;let res='step';if(r.left<=0){delete need10[id];res='done'}
 saveMarks();refreshMk(id);return res;
}
// start an exam from the questions of a tab
function startMarked(kind){
 if(!pfCat||!pfSub)return toast('Select a category and sub-category first.');
 const list=shuffle(pFiltered(kindQs(kind)));
 if(!list.length)return toast('Nothing to practise yet.');
 const label=kind==='skip'?'⏭ Skipped':kind==='imp'?'⭐ Important':kind==='n10'?'🔁 '+N10+'× Practice':'🧠 Wrong answers';
 newSession(list,{ty:'all',n:list.length,les:null,order:'random',cat:label,sub:pfCat?pfCat+(pfSub&&pfSub!=='ALL'?' › '+pfSub:''):'All',special:kind},0,'off',0);
}
function saveHistory(){
 const h={date:new Date().toLocaleString(),cat:session.cat,sub:session.sub,total:session.questions.length,correct:session.totalCorrect,wrong:session.totalWrong,skip:session.totalSkip,score:+session.totalScore.toFixed(2),percent:+((session.totalScore/session.questions.length)*100).toFixed(1)};
 history.unshift(h);history=history.slice(0,100);put(KEY.hist,history);
}
function renderHistory(){
 if(!history.length){qs('historyList').innerHTML='<div class="empty">No exams completed yet.</div>';return}
 qs('historyList').innerHTML=history.map((h,i)=>`<div class="history"><div><b>#${history.length-i} ${esc(h.cat)}</b><div class="muted">${esc(h.sub)} • ${esc(h.date)}</div></div><div><b>${h.percent}%</b><div class="muted">${h.correct}/${h.total}</div></div></div>`).join('');
}
function renderBank(){
 qs('bankTotal').textContent=totalQ().toLocaleString();
 qs('bankCats').textContent=CAT.length;
 qs('bankSubs').textContent=CAT.reduce((a,x)=>a+x.subs.length,0);
 qs('bankDaily').textContent=Math.min(DAILY_SIZE,totalQ());
 qs('bankList').innerHTML=CAT.map(c=>`<div class="bankcat"><span>${esc(c.c)}</span><span class="badge">${catTotal(c.c).toLocaleString()} questions</span></div>`+c.subs.map(s=>`<div class="banksub"><span>${esc(s.n)}</span><b>${s.total.toLocaleString()}</b></div>`+s.lessons.map(l=>`<div class="banklesson"><span>${esc(l.name)}</span><span>${l.total.toLocaleString()}</span></div>`).join('')).join('')).join('');
}
function refreshHome(){
 qs('totalQ').textContent=totalQ().toLocaleString();qs('totalExam').textContent=history.length;qs('practiceCount').textContent=Object.keys(wrong).length+Object.keys(need10).length+Object.keys(skipQs).length;
 qs('bestScore').textContent=(history.length?Math.max(...history.map(h=>h.percent)):0)+'%';updateBadges();
}
function updateBadges(){
 const nw=Object.keys(wrong).length,ni=Object.keys(important).length,nn=Object.keys(need10).length,ns=Object.keys(skipQs).length;
 qs('wrongBadge').textContent=nw+nn+ns;
 [['tabWrong',nw],['tabImp',ni],['tabSkip',ns],['tabN10',nn]].forEach(([id,v])=>{const e=qs(id);if(e)e.textContent=v});
 const ok=daily&&daily.date===todayStr()&&Array.isArray(daily.qs);
 qs('dailyBadge').textContent=ok?(daily.submitted?0:daily.qs.filter(q=>daily.answers[q.id]==null).length):Math.min(DAILY_SIZE,totalQ());
}
function resetAll(){if(confirm('Delete all saved progress, wrong questions and history?')){seen={};seenK={};localStorage.removeItem(SEEN_KEY);localStorage.removeItem(SEENK_KEY);localStorage.removeItem(KEY.wrong);localStorage.removeItem(IMP_KEY);localStorage.removeItem(N10_KEY);localStorage.removeItem(SKIP_KEY);skipQs={};important={};need10={};localStorage.removeItem(KEY.hist);localStorage.removeItem(DAILY_KEY);localStorage.removeItem('mcq_daily_v1');daily=null;wrong={};history=[];refreshHome();renderPractice();toast('Local data reset.')}}
let toastT;
function toast(t,ms){const x=qs('toast');x.textContent=t;x.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>x.style.display='none',ms||1800)}
function hideToast(){clearTimeout(toastT);qs('toast').style.display='none'}
/* ---------- Timer engine ---------- */
let tmr=null;
function fmtTime(ms){const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function startTimer(elId,endTs,onExpire){
 stopTimer();const el=qs(elId);el.style.display='inline-block';
 const paint=()=>{const left=endTs-Date.now();el.textContent='⏱ '+fmtTime(left);el.classList.toggle('warn',left<=10000);return left};
 paint();
 tmr={endTs,h:setInterval(()=>{if(paint()<=0){stopTimer();onExpire()}},250)};
}
function stopTimer(){if(!tmr)return null;clearInterval(tmr.h);const left=Math.max(0,tmr.endTs-Date.now());tmr=null;return left}

/* ---------- Add Question ---------- */
function nqToggle(){const t=qs('nqType').value==='text';qs('nqMcq').style.display=t?'none':'block';qs('nqText').style.display=t?'block':'none'}
function refreshLists(){
 qs('catList').innerHTML=cats().map(c=>`<option value="${esc(c)}">`).join('');
 qs('subList').innerHTML=[...new Set(CAT.flatMap(c=>c.subs.map(s=>s.n)))].slice(0,500).map(s=>`<option value="${esc(s)}">`).join('');
}
function addQuestion(){
 const t=qs('nqType').value,q=qs('nqQ').value.trim(),cat=qs('nqCat').value.trim()||'Custom',sub=qs('nqSub').value.trim()||'General',les=qs('nqLes').value.trim()||'General',e=qs('nqExp').value.trim();
 if(!q)return toast('Write the question first.');
 const id=Math.max(100000,...custom.map(x=>x.id))+1;let item;
 if(t==='text'){
  const ans=qs('nqAns').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!ans.length)return toast('Add at least one accepted answer.');
  item={id,t:'text',cat,sub,lesson:les,q,ans,e:e||('Answer: '+ans[0])};
 }else{
  const o=[0,1,2,3].map(i=>qs('nqO'+i).value.trim()),a=+document.querySelector('input[name="nqCorrect"]:checked').value;
  if(!o[a])return toast('The option marked correct is empty.');
  const opts=[];let na=0;o.forEach((x,i)=>{if(x){if(i===a)na=opts.length;opts.push(x)}});
  if(opts.length<2)return toast('Add at least two options.');
  item={id,cat,sub,lesson:les,q,o:opts,a:na,e:e||('Correct answer: '+opts[na])};
 }
 custom.push(item);put(CUSTOM_KEY,custom);rebuildCatalog();
 ['nqQ','nqAns','nqExp','nqO0','nqO1','nqO2','nqO3'].forEach(k=>qs(k).value='');
 const cv=qs('cat').value;loadCats();if(cats().includes(cv)){qs('cat').value=cv;loadSubs()}
 refreshHome();renderManage();toast('Question added ✅');
}
function deleteMine(id){
 if(!confirm('Delete this question?'))return;
 custom=custom.filter(x=>x.id!==id);delete wrong[id];delete important[id];delete need10[id];delete skipQs[id];saveSkip();saveWrong();saveMarks();put(CUSTOM_KEY,custom);rebuildCatalog();
 const cv=qs('cat').value;loadCats();if(cats().includes(cv)){qs('cat').value=cv;loadSubs()}
 refreshHome();renderManage();
}
function renderManage(){
 refreshLists();nqToggle();
 qs('myCount').textContent=custom.length;
 qs('myList').innerHTML=custom.length?custom.slice().reverse().map(x=>`<div class="mine"><div><span class="badge">${isText(x)?'Short answer':'MCQ'}</span> <span class="badge">${esc(x.cat)}</span> <span class="badge">${esc(x.sub)}</span> <span class="badge">${esc(x.lesson||'General')}</span><div class="qt">${esc(x.q)}</div><div class="correct" style="font-size:14px">${rightText(x)}</div></div><button class="btn danger" onclick="deleteMine(${x.id})">Delete</button></div>`).join(''):'<div class="empty">No custom questions yet.</div>';
}
function esc(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

/* ---------- Daily 50 ---------- */
const DAILY_KEY='mcq_daily_v2',DAILY_SIZE=50;
let daily=get(DAILY_KEY,null);
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function seededShuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function buildDaily(date){
 const r=rng(hashStr(date)),groups=[],used=new Map(),picks=[];
 CAT.forEach(c=>c.subs.forEach(s=>{if(s.total)groups.push(s)}));
 // Round-robin over sub-categories: one question from each first, then a second, and so on.
 for(let round=0;picks.length<DAILY_SIZE;round++){
  const active=groups.filter(g=>g.total>round);
  if(!active.length)break;
  for(const g of seededShuffle(active,r)){
   if(picks.length>=DAILY_SIZE)break;
   let u=used.get(g);if(!u){u=new Set();used.set(g,u)}
   let p;do{p=Math.floor(r()*g.total)}while(u.has(p));u.add(p);
   if(p>=g.base){picks.push({q:g.custom[p-g.base]});continue}
   for(const x of g.shards){if(p<x.c){picks.push({k:x.k,i:p});break}p-=x.c}
  }
 }
 const keys=[...new Set(picks.filter(x=>x.k).map(x=>x.k))],data={};
 await Promise.all(keys.map(async k=>{data[k]=await loadShard(k)}));
 return seededShuffle(picks.map(x=>x.q||data[x.k][x.i]),r);
}
let dailyBusy=null;
function prepareDaily(){
 const t=todayStr();
 if(daily&&daily.date===t&&Array.isArray(daily.qs)){if(!daily.answers)daily.answers={};return Promise.resolve()}
 if(dailyBusy)return dailyBusy;
 return dailyBusy=buildDaily(t).then(list=>{daily={date:t,qs:list,ids:list.map(q=>q.id),answers:{},submitted:false,result:null};put(DAILY_KEY,daily)}).finally(()=>{dailyBusy=null});
}
function ensureDaily(){if(daily&&!daily.answers)daily.answers={}}
function dailyItems(){return daily&&Array.isArray(daily.qs)?daily.qs:[]}
function dailyCard(q,idx){
 const sel=daily.answers[q.id],sub=daily.submitted;
 const locked=!sub&&isText(q)&&daily.checked&&daily.checked[q.id];
 const ui=answerUI(q,'d',{sel,dis:sub||locked,mc:j=>`dailySelect(${q.id},${j})`,tx:`dailyText(${q.id},this.value)`,cls:j=>sub?(j===q.a?' ok':(j===sel?' no':'')):''});
 let result='';
 if(sub){
  const skipped=isSkip(q,sel),ok=isRight(q,sel);
  result=(ok?`<div class="correct" style="margin-top:10px">✅ Correct!</div>`
   :skipped?`<div class="muted" style="margin-top:10px">⏭ Skipped. Correct answer: ${rightText(q)}</div>`
   :`<div class="bad" style="margin-top:10px">❌ Wrong. Correct answer: ${rightText(q)}</div>`)
   +`<div class="explain"><b>Explanation:</b> ${esc(q.e)}</div>`;
 }
 return `<div class="card" id="dq_${q.id}" style="margin-bottom:12px">
  <div class="dtag"><span class="badge">#${idx+1}</span><span class="badge">${esc(q.cat)}</span><span class="badge">${esc(q.sub)}</span>${isText(q)?'<span class="badge">Short answer</span>':''}</div>
  <div class="qtext" style="margin-top:4px">${esc(q.q)}</div>
  ${mkBar(q)}
  ${ui}
  ${!sub&&isText(q)?(locked?feedbackHTML(q,sel):`<button class="btn good" style="margin-top:10px" onclick="dailyCheck(${q.id})">Submit answer</button>`):''}
  ${result}
 </div>`;
}
function dailySelect(id,j){ensureDaily();if(daily.submitted)return;daily.answers[id]=j;put(DAILY_KEY,daily);updateDailyStats()}
function dailyCheck(id){
 ensureDaily();if(daily.submitted)return;
 if(daily.answers[id]==null)return toast('Type your answer first.');
 daily.checked=daily.checked||{};daily.checked[id]=true;put(DAILY_KEY,daily);
 const items=dailyItems(),i=items.findIndex(x=>x.id===id);
 if(i>=0)qs('dq_'+id).outerHTML=dailyCard(items[i],i);
}
function dailyText(id,v){ensureDaily();if(daily.submitted)return;if(daily.checked&&daily.checked[id])return;v=v.trim();if(v==='')delete daily.answers[id];else daily.answers[id]=v;put(DAILY_KEY,daily);updateDailyStats()}
const DAILY_SEC=60;
function dailyPos(){const n=dailyItems().length;return Math.max(0,Math.min(n-1,+daily.pos||0))}
// shows ONE question with an automatic 60 s timer (after submitting, all questions are shown for review)
function dailyStep(){
 ensureDaily();const items=dailyItems(),n=items.length,row=qs('dailyTimerRow');
 if(!n){qs('dailyList').innerHTML='<div class="card empty">No questions available.</div>';return}
 if(daily.submitted){stopTimer();row.style.display='none';qs('dailyList').innerHTML=items.map((q,i)=>dailyCard(q,i)).join('');return}
 row.style.display='flex';
 const i=dailyPos();daily.pos=i;
 qs('dailyList').innerHTML=dailyCard(items[i],i);
 startTimer('dailyTimer',Date.now()+(daily.left>0?daily.left:DAILY_SEC*1000),()=>{toast("⏰ Time's up for this question");dailyNext(true)});
 qs('dailyNextBtn').textContent=i>=n-1?'Submit Daily Questions →':'Next →';
 const t=qs('dt_'+items[i].id);if(t&&!t.disabled)setTimeout(()=>t.focus(),50);
}
function dailyNext(auto){
 ensureDaily();if(daily.submitted)return;stopTimer();
 const n=dailyItems().length,i=dailyPos();
 if(i>=n-1){dailySubmit(true);return}
 daily.pos=i+1;daily.left=DAILY_SEC*1000;put(DAILY_KEY,daily);
 dailyStep();updateDailyStats();window.scrollTo(0,0);
}
function dailyPrimary(){ensureDaily();if(daily.submitted)return;if(dailyPos()>=dailyItems().length-1)dailySubmit();else dailyNext()}
function updateDailyStats(){
 const items=dailyItems(),n=items.length,answered=items.filter(q=>daily.answers[q.id]!=null).length;
 if(daily.submitted&&daily.result)qs('dailyStats').textContent=`Score ${daily.result.correct} / ${daily.result.total} (${daily.result.percent}%)`;
 else qs('dailyStats').textContent=`Question ${dailyPos()+1} / ${n} • ${answered} answered`;
 qs('dailyBar').style.width=(n?answered/n*100:0)+'%';
 qs('dailySubmitInfo').textContent=`${answered} / ${n} answered`;
 qs('dailySubmitBar').style.display=daily.submitted?'none':'flex';
 const subs=new Set(items.map(q=>q.cat+'||'+q.sub)).size;
 qs('dailyInfo').textContent=`${daily.date} • ${n} questions from ${subs} sub-categories`;
 updateBadges();
}
function renderDailyResult(){
 const box=qs('dailyResult');
 if(!daily.submitted||!daily.result){box.innerHTML='';return}
 const r=daily.result,deg=Math.max(0,Math.min(360,r.percent*3.6));
 box.innerHTML=`<div class="card" style="margin-bottom:14px;text-align:center">
  <div class="ring" style="background:conic-gradient(#7181ff 0deg,#8b5cf6 ${deg}deg,#263858 ${deg}deg)"><div class="ringin">${r.percent}%</div></div>
  <h2>Today's Score</h2>
  <div class="stats">
   <div class="card"><div class="muted">Correct</div><b>${r.correct}</b></div>
   <div class="card"><div class="muted">Wrong</div><b>${r.wrong}</b></div>
   <div class="card"><div class="muted">Skipped</div><b>${r.skip}</b></div>
   <div class="card"><div class="muted">Score</div><b>${r.correct} / ${r.total}</b></div>
  </div>
  <p class="muted">${r.wrong?`${r.wrong} wrong question${r.wrong>1?'s were':' was'} added to More Practice.`:'No wrong answers today. Great job!'}${r.skip?` ${r.skip} skipped question${r.skip>1?'s were':' was'} added to More Practice › Skipped.`:''} Scroll down to review all answers.</p>
  <button class="btn good" onclick="show('practice')">Go to More Practice</button>
 </div>`;
}
async function renderDaily(){
 if(!(daily&&daily.date===todayStr()&&Array.isArray(daily.qs)))qs('dailyList').innerHTML='<div class="card empty">Loading today\'s questions…</div>';
 try{await prepareDaily()}catch(e){qs('dailyList').innerHTML='<div class="card empty">Could not load today\'s questions. Check your connection, then open this page again.</div>';return}
 if(!qs('daily').classList.contains('active'))return;
 dailyStep();
 renderDailyResult();
 updateDailyStats();
}
function dailySubmit(force){
 ensureDaily();if(daily.submitted)return;stopTimer();
 const items=dailyItems(),n=items.length;
 if(!n)return toast('No questions available.');
 const unanswered=items.filter(q=>daily.answers[q.id]==null).length;
 if(unanswered&&force!==true&&!confirm(`${unanswered} question${unanswered>1?'s are':' is'} unanswered. Submit anyway?`))return;
 let correct=0,wrongN=0,skip=0;
 items.forEach(q=>{
  const a=daily.answers[q.id];
  if(isSkip(q,a)){skip++;addSkip(q)}
  else if(isRight(q,a)){correct++;dropSkip(q.id);if(wrong[q.id])delete wrong[q.id];if(need10[q.id])bumpN10(q.id)}
  else{wrongN++;dropSkip(q.id);addWrong(q)}
 });
 saveWrong();
 daily.submitted=true;daily.left=0;
 daily.result={correct,wrong:wrongN,skip,total:n,percent:Math.round(correct/n*100)};
 put(DAILY_KEY,daily);
 history.unshift({date:new Date().toLocaleString(),cat:'Daily 50',sub:daily.date,total:n,correct,wrong:wrongN,skip,score:correct,percent:+(correct/n*100).toFixed(1)});
 history=history.slice(0,100);put(KEY.hist,history);
 renderDaily();window.scrollTo(0,0);
}

loadCats();refreshHome();restoreTimerPref();

