'use strict';
const METRICS = [
  ['correctness','Correctness','Factual accuracy relative to the evidence.'],
  ['groundedness','Groundedness','Support for factual claims in the source evidence.'],
  ['completeness','Completeness','Covers the important information needed.'],
  ['relevance','Relevance','Directly addresses the question.']
];
const KEY='sdsu-rag-eval-draft-v1';
const $=id=>document.getElementById(id);
let questions=[],items=[],index=0,profile={},ratings={},ready=false;
function text(el,str){el.textContent=str==null?'':String(str)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderMarkdown(markdown){
  // Escape untrusted source content before minimal markdown formatting.
  // No raw HTML, no scripts, no javascript: links.
  const lines=String(markdown||'').replace(/\r/g,'').split('\n');
  const inline=raw=>{
    let s=esc(raw);
    s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_m,title,url)=>'<a href="'+url.replace(/&amp;/g,'&amp;')+'" target="_blank" rel="noopener noreferrer">'+title+'</a>');
    return s;
  };
  let out='',inList=false;
  const close=()=>{if(inList){out+='</ul>';inList=false;}};
  for(const line of lines){let t=line.trim();if(!t){close();continue}
    if(/^#{1,4} /.test(t)){close();let n=t.match(/^#+/)[0].length;out+=`<h${n+1}>${inline(t.slice(n+1))}</h${n+1}>`;continue}
    if(/^[-*] /.test(t)){if(!inList){out+='<ul>';inList=true;}out+='<li>'+inline(t.slice(2))+'</li>';continue}
    close();out+='<p>'+inline(t)+'</p>';
  }close();return out;
}
function show(name){['welcome','evaluation','review','done'].forEach(id=>$(id).hidden=id!==name);window.scrollTo(0,0)}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({profile,ratings,index}))}catch(e){console.warn('Local draft not saved',e)}}
function completed(id){return METRICS.every(([m])=>Number.isInteger(ratings[id]?.[m])&&ratings[id][m]>=1&&ratings[id][m]<=5)}
function count(){return items.filter(it=>completed(it.id)).length}
function updateProgress(){text($('stepLabel'),`Response ${index+1} of ${items.length}`);text($('progressLabel'),`${count()} / ${items.length} rated`);$('fill').style.width=`${100*count()/items.length}%`}
function setSource(tab,q){
  $('referenceText').hidden=tab!=='ref';$('chunkList').hidden=tab!=='chunks';$('refTab').classList.toggle('selected',tab==='ref');$('chunksTab').classList.toggle('selected',tab==='chunks');
  text($('referenceText'),q.out_of_scope?'No linked authoritative SDSU article is available for this intentional out-of-scope question.':'\n'+(q.reference||'No linked reference text was included in the packet.'));
  $('chunkList').replaceChildren();
  const chunks=q.retrieved_excerpts||[];
  if(!chunks.length){text($('chunkList'),'No retrieved excerpts supplied.');return;}
  for(const ch of chunks){const d=document.createElement('div');d.className='chunk';const h=document.createElement('h3');text(h,`[${ch.citation_id}] ${ch.title||'Source excerpt'}`);const p=document.createElement('div');text(p,ch.text);d.append(h,p);$('chunkList').append(d)}
}
function render(){const it=items[index],q=it.question,resp=it.response;show('evaluation');updateProgress();text($('questionId'),q.id+' · '+resp.label);text($('questionTitle'),q.question);$('outOfScope').hidden=!q.out_of_scope;text($('answerLabel'),resp.label);$('answerText').innerHTML=renderMarkdown(resp.answer);setSource('ref',q);
 $('metricGrid').replaceChildren();for(const [metric,label,help] of METRICS){const block=document.createElement('div');block.className='metric';const head=document.createElement('div');head.className='metric-head';const b=document.createElement('b');text(b,label);const state=document.createElement('small');text(state,ratings[it.id]?.[metric]?`${ratings[it.id][metric]}/5`:'Not rated');head.append(b,state);const descr=document.createElement('p');text(descr,help);const controls=document.createElement('div');controls.className='rating-options';for(let i=1;i<=5;i++){const l=document.createElement('label'),inp=document.createElement('input'),sp=document.createElement('span');inp.type='radio';inp.name=metric;inp.value=String(i);inp.checked=ratings[it.id]?.[metric]===i;inp.setAttribute('aria-label',`${label}: ${i}`);inp.addEventListener('change',()=>{ratings[it.id]??={};ratings[it.id][metric]=i;text(state,`${i}/5`);persist();updateProgress()});text(sp,i);l.append(inp,sp);controls.append(l)}block.append(head,descr,controls);$('metricGrid').append(block)}$('comment').value=ratings[it.id]?.comment||'';$('backBtn').disabled=index===0;text($('nextBtn'),index===items.length-1?'Review all answers →':'Next response →');text($('navPosition'),`${index+1} / ${items.length}`)}
function saveCurrent(){const it=items[index];ratings[it.id]??={};ratings[it.id].comment=$('comment').value.trim();persist()}
function review(){show('review');text($('completedCount'),`${count()} / ${items.length}`);$('reviewList').replaceChildren();for(const [i,it] of items.entries()){const div=document.createElement('div');div.className='review-item';const t=document.createElement('span');text(t,`${it.question.id} · ${it.response.label}`);const s=document.createElement('span');s.className='status';text(s,completed(it.id)?'✓ Rated':'Incomplete');const b=document.createElement('button');text(b,'Edit');b.addEventListener('click',()=>{index=i;persist();render()});div.append(t,s,b);$('reviewList').append(div)}$('submitBtn').disabled=count()!==items.length;text($('submitMessage'),count()===items.length?'':'Complete all ratings before submitting.')}
function validateEmail(str){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)}
async function submit(){const apiUrl=window.EVAL_CONFIG?.apiUrl;if(!apiUrl||apiUrl.includes('REPLACE-WITH')){text($('submitMessage'),'Configure site/config.js with your Cloudflare Worker URL before submitting.');return}if(count()!==30){text($('submitMessage'),'Please complete all 30 ratings.');return}
 const payload={submission_id:crypto.randomUUID(),judge_id:crypto.randomUUID(),full_name:profile.full_name,email:profile.email,affiliation:profile.affiliation,submitted_at:new Date().toISOString(),evaluations:items.map(it=>({question_id:it.question.id,response_id:it.id,correctness:ratings[it.id].correctness,groundedness:ratings[it.id].groundedness,completeness:ratings[it.id].completeness,relevance:ratings[it.id].relevance,comment:ratings[it.id].comment||''}))};
 // Reuse the same submission ID on retry to avoid accidental duplicate rows.
 let stored=null;try{stored=JSON.parse(sessionStorage.getItem('sdsu-pending-submission')||'null')}catch{}if(stored?.evaluations?.length===30)payload.submission_id=stored.submission_id;
 sessionStorage.setItem('sdsu-pending-submission',JSON.stringify(payload));const btn=$('submitBtn');btn.disabled=true;text(btn,'Submitting…');text($('submitMessage'),'Sending evaluations securely…');
 try{const res=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await res.json()}catch{}if(!res.ok||!data.success)throw Error(data.message||`Submission failed (HTTP ${res.status}). Check with the research team before retrying.`);sessionStorage.removeItem('sdsu-pending-submission');localStorage.removeItem(KEY);text($('receipt'),`Submission receipt: ${payload.submission_id}`);show('done')}
 catch(e){text($('submitMessage'),`${e.message} Your ratings are still saved on this device.`)}finally{btn.disabled=false;text(btn,'Submit all 30 evaluations')}
}
async function init(){try{const res=await fetch('questions.json',{cache:'no-store'});if(!res.ok)throw Error('questions.json could not be loaded');questions=(await res.json()).questions;if(questions.length!==10)throw Error('Expected exactly 10 questions');items=questions.flatMap(q=>q.responses.map(response=>({question:q,response,id:response.id})));if(items.length!==30||new Set(items.map(x=>x.id)).size!==30)throw Error('Expected 30 unique anonymous responses');ready=true;
 let draft=null;try{draft=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}if(draft?.ratings)ratings=draft.ratings;if(draft?.profile){profile=draft.profile;$('fullName').value=profile.full_name||'';$('email').value=profile.email||'';$('affiliation').value=profile.affiliation||'';}if(Number.isInteger(draft?.index))index=Math.max(0,Math.min(29,draft.index));}
 catch(e){document.querySelector('.welcome .lead').textContent='Could not load evaluation data: '+e.message+'. Run build_site.py and publish the generated site/questions.json.'}}
$('startForm').addEventListener('submit',e=>{e.preventDefault();if(!ready)return;const full_name=$('fullName').value.trim(),email=$('email').value.trim(),affiliation=$('affiliation').value.trim();if(!full_name||!validateEmail(email)||!affiliation||!$('consent').checked)return;profile={full_name,email,affiliation};persist();render()});
$('refTab').onclick=()=>setSource('ref',items[index].question);$('chunksTab').onclick=()=>setSource('chunks',items[index].question);
$('comment').addEventListener('input',saveCurrent);
$('backBtn').onclick=()=>{saveCurrent();index=Math.max(0,index-1);persist();render()};
$('nextBtn').onclick=()=>{saveCurrent();if(!completed(items[index].id)){alert('Please score all four criteria before continuing.');return}if(index===items.length-1){review();return}index++;persist();render()};
$('returnBtn').onclick=()=>render();$('submitBtn').onclick=submit;init();
