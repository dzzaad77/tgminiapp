import {attachmentHref} from './transport.js?v=423958bde57f';

export const escape = input => String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const e=escape;
export const roles={author:'Автор',editor:'Редактор',admin:'Администратор'};
export const statuses={new:['Новая','blue'],review:['На проверке','blue'],edits:['Нужны правки','amber'],ready:['Готова к публикации','green'],published:['Опубликована','green'],rejected:['Отклонена','red'],withdrawn:['Отозвана','neutral']};
const eventNames={created:'Заявка отправлена',edit:'Заявка изменена',assign:'Назначение редактора',start:'Началась проверка',edits:'Запрошены правки',resubmit:'Отправлены исправления',ready:'Статья готова',reopen:'Статья возвращена на проверку',publish:'Статья опубликована',correct:'Ссылка исправлена',reject:'Заявка отклонена',withdraw:'Заявка отозвана',comment:'Комментарий'};
const actionNames={assign:'Назначить редактора',withdraw:'Отозвать заявку',reject:'Отклонить',edit:'Изменить заявку',start:'Взять в работу',edits:'Запросить правки',ready:'Отметить готовность',resubmit:'Отправить исправления',publish:'Подтвердить публикацию',reopen:'Вернуть на проверку',correct:'Исправить ссылку'};
const dateFormat = new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
const date = value => dateFormat.format(new Date(value));
const size = value => new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(value/1e6)+' МБ';
export const icon = (name, size=22) => miniAppIconSvg(name,'currentColor',size);
const urlFor = id => '#request/'+encodeURIComponent(id);
const nameInitials = name => name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const btn=(label,classes='primary')=>'<button type="submit" class="button '+classes+'">'+e(label)+'</button>';
const linkBtn=(href,label,classes='primary')=>'<a href="'+e(href)+'" class="button '+classes+'">'+e(label)+'</a>';
const heading=(title,subtitle)=>'<header class="heading"><h1>'+e(title)+'</h1>'+(subtitle?'<p>'+e(subtitle)+'</p>':'')+'</header>';
const group=(title,content)=>'<section><h2>'+e(title)+'</h2><div class="panel">'+content+'</div></section>';
const note=(title,content,tone='blue')=>'<aside class="note '+tone+'"><strong>'+e(title)+'</strong><div>'+e(content)+'</div></aside>';
const badge=status=>{
  const [label,tone]=statuses[status]||statuses.new;
  return '<span class="badge '+tone+'"><span aria-hidden="true">●</span> '+label+'</span>';
};
const blank=(title,description,action='')=>'<div class="blank"><span class="tile">'+icon('files')+'</span><h2>'+e(title)+'</h2><p>'+e(description)+'</p>'+action+'</div>';
const external=(href,label,css='link')=>'<a class="'+css+'" href="'+e(href)+'" target="_blank" rel="noopener noreferrer" data-external>'+e(label)+'</a>';

export function top(user,back) {
  return '<header class="top">'+(back?'<a class="glass back" href="'+e(back)+'" data-back aria-label="Назад">'+icon('chevron-left')+'</a>':'<span class="mark">'+icon('sber',26)+'</span>')+
    '<span class="wordmark">Сбер × Хабр</span>'+(user?'<span class="role">'+e(roles[user.role])+'</span>':'')+'</header>';
}
export function nav(user,page) {
  const first=user.role==='author'?['home','Обзор','house']:['queue','Очередь','inbox'];
  const tabs=[first];
  if(user.canSubmit)tabs.push(['mine','Мои заявки','files']);
  tabs.push(['feed','Лента','bell']);
  if(user.role==='admin')tabs.push(['access','Доступ','users-round']);
  tabs.push(['profile','Профиль',null]);
  return '<nav class="dock glass" aria-label="Разделы Mini App">'+tabs.map(([id,label,symbol])=>
    '<a href="#'+id+'" title="'+label+'" aria-label="'+label+'"'+(page===id?' aria-current="page"':'')+'>'+
    (symbol?icon(symbol,23):'<span class="avatar">'+e(nameInitials(user.name))+'</span>')+'</a>').join('')+'</nav>';
}
export function signIn(config,message='') {
  const profiles=[['101','Илья Орлов','Автор'],['102','Алина Морозова','Автор'],['201','Анна Миронова','Редактор'],['301','Мария Волкова','Администратор']];
  return heading('Редакция на Хабре',config.demo?'Локальная демонстрация':'Подача и согласование статей корпоративного блога.')+
    (message?note('Вход недоступен',message,'red'):'')+
    (config.demo?group('Выберите профиль',profiles.map(([id,name,role])=>'<button class="list-row" data-demo="'+id+'"><span class="avatar">'+e(nameInitials(name))+'</span><span><strong>'+name+'</strong><small>'+role+'</small></span>'+icon('chevron-right',16)+'</button>').join('')):
      note('Войдите через Telegram','Откройте Mini App из меню бота или по его ссылке.'));
}

function requestRow(entry,description) {
  return '<a class="request-row" href="'+urlFor(entry.id)+'"><span class="row-meta"><span>'+e(entry.number)+'</span>'+badge(entry.status)+'</span>'+
    '<strong>'+e(entry.title)+'</strong><small>'+e(description||entry.editor||'Ожидается назначение')+'</small></a>';
}
function eventRow(item,link) {
  const name=eventNames[item.type]||'Статус изменился';
  const body='<span class="tile">'+icon(item.type==='publish'?'circle-check':item.type==='comment'?'message-square':'history',18)+'</span><span><strong>'+e(name)+'</strong>'+
    '<small>'+e(link?item.number+' · '+date(item.at):item.by+' · '+date(item.at))+'</small>'+
    (!link&&item.reason?'<small class="event-reason">'+e(item.reason)+'</small>':'')+
    (!link&&item.type==='assign'?'<small>'+e(item.editor||'Редактор снят')+'</small>':'')+
    (!link&&item.oldUrl?'<small>'+escape(item.oldUrl)+' → '+escape(item.url)+'</small>':'')+'</span>';
  return link?'<a class="list-row" href="'+urlFor(item.requestId)+'">'+body+icon('chevron-right',16)+'</a>':'<div class="list-row">'+body+'</div>';
}
export function home(meta,queue,activity) {
  const needs=queue.items.filter(item=>item.status==='edits');
  return heading('Обзор')+
    '<section class="hero"><h2>Статья на Хабр</h2><p>'+(meta.accepting?'Отправьте черновик на проверку редакции.':'Приём новых заявок на паузе.')+'</p>'+
    (meta.accepting?linkBtn('#new','Подать статью'):'')+'</section>'+
    (needs.length?group('Требуется ваше действие',needs.map(item=>requestRow(item,'Отправьте исправленную версию')).join('')):'')+
    group('Последние события',activity.items.length?activity.items.slice(0,4).map(item=>eventRow(item,true)).join(''):blank('Пока нет событий','Здесь появятся обновления по вашим заявкам.'));
}
export function queueView(meta,queue,current,kind,unassigned) {
  const mine=kind==='mine';
  const title=mine?'Мои заявки':meta.user.role==='admin'?'Очередь редакции':'Назначенные заявки';
  const tabs=[['active','Активные'],['archive','Архив']];
  if(!mine&&meta.user.role==='admin')tabs.splice(1,0,['unassigned','Без редактора']);
  const filters=tabs.map(([id,label])=>'<button type="button" class="chip" data-tab="'+id+'" aria-pressed="'+(current.tab===id)+'">'+label+'</button>').join('');
  const create=mine&&meta.accepting&&meta.user.canSubmit?linkBtn('#new','Подать статью'):'';
  return heading(title,mine?null:meta.user.role==='admin'?'Все заявки пилота':'Ваши заявки в редакции')+
    (!mine&&meta.user.role==='admin'&&unassigned?'<button type="button" class="summary" data-tab="unassigned"><strong>'+unassigned+'</strong><span>Ожидают назначения<small>Открыть очередь без редактора</small></span>'+icon('arrow-up-right',18)+'</button>':'')+
    '<div class="chips">'+filters+'</div>'+
    '<form data-form="search" class="search"><label>Поиск<input type="search" name="q" placeholder="Номер или название" value="'+e(current.q)+'"></label>'+
    '<label>Статус<select name="status" aria-label="Статус"><option value="">Все статусы</option>'+Object.entries(statuses).map(([id,[label]])=>'<option value="'+id+'"'+(current.status===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    btn('Найти','secondary')+'</form>'+
    (queue.items.length?'<div class="panel">'+queue.items.map(entry=>requestRow(entry,mine?undefined:[entry.author,entry.editor||'Без редактора'].join(' · '))).join('')+'</div>':
      blank('Заявок не найдено',current.q||current.status?'Попробуйте изменить поиск или статус.':'В этом разделе пока нет заявок.'))+
    (queue.next!==null?'<button class="button secondary" data-more="'+queue.next+'">Следующая страница</button>':'')+
    (current.offset>0?'<button class="button secondary" data-more="'+Math.max(0,current.offset-30)+'">Предыдущая страница</button>':'')+create;
}
export function feedView(data) {
  return heading('Лента')+(data.items.length?group('Недавние события',data.items.map(item=>eventRow(item,true)).join('')):
    blank('Пока нет событий','Обновления по доступным заявкам появятся здесь.'));
}

function stage(entry) {
  const active={new:0,review:1,edits:1,ready:2,published:3}[entry.status];
  if(active===undefined)return '';
  return '<ol class="stages" aria-label="Этапы заявки">'+['Заявка',entry.status==='edits'?'Правки':'Проверка','Готова','Хабр'].map((step,index)=>
    '<li class="'+(index===active?'selected':index<active?'past':'')+'"'+(index===active?' aria-current="step"':'')+'>'+step+'</li>').join('')+'</ol>';
}
function materials(entry,version) {
  return version.files.map(file=>{
    const url='/requests/'+e(entry.id)+'/files/'+e(file.id);
    return '<a class="list-row" href="'+attachmentHref(url)+'" data-download="'+url+'" download><span class="tile">'+icon('file-text',18)+'</span><span><strong>'+e(file.name)+'</strong><small>'+size(file.size)+'</small></span>'+icon('chevron-right',16)+'</a>';
  }).join('')+
    version.links.map(link=>'<div class="list-row"><span class="tile">'+icon('link-2',18)+'</span><span>'+external(link,new URL(link).hostname+' · открыть материал')+'</span></div>').join('');
}
export function requestView(entry) {
  const newest=entry.versions.at(-1);
  const reasonType={edits:'edits',rejected:'reject',withdrawn:'withdraw'}[entry.status];
  const latest=[...entry.events].reverse().find(item=>item.type===reasonType&&item.reason);
  const comment='<form data-form="comment"><label>Комментарий<textarea name="reason" required maxlength="2000" rows="3"></textarea></label>'+btn('Отправить комментарий','secondary')+'</form>';
  const control=entry.actions.filter(action=>action!=='comment').map(action=>linkBtn('#action/'+e(entry.id)+'/'+action,actionNames[action],
    ['withdraw','reject'].includes(action)?'danger':['assign','edit','reopen','correct'].includes(action)?'secondary':'primary')).join('');
  return '<header class="heading request-heading"><div class="row-meta"><span>'+e(entry.number)+'</span>'+badge(entry.status)+'</div><h1>'+e(entry.title)+'</h1></header>'+stage(entry)+
    (latest?note(entry.status==='edits'?'Что нужно поправить':'Причина',latest.reason,entry.status==='edits'?'amber':'red'):'')+
    (entry.publication?'<section class="hero"><h2>Статья опубликована</h2><p>'+e(entry.publication.title)+'</p><small>'+e(entry.publication.by+' · '+date(entry.publication.at))+'</small>'+external(entry.publication.url,'Открыть на Хабре','button primary')+'</section>':'')+
    '<dl class="panel facts"><div><dt>Подал заявку</dt><dd>'+e(entry.author)+'</dd></div><div><dt>Редактор</dt><dd>'+e(entry.editor||'Пока не назначен')+'</dd></div><div><dt>Команда</dt><dd>'+e(entry.team)+'</dd></div>'+
    '<div><dt>Авторы статьи</dt><dd>'+e(entry.authors.join(', '))+'</dd></div><div><dt>Рабочая почта</dt><dd>'+e(entry.email)+'</dd></div>'+
    (entry.profile?'<div><dt>Хабр</dt><dd>'+external(entry.profile,'Профиль автора')+'</dd></div>':'')+'</dl>'+
    (entry.summary?note('Об статье',entry.summary):'')+
    group('Материалы · версия '+newest.number,materials(entry,newest))+
    (control?'<div class="controls">'+control+'</div>':'')+
    (entry.versions.length>1?'<section><h2>Предыдущие версии</h2><div class="panel">'+entry.versions.slice(0,-1).reverse().map(version=>'<details><summary>Версия '+version.number+' · '+e(date(version.at))+'</summary>'+materials(entry,version)+'</details>').join('')+'</div></section>':'')+
    group('История',entry.events.slice().reverse().map(event=>eventRow(event,false)).join(''))+
    (entry.actions.includes('comment')?comment:'');
}

const input=(name,label,value='',attrs='')=>'<label>'+e(label)+'<input name="'+name+'" value="'+e(value)+'" '+attrs+'></label>';
const textarea=(name,label,value='')=>'<label>'+e(label)+'<textarea name="'+name+'" rows="3" maxlength="4000">'+e(value)+'</textarea></label>';
export function editorForm(meta,entry,action,draft) {
  const isRevision=action==='resubmit';
  const material=draft.links?.length?draft.links:[''];
  const authors=draft.authors?.length?draft.authors:[meta.user.name];
  const details=isRevision?'': '<section><h2>О статье</h2>'+input('title','Название статьи',draft.title,'required minlength="5" maxlength="200"')+
    input('team','Команда',draft.team,'required maxlength="120"')+input('email','Рабочая почта',draft.email,'required type="email" maxlength="254"')+
    '<div id="authors">'+authors.map((name,index)=>input('authors',index?'Соавтор '+index:'ФИО автора',name,'required maxlength="120"')).join('')+'</div>'+
    '<button type="button" class="button secondary" data-add="authors">Добавить соавтора</button>'+
    input('profile','Профиль на Хабре · необязательно',draft.profile,'type="url"')+textarea('summary','Описание · необязательно',draft.summary)+'</section>';
  return heading(isRevision?'Исправленная версия':action==='edit'?'Изменить заявку':'Новая заявка',entry?.number||'Публикация в корпоративном блоге')+
    '<form id="material-form" data-form="material">'+details+'<section><h2>Материалы</h2><p class="hint">PDF или DOCX · до 20 МБ на файл, до 5 файлов и 5 ссылок.</p>'+
    '<div id="uploads" aria-live="polite"></div><label class="upload-trigger button secondary">Прикрепить файл<input type="file" id="file-picker" accept=".pdf,.docx" multiple></label>'+
    '<div id="links">'+material.map((link,index)=>input('links',index?'Дополнительная ссылка':'HTTPS-ссылка на черновик',link,'type="url" maxlength="2048"')).join('')+'</div>'+
    '<button type="button" class="button secondary" data-add="links">Добавить ссылку</button></section>'+
    '<p class="form-error" role="alert" hidden></p>'+btn(isRevision?'Отправить на проверку':action==='edit'?'Сохранить изменения':'Отправить заявку')+'</form>';
}

export function actionForm(entry,action,editors,user) {
  const title=actionNames[action];
  let fields='';
  if(action==='assign'){
    fields='<label>Редактор<select name="editorId" aria-label="Редактор"><option value="">Без редактора</option>'+editors.filter(editor=>editor.id!==entry.authorId).map(editor=>'<option value="'+e(editor.id)+'"'+(editor.id===entry.editorId?' selected':'')+'>'+e(editor.name)+'</option>').join('')+'</select></label>';
  }
  if(['edits','reject','reopen','correct'].includes(action)||(action==='withdraw'&&user.id!==entry.authorId)){
    fields+=textarea('reason',action==='edits'?'Что нужно исправить':'Причина').replace('rows="3"','rows="3" required');
  }
  if(action==='publish'||action==='correct'){
    fields+=input('finalTitle','Итоговый заголовок',entry.publication?.title||entry.title,'required maxlength="200"')+
      input('url','Ссылка на публикацию',entry.publication?.url,'type="url" required placeholder="https://habr.com/…"')+
      '<label class="check"><input type="checkbox" name="verified" required> Я сверил статью и блог Сбера на Хабре</label>';
  }
  if(!fields)fields='<p class="hint">Действие сохранится в истории заявки.</p>';
  return heading(title,entry.number)+'<form data-form="action">'+fields+'<p class="form-error" role="alert" hidden></p>'+
    btn(title,['withdraw','reject'].includes(action)?'danger':'primary')+'</form>';
}
export function profileView(meta) {
  return heading('Профиль')+'<div class="panel account"><span class="avatar">'+e(nameInitials(meta.user.name))+'</span><div><strong>'+e(meta.user.name)+'</strong><small>'+e(roles[meta.user.role])+'</small></div></div>'+
    '<form data-form="preferences"><label class="check"><input type="checkbox" name="notify"'+(meta.user.notify?' checked':'')+'> Уведомления о правках и результате</label>'+btn('Сохранить настройки','secondary')+'</form>'+
    '<button class="button secondary" type="button" data-theme>Переключить тему</button><button class="button secondary" type="button" data-signout>Выйти</button>';
}
export function accessView(meta,data) {
  return heading('Доступ','Участники пилота')+group('Приём заявок','<form data-form="intake"><p>'+ (meta.accepting?'Приём новых заявок открыт.':'Приём новых заявок на паузе.')+'</p>'+
    btn(meta.accepting?'Поставить на паузу':'Возобновить приём','secondary')+'</form>')+
    group('Участники',data.items.map(user=>'<a class="list-row" href="#user/'+e(user.id)+'"><span class="avatar">'+e(nameInitials(user.name))+'</span><span><strong>'+e(user.name)+'</strong><small>'+roles[user.role]+' · '+(user.active?'доступ открыт':'доступ закрыт')+'</small></span>'+icon('chevron-right',16)+'</a>').join(''))+
    linkBtn('#user/new','Добавить участника');
}
export function userView(user) {
  return heading(user?'Участник пилота':'Добавить участника')+
    '<form data-form="user">'+input('id','Telegram ID',user?.id,'required inputmode="numeric" pattern="[0-9]{1,16}"'+(user?' readonly':''))+
    input('name','Имя',user?.name,'required maxlength="100"')+
    '<label>Роль<select name="role" aria-label="Роль">'+Object.entries(roles).map(([id,label])=>'<option value="'+id+'"'+(user?.role===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<label class="check"><input type="checkbox" name="active"'+(!user||user.active?' checked':'')+'> Доступ открыт</label>'+
    '<label class="check"><input type="checkbox" name="canSubmit"'+(user?.canSubmit?' checked':'')+'> Редактор может подавать свои статьи</label>'+
    '<p class="form-error" role="alert" hidden></p>'+btn('Сохранить')+'</form>';
}
