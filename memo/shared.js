import {MemoBoard,cleanState,mergeStates,validToken,tokenBytes,bytes,fromBase64,ACTIVE_KEY,CACHE_PREFIX,CLOUD,API_KEY} from './app.js?v=3';

const el = id => document.getElementById(id);
const embedded = window.parent !== window;
const notify = type => { if (embedded) window.parent.postMessage({type},location.origin); };
const board = new MemoBoard({shared:true});
window.MemoApp = board;

if (new URLSearchParams(location.search).get('widget') === '1') {
  document.body.classList.add('widget-mode'); el('memo-views').hidden = false;
}
document.querySelector('.back-link').addEventListener('click',event => {
  if (embedded) { event.preventDefault(); notify('hachoriclass:memo-close'); }
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape' && embedded && !document.querySelector('dialog[open]')) {
    event.preventDefault(); notify('hachoriclass:memo-close');
  }
});
document.addEventListener('pointerdown',() => notify('hachoriclass:memo-focus'));
window.addEventListener('message',event => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'hachoriclass:memo-visible') return;
  board.visible = !!event.data.visible;
  if (board.visible) board.sync(); else board.flush();
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => {
  document.querySelectorAll('[data-view]').forEach(other => other.setAttribute('aria-pressed',String(other === button)));
  for (const type of ['todo','note','links']) document.querySelector('.' + type + '-panel').hidden = button.dataset.view !== 'all' && button.dataset.view !== type;
}));
const openImport = () => { el('import-status').hidden = true; el('import-dialog').showModal(); };
el('show-import').addEventListener('click',openImport);
el('widget-import').addEventListener('click',openImport);
const hashToken = location.hash.match(/^#v1\.([A-Za-z0-9_-]{43})$/)?.[1];
if (hashToken) { try { localStorage.setItem(ACTIVE_KEY,hashToken); } catch {} }
if (location.hash) history.replaceState(null,'',location.pathname + location.search);

async function legacySource() {
  let token = hashToken;
  try { token ||= localStorage.getItem(ACTIVE_KEY); } catch {}
  const entered = el('legacy-url').value.trim();
  if (entered) {
    let url; try { url = new URL(entered); } catch {}
    if (!url || url.origin !== location.origin || url.pathname.replace(/\/$/,'') !== new URL('./',import.meta.url).pathname.replace(/\/$/,'') || !/^#v1\.[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error('이전 ‘내 메모 링크’ 주소 전체를 붙여넣어 주세요.');
    token = url.hash.slice(4);
  }
  if (!validToken(token)) throw new Error('이 기기에 이전 메모가 없어요. 사용하던 메모 링크를 입력해 주세요.');
  const digest = await crypto.subtle.digest('SHA-256',tokenBytes(token));
  const id = 'memo_v1_' + Array.from(new Uint8Array(digest),n => n.toString(16).padStart(2,'0')).join('');
  let local = {version:1,items:[]}, remote = local, hasLocal = false;
  try { const cache = JSON.parse(localStorage.getItem(CACHE_PREFIX + id)); if (cache?.state) { local = cleanState(cache.state); hasLocal = true; } } catch {}
  try {
    const response = await fetch(CLOUD + id + '?key=' + API_KEY,{signal:AbortSignal.timeout(8000)});
    if (response.ok) {
      const doc = await response.json();
      if (doc.fields?.kind?.stringValue !== 'hachoriclass-memo-v1') throw new Error();
      const key = await crypto.subtle.importKey('raw',tokenBytes(token),'AES-GCM',false,['decrypt']);
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(doc.fields.iv.stringValue),additionalData:bytes(id)},key,fromBase64(doc.fields.cipher.stringValue));
      remote = cleanState(JSON.parse(new TextDecoder().decode(plaintext)));
    } else if (response.status !== 404) throw new Error();
  } catch { if (!hasLocal) throw new Error('이전 메모를 불러오지 못했어요. 인터넷 연결과 링크를 확인해 주세요.'); }
  return mergeStates(local,remote);
}
async function importSource(source) {
  for (const id of ['import-submit','import-account']) el(id).disabled = true;
  el('import-status').hidden = true; el('import-status').classList.remove('success');
  try {
    await board.ready;
    const incoming = await source();
    if (!incoming.items.some(item => !item.deleted && (item.title || item.body || item.url))) throw new Error('가져올 이전 메모가 없어요. 이전 원본은 그대로 유지됩니다.');
    await board.flush();
    if (!board.loaded && !board.hasCache) throw new Error('현재 메모를 먼저 불러온 뒤 다시 시도해 주세요.');
    const previous = board.state.items.find(item => item.id === 'note-main' && !item.deleted)?.body || '';
    const imported = incoming.items.find(item => item.id === 'note-main' && !item.deleted)?.body || '';
    const combined = previous && imported && !previous.includes(imported) ? previous + '\n\n── 이전 메모 ──\n' + imported : previous || imported;
    if (combined.length > 30000) throw new Error('합친 자유 메모가 너무 길어요. 조금 정리한 뒤 가져와 주세요.');
    // Existing entries win on repeated imports, including deletions made after an import.
    const ids = new Set(board.state.items.map(item => item.id));
    board.state = cleanState({version:1,items:[...board.state.items,...incoming.items.filter(item => item.id !== 'note-main' && !ids.has(item.id))]});
    board.dirty = true;
    if (combined) board.change('note-main',{type:'note',body:combined,deleted:false});
    board.cache(); board.render(); await board.flush();
    if (board.dirty) throw new Error('이 기기에 가져왔어요. 인터넷 연결 후 자동 저장이 끝날 때까지 기다려 주세요.');
    el('import-status').textContent = '가져왔어요. 이제 같은 교실 주소에서 로그인 없이 이어 쓸 수 있어요.';
    el('import-status').classList.add('success');
  } catch (error) { el('import-status').textContent = error.message || '가져오지 못했어요. 다시 시도해 주세요.'; }
  finally { el('import-status').hidden = false; for (const id of ['import-submit','import-account']) el(id).disabled = false; }
}
el('import-form').addEventListener('submit',event => { event.preventDefault(); importSource(legacySource); });
el('import-account').addEventListener('click',() => importSource(async () => {
  const {accountSource} = await import('./account-source.js?v=3');
  return accountSource();
}));
