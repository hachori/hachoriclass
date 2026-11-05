'use strict';

const $ = id => document.getElementById(id);
const ACTIVE_KEY = 'hachoriclass_memo_active_v1';
const CACHE_PREFIX = 'hachoriclass_memo_cache_v1_';
// Use a separate, prefixed document; never write to a class roster or seating plan.
const CLOUD = 'https://firestore.googleapis.com/v1/projects/classroom-seats-8dfbf/databases/(default)/documents/classes/';
const API_KEY = 'AIzaSyCkWzg1dDmjtos3gTKqmiOLOrx0-F6seFI';
const KIND = 'hachoriclass-memo-v1';
const SHARED_ID = 'hachoriclass_memo_main_v3';
const SHARED_KIND = 'hachoriclass-shared-memo-v1';
const bytes = value => new TextEncoder().encode(value);
const asBase64 = value => {
  const data = new Uint8Array(value); let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i,i + 0x8000));
  return btoa(binary);
};
const fromBase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const tokenFor = value => asBase64(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const tokenBytes = value => fromBase64(value.replaceAll('-','+').replaceAll('_','/') + '=');
const safeURL = value => {
  try {
    const raw = value.trim();
    if (!raw || /\s/.test(raw)) return null;
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : 'https://' + raw);
    return ['https:','http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
function cleanState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items)) throw new Error('메모 형식을 확인할 수 없어요.');
  const items = value.items.filter(item => item && /^[A-Za-z0-9_-]{1,100}$/.test(item.id) && ['todo','note','link'].includes(item.type) && Number.isFinite(item.updatedAt) && typeof item.rev === 'string').map(item => ({
    id:item.id,type:item.type,title:String(item.title || '').slice(0,240),body:String(item.body || '').slice(0,30000),
    url:item.type === 'link' ? safeURL(String(item.url || '')) || '' : '',done:!!item.done,updatedAt:item.updatedAt,rev:item.rev.slice(0,100),deleted:!!item.deleted
  }));
  return {version:1,items:items.sort((a,b) => a.id.localeCompare(b.id))};
}
function mergeStates(local, remote) {
  const map = new Map();
  for (const item of [...local.items,...remote.items]) {
    const previous = map.get(item.id);
    if (!previous || item.updatedAt > previous.updatedAt || (item.updatedAt === previous.updatedAt && item.rev > previous.rev)) map.set(item.id,item);
  }
  return {version:1,items:[...map.values()].sort((a,b) => a.id.localeCompare(b.id))};
}
const fingerprint = state => JSON.stringify(state);

class MemoBoard {
  constructor({user=null,token=null,shared=false,documentId=SHARED_ID} = {}) {
    this.shared = shared; this.documentId = documentId;
    this.user = user; this.token = token; this.events = new AbortController(); this.requests = new Set();
    this.state = {version:1,items:[]}; this.dirty = false; this.syncing = false;
    this.visible = window.parent === window || !!window.frameElement?.getClientRects().length;
    this.cloudStamp = null; this.localFailed = false; this.ready = this.init();
  }
  async init() {
    try {
      if (!crypto.subtle) throw new Error('최신 브라우저의 HTTPS 주소에서 열어 주세요.');
      if (this.shared) this.id = this.documentId;
      else {
        if (!this.user || !validToken(this.token)) throw new Error('다시 로그인해 주세요.');
        const raw = tokenBytes(this.token);
        this.key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
        if (this.stopped) { this.key = null; return; }
        this.id = 'account_' + this.user.uid;
      }
      this.cacheKey = CACHE_PREFIX + this.id;
      this.url = (this.shared ? CLOUD + encodeURIComponent(this.id) : CLOUD.replace('/classes/','/teacherMemos/') + encodeURIComponent(this.user.uid)) + '?key=' + API_KEY;
      try {
        const draft = JSON.parse(sessionStorage.getItem(this.cacheKey + '_draft') || 'null');
        const cache = JSON.parse(localStorage.getItem(this.cacheKey) || 'null');
        if (this.shared && cache?.state) { this.state = cleanState(cache.state); this.dirty = !!cache.dirty; this.hasCache = true; }
        else if (draft) { this.state = cleanState(draft.state); this.dirty = !!draft.dirty; this.hasCache = true; }
        else if (cache?.encrypted) { this.state = await this.decrypted(cache.encrypted); this.dirty = !!cache.dirty; this.hasCache = true; }
      } catch { this.localFailed = true; }
      if (this.stopped) return;
      this.bind(); this.render();
      $('sync-now').disabled = false;
      this.poll = setInterval(() => { if (this.visible && !document.hidden) this.sync(); },30000);
      await this.sync();
      if (!this.stopped) $('workspace').inert = !(this.loaded || this.hasCache);
    } catch (error) { this.status('error',error.message || '메모를 열지 못했어요. 다시 열어 주세요.'); }
  }
  bind() {
    const on = (target,event,handler) => target.addEventListener(event,handler,{signal:this.events.signal});
    on($('todo-form'),'submit',event => {
      event.preventDefault(); const title = $('todo-input').value.trim(); if (!title) return;
      this.change(crypto.randomUUID(),{type:'todo',title}); $('todo-input').value = ''; $('todo-input').focus();
    });
    on($('todo-filter'),'change',() => this.render());
    on($('memo-text'),'input',() => this.change('note-main',{type:'note',body:$('memo-text').value}));
    on($('memo-text'),'blur',() => this.render());
    on($('link-form'),'submit',event => {
      event.preventDefault(); const url = safeURL($('link-url').value);
      $('link-error').hidden = !!url;
      if (!url) { $('link-error').textContent = 'http:// 또는 https:// 주소를 입력해 주세요.'; return; }
      this.change(crypto.randomUUID(),{type:'link',title:$('link-title').value.trim() || new URL(url).hostname,url});
      $('link-form').reset(); $('link-title').focus();
    });
    on($('link-url'),'input',() => { $('link-error').hidden = true; });
    on($('sync-now'),'click',() => this.sync());
    on($('cancel-edit'),'click',() => $('edit-dialog').close());
    on($('edit-form'),'submit',event => {
      event.preventDefault(); const item = this.state.items.find(item => item.id === this.editingId);
      if (!item) return;
      const title = $('edit-text').value.trim(); if (!title) return;
      const url = item.type === 'link' ? safeURL($('edit-url').value) : '';
      if (item.type === 'link' && !url) { $('edit-error').textContent = 'http:// 또는 https:// 주소를 입력해 주세요.'; $('edit-error').hidden = false; return; }
      this.change(item.id,{title,url,deleted:false}); $('edit-dialog').close();
    });
    on($('undo-delete'),'click',() => {
      if (this.lastDeleted) this.change(this.lastDeleted.id,{...this.lastDeleted,deleted:false});
      this.lastDeleted = null; $('toast').hidden = true;
    });
    on(window,'online',() => this.sync());
    on(window,'offline',() => this.status('local','이 기기에 저장됨 · 연결되면 동기화'));
    on(window,'storage',async event => {
      if (event.key !== this.cacheKey || !event.newValue) return;
      try { const cache = JSON.parse(event.newValue); const state = this.shared ? cleanState(cache.state) : await this.decrypted(cache.encrypted); if (this.stopped) return; this.state = mergeStates(this.state,state); this.dirty ||= !!cache.dirty; this.render(); this.schedule(); } catch { /* 다른 메모에는 영향이 없다. */ }
    });
    on(document,'visibilitychange',() => {
      if (!document.hidden) this.sync(); else this.keepalive();
    });
    on(window,'pagehide',() => this.keepalive());
  }
  status(state,text) {
    if (this.stopped) return;
    $('sync-status').dataset.state = state;
    if ($('sync-status').textContent !== text) $('sync-status').textContent = text;
  }
  cache() {
    if (this.stopped) return;
    try { (this.shared ? localStorage : sessionStorage).setItem(this.shared ? this.cacheKey : this.cacheKey + '_draft',JSON.stringify({state:this.state,dirty:this.dirty})); }
    catch { this.localFailed = true; }
    this.prepareKeepalive();
  }
  change(id,patch) {
    if (this.stopped) return;
    const previous = this.state.items.find(item => item.id === id) || {id,type:'todo',title:'',body:'',url:'',done:false,deleted:false};
    const clock = Math.max(Date.now(),...this.state.items.map(item => item.updatedAt || 0)) + 1;
    const next = {...previous,...patch,id,updatedAt:clock,rev:crypto.randomUUID()};
    this.state = cleanState({version:1,items:[...this.state.items.filter(item => item.id !== id),next]});
    this.dirty = true; this.cache();
    if (next.type === 'note') $('memo-count').textContent = next.body.length.toLocaleString() + '자';
    else this.render();
    this.status(navigator.onLine ? 'pending' : 'local',navigator.onLine ? '이 기기에 저장됨 · 동기화 중…' : '이 기기에 저장됨 · 연결되면 동기화');
    if (this.localFailed && navigator.onLine) this.status('pending','클라우드에 저장하는 중…');
    if (this.localFailed && !navigator.onLine) this.status('error','이 기기에 저장할 수 없어요. 인터넷 연결을 확인해 주세요.');
    this.prepareKeepalive(); this.schedule();
  }
  schedule() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.sync(),500); }
  remove(item) {
    this.lastDeleted = {...item};
    this.change(item.id,{deleted:true,title:'',body:'',url:''});
    $('toast-text').textContent = '항목을 지웠어요.'; $('undo-delete').hidden = false; $('toast').hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { $('toast').hidden = true; this.lastDeleted = null; },10000);
  }
  edit(item) {
    this.editingId = item.id; $('edit-title').textContent = item.type === 'link' ? '링크 수정' : '할 일 수정';
    $('edit-text').value = item.title; $('edit-url-row').hidden = item.type !== 'link'; $('edit-url').value = item.url;
    $('edit-error').hidden = true; $('edit-dialog').showModal(); $('edit-text').focus();
  }
  button(text,label,action,className) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.className = className; button.setAttribute('aria-label',label); button.addEventListener('click',action); return button;
  }
  render() {
    if (this.stopped) return;
    const focus = document.activeElement?.dataset.focusKey;
    const active = this.state.items.filter(item => !item.deleted);
    const todos = active.filter(item => item.type === 'todo').sort((a,b) => Number(a.done) - Number(b.done) || b.updatedAt - a.updatedAt);
    const done = todos.filter(item => item.done).length, filter = $('todo-filter').value;
    const shown = todos.filter(item => filter === 'all' || (filter === 'done' ? item.done : !item.done));
    $('todo-count').textContent = todos.length - done;
    $('todo-progress').textContent = todos.length ? done + ' / ' + todos.length + ' 완료' : '가볍게 하나씩 시작해요.';
    $('todo-list').replaceChildren(); $('todo-empty').hidden = shown.length > 0;
    for (const item of shown) {
      const li = document.createElement('li'); li.className = 'todo-item' + (item.done ? ' done' : ''); li.dataset.id = item.id;
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.done;
      check.setAttribute('aria-label',item.title + ' 완료'); check.dataset.focusKey = 'check-' + item.id;
      check.addEventListener('change',() => this.change(item.id,{done:check.checked}));
      const title = this.button(item.title,item.title + ' 수정',() => this.edit(item),'todo-text'); title.dataset.focusKey = 'todo-' + item.id;
      li.append(check,title,this.button('×',item.title + ' 삭제',() => this.remove(item),'delete-button')); $('todo-list').append(li);
    }
    const note = active.find(item => item.id === 'note-main')?.body || '';
    if (document.activeElement !== $('memo-text')) $('memo-text').value = note;
    $('memo-count').textContent = (document.activeElement === $('memo-text') ? $('memo-text').value : note).length.toLocaleString() + '자';
    const links = active.filter(item => item.type === 'link' && item.url).sort((a,b) => b.updatedAt - a.updatedAt);
    $('link-count').textContent = links.length; $('link-list').replaceChildren(); $('link-empty').hidden = links.length > 0;
    for (const item of links) {
      const li = document.createElement('li'); li.className = 'link-item'; li.dataset.id = item.id;
      const badge = document.createElement('span'); badge.className = 'link-badge'; badge.textContent = '↗'; badge.setAttribute('aria-hidden','true');
      const link = document.createElement('a'); link.className = 'link-info'; link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const title = document.createElement('strong'); title.textContent = item.title || new URL(item.url).hostname;
      const url = document.createElement('small'); url.textContent = item.url; link.title = item.title + '\n' + item.url; link.append(title,url);
      li.append(badge,link,this.button('수정',item.title + ' 수정',() => this.edit(item),'edit-button'),this.button('×',item.title + ' 삭제',() => this.remove(item),'delete-button')); $('link-list').append(li);
    }
    if (focus) document.querySelector('[data-focus-key="' + CSS.escape(focus) + '"]')?.focus({preventScroll:true});
  }
  async encrypted(state) {
    const plaintext = bytes(fingerprint(state));
    if (plaintext.length > 450000) throw new Error('메모의 양이 많아 동기화할 수 없어요. 오래된 항목을 정리해 주세요.');
    if (this.shared) return {fields:{kind:{stringValue:SHARED_KIND},version:{integerValue:'1'},content:{stringValue:fingerprint(state)}}};
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(this.id)},this.key,plaintext);
    return {fields:{kind:{stringValue:KIND},version:{integerValue:'1'},iv:{stringValue:asBase64(iv)},cipher:{stringValue:asBase64(cipher)}}};
  }
  async decrypted(doc) {
    const fields = doc.fields;
    if (this.shared) {
      if (fields?.kind?.stringValue !== SHARED_KIND || fields.version?.integerValue !== '1' || typeof fields.content?.stringValue !== 'string') throw new Error('저장된 메모 형식을 확인하지 못했어요.');
      return cleanState(JSON.parse(fields.content.stringValue));
    }
    if (fields?.kind?.stringValue !== KIND || fields.version?.integerValue !== '1') throw new Error('계정의 메모 형식을 확인할 수 없어요. 다시 로그인해 주세요.');
    try {
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(fields.iv.stringValue),additionalData:bytes(this.id)},this.key,fromBase64(fields.cipher.stringValue));
      return cleanState(JSON.parse(new TextDecoder().decode(plaintext)));
    } catch { throw new Error('메모를 열지 못했어요. 계정 연결을 다시 확인해 주세요.'); }
  }
  async request(url,options = {}) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(),8000);
    this.requests.add(ctrl);
    try {
      if (!this.shared) this.bearer = await this.user.getIdToken();
      if (this.stopped) throw new DOMException('Stopped','AbortError');
      const response = await fetch(url,{...options,headers:{...options.headers,...(this.bearer ? {Authorization:'Bearer ' + this.bearer} : {})},signal:ctrl.signal});
      const data = await response.json(); return {response,data};
    } finally { clearTimeout(timer); this.requests.delete(ctrl); }
  }
  async sync() {
    if ((!this.shared && !this.key) || this.stopped) return;
    if (this.syncing) { this.syncAgain = true; return; }
    if (!navigator.onLine) {
      if (!this.loaded && !this.hasCache) this.status('error','인터넷에 연결하면 이 메모를 불러올 수 있어요.');
      else this.status(this.localFailed ? 'error' : 'local',this.localFailed ? '저장할 수 없어요. 인터넷 연결을 확인해 주세요.' : '이 기기에 저장됨 · 연결되면 동기화');
      return;
    }
    clearTimeout(this.saveTimer); this.syncing = true; this.syncAgain = false; let success = false;
    if (this.dirty || !this.loaded) this.status('pending',this.dirty ? '메모를 동기화하는 중…' : '메모를 확인하는 중…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const {response,data} = await this.request(this.url);
        if (this.stopped) return;
        if (!response.ok && response.status !== 404) throw new Error('동기화하지 못했어요. 이 기기에 저장하고 다시 시도합니다.');
        const remote = response.status === 404 ? {version:1,items:[]} : await this.decrypted(data);
        this.cloudStamp = response.status === 404 ? null : data.updateTime;
        this.state = mergeStates(this.state,remote); this.cache(); this.render();
        if (fingerprint(this.state) !== fingerprint(remote)) {
          this.dirty = true; this.cache();
          const snapshot = fingerprint(this.state), body = JSON.stringify(await this.encrypted(this.state));
          const condition = this.cloudStamp ? '&currentDocument.updateTime=' + encodeURIComponent(this.cloudStamp) : '&currentDocument.exists=false';
          const written = await this.request(this.url + condition,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
          if (!written.response.ok) {
            if (['FAILED_PRECONDITION','ALREADY_EXISTS','ABORTED'].includes(written.data.error?.status)) continue;
            throw new Error('동기화하지 못했어요. 이 기기에 저장하고 다시 시도합니다.');
          }
          this.cloudStamp = written.data.updateTime; this.dirty = fingerprint(this.state) !== snapshot;
        } else this.dirty = false;
        this.cache(); this.prepared = null; success = true; this.loaded = true; $('workspace').inert = false;
        if (this.dirty) { this.status('pending','이 기기에 저장됨 · 동기화 중…'); this.prepareKeepalive(); }
        else this.status('saved',this.state.items.length ? this.shared ? '자동 저장됨' : '내 계정에 저장됨' : '준비됐어요 · 입력하면 자동 저장');
        break;
      }
      if (!success) throw new Error('다른 기기의 수정 사항을 확인 중이에요. 잠시 뒤 다시 시도합니다.');
    } catch (error) {
      this.cache(); this.status('error',error.name === 'AbortError' ? '연결이 느려요. 이 기기에 저장하고 다시 시도합니다.' : error instanceof TypeError ? '인터넷 연결을 확인해 주세요. 이 기기의 메모는 유지됩니다.' : error.message || '연결을 확인해 주세요. 이 기기의 메모는 유지됩니다.');
      if (this.localFailed) this.status('error','아직 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
      else if (!this.loaded && !this.hasCache) this.status('error','이 컴퓨터에 메모 사본이 없어요. 인터넷 연결 후 다시 동기화해 주세요.');
    } finally {
      this.syncing = false;
      if (success && (this.dirty || this.syncAgain)) this.schedule();
    }
  }
  async prepareKeepalive() {
    try {
      const sig = fingerprint(this.state), body = JSON.stringify(await this.encrypted(this.state));
      if (!this.stopped && sig === fingerprint(this.state)) {
        this.prepared = {sig,body,stamp:this.cloudStamp};
        localStorage.setItem(this.cacheKey,JSON.stringify(this.shared ? {state:this.state,dirty:this.dirty} : {encrypted:JSON.parse(body),dirty:this.dirty}));
      }
    } catch { /* 일반 동기화에서 저장 상태를 표시한다. */ }
  }
  keepalive() {
    if (this.stopped || (!this.shared && !this.bearer) || !this.dirty || !this.prepared || this.prepared.sig !== fingerprint(this.state) || bytes(this.prepared.body).length > 60000) return;
    const condition = this.prepared.stamp ? '&currentDocument.updateTime=' + encodeURIComponent(this.prepared.stamp) : '&currentDocument.exists=false';
    fetch(this.url + condition,{method:'PATCH',headers:{'Content-Type':'application/json',...(this.bearer ? {Authorization:'Bearer ' + this.bearer} : {})},body:this.prepared.body,keepalive:true}).catch(() => {});
  }
  async flush() {
    clearTimeout(this.saveTimer);
    while (this.syncing && !this.stopped) await new Promise(resolve => setTimeout(resolve,25));
    if (this.dirty && !this.stopped) await this.sync();
    await this.prepareKeepalive();
  }
  dispose() {
    this.stopped = true; clearTimeout(this.saveTimer); clearTimeout(this.toastTimer); clearInterval(this.poll);
    this.events.abort(); for (const request of this.requests) request.abort();
    try { sessionStorage.removeItem(this.cacheKey + '_draft'); } catch { /* 암호화한 초안은 유지한다. */ }
    this.key = null; this.bearer = null; this.token = null; this.state = {version:1,items:[]};
  }
}

export {MemoBoard,cleanState,mergeStates,fingerprint,validToken,tokenFor,tokenBytes,bytes,fromBase64,ACTIVE_KEY,CACHE_PREFIX,CLOUD,API_KEY,SHARED_ID};
