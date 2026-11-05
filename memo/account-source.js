// Loaded only when the teacher explicitly imports their previous account memo.
import {MemoBoard,cleanState,mergeStates,validToken,tokenBytes,CACHE_PREFIX,CLOUD,API_KEY} from './app.js?v=3';
const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
let auth;
export async function accountSource() {
  if (!auth) {
    const [appSDK,authSDK] = await Promise.all([import(SDK + 'firebase-app.js'),import(SDK + 'firebase-auth.js')]);
    const app = appSDK.getApps().find(app => app.name === 'hachoriclass-memo') || appSDK.initializeApp({apiKey:API_KEY,authDomain:'classroom-seats-8dfbf.firebaseapp.com',projectId:'classroom-seats-8dfbf'},'hachoriclass-memo');
    auth = authSDK.initializeAuth(app,{persistence:authSDK.browserSessionPersistence,popupRedirectResolver:authSDK.browserPopupRedirectResolver});
    await auth.authStateReady();
  }
  const user = auth.currentUser;
  if (!user) throw new Error('이 기기에 이전 로그인 세션이 없어요. 아래 ‘이전 계정 메모’에서 확인한 뒤 돌아와 주세요.');
  const get = async collection => {
    const response = await fetch(CLOUD.replace('/classes/','/' + collection + '/') + encodeURIComponent(user.uid) + '?key=' + API_KEY,{headers:{Authorization:'Bearer ' + await user.getIdToken()},signal:AbortSignal.timeout(8000)});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('이전 계정 메모를 불러오지 못했어요. 연결 상태를 확인해 주세요.');
    return response.json();
  };
  const profile = await get('memoAccounts'), token = profile?.fields?.key?.stringValue;
  if (!validToken(token) || profile.fields.version?.integerValue !== '1') throw new Error('이전 계정에 저장된 메모가 없어요.');
  const id = 'account_' + user.uid;
  const key = await crypto.subtle.importKey('raw',tokenBytes(token),'AES-GCM',false,['decrypt']);
  const decrypt = doc => MemoBoard.prototype.decrypted.call({id,key,shared:false},doc);
  const doc = await get('teacherMemos');
  let state = doc ? await decrypt(doc) : {version:1,items:[]};
  try {
    const draft = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + id + '_draft'));
    const cache = JSON.parse(localStorage.getItem(CACHE_PREFIX + id));
    if (draft?.state) state = mergeStates(state,cleanState(draft.state));
    else if (cache?.encrypted) state = mergeStates(state,await decrypt(cache.encrypted));
  } catch { /* A valid cloud copy is sufficient. */ }
  return state;
}
