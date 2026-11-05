'use strict';

const $ = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const PALETTE = ['#faadc7', '#a0e5d4', '#b5b2ed', '#ffc779', '#8ecfee', '#e7eba5'];
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장을 허용하지 않아도 뽑기는 가능하다. */ } },
  json(key) { try { return JSON.parse(this.get(key) || 'null'); } catch { return null; } }
};

// 기계 속 캡슐은 시각 효과다. 실제 당첨자는 별도로 한 번만 추첨한다.
class CapsuleMachine {
  constructor(canvas, reducedMotion) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.motion = reducedMotion;
    this.balls = [];
    this.count = 0;
    this.active = false;
    this.frame = 0;
    this.lastTime = 0;
    this.resize();
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.balls.forEach(b => this.bound(b));
    this.draw();
  }
  sync(count) {
    this.count = count;
    const number = Math.min(count, 24);
    if (number !== this.balls.length) {
      this.balls = Array.from({length:number}, (_, i) => ({
        x: this.width / 2 + (i % 5 - 2) * 49,
        y: 73 + Math.floor(i / 5) * 38,
        vx: (Math.random() - .5) * 1.25,
        vy: (Math.random() - .5) * 1.15,
        radius: 22,
        angle: Math.random() * Math.PI * 2,
        rotation: (Math.random() - .5) * .015,
        color: PALETTE[i % PALETTE.length]
      }));
      for (let i = 0; i < 35; i++) this.step(1);
    }
    this.draw();
    this.start();
  }
  bound(b) {
    const r = b.radius + 5;
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
    if (b.x > this.width - r) { b.x = this.width - r; b.vx = -Math.abs(b.vx); }
    const nx = (b.x - this.width / 2) / (this.width / 2 - b.radius);
    const minY = 146 - 132 * Math.sqrt(Math.max(0, 1 - nx * nx)) + b.radius;
    if (b.y < minY) { b.y = minY; b.vy = Math.abs(b.vy); }
    if (b.y > this.height - r - 19) { b.y = this.height - r - 19; b.vy = -Math.abs(b.vy); }
  }
  step(dt) {
    const speed = this.active ? 5 : 1;
    this.balls.forEach(b => {
      b.x += b.vx * dt * speed;
      b.y += b.vy * dt * speed;
      b.angle += b.rotation * dt * speed;
      this.bound(b);
    });
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (!distance || distance >= a.radius + b.radius) continue;
        const nx = dx / distance, ny = dy / distance;
        const overlap = (a.radius + b.radius - distance) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const dot = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (dot < 0) {
          a.vx += dot * nx; a.vy += dot * ny;
          b.vx -= dot * nx; b.vy -= dot * ny;
        }
        this.bound(a); this.bound(b);
      }
    }
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.balls.forEach(b => {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.shadowColor = '#030a2244'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      const base = ctx.createLinearGradient(-18, -18, 18, 22);
      base.addColorStop(0, '#fff9e6'); base.addColorStop(1, '#b8bbd7');
      ctx.fillStyle = base; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.beginPath(); ctx.arc(0, 0, b.radius, Math.PI, Math.PI * 2); ctx.closePath();
      const top = ctx.createLinearGradient(-16, -20, 15, 3);
      top.addColorStop(0, '#fff0ed'); top.addColorStop(.35, b.color); top.addColorStop(1, b.color);
      ctx.fillStyle = top; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-b.radius, 0); ctx.lineTo(b.radius, 0);
      ctx.strokeStyle = '#51436866'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-8, -10, 7, 3.2, -.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffffa6'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, b.radius - .6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    });
  }
  start() {
    if (this.frame || this.motion.matches || document.hidden) return;
    const tick = time => {
      const dt = this.lastTime ? Math.min((time - this.lastTime) / 16.67, 2) : 1;
      this.lastTime = time;
      this.step(dt); this.draw();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.lastTime = 0; }
}

class CapsuleGame {
  constructor() {
    this.key = 'englishclass_capsule_v1';
    this.presetKey = 'englishclass_roulette_rolepresets';
    this.pool = [];
    this.history = [];
    this.seq = 0;
    this.phase = 'idle';
    this.lastWinners = [];
    this.sound = true;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.machine = new CapsuleMachine($('capsules'), this.motion);
    this.audio = null;
    this.confettiFrame = 0;
    this.restore();
    this.refreshPresets();
    this.bind();
    this.updateUI();
    this.renderHistory();
    this.machine.sync(this.pool.length);
  }
  bind() {
    $('draw-one').addEventListener('click', () => this.draw('single'));
    $('draw-many').addEventListener('click', () => this.draw('multiple'));
    $('apply-names').addEventListener('click', () => this.applyNames());
    $('clear-names').addEventListener('click', () => this.clearAll());
    $('load-class').addEventListener('click', () => this.loadClass());
    $('role-mode').addEventListener('change', () => { this.updateUI(); this.save(); });
    $('roles').addEventListener('input', () => { this.updateUI(); this.save(); });
    $('names').addEventListener('input', () => { $('names-status').textContent = '고친 명단을 사용하려면 ‘명단 적용’을 눌러 주세요.'; this.save(); });
    ['class-select','gender-filter','strip-number','remove-winners','pick-count','pace'].forEach(id => $(id).addEventListener('change', () => this.save()));
    $('preset-select').addEventListener('change', () => this.loadPreset());
    $('save-preset').addEventListener('click', () => this.savePreset());
    $('delete-preset').addEventListener('click', () => this.deletePreset());
    $('sound').addEventListener('click', () => { this.sound = !this.sound; this.updateSound(); this.save(); });
    $('keep-winners').addEventListener('click', () => this.closeResults(false));
    $('exclude-winners').addEventListener('click', () => this.closeResults(true));
    $('result-dialog').addEventListener('cancel', event => { event.preventDefault(); if (this.phase === 'result') this.closeResults(false); });
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.key === 'Enter' && !event.repeat && this.phase === 'idle') { event.preventDefault(); this.draw('single'); }
    });
    window.addEventListener('resize', () => this.machine.resize());
    document.addEventListener('visibilitychange', () => document.hidden ? this.machine.stop() : this.machine.start());
    this.motion.addEventListener('change', () => { this.machine.stop(); this.machine.start(); this.machine.draw(); });
    window.addEventListener('pagehide', () => { this.machine.stop(); this.stopConfetti(); });
    window.addEventListener('pageshow', () => this.machine.start());
  }
  restore() {
    const own = storage.json(this.key);
    const saved = own && typeof own === 'object' && !Array.isArray(own) ? own : storage.json('englishclass_roulette_v2');
    if (saved && typeof saved === 'object') {
      const fields = {'names':'names','roles':'roles','class-select':'cls','gender-filter':'gender','pick-count':'count','pace':'pace'};
      Object.entries(fields).forEach(([id, prop]) => { if (typeof saved[prop] === 'string' || typeof saved[prop] === 'number') $(id).value = saved[prop]; });
      [['strip-number','strip'],['role-mode','role'],['remove-winners','remove']].forEach(([id, prop]) => { if (typeof saved[prop] === 'boolean') $(id).checked = saved[prop]; });
      if (typeof saved.sound === 'boolean') this.sound = saved.sound;
    }
    if (!['normal','quick'].includes($('pace').value)) $('pace').value = 'normal';
    const names = own && Array.isArray(own.pool) ? own.pool.filter(n => typeof n === 'string' && n.trim()) : this.readNames();
    this.pool = names.map(label => ({id:++this.seq,label}));
    if (own && Array.isArray(own.history)) this.history = own.history.filter(h => Array.isArray(h) && h.every(w => w && typeof w.label === 'string' && (w.role === null || typeof w.role === 'string'))).slice(0, 30);
    this.updateSound();
  }
  save() {
    storage.set(this.key, JSON.stringify({
      names:$('names').value, roles:$('roles').value,
      cls:$('class-select').value, gender:$('gender-filter').value,
      strip:$('strip-number').checked, role:$('role-mode').checked,
      remove:$('remove-winners').checked, count:$('pick-count').value,
      pace:$('pace').value, sound:this.sound,
      pool:this.pool.map(n => n.label), history:this.history
    }));
  }
  readNames() { return $('names').value.split('\n').map(n => n.trim()).filter(Boolean); }
  applyNames() {
    if (this.phase !== 'idle') return;
    const names = this.readNames();
    if (!names.length) { this.notice('names-status','이름을 한 명 이상 입력해 주세요.',true); $('names').focus(); return; }
    this.pool = names.map(label => ({id:++this.seq,label}));
    this.history = [];
    this.notice('names-status',names.length + '명 탑승 완료! 뽑기를 시작해 보세요.');
    this.machine.sync(this.pool.length);
    this.renderHistory(); this.updateUI(); this.save();
  }
  clearAll() {
    if (this.phase !== 'idle') return;
    this.pool = []; this.history = []; this.lastWinners = [];
    $('names').value = '';
    this.notice('names-status','새 명단을 입력하거나 반 명단을 불러와 주세요.');
    this.machine.sync(0); this.renderHistory(); this.updateUI(); this.save();
  }
  notice(id, message, error = false) {
    $(id).textContent = message;
    $(id).className = 'hint ' + (error ? 'error' : 'ok');
  }
  parseRoles() {
    const roles = [];
    for (const line of $('roles').value.split('\n')) {
      const text = line.trim();
      if (!text) continue;
      const match = text.match(/^(.*?)\s*[x×*]\s*(\d+)$/i);
      const label = (match ? match[1] : text).trim();
      if (!label) continue;
      const count = match ? Math.min(99, Math.max(1, Number(match[2]))) : 1;
      for (let i = 0; i < count && roles.length < 999; i++) roles.push(label);
    }
    return roles;
  }
  updateSound() {
    $('sound').textContent = this.sound ? '♪ 소리 켜짐' : '♪ 소리 꺼짐';
    $('sound').setAttribute('aria-pressed', String(this.sound));
  }
  updateUI() {
    const idle = this.phase === 'idle';
    const roleMode = $('role-mode').checked;
    const roles = this.parseRoles();
    $('settings').disabled = !idle;
    $('role-box').hidden = !roleMode;
    $('role-status').textContent = roles.length ? roles.length + '개 역할 · 한 명당 한 역할씩 배정해요.' : '배정할 역할을 입력해 주세요.';
    $('pool-count').textContent = this.pool.length + '명';
    $('pick-count').disabled = !idle || roleMode;
    $('pace').disabled = !idle;
    $('draw-one').disabled = !idle || !this.pool.length;
    $('draw-many').disabled = !idle || !this.pool.length || roleMode;
    $('draw-one').replaceChildren(document.createTextNode(!idle ? (this.phase === 'loading' ? '명단 불러오는 중…' : '캡슐 탐사 중…') : roleMode ? '✧ 역할 배정하기 ↗' : '✦ 한 명 뽑기 ↗'));
    $('keep-winners').disabled = this.phase !== 'result';
    $('exclude-winners').disabled = this.phase !== 'result';
    $('exclude-winners').hidden = !$('remove-winners').checked;
    $('keep-winners').textContent = $('remove-winners').checked ? '명단 유지' : '계속 뽑기';
    if (idle) {
      if (!this.pool.length) $('flight-status').textContent = '탐사 완료! 명단을 적용하면 다시 시작할 수 있어요.';
      else {
        const strong = document.createElement('strong'); strong.textContent = this.pool.length + '명';
        $('flight-status').replaceChildren(document.createTextNode('캡슐 속에 '), strong, document.createTextNode(' 대기 중 · 준비되면 출발!'));
      }
    }
  }
  async fetchClass(cls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEAT.TIMEOUT);
    try {
      const url = 'https://firestore.googleapis.com/v1/projects/' + SEAT.PROJECT + '/databases/(default)/documents/' + SEAT.COLLECTION + '/' + encodeURIComponent(cls) + '?key=' + SEAT.API_KEY;
      const response = await fetch(url, {signal:controller.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const value = data.fields?.studentList?.stringValue;
      if (typeof value !== 'string' || !value.trim()) throw new Error('명단 없음');
      storage.set(SEAT.LS_LIST + cls, value);
      return value;
    } finally { clearTimeout(timeout); }
  }
  async loadClass() {
    if (this.phase !== 'idle') return;
    const cls = $('class-select').value;
    if (!cls) { this.notice('load-status','먼저 반을 골라 주세요.',true); return; }
    const gender = $('gender-filter').value;
    const strip = $('strip-number').checked;
    this.phase = 'loading'; this.updateUI();
    this.notice('load-status','반 명단을 불러오고 있어요…');
    let raw, via;
    try { raw = await this.fetchClass(cls); via = '저장된 명단'; }
    catch { raw = storage.get(SEAT.LS_LIST + cls); via = '이 기기에 저장된 명단'; }
    this.phase = 'idle'; this.updateUI();
    if (!raw) { this.notice('load-status',cls + ' 명단이 없어요. 자리배치에서 먼저 저장해 주세요.',true); return; }
    let names = raw.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    const grade = Number(cls.match(/^(\d)/)?.[1]);
    const lowGender = grade === 3 || grade === 5 ? 'female' : 'male';
    if (gender !== 'all') names = names.filter(name => {
      const number = name.match(/\d+/);
      if (!number) return false;
      const studentGender = Number(number[0]) >= SEAT.NUM_SPLIT ? (lowGender === 'female' ? 'male' : 'female') : lowGender;
      return studentGender === gender;
    });
    if (strip) names = names.map(n => n.replace(/^\s*\d+\s*/, '').trim()).filter(Boolean);
    if (!names.length) { this.notice('load-status','조건에 맞는 친구가 없어요. 필터를 확인해 주세요.',true); return; }
    $('names').value = names.join('\n');
    this.applyNames();
    this.notice('load-status',cls + ' · ' + names.length + '명 탑승 완료 (' + via + ')');
  }
  refreshPresets() {
    const saved = storage.json(this.presetKey);
    this.presets = Object.fromEntries(saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.entries(saved).filter(([,value]) => typeof value === 'string') : []);
    $('preset-select').replaceChildren(new Option('저장한 역할 세트',''));
    Object.keys(this.presets).forEach(name => $('preset-select').add(new Option(name,name)));
  }
  savePreset() {
    if (this.phase !== 'idle') return;
    const value = $('roles').value.trim();
    if (!value) { this.notice('role-status','저장할 역할을 먼저 입력해 주세요.',true); return; }
    const name = (prompt('역할 세트 이름을 적어 주세요. (예: 3단원 역할극)') || '').trim();
    if (!name) return;
    this.refreshPresets();
    this.presets = {...this.presets,[name]:value};
    storage.set(this.presetKey,JSON.stringify(this.presets));
    this.refreshPresets(); $('preset-select').value = name;
  }
  loadPreset() {
    const name = $('preset-select').value;
    if (this.phase !== 'idle' || !Object.hasOwn(this.presets,name)) return;
    $('roles').value = this.presets[name]; this.updateUI(); this.save();
  }
  deletePreset() {
    if (this.phase !== 'idle') return;
    const name = $('preset-select').value;
    if (!name || !confirm('‘' + name + '’ 역할 세트를 지울까요?')) return;
    this.refreshPresets(); delete this.presets[name];
    storage.set(this.presetKey,JSON.stringify(this.presets)); this.refreshPresets();
  }
  randomIndex(max) {
    // 나머지 연산의 편향 없이 0..max-1 중 하나를 고른다.
    const values = new Uint32Array(1);
    const limit = Math.floor(4294967296 / max) * max;
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  }
  sample(count) {
    const shuffled = [...this.pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.randomIndex(i + 1);
      [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]];
    }
    return shuffled.slice(0,count);
  }
  initAudio() {
    if (!this.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!this.audio) this.audio = new Audio();
      if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    } catch { /* 소리가 지원되지 않아도 연출은 계속한다. */ }
  }
  tone(frequency, duration = .12, delay = 0, volume = .035) {
    if (!this.sound || !this.audio || this.audio.state !== 'running') return;
    const osc = this.audio.createOscillator(), gain = this.audio.createGain();
    osc.connect(gain); gain.connect(this.audio.destination);
    const time = this.audio.currentTime + delay;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(volume,time + .015);
    gain.gain.exponentialRampToValueAtTime(.001,time + duration);
    osc.start(time); osc.stop(time + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  async draw(mode) {
    if (this.phase !== 'idle' || !this.pool.length) return;
    const roleMode = $('role-mode').checked;
    let roles = [], count = 1;
    if (roleMode) {
      roles = this.parseRoles();
      if (!roles.length) { this.notice('role-status','배정할 역할을 먼저 입력해 주세요.',true); $('roles').focus(); return; }
      if (roles.length > this.pool.length) {
        if (!confirm('역할은 ' + roles.length + '개, 남은 친구는 ' + this.pool.length + '명이에요. 앞에서부터 ' + this.pool.length + '개 역할만 배정할까요?')) return;
        roles = roles.slice(0,this.pool.length);
      }
      count = roles.length;
    } else if (mode === 'multiple') {
      count = Math.min(this.pool.length,Math.max(1,parseInt($('pick-count').value,10) || 1));
      $('pick-count').value = count;
    }
    // 이 시점에 결과를 확정한다. 뒤의 물리 효과와 공개 순서는 결과를 바꾸지 않는다.
    this.lastWinners = this.sample(count).map((person,i) => ({...person,role:roleMode ? roles[i] : null}));
    const quick = $('pace').value === 'quick';
    const reduced = this.motion.matches;
    this.phase = 'mixing'; this.updateUI(); this.save(); this.initAudio();
    $('machine-scene').classList.add('mixing'); this.machine.active = true;
    $('flight-status').textContent = '무중력 모드 ON! 캡슐을 신나게 섞고 있어요.';
    this.tone(330,.12); this.tone(440,.12,.14); this.tone(660,.2,.28);
    await pause(reduced ? 80 : quick ? 750 : 2000);
    $('flight-status').textContent = '두근두근… 캡슐이 내려와요!';
    $('machine-scene').classList.add('delivering');
    this.tone(500,.2); this.tone(760,.25,.16);
    await pause(reduced ? 80 : 700);
    $('machine-scene').classList.remove('mixing','delivering'); this.machine.active = false;
    this.phase = 'revealing'; this.updateUI();
    $('result-title').textContent = roleMode ? '우리 반 역할 탐사대!' : count === 1 ? '오늘의 주인공!' : '오늘의 주인공들!';
    $('result-eyebrow').textContent = 'OPENING CAPSULES';
    $('result-subtitle').textContent = '두근두근, 캡슐이 열리고 있어요.';
    const cards = this.makeCards();
    $('result-dialog').showModal();
    $('result-dialog').scrollTop = 0;
    $('result-dialog').append($('confetti'));
    const interval = reduced ? 25 : Math.min(quick ? 230 : 550,(quick ? 1400 : 3300) / count);
    for (let i = 0; i < cards.length; i++) {
      await pause(interval);
      cards[i].querySelector('.winner-name').textContent = this.lastWinners[i].label;
      cards[i].classList.add('opened');
      cards[i].setAttribute('aria-label',(this.lastWinners[i].role ? this.lastWinners[i].role + ': ' : '') + this.lastWinners[i].label);
      $('result-subtitle').textContent = (i + 1) + ' / ' + count + ' 캡슐 공개!';
      this.tone(523.25 * Math.pow(1.12246,i % 6),.2,0,.025);
      if (count > 6) cards[i].scrollIntoView({block:'nearest',behavior:'instant'});
    }
    await pause(reduced ? 30 : 850);
    this.phase = 'result';
    $('result-eyebrow').textContent = 'MISSION COMPLETE';
    $('result-subtitle').textContent = roleMode ? '각자의 역할로 멋지게 활약해 주세요!' : '축하해요! 반짝이는 오늘의 주인공이에요.';
    this.history.unshift(this.lastWinners.map(({label,role}) => ({label,role})));
    this.history = this.history.slice(0,30);
    this.renderHistory(); this.updateUI(); this.save();
    [523.25,659.25,783.99,1046.5].forEach((f,i) => this.tone(f,.4,i * .1));
    this.celebrate();
    ($('remove-winners').checked ? $('exclude-winners') : $('keep-winners')).focus({preventScroll:true});
  }
  makeCards() {
    $('winner-cards').replaceChildren();
    $('winner-cards').classList.toggle('single',this.lastWinners.length === 1);
    return this.lastWinners.map((winner,i) => {
      const card = document.createElement('article'); card.className = 'winner-card';
      card.style.setProperty('--cap-color',PALETTE[i % PALETTE.length]);
      card.setAttribute('aria-label',(winner.role || String(i + 1) + '번') + ' 캡슐 공개 대기');
      const role = document.createElement('div'); role.className = 'winner-role'; role.textContent = winner.role || 'LUCKY STAR ' + String(i + 1).padStart(2,'0');
      const name = document.createElement('div'); name.className = 'winner-name';
      const shell = document.createElement('div'); shell.className = 'reveal-shell'; shell.setAttribute('aria-hidden','true');
      const top = document.createElement('div'); top.className = 'shell-top';
      const bottom = document.createElement('div'); bottom.className = 'shell-bottom';
      shell.append(top,bottom); card.append(role,name,shell); $('winner-cards').append(card);
      return card;
    });
  }
  closeResults(remove) {
    if (this.phase !== 'result') return;
    if (remove) {
      const ids = new Set(this.lastWinners.map(w => w.id));
      this.pool = this.pool.filter(person => !ids.has(person.id));
      this.notice('names-status','당첨자를 제외하고 ' + this.pool.length + '명 남았어요. 명단 적용을 누르면 전체가 다시 참가해요.');
    }
    $('result-dialog').close(); this.stopConfetti(); document.body.append($('confetti'));
    this.lastWinners = []; this.phase = 'idle';
    this.machine.sync(this.pool.length); this.updateUI(); this.save();
    (this.pool.length ? $('draw-one') : $('apply-names')).focus({preventScroll:true});
  }
  renderHistory() {
    $('history-count').textContent = this.history.length;
    $('history-list').replaceChildren();
    if (!this.history.length) {
      const item = document.createElement('li'); item.className = 'empty-history'; item.textContent = '첫 번째 주인공을 뽑아 보세요.'; $('history-list').append(item);
    }
    this.history.forEach(winners => {
      const item = document.createElement('li'); item.textContent = winners.map(w => (w.role ? w.role + ': ' : '') + w.label).join(' · '); $('history-list').append(item);
    });
  }
  celebrate() {
    if (this.motion.matches) return;
    this.stopConfetti();
    const canvas = $('confetti'), ctx = canvas.getContext('2d');
    const width = innerWidth, height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1,2);
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    const pieces = Array.from({length:100},(_,i) => ({x:width / 2,y:height * .38,vx:(Math.random() - .5) * 15,vy:-3 - Math.random() * 11,r:Math.random() * 6,color:PALETTE[i % PALETTE.length]}));
    let start = 0, last = 0;
    const tick = time => {
      if (!start) start = time;
      const dt = last ? Math.min((time - last) / 16.67,2) : 1; last = time;
      ctx.clearRect(0,0,width,height);
      ctx.globalAlpha = Math.max(0,1 - (time - start) / 2800);
      pieces.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .14 * dt; p.r += .06 * dt;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle = p.color; ctx.fillRect(-3,-5,6,10); ctx.restore(); });
      if (time - start < 2800) this.confettiFrame = requestAnimationFrame(tick);
      else this.stopConfetti();
    };
    this.confettiFrame = requestAnimationFrame(tick);
  }
  stopConfetti() {
    cancelAnimationFrame(this.confettiFrame); this.confettiFrame = 0;
    const canvas = $('confetti'); canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.CapsuleApp = new CapsuleGame(); });

// 자리배치 앱 및 기존 룰렛과 같은 명단 소스를 사용한다.
const SEAT = {
                PROJECT:    'classroom-seats-8dfbf',
                API_KEY:    'AIzaSyCkWzg1dDmjtos3gTKqmiOLOrx0-F6seFI',
                COLLECTION: 'classes',
                LS_LIST:    'classroom_seats_class_',   // 오리진이 같아 localStorage를 그대로 읽는다
                NUM_SPLIT:  51,                          // 이 번호부터 '높은 번호대'
                TIMEOUT:    2500                         // 교실 네트워크가 느릴 때 기다리는 한계
            };

