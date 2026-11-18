'use strict';
/* ================= Helper & Storage ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const K = { users: 'tf_users', session: 'tf_session', projects: 'tf_projects', tasks: 'tf_tasks', theme: 'tf_theme', accent: 'tf_accent', custom: 'tf_accent_custom' };
const STATUS = ['To-do', 'In-Progress', 'Done'];
const PSTATUS = ['Aktif', 'Ditunda', 'Selesai'];
const ACCENTS = { pink: ['#e84393', '#ff7eb3'], ungu: ['#7c3aed', '#ec4899'], oranye: ['#f97316', '#eab308'], hijau: ['#10b981', '#06b6d4'], laut: ['#0ea5e9', '#6366f1'] };
const MAX_FILE = 500 * 1024; // 500 KB per lampiran (batas localStorage ~5 MB)
const FILE_OK = /\.(png|jpe?g|gif|webp|pdf|txt|docx?|xlsx?|pptx?)$/i;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch { toast('Penyimpanan browser penuh. Hapus lampiran/data lama.', 'error'); return false; }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const P = () => load(K.projects, []);
const T = () => load(K.tasks, []);
const me = () => load(K.users, []).find(u => u.id === load(K.session, null));
const myP = () => P().filter(p => p.userId === me().id);
const myT = () => { const ids = new Set(myP().map(p => p.id)); return T().filter(t => ids.has(t.projectId)); };
const opts = (list, sel) => list.map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('');
const field = (name, label, input) => `<label>${label}${input}<span class="err" data-err="${name}"></span></label>`;
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const pwInput = (name, ac) => `<span class="pw"><input name="${name}" type="password" autocomplete="${ac}"><button type="button" class="eye" data-act="toggle-pw" aria-label="Tampilkan kata sandi" title="Tampilkan kata sandi">${EYE}</button></span>`;
const empty = (t, s) => `<div class="empty"><div class="big">📭</div><h3>${t}</h3><p>${s}</p></div>`;

const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysLeft = d => Math.round((new Date(d + 'T00:00:00') - today0()) / 864e5);
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const dl = d => { const n = daysLeft(d);
  return n < 0 ? [`Terlambat ${-n} hari`, 'late'] : n === 0 ? ['Hari ini', 'soon'] : n === 1 ? ['H-1', 'soon'] : n <= 3 ? [`H-${n}`, 'near'] : [fmt(d), '']; };
// Skor prioritas: bobot tinggi + deadline dekat = paling atas. Tanpa bobot dianggap 10.
const score = t => (t.weight || 10) / (Math.max(daysLeft(t.deadline), 0) + 1);

async function sha(t) {
  if (window.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(t)));
}

/* ================= UI: toast, modal, validasi ================= */
function toast(msg, type = 'ok', ms = 3500) {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').append(el); setTimeout(() => el.remove(), ms);
}
const openModal = html => { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.classList.remove('hidden'); $('input,textarea', m)?.focus(); };
const closeModal = () => { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; if (S.cp) { S.cp = null; setAccent(); } };
const ask = (msg, yes = 'Ya, hapus') => new Promise(res => {
  openModal(`<h3>Konfirmasi</h3><p>${esc(msg)}</p><div class="row end"><button class="btn ghost" id="no">Batal</button><button class="btn danger" id="yes">${yes}</button></div>`);
  $('#yes').onclick = () => { closeModal(); res(true); };
  $('#no').onclick = () => { closeModal(); res(false); };
});
function showErrors(form, errs) {
  $$('[data-err]', form).forEach(e => e.textContent = errs[e.dataset.err] || '');
  const first = Object.keys(errs)[0];
  if (first) $(`[name=${first}]`, form)?.focus();
  return first !== undefined;
}

/* ================= Tema ================= */
function applyTheme() {
  const dark = (localStorage.getItem(K.theme) || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = dark ? '☀️' : '🌙';
  setAccent();
  const { name, pair } = accentNow();
  $('#swatches').innerHTML = Object.entries(ACCENTS).map(([n, [x, y]]) =>
    `<button class="sw ${n === name ? 'on' : ''}" data-act="accent" data-id="${n}" title="${n}" style="background:linear-gradient(135deg,${x},${y})"></button>`).join('') +
    `<button class="sw cust ${name === 'custom' ? 'on' : ''}" data-act="cp-open" title="Pilih warna sendiri" aria-label="Pilih warna sendiri" style="background:${name === 'custom' ? `linear-gradient(135deg,${pair[0]},${pair[1]})` : 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'}"></button>`;
}

// Warna aksen: 5 preset + warna bebas dari color picker
const hexOk = h => /^#[0-9a-f]{6}$/i.test(h || '');
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const shade = (h, t) => '#' + rgb(h).map(v => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)).toString(16).padStart(2, '0')).join('');   // t>0 ke putih, t<0 ke hitam
const lum = h => rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
// Warna terlalu terang digelapkan sampai teks putih di tombol tetap terbaca; pasangan gradasinya = versi lebih terang
const customPair = h => { let a = h; for (let i = 0; i < 12 && lum(a) > .3; i++) a = shade(a, -.1); return [a, shade(a, .35)]; };
function accentNow() {
  const k = localStorage.getItem(K.accent), c = localStorage.getItem(K.custom);
  if (k === 'custom' && hexOk(c)) return { name: 'custom', pair: customPair(c) };
  const n = k in ACCENTS ? k : 'pink'; return { name: n, pair: ACCENTS[n] };
}
function setAccent(over) {   // over = hex sementara (pratinjau) tanpa disimpan
  const [a, b] = over ? customPair(over) : accentNow().pair, st = document.documentElement.style;
  st.setProperty('--a1', a); st.setProperty('--a2', b);
}
const PAL = ['#e11d48', '#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];
const hslHex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
const hexHsl = hx => { const [r, g, b] = rgb(hx).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let h = 0;
  if (d) h = ((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function cpOpen() {
  const c = localStorage.getItem(K.custom), [h, sat, l] = hexHsl(hexOk(c) ? c : accentNow().pair[0]);
  S.cp = { h, s: clamp(sat, 45, 100), l: clamp(l, 30, 60) };
  openModal(`<h3>🎨 Warna sendiri</h3>
    <div class="cp-prev"><b>Vieline<span>.</span></b><span class="btn primary sm">Contoh tombol</span></div>
    <div class="cp-pal">${PAL.map(x => `<button type="button" class="cp-dot" data-act="cp-pal" data-id="${x}" style="background:${x}" aria-label="Warna ${x}"></button>`).join('')}</div>
    <label>Warna<input type="range" class="cp-r" id="cpH" min="0" max="360" value="${S.cp.h}"></label>
    <label>Kejenuhan<input type="range" class="cp-r" id="cpS" min="45" max="100" value="${S.cp.s}"></label>
    <label>Kecerahan<input type="range" class="cp-r" id="cpL" min="30" max="60" value="${S.cp.l}"></label>
    <div class="row end"><button class="btn ghost" data-act="cp-cancel">Batal</button><button class="btn primary" data-act="cp-ok">Terapkan</button></div>`);
  cpPaint();
}
function cpPaint() {   // pratinjau langsung ke seluruh aplikasi; baru disimpan saat Terapkan
  const { h, s, l } = S.cp;
  setAccent(hslHex(h, s, l));
  $('#cpS').style.setProperty('--t', `linear-gradient(90deg,hsl(${h} 45% ${l}%),hsl(${h} 100% ${l}%))`);
  $('#cpL').style.setProperty('--t', `linear-gradient(90deg,hsl(${h} ${s}% 30%),hsl(${h} ${s}% 60%))`);
}

/* ================= Router ================= */
const S = { cal: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(), pid: null, mode: 'list', filter: { q: '', status: '', sort: 'deadline' }, draft: [] };

function route() {
  const u = me(), pub = ['/login', '/register'], h = location.hash.slice(1) || (u ? '/dashboard' : '/home');
  if (!u && !pub.includes(h) && h !== '/home') { location.hash = '#/login'; return; }   // guard: wajib login
  if (u && pub.includes(h)) { location.hash = '#/dashboard'; return; }
  document.body.classList.toggle('authed', !!u);
  $('#userName').textContent = u ? u.name : '';
  renderPomo();
  const [, page, id] = h.split('/');
  S.calView = 'days';
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page || (page === 'project' && a.dataset.nav === 'projects')));
  ({ home: vHome, login: vLogin, register: vRegister, dashboard: vDash, projects: vProjects, project: () => vProject(id) }[page] || vDash)();
  window.scrollTo(0, 0);
}

/* ================= Beranda ================= */
function vHome() {
  const cta = me() ? '<a class="btn primary" href="#/dashboard">Buka dashboard</a>'
    : '<a class="btn primary" href="#/register">Mulai sekarang</a><a class="btn" href="#/login">Masuk</a>';
  const F = [['⏰', 'Pengingat deadline', 'Tugas yang mendekati tenggat muncul di dashboard, diurutkan dari bobot dan kedekatan deadline.'],
    ['🗂️', 'Proyek & tugas', 'Kelompokkan tugas per proyek, misalnya per divisi, program kerja, atau kegiatan.'],
    ['📌', 'Papan status', 'Seret kartu antara To-do, In-Progress, dan Done untuk memperbarui progres.'],
    ['📎', 'Lampiran file', 'Unggah dokumen, gambar, atau PDF langsung di tugas.'],
    ['🔥', 'XP, level & heatmap', 'Selesaikan tugas untuk mengumpulkan XP, naik level, dan jaga streak harianmu.'],
    ['🍅', 'Pomodoro', 'Timer fokus per tugas dengan durasi fokus dan istirahat yang bisa kamu atur.']];
  const S3 = [['Buat akun', 'Daftar dengan email dan kata sandi.'], ['Tambah proyek & tugas', 'Isi deadline, bobot nilai, dan lampiran bila perlu.'], ['Pantau di dashboard', 'Lihat ringkasan progres dan tugas yang paling mendesak.']];
  $('#view').innerHTML = `<section class="hero"><h1>Kelola proyek dan tugas <span>lebih teratur</span></h1>
    <p>Satu tempat untuk mencatat tugas, memantau deadline, dan melihat progres kerja tim maupun pribadi.</p><div class="row wrap">${cta}</div></section>
    <h2 class="sec-title">Fitur <span>utama</span></h2>
    <div class="features">${F.map(([i, t, d]) => `<div class="card feat"><div class="ico">${i}</div><h4>${t}</h4><p class="muted">${d}</p></div>`).join('')}</div>
    <h2 class="sec-title">Cara <span>pakai</span></h2>
    <div class="steps">${S3.map(([t, d]) => `<div class="card step"><h4>${t}</h4><p class="muted">${d}</p></div>`).join('')}</div>`;
}

/* ================= Auth ================= */
function vLogin() {
  $('#view').innerHTML = `<section class="card auth"><h2>Masuk</h2><p class="muted">Kelola proyek dan tugasmu di satu tempat.</p>
  <form data-form="login" novalidate>
    ${field('email', 'Email', '<input name="email" type="email" autocomplete="username">')}
    ${field('password', 'Kata sandi', pwInput('password', 'current-password'))}
    <button class="btn primary block">Masuk</button></form>
  <p class="muted center">Belum punya akun? <a href="#/register">Daftar</a></p></section>`;
}
function vRegister() {
  $('#view').innerHTML = `<section class="card auth"><h2>Buat akun</h2><p class="muted">Data tersimpan di browser ini saja.</p>
  <form data-form="register" novalidate>
    ${field('name', 'Nama', '<input name="name" maxlength="40" autocomplete="name">')}
    ${field('email', 'Email', '<input name="email" type="email" autocomplete="username">')}
    ${field('password', 'Kata sandi <small>(min. 6 karakter, ada huruf & angka)</small>', pwInput('password', 'new-password'))}
    ${field('confirm', 'Ulangi kata sandi', pwInput('confirm', 'new-password'))}
    <button class="btn primary block">Daftar</button></form>
  <p class="muted center">Sudah punya akun? <a href="#/login">Masuk</a></p></section>`;
}
async function doLogin(f) {
  const d = Object.fromEntries(new FormData(f)), e = {};
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Format email tidak valid';
  if (!d.password) e.password = 'Kata sandi wajib diisi';
  if (showErrors(f, e)) return;
  const u = load(K.users, []).find(x => x.email === d.email.trim().toLowerCase());
  if (!u || u.pass !== await sha(d.password)) return toast('Email atau kata sandi salah', 'error');
  localStorage.setItem(K.session, JSON.stringify(u.id));
  toast(`Selamat datang, ${u.name}!`); location.hash = '#/dashboard'; route();
}
async function doRegister(f) {
  const d = Object.fromEntries(new FormData(f)), e = {}, users = load(K.users, []);
  const email = d.email.trim().toLowerCase();
  if (d.name.trim().length < 2) e.name = 'Nama minimal 2 karakter';
  if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Format email tidak valid';
  else if (users.some(u => u.email === email)) e.email = 'Email sudah terdaftar';
  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(d.password)) e.password = 'Minimal 6 karakter, kombinasi huruf dan angka';
  if (d.confirm !== d.password) e.confirm = 'Kata sandi tidak sama';
  if (showErrors(f, e)) return;
  const u = { id: uid(), name: d.name.trim(), email, pass: await sha(d.password) };
  users.push(u);
  if (!save(K.users, users)) return;
  localStorage.setItem(K.session, JSON.stringify(u.id));
  toast('Akun berhasil dibuat'); location.hash = '#/dashboard'; route();
}

/* ================= Dashboard ================= */
function vDash() {
  const ps = myP(), ts = myT(), c = s => ts.filter(t => t.status === s).length;
  const names = Object.fromEntries(ps.map(p => [p.id, p.name]));
  const rem = ts.filter(t => t.status !== 'Done' && daysLeft(t.deadline) <= 3).sort((a, b) => score(b) - score(a));
  const bars = ts.length ? `<section class="card" style="margin-bottom:14px"><h3>📊 Progres tugas</h3><div class="bars">${STATUS.map(s => `<div class="bar"><span>${s}</span><div class="track"><i style="width:${Math.round(c(s) / ts.length * 100)}%"></i></div><b>${c(s)}</b></div>`).join('')}</div></section>` : '';
  const canAsk = 'Notification' in window && Notification.permission === 'default';
  $('#view').innerHTML = `<h2>Halo, ${esc(me().name)} 👋</h2>
  <div class="stats">
    <div class="card stat g"><b>${ps.length}</b><span>Proyek</span></div>
    <div class="card stat"><b>${c('To-do')}</b><span>To-do</span></div>
    <div class="card stat"><b>${c('In-Progress')}</b><span>In-Progress</span></div>
    <div class="card stat"><b>${c('Done')}</b><span>Done</span></div>
  </div>
  ${levelHTML(ts)}
  ${heatHTML(ts)}
  ${calHTML(ts)}
  ${bars}
  <section class="card"><div class="row between" style="margin:0 0 6px"><h3>⏰ Pengingat deadline</h3>
    ${canAsk ? '<button class="btn sm" data-act="notif">Aktifkan notifikasi browser</button>' : ''}</div>
    <p class="muted" style="margin-top:0">Tugas yang belum selesai dan deadline ≤ 3 hari, diurutkan dari bobot & kedekatan deadline.</p>
    ${rem.length ? rem.map(t => { const [l, cls] = dl(t.deadline); return `<div class="remind"><div>
        <a href="#/project/${t.projectId}"><b>${esc(t.title)}</b></a><div class="muted">${esc(names[t.projectId])}</div></div>
        <div class="row">${t.weight ? `<span class="pill w">⚖ ${t.weight}</span>` : ''}<span class="pill ${cls}">${l}</span></div></div>`; }).join('')
      : empty('Tidak ada deadline mendesak', 'Semua tugas aman untuk saat ini.')}
  </section>`;
}
function notifyDue() {
  if (sessionStorage.getItem('tf_notified') || !me()) return;
  sessionStorage.setItem('tf_notified', '1');
  const due = myT().filter(t => t.status !== 'Done' && daysLeft(t.deadline) <= 1).sort((a, b) => score(b) - score(a));
  if (!due.length) return;
  toast(`⏰ ${due.length} tugas H-1/terlambat. Prioritas: ${due[0].title}`, 'warn', 8000);
  if ('Notification' in window && Notification.permission === 'granted')
    new Notification('Vieline: deadline dekat', { body: due.slice(0, 3).map(t => t.title).join(', ') });
}

/* ================= Kalender ================= */
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function pickerHTML(v) {
  const { y, m } = S.cal, t = new Date(), cy = t.getFullYear();
  let title, body;
  if (v === 'months') {
    title = `<button class="linkbtn" data-act="cal-view" data-id="years">${S.pickY}</button>`;
    body = MONTHS.map((n, i) => `<button class="pk ${S.pickY === cy && i === t.getMonth() ? 'now' : ''} ${S.pickY === y && i === m ? 'on' : ''}" data-act="pick-month" data-id="${i}">${n.slice(0, 3)}</button>`).join('');
  } else {
    title = `${S.yBase} – ${S.yBase + 11}`;
    body = Array.from({ length: 12 }, (_, i) => S.yBase + i).map(yy => `<button class="pk ${yy === cy ? 'now' : ''} ${yy === y ? 'on' : ''}" data-act="pick-year" data-id="${yy}">${yy}</button>`).join('');
  }
  return `<section class="card" id="cal" style="margin-bottom:14px"><div class="row between" style="margin-bottom:10px"><h3>📅 ${title}</h3>
    <div class="row"><button class="btn sm" data-act="pick-prev" aria-label="Sebelumnya">‹</button><button class="btn sm" data-act="cal-view" data-id="days">Kembali</button><button class="btn sm" data-act="pick-next" aria-label="Berikutnya">›</button></div></div>
    <div class="pickgrid">${body}</div></section>`;
}
function calHTML(ts) {
  if (S.calView && S.calView !== 'days') return pickerHTML(S.calView);
  const { y, m } = S.cal, lead = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), t0 = today0();
  const todayK = ymd(t0.getFullYear(), t0.getMonth(), t0.getDate()), by = {};
  ts.forEach(t => (by[t.deadline] ||= []).push(t));
  let cells = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<div class="cdh">${d}</div>`).join('') + '<div class="cd off"></div>'.repeat(lead);
  for (let d = 1; d <= n; d++) {
    const k = ymd(y, m, d), l = by[k] || [];
    cells += `<button type="button" class="cd ${k === todayK ? 'today' : ''}" data-act="day" data-id="${k}"><b>${d}</b>` +
      l.slice(0, 2).map(t => `<span class="chip s${STATUS.indexOf(t.status)} ${t.status !== 'Done' && daysLeft(t.deadline) < 0 ? 'late' : ''}">${esc(t.title)}</span>`).join('') +
      (l.length > 2 ? `<small>+${l.length - 2} lagi</small>` : '') + '</button>';
  }
  return `<section class="card" id="cal" style="margin-bottom:14px"><div class="row between" style="margin-bottom:10px"><h3>📅 <button class="linkbtn" data-act="cal-view" data-id="months" title="Pilih bulan">${MONTHS[m]}</button><button class="linkbtn" data-act="cal-view" data-id="years" title="Pilih tahun">${y}</button></h3>
    <div class="row"><button class="btn sm" data-act="cal-prev" aria-label="Bulan sebelumnya">‹</button><button class="btn sm" data-act="cal-today">Hari ini</button><button class="btn sm" data-act="cal-next" aria-label="Bulan berikutnya">›</button></div></div>
    <div class="calgrid">${cells}</div><p class="muted" style="margin:10px 0 0;font-size:13px">Klik tanggal untuk melihat, mengubah, atau menambah tugas.</p></section>`;
}
function dayModal(k) {
  const ps = Object.fromEntries(myP().map(p => [p.id, p.name])), ts = myT().filter(t => t.deadline === k);
  openModal(`<h3>${fmt(k)}</h3>` + (ts.length ? ts.map(t => `<div class="remind"><div><b>${esc(t.title)}</b><div class="muted">${esc(ps[t.projectId])}</div></div>
    <div class="row"><span class="pill s${STATUS.indexOf(t.status)}">${t.status}</span><button class="btn ghost sm" data-act="edit-task" data-id="${t.id}">Ubah</button></div></div>`).join('') : '<p class="muted">Belum ada tugas di tanggal ini.</p>') +
    `<div class="row end"><button class="btn ghost" data-act="close">Tutup</button><button class="btn primary" data-act="cal-new" data-id="${k}">+ Tugas</button></div>`);
}
const calMove = n => { const d = new Date(S.cal.y, S.cal.m + n, 1); S.cal = { y: d.getFullYear(), m: d.getMonth() }; vDash(); };

/* ================= Gamifikasi: XP, level, heatmap ================= */
const todayKey = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
const dKey = d => ymd(d.getFullYear(), d.getMonth(), d.getDate());
const POMO = { focus: 25 * 60, rest: 5 * 60 };
const TITLES = ['Pemula', 'Rajin', 'Produktif', 'Andalan', 'Legenda'];
// XP selalu dihitung ulang dari data: tugas Done = bobot (default 10), tiap sesi fokus = +5
const xpOf = t => (t.status === 'Done' ? t.weight || 10 : 0) + (t.pomoDates?.length || 0) * 5;
const totalXp = () => myT().reduce((s, t) => s + xpOf(t), 0);
const lvlOf = xp => Math.floor(Math.sqrt(xp / 25)) + 1;   // Lv2 = 25 XP, Lv3 = 100, Lv4 = 225, ...
const lvlBase = l => 25 * (l - 1) ** 2;
const levelCheck = prev => { const l = lvlOf(totalXp()); if (l > lvlOf(prev)) toast(`🎉 Naik level! Sekarang Level ${l} (${TITLES[Math.min(l - 1, 4)]})`, 'ok', 6000); };
// Catat tanggal selesai saat status berubah (dipakai heatmap & streak)
const stamp = (t, status) => { t.status = status; t.doneOn = status === 'Done' ? (t.doneOn || todayKey()) : null; };

function activity(ts) {
  const m = {};
  ts.forEach(t => { if (t.doneOn) m[t.doneOn] = (m[t.doneOn] || 0) + 1; (t.pomoDates || []).forEach(d => m[d] = (m[d] || 0) + 1); });
  return m;
}
function levelHTML(ts) {
  const xp = totalXp(), l = lvlOf(xp), a = lvlBase(l), b = lvlBase(l + 1), pct = Math.round((xp - a) / (b - a) * 100);
  const n = ts.reduce((s, t) => s + (t.pomoDates || []).filter(d => d === todayKey()).length, 0);
  return `<section class="card lvl"><div class="badge">Lv ${l}</div>
    <div class="grow"><b>${TITLES[Math.min(l - 1, 4)]}</b> <span class="muted">· ${xp} XP</span>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <span class="muted" style="font-size:13px">${b - xp} XP lagi menuju Level ${l + 1}. Tugas Done = bobotnya (default 10 XP), sesi fokus = 5 XP.</span></div>
    <div class="fs"><b>🍅 ${n}</b><span class="muted">sesi fokus hari ini</span></div></section>`;
}
function heatHTML(ts) {
  const m = activity(ts), W = innerWidth < 600 ? 16 : 26, t0 = today0();
  const start = new Date(t0); start.setDate(t0.getDate() - (t0.getDay() + 6) % 7 - (W - 1) * 7);   // kolom = minggu, baris = Sen..Min
  let cells = '', total = 0;
  for (let i = 0; i < W * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > t0) { cells += '<i class="hm off"></i>'; continue; }
    const k = dKey(d), n = m[k] || 0; total += n;
    cells += `<i class="hm l${n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4}" title="${n} aktivitas · ${fmt(k)}"></i>`;
  }
  let streak = 0; const d = new Date(t0); if (!m[dKey(d)]) d.setDate(d.getDate() - 1);
  while (m[dKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return `<section class="card" style="margin-bottom:14px"><div class="row between" style="margin-bottom:10px"><h3>🔥 Heatmap produktivitas</h3>
    <span class="muted">Streak: <b>${streak}</b> hari</span></div>
    <div class="heatwrap"><div class="heat">${cells}</div></div>
    <div class="heat-foot muted"><span>${total} aktivitas (tugas selesai + sesi fokus) dalam ${W} minggu</span>
    <span class="legend">Sedikit <i class="hm"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> Banyak</span></div></section>`;
}

/* ================= Pomodoro ================= */
const BASE_TITLE = document.title;
S.pomo = (() => { try { return JSON.parse(sessionStorage.getItem('tf_pomo')); } catch { return null; } })();   // {tid, mode, running, end, left}
const pomoSave = () => { try { S.pomo ? sessionStorage.setItem('tf_pomo', JSON.stringify(S.pomo)) : sessionStorage.removeItem('tf_pomo'); } catch { } };
const pLeft = () => { const p = S.pomo; return !p ? 0 : p.running ? Math.max(0, Math.ceil((p.end - Date.now()) / 1000)) : p.left; };
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const cfgOf = p => p.cfg || POMO;   // durasi (detik) milik sesi ini
const phase = (tid, mode, cfg) => ({ tid, mode, cfg, running: true, end: Date.now() + cfg[mode] * 1000, left: cfg[mode] });
const loadCfg = () => { try { const c = JSON.parse(localStorage.getItem('tf_pomo_cfg')); if (c && c.focus >= 60 && c.rest >= 60) return c; } catch { } return { ...POMO }; };
function beep() {
  try { const c = new (window.AudioContext || window.webkitAudioContext)();
    [0, .25].forEach(d => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .15; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .15); });
  } catch { }
}
function sysNotify(title, body) { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); }
function renderPomo() {
  const el = $('#pomo'), p = S.pomo;
  document.body.classList.toggle('pomo-on', !!(p && me()));
  if (!p || !me()) { el.className = 'pomo hidden'; el.innerHTML = ''; document.title = BASE_TITLE; return; }
  const t = T().find(x => x.id === p.tid), focus = p.mode === 'focus';
  el.className = 'pomo' + (focus ? '' : ' rest');
  el.innerHTML = `<div class="pm-top"><span>${focus ? '🍅 Fokus' : '☕ Istirahat'}</span><b id="pmTime"></b></div>
    <div class="pm-task">${esc(t?.title || '(tugas dihapus)')}</div><div class="progress"><i id="pmBar"></i></div>
    <div class="row"><button class="btn sm" data-act="pomo-toggle">${p.running ? 'Jeda' : 'Lanjut'}</button><button class="btn danger sm" data-act="pomo-stop">Hentikan</button></div>`;
  pomoUpdate();
}
function pomoUpdate() {
  const p = S.pomo; if (!p) return;
  const left = pLeft(), tot = cfgOf(p)[p.mode];
  if ($('#pmTime')) $('#pmTime').textContent = mmss(left);
  if ($('#pmBar')) $('#pmBar').style.width = Math.round((1 - left / tot) * 100) + '%';
  document.title = `${mmss(left)} · ${p.mode === 'focus' ? 'Fokus' : 'Istirahat'}`;
}
function pomoStart(tid) {
  if (S.pomo) return toast('Selesaikan atau hentikan sesi fokus yang sedang berjalan dulu', 'warn');
  const t = T().find(x => x.id === tid), c = loadCfg();
  openModal(`<form data-form="pomo" data-id="${tid}" novalidate><h3>🍅 Mulai sesi fokus</h3>
    <p class="muted" style="margin-top:0">${esc(t?.title)}</p>
    <div class="row wrap" style="margin-bottom:12px"><button type="button" class="btn sm" data-act="pomo-preset" data-id="25,5">Klasik 25/5</button>
      <button type="button" class="btn sm" data-act="pomo-preset" data-id="50,10">Panjang 50/10</button>
      <button type="button" class="btn sm" data-act="pomo-preset" data-id="15,3">Singkat 15/3</button></div>
    <div class="row wrap">${field('focus', 'Fokus (menit)', `<input name="focus" type="number" min="1" max="180" value="${c.focus / 60}">`)}
      ${field('rest', 'Istirahat (menit)', `<input name="rest" type="number" min="1" max="60" value="${c.rest / 60}">`)}</div>
    <div class="row end"><button type="button" class="btn ghost" data-act="close">Batal</button><button class="btn primary">Mulai</button></div></form>`);
}
function pomoBegin(f, tid) {
  const d = Object.fromEntries(new FormData(f)), e = {}, ok = (v, max) => /^\d+$/.test(v) && +v >= 1 && +v <= max;
  if (!ok(d.focus, 180)) e.focus = 'Isi 1–180 menit (bilangan bulat)';
  if (!ok(d.rest, 60)) e.rest = 'Isi 1–60 menit (bilangan bulat)';
  if (showErrors(f, e)) return;
  if (S.pomo) { closeModal(); return toast('Sudah ada sesi fokus yang berjalan', 'warn'); }
  const cfg = { focus: +d.focus * 60, rest: +d.rest * 60 };
  try { localStorage.setItem('tf_pomo_cfg', JSON.stringify(cfg)); } catch { }
  closeModal(); S.pomo = phase(tid, 'focus', cfg); pomoSave(); renderPomo();
  toast(`Sesi fokus ${d.focus} menit dimulai. Semangat! 🍅`);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
function pomoToggle() {
  const p = S.pomo; if (!p) return;
  if (p.running) { p.left = pLeft(); p.running = false; } else { p.end = Date.now() + p.left * 1000; p.running = true; }
  pomoSave(); renderPomo();
}
async function pomoStop() {
  if (S.pomo?.mode === 'focus' && !await ask('Hentikan sesi fokus? Sesi yang belum selesai tidak dihitung.', 'Ya, hentikan')) return;
  S.pomo = null; pomoSave(); renderPomo();
}
function pomoTick() {
  const p = S.pomo; if (!p) return;
  if (!me()) { S.pomo = null; pomoSave(); return renderPomo(); }
  if (!p.running) return;
  if (pLeft() > 0) return pomoUpdate();
  beep();
  if (p.mode === 'focus') {
    const before = totalXp(), all = T(), t = all.find(x => x.id === p.tid);
    if (t) { (t.pomoDates ||= []).push(todayKey()); save(K.tasks, all); }
    S.pomo = phase(p.tid, 'rest', cfgOf(p));
    toast(`Sesi fokus selesai! +5 XP${t ? ` untuk "${t.title}"` : ''}. Istirahat ${cfgOf(p).rest / 60} menit.`);
    sysNotify('Vieline: sesi fokus selesai 🎉', `Saatnya istirahat ${cfgOf(p).rest / 60} menit.`);
    levelCheck(before);
    if ($('#taskArea')) renderTasks(); if ($('#cal')) vDash();
  } else { S.pomo = null; toast('Istirahat selesai. Siap lanjut? 💪'); sysNotify('Vieline', 'Istirahat selesai.'); }
  pomoSave(); renderPomo();
}

/* ================= Proyek ================= */
function vProjects() {
  const ps = myP().sort((a, b) => a.deadline.localeCompare(b.deadline)), ts = myT();
  $('#view').innerHTML = `<div class="row between"><h2>Proyek</h2><button class="btn primary" data-act="new-project">+ Proyek baru</button></div>` +
    (ps.length ? `<div class="grid">${ps.map(p => {
      const t = ts.filter(x => x.projectId === p.id), done = t.filter(x => x.status === 'Done').length, pct = t.length ? Math.round(done / t.length * 100) : 0;
      const [l, cls] = dl(p.deadline);
      return `<article class="card"><div class="row between" style="margin:0"><h4>${esc(p.name)}</h4><span class="pill">${p.status}</span></div>
        <p class="muted">${esc(p.description) || 'Tanpa deskripsi'}</p>
        <div class="row"><span class="pill ${cls}">${l}</span><span class="muted">${done}/${t.length} tugas</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="row" style="margin-top:12px"><a class="btn sm" href="#/project/${p.id}">Lihat</a>
        <button class="btn ghost sm" data-act="edit-project" data-id="${p.id}">Ubah</button>
        <button class="btn danger sm" data-act="del-project" data-id="${p.id}">Hapus</button></div></article>`;
    }).join('')}</div>` : empty('Belum ada proyek', 'Klik "Proyek baru" untuk mulai.'));
}
function projectForm(id) {
  const p = id ? P().find(x => x.id === id) : null;
  openModal(`<form data-form="project" data-id="${id || ''}" novalidate><h3>${p ? 'Ubah' : 'Tambah'} proyek</h3>
    ${field('name', 'Nama proyek', `<input name="name" maxlength="60" value="${esc(p?.name)}">`)}
    ${field('description', 'Deskripsi', `<textarea name="description" rows="3" maxlength="300">${esc(p?.description)}</textarea>`)}
    ${field('deadline', 'Deadline', `<input name="deadline" type="date" value="${p?.deadline || ''}">`)}
    <label>Status<select name="status">${opts(PSTATUS, p?.status)}</select></label>
    <div class="row end"><button type="button" class="btn ghost" data-act="close">Batal</button><button class="btn primary">Simpan</button></div></form>`);
}
function saveProject(f, id) {
  const d = Object.fromEntries(new FormData(f)), e = {};
  if (d.name.trim().length < 3) e.name = 'Nama proyek minimal 3 karakter';
  if (!d.deadline) e.deadline = 'Deadline wajib diisi';
  if (showErrors(f, e)) return;
  const all = P(), obj = { name: d.name.trim(), description: d.description.trim(), deadline: d.deadline, status: d.status };
  if (id) { const i = all.findIndex(x => x.id === id); all[i] = { ...all[i], ...obj }; }
  else all.push({ id: uid(), userId: me().id, ...obj });
  if (save(K.projects, all)) { closeModal(); toast(id ? 'Proyek diperbarui' : 'Proyek ditambahkan'); route(); }
}
async function delProject(id) {
  const p = P().find(x => x.id === id), n = T().filter(t => t.projectId === id).length;
  if (!await ask(`Hapus proyek "${p.name}" beserta ${n} tugas di dalamnya? Tindakan ini tidak bisa dibatalkan.`)) return;
  save(K.tasks, T().filter(t => t.projectId !== id));
  save(K.projects, P().filter(x => x.id !== id));
  toast('Proyek dan tugasnya dihapus'); location.hash = '#/projects'; route();
}

/* ================= Tugas ================= */
function vProject(id) {
  const p = myP().find(x => x.id === id);
  if (!p) { toast('Proyek tidak ditemukan', 'error'); location.hash = '#/projects'; return; }
  if (S.pid !== id) S.filter = { q: '', status: '', sort: 'deadline' };
  S.pid = id;
  const [l, cls] = dl(p.deadline), f = S.filter;
  $('#view').innerHTML = `<a href="#/projects">← Semua proyek</a>
  <div class="row between" style="margin-top:8px"><div><h2>${esc(p.name)}</h2>
    <p class="muted" style="margin:4px 0">${esc(p.description)}</p>
    <div class="row"><span class="pill">${p.status}</span><span class="pill ${cls}">Deadline: ${l}</span></div></div>
    <div class="row"><button class="btn ghost sm" data-act="edit-project" data-id="${id}">Ubah proyek</button>
    <button class="btn primary" data-act="new-task">+ Tugas</button></div></div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="Cari tugas…" value="${esc(f.q)}" aria-label="Cari tugas">
    <select id="fs" aria-label="Filter status"><option value="">Semua status</option>${opts(STATUS, f.status)}</select>
    <select id="sort" aria-label="Urutkan"><option value="deadline" ${f.sort === 'deadline' ? 'selected' : ''}>Urut deadline</option>
      <option value="priority" ${f.sort === 'priority' ? 'selected' : ''}>Urut prioritas</option>
      <option value="title" ${f.sort === 'title' ? 'selected' : ''}>Urut judul</option></select>
    <button class="btn ${S.mode === 'list' ? 'on' : ''}" data-act="mode" data-id="list">Daftar</button>
    <button class="btn ${S.mode === 'board' ? 'on' : ''}" data-act="mode" data-id="board">Papan</button></div>
  <div id="taskArea"></div>`;
  renderTasks();
}
function taskCard(t, drag) {
  const [l, c] = dl(t.deadline);
  return `<article class="card task ${t.status === 'Done' ? 'done' : ''}" ${drag ? 'draggable="true"' : ''} data-id="${t.id}">
    <div class="row"><h4>${esc(t.title)}</h4>${t.weight ? `<span class="pill w" title="Bobot nilai">⚖ ${t.weight}</span>` : ''}</div>
    ${t.description ? `<p class="muted">${esc(t.description)}</p>` : ''}
    <div class="row wrap"><span class="pill ${t.status === 'Done' ? '' : c}">${l}</span><span class="pill s${STATUS.indexOf(t.status)}">${t.status}</span>
      ${t.status === 'Done' ? `<span class="pill w" title="XP dari tugas ini">+${t.weight || 10} XP</span>` : ''}
      ${t.pomoDates?.length ? `<span class="pill" title="Sesi fokus selesai">🍅 ${t.pomoDates.length}</span>` : ''}</div>
    ${(t.files || []).map(f => `<a class="file" href="${f.data}" download="${esc(f.name)}">📎 ${esc(f.name)}</a>`).join('')}
    <div class="row actions">${t.status !== 'Done' ? `<button class="btn sm" data-act="pomo-start" data-id="${t.id}" title="Mulai sesi fokus (durasi bisa diatur)">🍅 Fokus</button>` : ''}<select data-act="set-status" data-id="${t.id}" aria-label="Ubah status">${opts(STATUS, t.status)}</select>
      <button class="btn ghost sm" data-act="edit-task" data-id="${t.id}">Ubah</button>
      <button class="btn danger sm" data-act="del-task" data-id="${t.id}">Hapus</button></div></article>`;
}
function renderTasks() {
  const area = $('#taskArea'); if (!area) return;
  const all = T().filter(t => t.projectId === S.pid), { q, status, sort } = S.filter;
  const list = all.filter(t => (!status || t.status === status) && (!q || (t.title + ' ' + t.description).toLowerCase().includes(q.toLowerCase())));
  list.sort(sort === 'priority' ? (a, b) => score(b) - score(a) : sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => a.deadline.localeCompare(b.deadline));
  if (!all.length) area.innerHTML = empty('Belum ada tugas', 'Klik "+ Tugas" untuk menambahkan tugas pertama.');
  else if (!list.length) area.innerHTML = empty('Tidak ada hasil', 'Coba ubah kata kunci atau filter.');
  else if (S.mode === 'board')
    area.innerHTML = `<div class="board">${STATUS.map(s => `<div class="col" data-status="${s}"><h4>${s} (${list.filter(t => t.status === s).length})</h4>${list.filter(t => t.status === s).map(t => taskCard(t, true)).join('')}</div>`).join('')}</div>`;
  else area.innerHTML = `<div class="list">${list.map(t => taskCard(t, false)).join('')}</div>`;
}
function taskForm(id, date, pick) {
  const t = id ? T().find(x => x.id === id) : null;
  S.draft = (t?.files || []).slice();
  openModal(`<form data-form="task" data-id="${id || ''}" novalidate><h3>${t ? 'Ubah' : 'Tambah'} tugas</h3>
    ${field('title', 'Judul', `<input name="title" maxlength="80" value="${esc(t?.title)}">`)}
    ${field('description', 'Deskripsi', `<textarea name="description" rows="3" maxlength="500">${esc(t?.description)}</textarea>`)}
    ${pick && !t ? `<label>Proyek<select name="project">${myP().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}
    <div class="row wrap">${field('deadline', 'Deadline', `<input name="deadline" type="date" value="${t?.deadline || date || ''}">`)}
    <label>Status<select name="status">${opts(STATUS, t?.status)}</select></label></div>
    ${field('weight', 'Bobot nilai <small>(opsional, 1–100; makin besar makin diprioritaskan di pengingat)</small>', `<input name="weight" type="number" min="1" max="100" value="${t?.weight ?? ''}">`)}
    <label>Lampiran <small>(maks. 500 KB/file: gambar, PDF, dokumen)</small><input id="fileInput" type="file" multiple></label>
    <div id="fileList"></div>
    <div class="row end"><button type="button" class="btn ghost" data-act="close">Batal</button><button class="btn primary">Simpan</button></div></form>`);
  renderDraft();
}
const renderDraft = () => { const el = $('#fileList'); if (el) el.innerHTML = S.draft.map((f, i) =>
  `<div class="row" style="margin-bottom:6px">📎 <span style="flex:1;word-break:break-all">${esc(f.name)} <small class="muted">(${Math.ceil(f.size / 1024)} KB)</small></span>
   <button type="button" class="btn danger sm" data-act="rm-file" data-id="${i}">Lepas</button></div>`).join(''); };
const readFile = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
async function addFiles(input) {
  for (const f of input.files) {
    if (!FILE_OK.test(f.name)) { toast(`${f.name}: tipe file tidak didukung`, 'error'); continue; }
    if (f.size > MAX_FILE) { toast(`${f.name}: lebih dari 500 KB`, 'error'); continue; }
    S.draft.push({ name: f.name, size: f.size, data: await readFile(f) });
  }
  input.value = ''; renderDraft();
}
function saveTask(f, id) {
  const d = Object.fromEntries(new FormData(f)), e = {};
  if (d.title.trim().length < 3) e.title = 'Judul minimal 3 karakter';
  if (!d.deadline) e.deadline = 'Deadline wajib diisi';
  if (d.weight !== '' && !(Number.isInteger(+d.weight) && +d.weight >= 1 && +d.weight <= 100)) e.weight = 'Bobot harus bilangan bulat 1–100';
  if (showErrors(f, e)) return;
  const before = totalXp(), all = T(), obj = { title: d.title.trim(), description: d.description.trim(), deadline: d.deadline, status: d.status, weight: d.weight === '' ? null : +d.weight, files: S.draft };
  if (id) { const i = all.findIndex(x => x.id === id), old = all[i]; all[i] = { ...old, ...obj }; if (old.status !== obj.status) stamp(all[i], obj.status); }
  else { const nt = { id: uid(), projectId: d.project || S.pid, createdAt: Date.now(), ...obj }; stamp(nt, obj.status); all.push(nt); }
  if (save(K.tasks, all)) { closeModal(); toast(id ? 'Tugas diperbarui' : 'Tugas ditambahkan'); levelCheck(before); renderTasks(); if ($('#cal')) vDash(); }
}
function setStatus(id, status) {
  const all = T(), t = all.find(x => x.id === id);
  if (!t || t.status === status) return;
  const before = totalXp();
  stamp(t, status);
  if (save(K.tasks, all)) { toast(`Dipindah ke ${status}${status === 'Done' ? ` (+${t.weight || 10} XP)` : ''}`); levelCheck(before); renderTasks(); }
}
async function delTask(id) {
  const t = T().find(x => x.id === id);
  if (!await ask(`Hapus tugas "${t.title}"?`)) return;
  save(K.tasks, T().filter(x => x.id !== id)); toast('Tugas dihapus'); renderTasks();
}

/* ================= Event delegation ================= */
document.addEventListener('click', async e => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id } = el.dataset;
  if (act === 'close') closeModal();
  else if (act === 'logout') { if (confirm('Yakin ingin keluar?')) { localStorage.removeItem(K.session); sessionStorage.removeItem('tf_notified'); S.pomo = null; pomoSave(); location.hash = '#/login'; route(); } }
  else if (act === 'theme') { localStorage.setItem(K.theme, document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); }
  else if (act === 'accent') { localStorage.setItem(K.accent, id); applyTheme(); }
  else if (act === 'notif') { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifikasi browser aktif' : 'Notifikasi tidak diizinkan', r === 'granted' ? 'ok' : 'warn'); vDash(); }
  else if (act === 'toggle-pw') { const i = $('input', el.parentElement), show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.innerHTML = show ? EYE_OFF : EYE; const t = show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'; el.title = t; el.setAttribute('aria-label', t); }
  else if (act === 'day') dayModal(id);
  else if (act === 'cal-new') { if (!myP().length) { closeModal(); toast('Buat proyek dulu sebelum menambah tugas', 'warn'); } else taskForm(null, id, true); }
  else if (act === 'cal-view') { S.calView = id; S.pickY = S.pickY ?? S.cal.y; if (id === 'months') S.pickY = S.cal.y; if (id === 'years') S.yBase = Math.floor(S.pickY / 12) * 12; vDash(); }
  else if (act === 'pick-month') { S.cal = { y: S.pickY, m: +id }; S.calView = 'days'; vDash(); }
  else if (act === 'pick-year') { S.pickY = +id; S.calView = 'months'; vDash(); }
  else if (act === 'pick-prev' || act === 'pick-next') { const s = act === 'pick-next' ? 1 : -1; if (S.calView === 'years') S.yBase += 12 * s; else S.pickY += s; vDash(); }
  else if (act === 'cal-prev') calMove(-1);
  else if (act === 'cal-next') calMove(1);
  else if (act === 'cal-today') { S.calView = 'days'; const d = new Date(); S.cal = { y: d.getFullYear(), m: d.getMonth() }; vDash(); }
  else if (act === 'new-project') projectForm();
  else if (act === 'edit-project') projectForm(id);
  else if (act === 'del-project') delProject(id);
  else if (act === 'new-task') taskForm();
  else if (act === 'edit-task') taskForm(id);
  else if (act === 'del-task') delTask(id);
  else if (act === 'rm-file') { S.draft.splice(+id, 1); renderDraft(); }
  else if (act === 'mode') { S.mode = id; vProject(S.pid); }
  else if (act === 'cp-open') cpOpen();
  else if (act === 'cp-pal') { const [h, sat, l] = hexHsl(id); S.cp = { h, s: clamp(sat, 45, 100), l: clamp(l, 30, 60) }; $('#cpH').value = S.cp.h; $('#cpS').value = S.cp.s; $('#cpL').value = S.cp.l; cpPaint(); }
  else if (act === 'cp-ok') { localStorage.setItem(K.accent, 'custom'); localStorage.setItem(K.custom, hslHex(S.cp.h, S.cp.s, S.cp.l)); S.cp = null; closeModal(); applyTheme(); toast('Warna aksen diterapkan'); }
  else if (act === 'cp-cancel') closeModal();
  else if (act === 'pomo-start') pomoStart(id);
  else if (act === 'pomo-preset') { const [a, b] = id.split(','); $('[name=focus]').value = a; $('[name=rest]').value = b; }
  else if (act === 'pomo-toggle') pomoToggle();
  else if (act === 'pomo-stop') pomoStop();
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, k = f.dataset.form, id = f.dataset.id || null;
  ({ login: () => doLogin(f), register: () => doRegister(f), project: () => saveProject(f, id), task: () => saveTask(f, id), pomo: () => pomoBegin(f, id) }[k] || (() => {}))();
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.filter.q = e.target.value; renderTasks(); }
  else if (S.cp && ['cpH', 'cpS', 'cpL'].includes(e.target.id)) { S.cp[{ cpH: 'h', cpS: 's', cpL: 'l' }[e.target.id]] = +e.target.value; cpPaint(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fs') { S.filter.status = t.value; renderTasks(); }
  else if (t.id === 'sort') { S.filter.sort = t.value; renderTasks(); }
  else if (t.id === 'fileInput') addFiles(t);
  else if (t.dataset.act === 'set-status') setStatus(t.dataset.id, t.value);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Drag & drop status (papan) */
document.addEventListener('dragstart', e => { const c = e.target.closest?.('.task[data-id]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); } });
document.addEventListener('dragend', e => { e.target.closest?.('.task')?.classList.remove('dragging'); $$('.col.over').forEach(c => c.classList.remove('over')); });
document.addEventListener('dragover', e => { const c = e.target.closest?.('.col'); if (c) { e.preventDefault(); $$('.col.over').forEach(x => x !== c && x.classList.remove('over')); c.classList.add('over'); } });
document.addEventListener('drop', e => { const c = e.target.closest?.('.col'); if (!c) return; e.preventDefault(); setStatus(e.dataTransfer.getData('text/plain'), c.dataset.status); });

/* ================= Start ================= */
window.addEventListener('hashchange', route);
applyTheme();
route();
notifyDue();
setInterval(pomoTick, 1000);
