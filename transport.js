import {APPS_SCRIPT_URL} from './config.js';

const CHUNK_BYTES=1024*1024;
const googleOrigin=origin=>/^https:\/\/(?:script\.google\.com|(?:[\w-]+-)?script\.googleusercontent\.com)$/.test(origin);
const sessionName='habr-session:'+new URL('.',location.href).pathname;
let token;
try { token=sessionStorage.getItem(sessionName)||''; }catch {token='';}
let bridge;
const pending=new Map();

function keep(value){
  token=value;
  try {
    if(value)sessionStorage.setItem(sessionName,value);
    else sessionStorage.removeItem(sessionName);
  }catch { /* Some Telegram webviews disable session storage. */ }
}
function connect(){
  if(bridge)return bridge;
  bridge=new Promise((resolve,reject)=>{
    let url;
    try{ url=new URL(APPS_SCRIPT_URL); }catch { /* Configuration is required. */ }
    if(url?.origin!=='https://script.google.com'||!/^\/(?:macros|a\/macros\/[a-z0-9.-]+)\/s\/[\w-]+\/exec$/i.test(url.pathname)){
      reject(new Error('Добавь ссылку Apps Script с /exec в config.js.'));
      return;
    }
    const channel=crypto.randomUUID();
    const frame=document.createElement('iframe');
    frame.hidden=true;
    frame.title='Приложение Google Apps Script';
    url.searchParams.set('channel',channel);
    let peer;
    const timeout=setTimeout(()=>{
      window.removeEventListener('message',receive);
      frame.remove();
      bridge=null;
      reject(new Error('Apps Script не ответил. Проверь публикацию и GITHUB_PAGES_ORIGIN.'));
    },17000);

    function receive(event){
      const message=event.data;
      if(!googleOrigin(event.origin)||message?.channel!==channel||!event.source)return;
      if(message.type==='ready'&&!peer){
        peer={window:event.source,origin:event.origin};
        peer.window.postMessage({type:'connect',channel},peer.origin);
        return;
      }
      if(peer?.window!==event.source||peer.origin!==event.origin)return;
      if(message.type==='connected'){
        clearTimeout(timeout);
        resolve({peer,channel});
        return;
      }
      if(message.type==='result'){
        const request=pending.get(message.id);
        if(!request)return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        request.resolve(message.value);
      }
    }
    window.addEventListener('message',receive);
    frame.src=url.href;
    document.body.append(frame);
  });
  return bridge;
}
async function rpc(path,{method='GET',data,key}={}){
  const {peer,channel}=await connect();
  const id=crypto.randomUUID();
  const result=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      pending.delete(id);
      reject(new Error('Запрос занял слишком много времени. Повтори попытку.'));
    },70000);
    pending.set(id,{resolve,timeout});
    peer.window.postMessage({type:'rpc',channel,id,value:{path,method,data:data??null,key:key??null,token}},peer.origin);
  });
  if(!result?.ok){
    const error=new Error(result?.error||'Apps Script временно недоступен.');
    error.status=result?.status||503;
    if(error.status===401)keep('');
    throw error;
  }
  if(path==='/session'&&method==='POST'){
    const {token:issued,...safe}=result.data;
    keep(issued);
    return safe;
  }
  if(path==='/session'&&method==='DELETE')keep('');
  return result.data;
}
function to64(values){
  let binary='';
  for(let start=0;start<values.length;start+=8192){
    binary+=String.fromCharCode(...values.subarray(start,start+8192));
  }
  return btoa(binary);
}
function from64(value){
  const binary=atob(value);
  return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
}

async function upload(file,key){
  const params={name:file.name,size:file.size,key};
  const {id,offset,file:saved}=await rpc('/uploads/begin',{method:'POST',data:params});
  if(saved)return saved;
  for(let cursor=offset;cursor<file.size;){
    const bytes=new Uint8Array(await file.slice(cursor,cursor+CHUNK_BYTES).arrayBuffer());
    const reply=await rpc('/uploads/chunk',{method:'POST',data:{id,offset:cursor,data:to64(bytes)}});
    if(reply.offset!==cursor+bytes.length)throw new Error('Не удалось подтвердить часть файла. Повтори загрузку.');
    cursor=reply.offset;
  }
  return rpc('/uploads/finish',{method:'POST',data:{id}});
}

export async function api(path,options={}){
  if(path==='/config'){
    if(!APPS_SCRIPT_URL.trim())throw new Error('Добавь ссылку Apps Script с /exec в config.js.');
    return {demo:false,fileLimit:20000000,types:['PDF','DOCX']};
  }
  if(path==='/session'&&(!options.method||options.method==='GET')&&!token){
    const error=new Error('Войдите в приложение.');
    error.status=401;
    throw error;
  }
  return options.file?upload(options.file,options.key):rpc(path,options);
}

export async function downloadAttachment(path){
  const chunks=[];
  let offset=0,file;
  do{
    file=await rpc(path+'?offset='+offset);
    if(file.next<=offset||file.next>file.size)throw new Error('Не удалось скачать файл.');
    chunks.push(from64(file.data));
    offset=file.next;
  }while(offset<file.size);
  const blob=new Blob(chunks,{type:'application/octet-stream'});
  const href=URL.createObjectURL(blob);
  const control=document.createElement('a');
  control.href=href;
  control.download=file.name;
  document.body.append(control);
  control.click();
  control.remove();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
}

export const attachmentHref = () => '#';
