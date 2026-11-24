import {APPS_SCRIPT_URL} from './config.js';

const CHUNK_BYTES=1024*1024;
const googleOrigin=origin=>/^https:\/\/(?:script\.google\.com|(?:[\w-]+-)?script\.googleusercontent\.com)$/.test(origin);
const sessionName='habr-session:'+new URL('.',location.href).pathname;
let token;
try { token=sessionStorage.getItem(sessionName)||''; }catch {token='';}
let bridge;
let connection;
const pending=new Map();

function keep(value){
  token=value;
  try {
    if(value)sessionStorage.setItem(sessionName,value);
    else sessionStorage.removeItem(sessionName);
  }catch { /* Some Telegram webviews disable session storage. */ }
}
function endpoint(){
  let url;
  try{ url=new URL(APPS_SCRIPT_URL); }catch { /* Configuration is required. */ }
  if(url?.origin!=='https://script.google.com'||!/^\/(?:macros|a\/macros\/[a-z0-9.-]+)\/s\/[\w-]+\/exec$/i.test(url.pathname)){
    throw new Error('Добавь ссылку Apps Script с /exec в config.js.');
  }
  return url;
}
async function direct(url,value,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url.href,{
      method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'content-type':'text/plain;charset=UTF-8'},body:JSON.stringify(value),signal:controller.signal
    });
    if(!response.ok)throw new Error('Apps Script вернул ошибку HTTP.');
    return await response.json();
  }finally {clearTimeout(timer);}
}
function connect(){
  if(bridge)return bridge;
  bridge=new Promise((resolve,reject)=>{
    const url=endpoint();
    const channel=crypto.randomUUID();
    const frame=document.createElement('iframe');
    frame.className='apps-script-bridge';
    frame.setAttribute('aria-hidden','true');
    frame.tabIndex=-1;
    frame.title='Приложение Google Apps Script';
    url.searchParams.set('channel',channel);
    let peer;
    const timeout=setTimeout(()=>{
      window.removeEventListener('message',receive);
      frame.remove();
      bridge=null;
      reject(new Error('Apps Script не ответил. Проверь публикацию и GITHUB_PAGES_ORIGIN.'));
    },30000);

    function receive(event){
      const message=event.data;
      if(!googleOrigin(event.origin)||message?.channel!==channel||!event.source)return;
      if(message.type==='ready'){
        if(!peer)peer={window:event.source,origin:event.origin};
        if(peer.window===event.source&&peer.origin===event.origin){
          peer.window.postMessage({type:'connect',channel},peer.origin);
        }
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
async function viaFrame(value){
  const {peer,channel}=await connect();
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      pending.delete(id);
      reject(new Error('Запрос занял слишком много времени. Повтори попытку.'));
    },70000);
    pending.set(id,{resolve,timeout});
    peer.window.postMessage({type:'rpc',channel,id,value},peer.origin);
  });
}
async function selectConnection(){
  const url=endpoint();
  let timer;
  const ready=(async()=>{
    const probe=await direct(url,{path:'/config',method:'GET'},7000);
    if(probe?.ok&&probe.data?.fileLimit===20000000)return value=>direct(url,value,70000);
    throw new Error('Прямое подключение Apps Script недоступно.');
  })();
  const wait=new Promise(resolve=>{timer=setTimeout(resolve,1000);});
  const fallback=Promise.race([wait,ready.then(()=>wait,()=>{})]).then(async()=>{
    await connect();
    return viaFrame;
  });
  try { return await Promise.any([ready,fallback]); }
  catch(error){ throw error.errors.at(-1); }
  finally { clearTimeout(timer); }
}
async function rpc(path,{method='GET',data,key}={}){
  if(!connection){
    connection=selectConnection().catch(error=>{connection=null;throw error;});
  }
  const send=await connection;
  const session=token;
  const result=await send({path,method,data:data??null,key:key??null,token:session});
  if(!result?.ok){
    const error=new Error(result?.error||'Apps Script временно недоступен.');
    error.status=result?.status||503;
    if(error.status===401&&token===session)keep('');
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
  if((path==='/session'||path.startsWith('/page?'))&&(!options.method||options.method==='GET')&&!token){
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
