'use strict';

const $ = id => document.getElementById(id);
const ACTIVE_KEY = 'hachoriclass_memo_active_v1';
const CACHE_PREFIX = 'hachoriclass_memo_cache_v1_';
// Use a separate, prefixed document; never write to a class roster or seating plan.
const CLOUD = 'https://firestore.googleapis.com/v1/projects/classroom-seats-8dfbf/databases/(default)/documents/classes/';
const API_KEY = 'AIzaSyCkWzg1dDmjtos3gTKqmiOLOrx0-F6seFI';
const KIND = 'hachoriclass-memo-v1';
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
  constructor() {
    this.state = {version:1,items:[]}; this.dirty = false; this.syncing = false;
    this.visible = window.parent === window || !!window.frameElement?.closest('dialog')?.open;
    this.cloudStamp = null; this.localFailed = false; this.ready = this.init();
  }
  async init() {
    try {
      if (!crypto.subtle) throw new Error('최신 브라우저의 HTTPS 주소에서 열어 주세요.');
      const hash = location.hash.slice(1);
      let savedToken;
      try { savedToken = localStorage.getItem(ACTIVE_KEY); } catch { this.localFailed = true; }
      if (hash && !/^v1\.[A-Za-z0-9_-]{43}$/.test(hash)) throw new Error('메모 링크가 올바르지 않아요. 사용하던 링크 전체를 확인해 주세요.');
      this.token = hash ? hash.slice(3) : validToken(savedToken) ? savedToken : tokenFor(crypto.getRandomValues(new Uint8Array(32)));
      this.createdHere = !hash && !validToken(savedToken);
      const raw = tokenBytes(this.token);
      this.key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
      const digest = await crypto.subtle.digest('SHA-256',raw);
      this.id = 'memo_v1_' + Array.from(new Uint8Array(digest),n => n.toString(16).padStart(2,'0')).join('');
      this.url = CLOUD + this.id + '?key=' + API_KEY;
      this.shareURL = new URL('./',location.href).href + '#v1.' + this.token;
      history.replaceState(null,'',location.pathname + location.search + '#v1.' + this.token);
      try {
        localStorage.setItem(ACTIVE_KEY,this.token);
        const cache = JSON.parse(localStorage.getItem(CACHE_PREFIX + this.id) || 'null');
        if (cache) { this.state = cleanState(cache.state); this.dirty = !!cache.dirty; this.hasCache = true; }
      } catch { this.localFailed = true; }
      this.bind(); this.render();
      $('share-link').disabled = false; $('sync-now').disabled = false;
      $('memo-share-url').value = this.shareURL;
      this.poll = setInterval(() => { if (this.visible && !document.hidden) this.sync(); },30000);
      await this.sync();
      $('workspace').inert = !(this.loaded || this.hasCache || this.createdHere);
    } catch (error) { this.status('error',error.message || '메모를 열지 못했어요. 다시 열어 주세요.'); }
  }
  bind() {
    $('todo-form').addEventListener('submit',event => {
      event.preventDefault(); const title = $('todo-input').value.trim(); if (!title) return;
      this.change(crypto.randomUUID(),{type:'todo',title}); $('todo-input').value = ''; $('todo-input').focus();
    });
    $('todo-filter').addEventListener('change',() => this.render());
    $('memo-text').addEventListener('input',() => this.change('note-main',{type:'note',body:$('memo-text').value}));
    $('memo-text').addEventListener('blur',() => this.render());
    $('link-form').addEventListener('submit',event => {
      event.preventDefault(); const url = safeURL($('link-url').value);
      $('link-error').hidden = !!url;
      if (!url) { $('link-error').textContent = 'http:// 또는 https:// 주소를 입력해 주세요.'; return; }
      this.change(crypto.randomUUID(),{type:'link',title:$('link-title').value.trim() || new URL(url).hostname,url});
      $('link-form').reset(); $('link-title').focus();
    });
    $('link-url').addEventListener('input',() => { $('link-error').hidden = true; });
    $('share-link').addEventListener('click',() => { $('copy-link').textContent = '복사'; $('share-dialog').showModal(); $('memo-share-url').select(); });
    $('memo-share-url').addEventListener('click',() => $('memo-share-url').select());
    $('copy-link').addEventListener('click',async () => {
      try { await navigator.clipboard.writeText(this.shareURL); $('copy-link').textContent = '복사 완료'; }
      catch { $('memo-share-url').select(); $('copy-link').textContent = '주소를 선택했어요'; }
    });
    $('open-board-form').addEventListener('submit',async event => {
      event.preventDefault(); let token;
      try {
        const url = new URL($('other-memo-url').value.trim());
        if (url.origin !== location.origin || url.pathname.replace(/\/$/,'') !== new URL('./',location.href).pathname.replace(/\/$/,'') || !/^#v1\.[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error();
        token = url.hash.slice(4);
      } catch { $('open-error').textContent = '‘내 메모 링크’에서 복사한 주소 전체를 붙여넣어 주세요.'; $('open-error').hidden = false; return; }
      await this.sync();
      location.hash = 'v1.' + token; location.reload();
    });
    $('sync-now').addEventListener('click',() => this.sync());
    $('cancel-edit').addEventListener('click',() => $('edit-dialog').close());
    $('edit-form').addEventListener('submit',event => {
      event.preventDefault(); const item = this.state.items.find(item => item.id === this.editingId);
      if (!item) return;
      const title = $('edit-text').value.trim(); if (!title) return;
      const url = item.type === 'link' ? safeURL($('edit-url').value) : '';
      if (item.type === 'link' && !url) { $('edit-error').textContent = 'http:// 또는 https:// 주소를 입력해 주세요.'; $('edit-error').hidden = false; return; }
      this.change(item.id,{title,url,deleted:false}); $('edit-dialog').close();
    });
    $('undo-delete').addEventListener('click',() => {
      if (this.lastDeleted) this.change(this.lastDeleted.id,{...this.lastDeleted,deleted:false});
      this.lastDeleted = null; $('toast').hidden = true;
    });
    document.querySelector('.back-link').addEventListener('click',event => {
      if (window.parent !== window) { event.preventDefault(); window.parent.postMessage({type:'hachoriclass:memo-close'},location.origin); }
    });
    document.addEventListener('keydown',event => {
      if (event.key === 'Escape' && window.parent !== window && !document.querySelector('dialog[open]')) {
        event.preventDefault(); window.parent.postMessage({type:'hachoriclass:memo-close'},location.origin);
      }
    });
    window.addEventListener('message',event => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'hachoriclass:memo-visible') return;
      this.visible = !!event.data.visible; this.sync();
    });
    window.addEventListener('online',() => this.sync());
    window.addEventListener('offline',() => this.status('local','이 기기에 저장됨 · 연결되면 동기화'));
    window.addEventListener('storage',event => {
      if (event.key !== CACHE_PREFIX + this.id || !event.newValue) return;
      try { const cache = JSON.parse(event.newValue); this.state = mergeStates(this.state,cleanState(cache.state)); this.dirty ||= !!cache.dirty; this.render(); this.schedule(); } catch { /* 다른 메모장에는 영향이 없다. */ }
    });
    document.addEventListener('visibilitychange',() => {
      if (!document.hidden) this.sync(); else this.keepalive();
    });
    window.addEventListener('pagehide',() => this.keepalive());
  }
  status(state,text) {
    $('sync-status').dataset.state = state;
    if ($('sync-status').textContent !== text) $('sync-status').textContent = text;
  }
  cache() {
    try { localStorage.setItem(CACHE_PREFIX + this.id,JSON.stringify({state:this.state,dirty:this.dirty})); }
    catch { this.localFailed = true; }
  }
  change(id,patch) {
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
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(this.id)},this.key,plaintext);
    return {fields:{kind:{stringValue:KIND},version:{integerValue:'1'},iv:{stringValue:asBase64(iv)},cipher:{stringValue:asBase64(cipher)}}};
  }
  async decrypted(doc) {
    const fields = doc.fields;
    if (fields?.kind?.stringValue !== KIND || fields.version?.integerValue !== '1') throw new Error('이 메모를 열 수 없어요. 메모 링크를 확인해 주세요.');
    try {
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(fields.iv.stringValue),additionalData:bytes(this.id)},this.key,fromBase64(fields.cipher.stringValue));
      return cleanState(JSON.parse(new TextDecoder().decode(plaintext)));
    } catch { throw new Error('메모를 열지 못했어요. 사용하던 링크를 다시 확인해 주세요.'); }
  }
  async request(url,options = {}) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(),8000);
    try {
      const response = await fetch(url,{...options,signal:ctrl.signal});
      const data = await response.json(); return {response,data};
    } finally { clearTimeout(timer); }
  }
  async sync() {
    if (!this.key) return;
    if (this.syncing) { this.syncAgain = true; return; }
    if (!navigator.onLine) {
      if (!this.loaded && !this.hasCache && !this.createdHere) this.status('error','인터넷에 연결하면 이 메모를 불러올 수 있어요.');
      else this.status(this.localFailed ? 'error' : 'local',this.localFailed ? '저장할 수 없어요. 인터넷 연결을 확인해 주세요.' : '이 기기에 저장됨 · 연결되면 동기화');
      return;
    }
    clearTimeout(this.saveTimer); this.syncing = true; this.syncAgain = false; let success = false;
    if (this.dirty || !this.loaded) this.status('pending',this.dirty ? '메모를 동기화하는 중…' : '메모를 확인하는 중…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const {response,data} = await this.request(this.url);
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
        else this.status('saved',this.localFailed ? '클라우드에 저장됨 · 내 메모 링크를 보관해 주세요' : this.state.items.length ? '클라우드에 저장됨' : '준비됐어요 · 입력하면 자동 저장');
        break;
      }
      if (!success) throw new Error('다른 기기의 수정 사항을 확인 중이에요. 잠시 뒤 다시 시도합니다.');
    } catch (error) {
      this.cache(); this.status('error',error.name === 'AbortError' ? '연결이 느려요. 이 기기에 저장하고 다시 시도합니다.' : error instanceof TypeError ? '인터넷 연결을 확인해 주세요. 이 기기의 메모는 유지됩니다.' : error.message || '연결을 확인해 주세요. 이 기기의 메모는 유지됩니다.');
      if (this.localFailed) this.status('error','아직 저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
      else if (!this.loaded && !this.hasCache && !this.createdHere) this.status('error','이 컴퓨터에 메모 사본이 없어요. 인터넷 연결 후 다시 동기화해 주세요.');
    } finally {
      this.syncing = false;
      if (success && (this.dirty || this.syncAgain)) this.schedule();
    }
  }
  async prepareKeepalive() {
    try {
      const sig = fingerprint(this.state), body = JSON.stringify(await this.encrypted(this.state));
      if (sig === fingerprint(this.state)) this.prepared = {sig,body,stamp:this.cloudStamp};
    } catch { /* 일반 동기화에서 저장 상태를 표시한다. */ }
  }
  keepalive() {
    if (!this.dirty || !this.prepared || this.prepared.sig !== fingerprint(this.state) || bytes(this.prepared.body).length > 60000) return;
    const condition = this.prepared.stamp ? '&currentDocument.updateTime=' + encodeURIComponent(this.prepared.stamp) : '&currentDocument.exists=false';
    fetch(this.url + condition,{method:'PATCH',headers:{'Content-Type':'application/json'},body:this.prepared.body,keepalive:true}).catch(() => {});
  }
}

window.addEventListener('DOMContentLoaded',() => { window.MemoApp = new MemoBoard(); });
