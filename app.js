import * as view from './views.js';
import {api,downloadAttachment} from './transport.js';

const root=document.querySelector('#app');
const terminalFiles=new Set(['clean','error','rejected']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
let config, meta, telegram, current, entry, editors=[], draft, back, generation=0;
let sending=false;
let forcedTheme;
const drafts=new Map();
const commandKeys=new Map();
const filterByPage=new Map();
const safeError=error=>error?.message||'Повторите попытку.';
const defaultRoute=()=>meta.user.role==='author'?'home':'queue';
const href=id=>'#request/'+id;
const keyFor=scope=>commandKeys.get(scope)||crypto.randomUUID();
const jsonData=element=>Object.fromEntries(new FormData(element));

function setTheme(){
  const dark=forcedTheme!==undefined?forcedTheme:telegram?telegram.colorScheme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  telegram?.setHeaderColor?.(dark?'#141923':'#f2f4f8');
  telegram?.setBackgroundColor?.(dark?'#141923':'#f2f4f8');
}

async function loadTelegram(){
  await new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='https://telegram.org/js/telegram-web-app.js';
    const timeout=setTimeout(resolve,6000);
    script.onload=script.onerror=()=>{clearTimeout(timeout);resolve();};
    document.head.append(script);
  });
  telegram=window.Telegram?.WebApp;
  telegram?.ready?.();
  telegram?.expand?.();
  telegram?.BackButton?.onClick(()=>{if(back)go(back);});
  telegram?.onEvent?.('themeChanged',setTheme);
}
function go(hash){
  const target=hash.startsWith('#')?hash:'#'+hash;
  if(location.hash===target)route();
  else location.hash=target;
}
function shell(content,{page='',backTo='',busy=false}={}){
  back=backTo;
  if(back)telegram?.BackButton?.show();
  else telegram?.BackButton?.hide();
  root.setAttribute('aria-busy',String(busy));
  root.innerHTML=view.top(meta?.user,back)+
    '<div class="scroll'+(page?' with-dock':'')+'">'+content+'</div>'+
    (page&&meta?view.nav(meta.user,page):'')+'<p class="toast" role="status" hidden></p>';
}
function notify(message){
  const toast=root.querySelector('.toast');
  if(!toast)return;
  toast.textContent=message;
  toast.hidden=false;
  setTimeout(()=>{toast.hidden=true;},4200);
}
function problem(error){
  if(error.status===401||error.status===403&&!meta){
    meta=null;
    shell(view.signIn(config,safeError(error)));
    return;
  }
  shell('<section class="blank"><h1>Экран недоступен</h1><p>'+view.escape(safeError(error))+'</p><button class="button secondary" data-retry>Повторить</button></section>',
    {backTo:meta?'#'+defaultRoute():''});
}
async function boot(){
  try{
    config=await api('/config');
    if(!config.demo) await loadTelegram();
    setTheme();
    try{meta=await api('/session');}
    catch(error){
      if(!telegram?.initData){
        if(error.status!==401&&error.status!==403)throw error;
        shell(view.signIn(config));
        return;
      }
      meta=await api('/session',{method:'POST',data:{initData:telegram.initData}});
    }
    const deep=telegram?.initDataUnsafe?.start_param||new URL(location.href).searchParams.get('tgWebAppStartParam');
    if(!location.hash&&deep?.startsWith('req_')&&uuid.test(deep.slice(4)))go(href(deep.slice(4)));
    else route();
  }catch(error){
    if(config&&[401,403].includes(error.status))shell(view.signIn(config,safeError(error)));
    else problem(error);
  }
}

function filters(page){
  if(!filterByPage.has(page))filterByPage.set(page,{tab:'active',q:'',status:'',offset:0});
  return filterByPage.get(page);
}
async function loadQueue(page){
  const active=filters(page);
  const params=new URLSearchParams({...active,...(page==='mine'?{mine:'1'}:{})});
  const [result,unassigned]=await Promise.all([api('/requests?'+params),
    page==='queue'&&meta.user.role==='admin'?api('/requests?tab=unassigned'):null]);
  return view.queueView(meta,result,active,page,unassigned?.total);
}
function formDraft(action,item){
  const scope=action+'-'+(item?.id||'new');
  if(!drafts.has(scope)){
    const base=action==='edit'?item:null;
    const version=base?.versions.at(-1);
    drafts.set(scope,{
      scope,action,id:item?.id, title:base?.title||'',team:base?.team||'',email:base?.email||'',
      authors:base?.authors||[meta.user.name],summary:base?.summary||'',profile:base?.profile||'',
      links:version?.links||[''], uploads:new Map((version?.files||[]).map(file=>[file.id,file]))
    });
  }
  return drafts.get(scope);
}
async function loadView(page,id,action,version){
  if(page==='home'){
    if(meta.user.role!=='author')return loadQueue('queue');
    const [list,feed]=await Promise.all([api('/requests?mine=1&status=edits'),api('/feed')]);
    return view.home(meta,list,feed);
  }
  if(page==='mine'||page==='queue')return loadQueue(page);
  if(page==='feed')return view.feedView(await api('/feed'));
  if(page==='profile')return view.profileView(meta);
  if(page==='access')return view.accessView(meta,await api('/admin/users'));
  if(page==='user'){
    const {items}=await api('/admin/users');
    const person=items.find(user=>user.id===id);
    if(id!=='new'&&!person)throw new Error('Участник недоступен.');
    return view.userView(person);
  }
  if(page==='new'){
    if(!meta.user.canSubmit || !meta.accepting)throw new Error('Приём новых заявок недоступен.');
    draft=formDraft('new',null);
    return view.editorForm(meta,null,'new',draft);
  }
  if(!['request','action'].includes(page)||!uuid.test(id))throw new Error('Заявка недоступна.');
  const loaded=await api('/requests/'+id);
  if(version!==generation)return '';
  entry=loaded;
  if(page==='request')return view.requestView(entry);
  if(!entry.actions.includes(action))throw new Error('Действие недоступно в текущем статусе.');
  if(['edit','resubmit'].includes(action)){
    draft=formDraft(action,entry);
    return view.editorForm(meta,entry,action,draft);
  }
  if(action==='assign'){
    const available=await api('/editors');
    if(version!==generation)return '';
    editors=available.items;
  }
  return view.actionForm(entry,action,editors,meta.user);
}
function backFor(page,id){
  if(page==='request')return meta.user.role==='author'?'#mine':'#queue';
  if(page==='action')return href(id);
  if(page==='new')return '#'+defaultRoute();
  if(page==='user')return '#access';
  return '';
}
function captureDraft(){
  const form=document.querySelector('#material-form');
  if(!draft||!form)return;
  const data=new FormData(form);
  for(const field of ['title','team','email','summary','profile'])if(data.has(field))draft[field]=data.get(field);
  draft.authors=data.getAll('authors');
  draft.links=data.getAll('links');
}
async function route(){
  if(!meta)return;
  const version=++generation;
  captureDraft();
  draft=null; entry=null; editors=[];
  const [raw,id,action]=location.hash.slice(1).split('/');
  const page=raw||defaultRoute();
  current={page,id,action};
  const dock=['home','queue','mine','feed','profile','access'].includes(page)?page:'';
  const backTo=backFor(page,id);
  shell('<p class="boot" role="status">Загружаем…</p>',{page:dock,backTo,busy:true});
  try {
    const state=await api('/session');
    if(version!==generation)return;
    meta=state;
    if((page==='home'&&meta.user.role!=='author')||(page==='queue'&&meta.user.role==='author')){
      go(defaultRoute());
      return;
    }
    const content=await loadView(page,id,action,version);
    if(version!==generation)return;
    shell(content,{page:dock,backTo});
    if(draft)renderUploads();
  }catch(error){
    if(version===generation)problem(error);
  }
}

function renderUploads(){
  const target=document.querySelector('#uploads');
  if(!target||!draft)return;
  const label={uploading:'Загрузка…',checking:'На проверке',clean:'Готов к прикреплению',rejected:'Отклонён',error:'Ошибка'};
  target.innerHTML=[...draft.uploads.values()].map(file=>
    '<div class="upload-row"><div><strong>'+view.escape(file.name)+'</strong><small>'+label[file.status]+(file.reason?' · '+view.escape(file.reason):'')+'</small></div>'+
    (file.status==='error'&&file.source?'<button type="button" data-retry-file="'+view.escape(file.id)+'">Повторить</button>':'')+
    '<button type="button" data-remove-file="'+view.escape(file.id)+'" aria-label="Убрать '+view.escape(file.name)+'">Убрать</button></div>').join('');
  const submit=document.querySelector('#material-form button[type=submit]');
  if(submit)submit.disabled=sending||[...draft.uploads.values()].some(file=>file.status!=='clean');
}
async function sendFile(target,id){
  const item=target.uploads.get(id);
  if(!item?.source)return;
  item.status='uploading'; item.reason='';
  if(draft===target)renderUploads();
  try{
    const file=await api('/uploads',{method:'POST',file:item.source,key:item.key});
    if(target.uploads.has(id)){
      target.uploads.delete(id);
      target.uploads.set(file.id,file);
    }
  }catch(error){
    item.status='error';
    item.reason=safeError(error);
  }
  if(draft===target)renderUploads();
}
function addFiles(files){
  if(!draft||!files.length)return;
  const target=draft;
  for(const file of files.slice(0,Math.max(0,5-target.uploads.size))){
    if(file.size>config.fileLimit){notify('Файл превышает 20 МБ.');continue;}
    if(!/\.(pdf|docx)$/i.test(file.name)){notify('Принимаются PDF и DOCX.');continue;}
    const id=crypto.randomUUID();
    target.uploads.set(id,{id,name:file.name,source:file,status:'uploading',key:id});
    sendFile(target,id);
  }
}
let polling=false;
setInterval(async()=>{
  const target=draft;
  if(polling||!target)return;
  const pending=[...target.uploads.values()].filter(file=>file.status==='checking');
  if(!pending.length)return;
  polling=true;
  try {
    await Promise.allSettled(pending.map(async file=>{
      try{
        const updated=await api('/uploads/'+file.id);
        if(target.uploads.has(file.id)&&terminalFiles.has(updated.status))target.uploads.set(file.id,updated);
      }catch(error){
        if(error.status===404&&target.uploads.has(file.id)){
          target.uploads.set(file.id,{...file,status:'error',reason:'Файл больше недоступен. Загрузите его заново.'});
        }
      }
    }));
  }finally{
    polling=false;
    if(draft===target)renderUploads();
  }
},750);

async function command(path,data,scope){
  const fingerprint=scope+':'+JSON.stringify(data);
  const key=keyFor(fingerprint);
  commandKeys.set(fingerprint,key);
  const result=await api(path,{method:'POST',data,key});
  commandKeys.delete(fingerprint);
  return result;
}
async function submitMaterial(){
  captureDraft();
  const target=draft;
  const files=[...target.uploads.values()];
  if(files.some(file=>file.status!=='clean'))throw new Error('Дождитесь проверки или уберите проблемный файл.');
  const data={title:target.title,team:target.team,email:target.email,authors:target.authors,
    summary:target.summary,profile:target.profile,links:target.links.map(link=>link.trim()).filter(Boolean),fileIds:files.map(file=>file.id)};
  if(target.action!=='new')Object.assign(data,{action:target.action,expectedVersion:entry.recordVersion});
  const path=target.action==='new'?'/requests':'/requests/'+target.id+'/actions';
  const result=await command(path,data,target.scope);
  drafts.delete(target.scope);
  draft=null;
  go(href(result.id));
}
async function submitAction(form,action){
  const data=jsonData(form);
  data.action=action;
  data.expectedVersion=entry.recordVersion;
  if(data.verified==='on')data.verified=true;
  const result=await command('/requests/'+entry.id+'/actions',data,entry.id+':'+action);
  go(href(result.id));
}
async function preferences(form){
  const enabled=new FormData(form).has('notify');
  let allowed=false;
  if(enabled&&!meta.user.canMessage&&telegram?.requestWriteAccess){
    allowed=await new Promise(resolve=>telegram.requestWriteAccess(resolve));
  }
  const saved=await api('/preferences',{method:'PUT',data:{notify:enabled,canMessage:allowed}});
  meta.user=saved.user;
  notify(enabled&&!saved.user.canMessage?'Настройка сохранена. Для сообщений нужно разрешение Telegram.':'Настройки сохранены.');
}
const formHandlers={
  material:submitMaterial,
  action:form=>submitAction(form,current.action),
  comment:form=>submitAction(form,'comment'),
  search:form=>{
    Object.assign(filters(current.page),jsonData(form),{offset:0});
    return route();
  },
  preferences,
  intake:async()=>{
    await api('/admin/intake',{method:'PUT',data:{accepting:!meta.accepting}});
    return route();
  },
  user:async form=>{
    const data=jsonData(form);
    data.active=data.active==='on';
    data.canSubmit=data.canSubmit==='on';
    await api('/admin/users',{method:'PUT',data});
    go('#access');
  }
};
async function submit(event){
  const form=event.target;
  const handler=formHandlers[form.dataset.form];
  if(!handler)return;
  event.preventDefault();
  if(sending)return;
  const submitter=event.submitter;
  const issue=form.querySelector('.form-error');
  if(issue)issue.hidden=true;
  sending=true;
  if(submitter)submitter.disabled=true;
  try { await handler(form); }
  catch(error){
    if(error.status===409&&entry){
      const latest=await api('/requests/'+entry.id).catch(()=>null);
      if(latest)entry=latest;
    }
    if(error.status===401){ problem(error);return; }
    if(issue){issue.textContent=safeError(error);issue.hidden=false;}
    else notify(safeError(error));
  }finally{
    sending=false;
    if(submitter)submitter.disabled=false;
    if(draft)renderUploads();
  }
}

async function click(event){
  const control=event.target.closest('button,a');
  if(!control)return;
  const data=control.dataset;
  try{
    if(data.demo){
      if(sending)return;
      sending=true;
      try{
        meta=await api('/session',{method:'POST',data:{demoId:data.demo}});
        go(defaultRoute());
      }finally{sending=false;}
    }
    if(data.retry!==undefined){ if(meta)route();else boot(); }
    if(data.tab){ Object.assign(filters(current.page),{tab:data.tab,offset:0});route(); }
    if(data.more!==undefined){ filters(current.page).offset=Number(data.more);route(); }
    if(data.removeFile&&draft){ draft.uploads.delete(data.removeFile);renderUploads(); }
    if(data.retryFile&&draft)sendFile(draft,data.retryFile);
    if(data.add){
      captureDraft();
      const list=draft?.[data.add];
      if(!list)return;
      const limit=data.add==='authors'?10:5;
      if(list.length>=limit){notify('Достигнут лимит: '+limit+'.');return;}
      list.push('');
      const scroll=root.querySelector('.scroll').scrollTop;
      shell(view.editorForm(meta,entry,draft.action,draft),{backTo:back});
      renderUploads();
      root.querySelector('.scroll').scrollTop=scroll;
      root.querySelector('#'+data.add+' label:last-child input').focus();
    }
    if(data.theme!==undefined){
      forcedTheme=document.documentElement.dataset.theme!=='dark';
      setTheme();
    }
    if(data.signout!==undefined){
      await api('/session',{method:'DELETE'});
      generation++;
      meta=null;entry=null;draft=null;
      drafts.clear();commandKeys.clear();filterByPage.clear();
      shell(view.signIn(config));
      history.replaceState(null,'',location.pathname);
    }
    if(data.download!==undefined&&downloadAttachment){
      event.preventDefault();
      if(control.getAttribute('aria-busy')==='true')return;
      control.setAttribute('aria-busy','true');
      notify('Скачиваем файл…');
      try { await downloadAttachment(data.download); }
      finally { control.removeAttribute('aria-busy'); }
    }
    if(data.external!==undefined&&telegram?.openLink){
      event.preventDefault();
      telegram.openLink(control.href);
    }
  }catch(error){notify(safeError(error));}
}
root.addEventListener('submit',submit);
root.addEventListener('click',click);
root.addEventListener('change',event=>{
  if(event.target.id==='file-picker'){
    addFiles(Array.from(event.target.files));
    event.target.value='';
  }
});
window.addEventListener('hashchange',route);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&meta&&!sending&&['home','mine','queue','feed'].includes(current?.page))route();
});
boot();
