import {MemoBoard,cleanState,mergeStates,fingerprint,validToken,tokenFor,tokenBytes,bytes,fromBase64,ACTIVE_KEY,CACHE_PREFIX,CLOUD,API_KEY} from './app.js?v=3';

const el = id => document.getElementById(id);
const PROFILE_CACHE = 'hachoriclass_memo_profile_v2_';
const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';

class MemoSession {
  constructor() {
    this.epoch = 0; this.bindShell(); this.ready = this.init();
  }
  bindShell() {
    // Preserve a legacy link as an import candidate, then remove it from the address.
    const legacy = location.hash.match(/^#v1\.([A-Za-z0-9_-]{43})$/)?.[1];
    if (legacy) { try { localStorage.setItem(ACTIVE_KEY,legacy); } catch { this.legacyToken = legacy; } }
    if (location.hash) history.replaceState(null,'',location.pathname + location.search);
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
      if (window.MemoApp) { MemoApp.visible = !!event.data.visible; MemoApp.sync(); }
    });
    el('login').addEventListener('click',() => this.login());
    el('logout').addEventListener('click',() => this.logout());
    el('retry-account').addEventListener('click',() => this.auth?.currentUser ? this.accountChanged(this.auth.currentUser) : this.init());
    el('show-import').addEventListener('click',() => this.openImport());
    el('import-local').addEventListener('click',() => this.openImport());
    el('import-form').addEventListener('submit',event => { event.preventDefault(); this.importLegacy(); });
  }
  async init() {
    try {
      el('login').disabled = true; el('auth-error').hidden = true;
      const [appSDK,authSDK] = await Promise.all([import(SDK + 'firebase-app.js'),import(SDK + 'firebase-auth.js')]);
      this.sdk = authSDK;
      const app = appSDK.getApps().find(app => app.name === 'hachoriclass-memo') || appSDK.initializeApp({apiKey:API_KEY,authDomain:'classroom-seats-8dfbf.firebaseapp.com',projectId:'classroom-seats-8dfbf'},'hachoriclass-memo');
      this.auth = authSDK.initializeAuth(app,{persistence:authSDK.browserSessionPersistence,popupRedirectResolver:authSDK.browserPopupRedirectResolver});
      this.auth.languageCode = 'ko';
      authSDK.onAuthStateChanged(this.auth,user => this.accountChanged(user),() => this.showError('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.'));
    } catch {
      this.showError('로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      el('retry-account').hidden = false;
    }
  }
  showError(message) { el('auth-error').textContent = message; el('auth-error').hidden = false; }
  async login() {
    if (!this.auth || this.auth.currentUser) return;
    el('login').disabled = true; el('auth-error').hidden = true;
    try {
      const provider = new this.sdk.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
      await this.sdk.signInWithPopup(this.auth,provider);
    } catch (error) {
      const messages = {
        'auth/popup-closed-by-user':'로그인 창이 닫혔어요. 다시 눌러 로그인해 주세요.',
        'auth/popup-blocked':'로그인 팝업이 차단됐어요. 브라우저에서 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.',
        'auth/unauthorized-domain':'이 사이트의 로그인 주소 설정을 확인해야 합니다.',
        'auth/operation-not-allowed':'Google 로그인 설정을 확인해야 합니다.',
        'auth/network-request-failed':'인터넷 연결을 확인한 뒤 다시 로그인해 주세요.'
      };
      this.showError(messages[error.code] || '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally { el('login').disabled = false; }
  }
  clearWorkspace() {
    window.MemoApp?.dispose(); window.MemoApp = null;
    el('workspace').inert = true; el('workspace').hidden = true;
    for (const id of ['todo-list','link-list']) el(id).replaceChildren();
    for (const id of ['memo-text','todo-input','link-title','link-url','legacy-url','edit-text','edit-url']) el(id).value = '';
    for (const id of ['todo-count','link-count']) el(id).textContent = '0';
    el('memo-count').textContent = '0자'; el('todo-progress').textContent = '가볍게 하나씩 시작해요.';
    el('todo-filter').value = 'all'; el('todo-empty').hidden = false; el('link-empty').hidden = false;
    el('account-tip').hidden = true; el('legacy-banner').hidden = true; el('toast').hidden = true;
    el('sync-now').hidden = true; el('sync-now').disabled = true;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  }
  async accountChanged(user) {
    const epoch = ++this.epoch; this.clearWorkspace(); el('auth-error').hidden = true; el('retry-account').hidden = true;
    el('auth-gate').hidden = false; el('login').hidden = !!user; el('logout').hidden = !user;
    el('account-name').hidden = !user; el('account-name').textContent = user?.displayName || user?.email || '';
    el('login').disabled = false; el('logout').disabled = false;
    if (!user) { el('sync-status').dataset.state = 'local'; el('sync-status').textContent = '로그인하면 내 메모를 불러옵니다'; return; }
    el('sync-status').dataset.state = 'loading'; el('sync-status').textContent = '내 계정의 메모를 불러오는 중…';
    try {
      const token = await this.profileKey(user);
      if (epoch !== this.epoch) return;
      const board = new MemoBoard({user,token}); window.MemoApp = board;
      await board.ready;
      if (epoch !== this.epoch) return;
      el('auth-gate').hidden = true; el('workspace').hidden = false; el('account-tip').hidden = false; el('sync-now').hidden = false;
      const candidate = this.savedLegacy();
      if (validToken(candidate)) {
        const id = await this.legacyId(candidate);
        if (epoch !== this.epoch) return;
        try { el('legacy-banner').hidden = localStorage.getItem('hachoriclass_memo_imported_' + user.uid + '_' + id) === '1'; } catch { el('legacy-banner').hidden = false; }
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.showError(error.message || '내 메모를 불러오지 못했어요. 다시 시도해 주세요.'); el('retry-account').hidden = false;
      el('sync-status').dataset.state = 'error'; el('sync-status').textContent = '계정 연결을 확인해 주세요';
    }
  }
  async profileRequest(user,url,options = {}) {
    const ctrl = new AbortController(), timeout = setTimeout(() => ctrl.abort(),8000);
    try {
      const bearer = await user.getIdToken();
      const response = await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer ' + bearer},signal:ctrl.signal});
      return {response,data:await response.json()};
    } finally { clearTimeout(timeout); }
  }
  async profileKey(user) {
    const cacheKey = PROFILE_CACHE + user.uid;
    const url = CLOUD.replace('/classes/','/memoAccounts/') + encodeURIComponent(user.uid) + '?key=' + API_KEY;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const found = await this.profileRequest(user,url);
        if (found.response.ok) {
          const token = found.data.fields?.key?.stringValue;
          if (found.data.fields?.version?.integerValue !== '1' || !validToken(token)) throw new Error('계정의 저장 정보를 확인할 수 없어요.');
          if (this.auth.currentUser?.uid === user.uid && !this.loggingOut) { try { sessionStorage.setItem(cacheKey,token); } catch {} }
          return token;
        }
        if (found.response.status !== 404) throw new Error('계정의 저장 공간에 접근하지 못했어요. 다시 로그인해 주세요.');
        const token = tokenFor(crypto.getRandomValues(new Uint8Array(32)));
        const created = await this.profileRequest(user,url + '&currentDocument.exists=false',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:{version:{integerValue:'1'},key:{stringValue:token}}})});
        if (created.response.ok) { if (this.auth.currentUser?.uid === user.uid && !this.loggingOut) { try { sessionStorage.setItem(cacheKey,token); } catch {} } return token; }
        if (!['ALREADY_EXISTS','FAILED_PRECONDITION','ABORTED'].includes(created.data.error?.status)) throw new Error('계정의 저장 공간을 만들지 못했어요. 다시 시도해 주세요.');
      }
      throw new Error('다른 기기의 계정 연결을 확인 중이에요. 다시 시도해 주세요.');
    } catch (error) {
      if (!navigator.onLine || error.name === 'AbortError' || error instanceof TypeError) {
        let cached; try { cached = sessionStorage.getItem(cacheKey); } catch {}
        if (validToken(cached)) return cached;
        throw new Error('처음 로그인할 때는 인터넷 연결이 필요해요. 연결 후 다시 시도해 주세요.');
      }
      throw error;
    }
  }
  async logout() {
    if (!this.auth?.currentUser) return;
    const uid = this.auth.currentUser.uid; this.loggingOut = true; el('logout').disabled = true; el('workspace').inert = true;
    try {
      await window.MemoApp?.flush();
      try { sessionStorage.removeItem(PROFILE_CACHE + uid); } catch {}
      await this.sdk.signOut(this.auth);
    } catch { el('logout').disabled = false; el('workspace').inert = false; window.MemoApp?.status('error','저장을 마무리하지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
    finally { this.loggingOut = false; }
  }
  savedLegacy() { try { return this.legacyToken || localStorage.getItem(ACTIVE_KEY); } catch { return this.legacyToken; } }
  async legacyId(token) {
    const digest = await crypto.subtle.digest('SHA-256',tokenBytes(token));
    return 'memo_v1_' + Array.from(new Uint8Array(digest),n => n.toString(16).padStart(2,'0')).join('');
  }
  openImport() { el('import-status').hidden = true; el('import-dialog').showModal(); }
  async importLegacy() {
    const board = window.MemoApp, user = this.auth?.currentUser;
    if (!board || !user) return;
    el('import-submit').disabled = true; el('import-status').hidden = true; el('import-status').classList.remove('success');
    try {
      let token = this.savedLegacy(); const entered = el('legacy-url').value.trim();
      if (entered) {
        let url; try { url = new URL(entered); } catch {}
        if (!url || url.origin !== location.origin || url.pathname.replace(/\/$/,'') !== new URL('./',import.meta.url).pathname.replace(/\/$/,'') || !/^#v1\.[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error('이전 ‘내 메모 링크’ 주소 전체를 붙여넣어 주세요.');
        token = url.hash.slice(4);
      }
      if (!validToken(token)) throw new Error('이 기기에 이전 메모가 없어요. 사용하던 메모 링크를 입력해 주세요.');
      const id = await this.legacyId(token);
      let local = {version:1,items:[]}, remote = {version:1,items:[]}, hasLocal = false;
      try { const cache = JSON.parse(localStorage.getItem(CACHE_PREFIX + id) || 'null'); if (cache?.state) { local = cleanState(cache.state); hasLocal = true; } } catch {}
      try {
        const ctrl = new AbortController(), timeout = setTimeout(() => ctrl.abort(),8000);
        let response; try { response = await fetch(CLOUD + id + '?key=' + API_KEY,{signal:ctrl.signal}); } finally { clearTimeout(timeout); }
        if (response.ok) {
          const doc = await response.json();
          if (doc.fields?.kind?.stringValue !== 'hachoriclass-memo-v1') throw new Error('이전 메모 형식이 올바르지 않아요.');
          const key = await crypto.subtle.importKey('raw',tokenBytes(token),'AES-GCM',false,['decrypt']);
          const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(doc.fields.iv.stringValue),additionalData:bytes(id)},key,fromBase64(doc.fields.cipher.stringValue));
          remote = cleanState(JSON.parse(new TextDecoder().decode(plaintext)));
        } else if (response.status !== 404) throw new Error('이전 메모를 불러오지 못했어요.');
      } catch (error) { if (!hasLocal) throw new Error('이전 메모를 불러오지 못했어요. 인터넷 연결과 메모 링크를 확인해 주세요.'); }
      const legacy = mergeStates(local,remote);
      if (!legacy.items.some(item => !item.deleted && (item.title || item.body || item.url))) throw new Error('가져올 이전 메모가 없어요. 링크를 확인해 주세요.');
      await board.flush();
      if (board.stopped || this.auth.currentUser?.uid !== user.uid) throw new Error('계정이 변경되었어요. 다시 시도해 주세요.');
      const previous = board.state.items.find(item => item.id === 'note-main' && !item.deleted)?.body || '';
      const imported = legacy.items.find(item => item.id === 'note-main' && !item.deleted)?.body || '';
      const combined = previous && imported && previous !== imported && !previous.includes(imported) ? previous + '\n\n── 이전 메모 ──\n' + imported : previous || imported;
      if (combined.length > 30000) throw new Error('합친 메모가 너무 길어요. 자유 메모를 조금 정리한 뒤 가져와 주세요.');
      board.state = mergeStates(board.state,legacy); board.dirty = true;
      if (previous || imported) board.change('note-main',{type:'note',body:combined,deleted:false});
      board.cache(); board.render(); await board.flush();
      if (board.dirty) throw new Error('이 기기에 가져왔어요. 인터넷 연결 후 내 계정에 저장될 때까지 기다려 주세요.');
      try { localStorage.setItem('hachoriclass_memo_imported_' + user.uid + '_' + id,'1'); } catch {}
      el('legacy-banner').hidden = true; el('import-status').textContent = '기존 메모를 내 계정에 저장했어요. 이제 다른 교실에서도 로그인하면 됩니다.'; el('import-status').classList.add('success'); el('import-status').hidden = false;
    } catch (error) { el('import-status').textContent = error.message || '가져오지 못했어요. 다시 시도해 주세요.'; el('import-status').hidden = false; }
    finally { el('import-submit').disabled = false; }
  }
}

window.MemoApp = null;
window.MemoSession = new MemoSession();
