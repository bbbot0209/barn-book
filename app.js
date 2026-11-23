/* Barn Book — lessons, practice rides, and boarders for a horse farm.
   Single-file vanilla JS. Data lives in localStorage on the device. */
'use strict';

const KEY = 'barnbook.v1';
const METHODS = ['Cash', 'Venmo', 'Zelle', 'Check', 'Card'];
const NEW = '__new';

/* ------------------------------------------------------------------ data */

function blankDb() {
  return { version: 1, riders: [], horses: [], lessons: [], rides: [], boarders: [], boardPays: [], settings: { lastMethod: 'Cash' } };
}

function normalize(d) {
  const b = blankDb();
  if (!d || typeof d !== 'object') return b;
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) d = d.data; // backup wrapper
  for (const k of ['riders', 'horses', 'lessons', 'rides', 'boarders', 'boardPays']) {
    b[k] = Array.isArray(d[k]) ? d[k].filter(x => x && typeof x === 'object' && x.id) : [];
  }
  b.settings = Object.assign(b.settings, (d.settings && typeof d.settings === 'object') ? d.settings : {});
  return b;
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch (e) { return blankDb(); }
}

let db = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

/* --------------------------------------------------------------- helpers */

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const pad = n => String(n).padStart(2, '0');

function money(n) {
  n = Math.round(num(n) * 100) / 100;
  const whole = Math.abs(n % 1) < 0.005;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 15) * 15)}`; }
function isoToDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1); }
function isoAdd(iso, days) { const d = isoToDate(iso); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDate(iso) { if (!iso) return ''; const d = isoToDate(iso); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; }
function fmtMD(iso) { const d = isoToDate(iso); return `${d.getMonth() + 1}/${d.getDate()}`; }
function fmtDow(iso) { return isoToDate(iso).toLocaleDateString('en-US', { weekday: 'short' }); }
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === isoAdd(t, -1)) return 'Yesterday';
  if (iso === isoAdd(t, 1)) return 'Tomorrow';
  return `${fmtDow(iso)} ${fmtMD(iso)}`;
}
const monthOf = iso => iso.slice(0, 7);
const thisMonth = () => monthOf(todayISO());
function monthLabel(m, short) { return isoToDate(m + '-01').toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric' }); }
function addMonth(m, n) { const d = isoToDate(m + '-01'); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'; }

const byId = (arr, id) => arr.find(x => x.id === id);
const riderName = id => (byId(db.riders, id) || {}).name || '—';
const horseName = id => (byId(db.horses, id) || {}).name || '—';
const sortByName = arr => arr.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
const sortDesc = arr => arr.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
const sortAsc = arr => arr.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

/* charges: lessons use `price`, rides use `fee` */
const charge = (kind, x) => num(kind === 'lesson' ? x.price : x.fee);
const isOwed = (kind, x) => !x.paid && charge(kind, x) > 0;

function unpaidItems() {
  return [
    ...db.lessons.filter(x => isOwed('lesson', x)).map(x => ({ kind: 'lesson', x })),
    ...db.rides.filter(x => isOwed('ride', x)).map(x => ({ kind: 'ride', x }))
  ].sort((a, b) => (a.x.date + (a.x.time || '')).localeCompare(b.x.date + (b.x.time || '')));
}

function riderOwed(id) {
  return db.lessons.filter(x => x.riderId === id && isOwed('lesson', x)).reduce((s, x) => s + num(x.price), 0) +
         db.rides.filter(x => x.riderId === id && isOwed('ride', x)).reduce((s, x) => s + num(x.fee), 0);
}

/* boarders */
const boardPay = (bid, m) => db.boardPays.find(p => p.boarderId === bid && p.month === m);
function boardersFor(m) {
  return sortByName(db.boarders.filter(b => (b.start || '0000-00') <= m && (b.active !== false || boardPay(b.id, m))));
}
function boardStatus(b, m) {
  const p = boardPay(b.id, m), rent = num(b.rent);
  if (!p) return { state: 'unpaid', pay: null, due: rent };
  if (num(p.amount) + 0.005 < rent) return { state: 'partial', pay: p, due: rent - num(p.amount) };
  return { state: 'paid', pay: p, due: 0 };
}
function isLate(b, m) {
  const t = thisMonth();
  if (m < t) return true;
  if (m > t) return false;
  return new Date().getDate() > (parseInt(b.dueDay, 10) || 1);
}

/* ------------------------------------------------------------------ state */

const ui = {
  lessons: { status: 'all', rider: '', horse: '', from: '', to: '' },
  rides: { status: 'all', rider: '', horse: '', from: '', to: '' },
  boardMonth: thisMonth(),
  horseMonth: thisMonth()
};

/* ----------------------------------------------------------------- toast */

let toastTimer = null, undoSnap = null;
function toast(msg, snap) {
  undoSnap = snap || null;
  $('#toastMsg').textContent = msg;
  $('#toastUndo').classList.toggle('hidden', !snap);
  $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), snap ? 5000 : 2200);
}
$('#toastUndo').addEventListener('click', () => {
  if (!undoSnap) return;
  db = normalize(JSON.parse(undoSnap)); save(); undoSnap = null;
  $('#toast').classList.add('hidden'); render();
});
const snap = () => JSON.stringify(db);

/* ----------------------------------------------------------------- sheet */

let sheetSubmit = null;
function openSheet(title, body, onSubmit, opts = {}) {
  sheetSubmit = onSubmit;
  $('#toast').classList.add('hidden');
  $('#sheet').innerHTML = `<div class="grab"></div>
    <form id="sheetForm" autocomplete="off" novalidate>
      <div class="sheet-h"><button type="button" data-act="close-sheet">Cancel</button><h3>${esc(title)}</h3>
      <button type="submit" ${onSubmit ? '' : 'class="hidden"'}>${esc(opts.saveLabel || 'Save')}</button></div>
      ${body}
    </form>`;
  $('#sheetWrap').classList.remove('hidden');
  document.body.classList.add('sheet-open');
  $('#sheet').scrollTop = 0;
  const f = $('#sheetForm');
  f.addEventListener('submit', e => { e.preventDefault(); if (sheetSubmit && sheetSubmit(f) !== false) closeSheet(); });
  wireForm(f);
  if (opts.focus) { const el = f.elements[opts.focus]; if (el) setTimeout(() => el.focus(), 250); }
  return f;
}
function closeSheet() {
  $('#sheetWrap').classList.add('hidden');
  document.body.classList.remove('sheet-open');
  $('#sheet').innerHTML = ''; sheetSubmit = null;
}
$('#sheetBackdrop').addEventListener('click', closeSheet);

function wireForm(f) {
  // payment method chips
  f.querySelectorAll('.methods').forEach(box => {
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-m]'); if (!b) return;
      box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      f.elements[box.dataset.name].value = b.dataset.m;
    });
  });
  // paid switch reveals paid details
  if (f.elements.paid) {
    const sync = () => { const box = $('.paid-box', f); if (box) box.classList.toggle('hidden', !f.elements.paid.checked); };
    f.elements.paid.addEventListener('change', () => {
      if (f.elements.paid.checked && f.elements.paidDate && !f.elements.paidDate.value) f.elements.paidDate.value = todayISO();
      sync();
    });
    sync();
  }
  // "+ New …" options in selects
  f.querySelectorAll('select[data-new]').forEach(sel => {
    const box = $(`[data-newbox="${sel.name}"]`, f);
    const sync = () => {
      box.classList.toggle('hidden', sel.value !== NEW);
      if (sel.value === NEW) setTimeout(() => box.querySelector('input').focus(), 50);
    };
    sel.addEventListener('change', sync);
  });
}

function markErr(f, name) {
  const el = f.elements[name];
  if (el) { el.style.borderColor = 'var(--owed)'; el.focus(); }
  return false;
}

/* --------------------------------------------------------- form pieces */

function fText(name, label, val, attrs = '') {
  return `<label class="f"><span>${label}</span><input type="text" name="${name}" value="${esc(val)}" ${attrs}></label>`;
}
function fMoney(name, label, val) {
  const v = val === '' || val == null ? '' : num(val);
  return `<label class="f"><span>${label}</span><div class="money"><input type="number" inputmode="decimal" step="0.01" min="0" name="${name}" value="${v}"></div></label>`;
}
function fDate(name, label, val) { return `<label class="f"><span>${label}</span><input type="date" name="${name}" value="${esc(val)}"></label>`; }
function fNotes(val) { return `<label class="f"><span>Notes</span><textarea name="notes" rows="2">${esc(val)}</textarea></label>`; }
function fSwitch(name, label, on) {
  return `<label class="toggle-row"><span>${label}</span><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i></span></label>`;
}
function fMethods(name, val) {
  val = val || db.settings.lastMethod || 'Cash';
  return `<input type="hidden" name="${name}" value="${esc(val)}"><div class="methods" data-name="${name}">${METHODS.map(m => `<button type="button" data-m="${m}" class="${m === val ? 'on' : ''}">${m}</button>`).join('')}</div>`;
}
function fPaidBox(x) {
  return `${fSwitch('paid', 'Paid', !!x.paid)}
    <div class="paid-box">
      ${fDate('paidDate', 'Paid on', x.paidDate || (x.paid ? todayISO() : ''))}
      ${fMethods('method', x.method)}
    </div>`;
}
function riderSelect(val) {
  const opts = sortByName(db.riders).map(r => `<option value="${r.id}" ${r.id === val ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  return `<label class="f"><span>Rider</span><select name="riderId" data-new>
      <option value="" ${!val ? 'selected' : ''} disabled>Choose rider</option>${opts}<option value="${NEW}">+ New rider…</option></select>
      <div class="new-inline hidden" data-newbox="riderId"><input type="text" name="newRider" placeholder="Rider name" autocapitalize="words"></div></label>`;
}
function horseSelect(val, label = 'Horse') {
  const list = sortByName(db.horses.filter(h => h.active !== false || h.id === val));
  const opts = list.map(h => `<option value="${h.id}" ${h.id === val ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  return `<label class="f"><span>${label}</span><select name="horseId" data-new>
      <option value="" ${!val ? 'selected' : ''}>—</option>${opts}<option value="${NEW}">+ New horse…</option></select>
      <div class="new-inline hidden" data-newbox="horseId"><input type="text" name="newHorse" placeholder="Horse name" autocapitalize="words"></div></label>`;
}

function resolveRider(f) {
  let id = f.elements.riderId.value;
  if (id === NEW) {
    const name = f.elements.newRider.value.trim();
    if (!name) return null;
    const existing = db.riders.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    id = uid(); db.riders.push({ id, name, phone: '', notes: '' });
  }
  return id || null;
}
function resolveHorse(f) {
  let id = f.elements.horseId.value;
  if (id === NEW) {
    const name = f.elements.newHorse.value.trim();
    if (!name) return '';
    const existing = db.horses.find(h => h.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    id = uid(); db.horses.push({ id, name, notes: '', active: true });
  }
  return id || '';
}
function readPaid(f, target) {
  target.paid = f.elements.paid.checked;
  target.paidDate = target.paid ? (f.elements.paidDate.value || todayISO()) : '';
  target.method = target.paid ? f.elements.method.value : '';
  if (target.paid) db.settings.lastMethod = target.method;
}

/* --------------------------------------------------------------- lessons */

function lessonForm(id, preset = {}) {
  const x = id ? byId(db.lessons, id) : Object.assign({
    date: todayISO(), time: nowTime(), riderId: '', horseId: '', instructor: db.settings.lastInstructor || '',
    price: db.settings.lastPrice != null ? db.settings.lastPrice : '', paid: false, notes: ''
  }, preset);
  if (!x) return;
  const instructors = [...new Set(db.lessons.map(l => l.instructor).filter(Boolean))];
  const f = openSheet(id ? 'Lesson' : 'New lesson', `
    <div class="two">${fDate('date', 'Date', x.date)}<label class="f"><span>Time</span><input type="time" name="time" value="${esc(x.time || '')}"></label></div>
    ${riderSelect(x.riderId)}
    ${horseSelect(x.horseId, 'Horse ridden')}
    <div class="two">${fText('instructor', 'Instructor', x.instructor, 'list="instructors" autocapitalize="words"')}${fMoney('price', 'Price', x.price)}</div>
    <datalist id="instructors">${instructors.map(i => `<option value="${esc(i)}">`).join('')}</datalist>
    ${fPaidBox(x)}
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">Save lesson</button>
    ${id ? `<button class="btn danger block" type="button" data-act="del-lesson" data-id="${id}">Delete lesson</button>` : ''}</div>`,
  f => {
    const riderId = resolveRider(f);
    if (!riderId) return markErr(f, f.elements.riderId.value === NEW ? 'newRider' : 'riderId');
    if (!f.elements.date.value) return markErr(f, 'date');
    const before = snap();
    const rec = id ? byId(db.lessons, id) : { id: uid(), created: Date.now() };
    Object.assign(rec, {
      date: f.elements.date.value, time: f.elements.time.value, riderId, horseId: resolveHorse(f),
      instructor: f.elements.instructor.value.trim(), price: num(f.elements.price.value), notes: f.elements.notes.value.trim()
    });
    readPaid(f, rec);
    if (!id) { db.lessons.push(rec); db.settings.lastPrice = rec.price; db.settings.lastInstructor = rec.instructor; }
    save(); render(); toast(id ? 'Lesson saved' : 'Lesson added', before);
  });
  if (!id) {
    // pick up the rider's usual horse + price
    f.elements.riderId.addEventListener('change', () => {
      const last = sortDesc(db.lessons.filter(l => l.riderId === f.elements.riderId.value))[0];
      if (!last) return;
      if (last.horseId && byId(db.horses, last.horseId) && byId(db.horses, last.horseId).active !== false) f.elements.horseId.value = last.horseId;
      f.elements.price.value = num(last.price);
      if (last.instructor) f.elements.instructor.value = last.instructor;
    });
  }
}

/* ----------------------------------------------------------------- rides */

function rideForm(id, preset = {}) {
  const x = id ? byId(db.rides, id) : Object.assign({ date: todayISO(), time: nowTime(), riderId: '', horseId: '', duration: 45, fee: '', paid: false, notes: '' }, preset);
  if (!x) return;
  openSheet(id ? 'Practice ride' : 'New practice ride', `
    <div class="two">${fDate('date', 'Date', x.date)}<label class="f"><span>Time</span><input type="time" name="time" value="${esc(x.time || '')}"></label></div>
    ${riderSelect(x.riderId)}
    ${horseSelect(x.horseId)}
    <div class="two"><label class="f"><span>Minutes</span><input type="number" inputmode="numeric" min="0" step="5" name="duration" value="${esc(x.duration || '')}"></label>${fMoney('fee', 'Fee', x.fee)}</div>
    ${fPaidBox(x)}
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">Save ride</button>
    ${id ? `<button class="btn danger block" type="button" data-act="del-ride" data-id="${id}">Delete ride</button>` : ''}</div>`,
  f => {
    const riderId = resolveRider(f);
    if (!riderId) return markErr(f, f.elements.riderId.value === NEW ? 'newRider' : 'riderId');
    if (!f.elements.date.value) return markErr(f, 'date');
    const before = snap();
    const rec = id ? byId(db.rides, id) : { id: uid(), created: Date.now() };
    Object.assign(rec, {
      date: f.elements.date.value, time: f.elements.time.value, riderId, horseId: resolveHorse(f),
      duration: parseInt(f.elements.duration.value, 10) || 0, fee: num(f.elements.fee.value), notes: f.elements.notes.value.trim()
    });
    readPaid(f, rec);
    if (!id) db.rides.push(rec);
    save(); render(); toast(id ? 'Ride saved' : 'Ride added', before);
  });
}

/* --------------------------------------------------------------- riders */

function riderForm(id) {
  const x = id ? byId(db.riders, id) : { name: '', phone: '', notes: '' };
  if (!x) return;
  let stats = '';
  if (id) {
    const nL = db.lessons.filter(l => l.riderId === id).length, nR = db.rides.filter(r => r.riderId === id).length, owed = riderOwed(id);
    stats = `<div class="kv">
      <div class="stat ${owed ? 'owed' : 'zero'}"><div class="v">${money(owed)}</div><div class="l">Owed</div></div>
      <button type="button" class="stat" data-act="rider-lessons" data-id="${id}"><div class="v">${nL}</div><div class="l">Lessons ›</div></button>
      <button type="button" class="stat" data-act="rider-rides" data-id="${id}"><div class="v">${nR}</div><div class="l">Rides ›</div></button></div>`;
  }
  openSheet(id ? x.name : 'New rider', `${stats}
    ${fText('name', 'Name', x.name, 'autocapitalize="words"')}
    <label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(x.phone)}" inputmode="tel"></label>
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">Save rider</button>
    ${id ? `<button class="btn danger block" type="button" data-act="del-rider" data-id="${id}">Delete rider</button>` : ''}</div>`,
  f => {
    const name = f.elements.name.value.trim();
    if (!name) return markErr(f, 'name');
    const before = snap();
    const rec = id ? byId(db.riders, id) : { id: uid() };
    Object.assign(rec, { name, phone: f.elements.phone.value.trim(), notes: f.elements.notes.value.trim() });
    if (!id) db.riders.push(rec);
    save(); render(); toast(id ? 'Rider saved' : 'Rider added', before);
  }, { focus: id ? null : 'name' });
}

/* --------------------------------------------------------------- horses */

function horseForm(id) {
  const x = id ? byId(db.horses, id) : { name: '', notes: '', active: true };
  if (!x) return;
  let stats = '';
  if (id) {
    const m = thisMonth();
    const nL = db.lessons.filter(l => l.horseId === id && monthOf(l.date) === m).length;
    const nR = db.rides.filter(r => r.horseId === id && monthOf(r.date) === m).length;
    const all = db.lessons.filter(l => l.horseId === id).length + db.rides.filter(r => r.horseId === id).length;
    stats = `<div class="kv">
      <div class="stat"><div class="v">${nL}</div><div class="l">Lessons · ${monthLabel(m, true)}</div></div>
      <div class="stat"><div class="v">${nR}</div><div class="l">Rides · ${monthLabel(m, true)}</div></div>
      <div class="stat"><div class="v">${all}</div><div class="l">All time</div></div></div>`;
  }
  openSheet(id ? x.name : 'New horse', `${stats}
    ${fText('name', 'Name', x.name, 'autocapitalize="words"')}
    ${fSwitch('active', 'In work', x.active !== false)}
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">Save horse</button>
    ${id ? `<button class="btn danger block" type="button" data-act="del-horse" data-id="${id}">Delete horse</button>` : ''}</div>`,
  f => {
    const name = f.elements.name.value.trim();
    if (!name) return markErr(f, 'name');
    const before = snap();
    const rec = id ? byId(db.horses, id) : { id: uid() };
    Object.assign(rec, { name, active: f.elements.active.checked, notes: f.elements.notes.value.trim() });
    if (!id) db.horses.push(rec);
    save(); render(); toast(id ? 'Horse saved' : 'Horse added', before);
  }, { focus: id ? null : 'name' });
}

/* ------------------------------------------------------------- boarders */

function boarderForm(id) {
  const x = id ? byId(db.boarders, id) : { name: '', phone: '', horses: '', rent: '', dueDay: 1, start: thisMonth(), active: true, notes: '' };
  if (!x) return;
  openSheet(id ? x.name : 'New boarder', `
    ${fText('name', 'Boarder', x.name, 'autocapitalize="words"')}
    ${fText('horses', 'Horse(s)', x.horses, 'autocapitalize="words" placeholder="e.g. Biscuit, Dolly"')}
    <div class="two">${fMoney('rent', 'Monthly rent', x.rent)}<label class="f"><span>Due day</span><input type="number" inputmode="numeric" min="1" max="31" name="dueDay" value="${esc(x.dueDay || 1)}"></label></div>
    <div class="two"><label class="f"><span>Boarding since</span><input type="month" name="start" value="${esc(x.start || '')}"></label>
      <label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(x.phone || '')}" inputmode="tel"></label></div>
    ${fSwitch('active', 'Currently boarding', x.active !== false)}
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">Save boarder</button>
    ${id ? `<button class="btn danger block" type="button" data-act="del-boarder" data-id="${id}">Delete boarder</button>` : ''}</div>`,
  f => {
    const name = f.elements.name.value.trim();
    if (!name) return markErr(f, 'name');
    const before = snap();
    const rec = id ? byId(db.boarders, id) : { id: uid() };
    Object.assign(rec, {
      name, horses: f.elements.horses.value.trim(), rent: num(f.elements.rent.value),
      dueDay: Math.min(31, Math.max(1, parseInt(f.elements.dueDay.value, 10) || 1)),
      start: f.elements.start.value || '', phone: f.elements.phone.value.trim(),
      active: f.elements.active.checked, notes: f.elements.notes.value.trim()
    });
    if (!id) db.boarders.push(rec);
    save(); render(); toast(id ? 'Boarder saved' : 'Boarder added', before);
  }, { focus: id ? null : 'name' });
}

function boardPayForm(boarderId, month) {
  const b = byId(db.boarders, boarderId); if (!b) return;
  const p = boardPay(boarderId, month);
  const x = p || { amount: b.rent, date: todayISO(), method: db.settings.lastMethod, notes: '' };
  openSheet(`${b.name} · ${monthLabel(month, true)}`, `
    <div class="summary">Rent <b>${money(b.rent)}</b> · due the ${ordinal(parseInt(b.dueDay, 10) || 1)}</div>
    <div class="two">${fMoney('amount', 'Amount paid', x.amount)}${fDate('date', 'Paid on', x.date)}</div>
    ${fMethods('method', x.method)}
    ${fNotes(x.notes)}
    <div class="sheet-actions"><button class="btn big block" type="submit">${p ? 'Save payment' : 'Mark paid'}</button>
    ${p ? `<button class="btn danger block" type="button" data-act="del-boardpay" data-id="${p.id}">Mark unpaid</button>` : ''}</div>`,
  f => {
    const before = snap();
    const rec = p || { id: uid(), boarderId, month };
    Object.assign(rec, { amount: num(f.elements.amount.value), date: f.elements.date.value || todayISO(), method: f.elements.method.value, notes: f.elements.notes.value.trim() });
    db.settings.lastMethod = rec.method;
    if (!p) db.boardPays.push(rec);
    save(); render(); toast(`${b.name} · ${monthLabel(month, true)} saved`, before);
  });
}

/* ----------------------------------------------------------- quick pay */

function payItem(kind, id) {
  const list = kind === 'lesson' ? db.lessons : db.rides;
  const x = byId(list, id); if (!x) return;
  const before = snap();
  x.paid = true; x.paidDate = todayISO(); x.method = db.settings.lastMethod || 'Cash';
  save(); render();
  toast(`Paid ${money(charge(kind, x))} · ${x.method}`, before);
}
function payBoard(boarderId, month) {
  const b = byId(db.boarders, boarderId); if (!b) return;
  const before = snap();
  const p = boardPay(boarderId, month);
  const method = db.settings.lastMethod || 'Cash';
  if (p) Object.assign(p, { amount: num(b.rent), date: todayISO() });
  else db.boardPays.push({ id: uid(), boarderId, month, amount: num(b.rent), date: todayISO(), method, notes: '' });
  save(); render();
  toast(`${b.name} paid ${money(b.rent)} · ${monthLabel(month, true)}`, before);
}

/* ---------------------------------------------------------------- rows */

function itemRow(kind, x, opts = {}) {
  const c = charge(kind, x);
  const who = esc(riderName(x.riderId));
  const horse = x.horseId ? esc(horseName(x.horseId)) : '';
  const sub = kind === 'lesson'
    ? [opts.dateInSub ? relDay(x.date) : '', opts.timeCol ? '' : fmtTime(x.time), horse, x.instructor ? 'w/ ' + esc(x.instructor) : ''].filter(Boolean).join(' · ')
    : [opts.dateInSub ? relDay(x.date) : '', 'Practice', horse, x.duration ? x.duration + ' min' : ''].filter(Boolean).join(' · ');
  let right;
  if (c <= 0) right = `<div class="amt"><small>${kind === 'lesson' ? 'No charge' : 'No fee'}</small></div>`;
  else if (x.paid) right = `<div class="amt">${money(c)}<small style="color:var(--paid)">Paid${x.method ? ' · ' + esc(x.method) : ''}</small></div>`;
  else right = `<div class="amt">${money(c)}</div><button class="pay-btn" data-act="pay-${kind}" data-id="${x.id}">Mark paid</button>`;
  const when = opts.dateInSub ? '' : opts.timeCol
    ? `<div class="when">${x.time ? fmtTime(x.time).split(' ')[1] : ''}<b>${x.time ? fmtTime(x.time).split(' ')[0] : '—'}</b></div>`
    : `<div class="when">${fmtDow(x.date)}<b>${fmtMD(x.date)}</b></div>`;
  return `<div class="row tap" data-act="edit-${kind}" data-id="${x.id}" data-kind="${kind}">${when}
    <div class="main"><div class="t1">${who}</div><div class="t2">${sub}</div></div>${right}</div>`;
}

function boardRow(b, m) {
  const s = boardStatus(b, m);
  const late = s.state !== 'paid' && isLate(b, m);
  const sub = [b.horses ? esc(b.horses) : '', `${money(b.rent)}/mo`, `due ${ordinal(parseInt(b.dueDay, 10) || 1)}`].filter(Boolean).join(' · ');
  let right;
  if (s.state === 'paid') right = `<button class="pill paid" data-act="edit-boardpay" data-id="${b.id}" data-month="${m}">Paid ${fmtMD(s.pay.date)}</button>`;
  else if (s.state === 'partial') right = `<button class="pay-btn" data-act="pay-board" data-id="${b.id}" data-month="${m}">Mark paid</button>`;
  else right = `<button class="pay-btn" data-act="pay-board" data-id="${b.id}" data-month="${m}">Mark paid</button>`;
  return `<div class="row tap" data-act="board-row" data-id="${b.id}" data-month="${m}" data-state="${s.state}">
    <div class="avatar boarder">${esc(initials(b.name))}</div>
    <div class="main"><div class="t1">${esc(b.name)}${late ? '<span class="tag">Late</span>' : ''}${b.active === false ? '<span class="tag muted">Left</span>' : ''}</div><div class="t2">${sub}${s.state === 'partial' ? `<br><span class="pt">Paid ${money(s.pay.amount)} of ${money(b.rent)}</span>` : ''}</div></div>${right}</div>`;
}

/* --------------------------------------------------------------- views */

function viewHome() {
  const t = todayISO(), m = thisMonth();
  const unpaid = unpaidItems();
  const owed = unpaid.reduce((s, u) => s + charge(u.kind, u.x), 0);
  const boarders = boardersFor(m).filter(b => b.active !== false);
  const boardOpen = boarders.filter(b => boardStatus(b, m).state !== 'paid');
  const boardDue = boardOpen.reduce((s, b) => s + boardStatus(b, m).due, 0);
  const collected =
    db.lessons.filter(x => x.paid && x.paidDate && monthOf(x.paidDate) === m).reduce((s, x) => s + num(x.price), 0) +
    db.rides.filter(x => x.paid && x.paidDate && monthOf(x.paidDate) === m).reduce((s, x) => s + num(x.fee), 0) +
    db.boardPays.filter(p => p.date && monthOf(p.date) === m).reduce((s, p) => s + num(p.amount), 0);

  const today = sortAsc([...db.lessons.filter(x => x.date === t).map(x => ({ kind: 'lesson', x })), ...db.rides.filter(x => x.date === t).map(x => ({ kind: 'ride', x }))].map(o => Object.assign({}, o.x, { _k: o.kind })));
  const recent = sortDesc([...db.lessons.map(x => Object.assign({}, x, { _k: 'lesson' })), ...db.rides.map(x => Object.assign({}, x, { _k: 'ride' }))].filter(x => x.date < t)).slice(0, 6);

  return `
    <div class="stats">
      <button class="stat ${owed ? 'owed' : 'zero'}" data-act="goto-unpaid"><div class="v" id="statOwed">${money(owed)}</div><div class="l">Owed · ${unpaid.length}</div></button>
      <a class="stat ${boardDue ? 'owed' : 'zero'}" href="#boarders" style="text-decoration:none;color:inherit"><div class="v" id="statBoard">${money(boardDue)}</div><div class="l">Board due · ${monthLabel(m, true)}</div></a>
      <div class="stat ${collected ? 'good' : 'zero'}"><div class="v" id="statIn">${money(collected)}</div><div class="l">In · ${monthLabel(m, true)}</div></div>
    </div>
    <div class="quick">
      <button class="btn big" data-act="add-lesson">+ Lesson</button>
      <button class="btn big secondary" data-act="add-ride">+ Ride</button>
    </div>

    <div class="section-h"><h2>Today</h2><span class="meta">${isoToDate(t).toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric' })}</span></div>
    <div class="list" id="todayList">${today.length ? today.map(x => itemRow(x._k, x, { timeCol: true })).join('') : '<div class="empty">Nothing booked today</div>'}</div>

    <div class="section-h"><h2>Unpaid</h2>${unpaid.length ? `<button class="linkish" data-act="goto-unpaid">${money(owed)} · All ›</button>` : ''}</div>
    <div class="list" id="unpaidList">${unpaid.length ? unpaid.slice(0, 8).map(u => itemRow(u.kind, u.x, { dateInSub: true })).join('') : '<div class="empty">All paid up</div>'}</div>

    <div class="section-h"><h2>Board · ${monthLabel(m, false).split(' ')[0]}</h2><a href="#boarders">${boarders.length - boardOpen.length}/${boarders.length} paid ›</a></div>
    <div class="list" id="boardList">${!boarders.length ? '<div class="empty">No boarders</div>' : boardOpen.length ? boardOpen.map(b => boardRow(b, m)).join('') : '<div class="empty">Everyone’s paid for ' + monthLabel(m, false).split(' ')[0] + '</div>'}</div>

    ${recent.length ? `<div class="section-h"><h2>Recent</h2></div>
    <div class="list">${recent.map(x => itemRow(x._k, x)).join('')}</div>` : ''}
  `;
}

function filterItems(kind) {
  const F = ui[kind === 'lesson' ? 'lessons' : 'rides'];
  const list = kind === 'lesson' ? db.lessons : db.rides;
  return sortDesc(list.filter(x =>
    (!F.rider || x.riderId === F.rider) &&
    (!F.horse || x.horseId === F.horse) &&
    (!F.from || x.date >= F.from) &&
    (!F.to || x.date <= F.to) &&
    (F.status === 'all' || (F.status === 'unpaid' ? isOwed(kind, x) : (x.paid && charge(kind, x) > 0)))
  ));
}

function viewList(kind) {
  const key = kind === 'lesson' ? 'lessons' : 'rides';
  const F = ui[key];
  const items = filterItems(kind);
  const total = items.reduce((s, x) => s + charge(kind, x), 0);
  const owed = items.filter(x => isOwed(kind, x)).reduce((s, x) => s + charge(kind, x), 0);
  const anyF = F.rider || F.horse || F.from || F.to || F.status !== 'all';
  const rOpts = sortByName(db.riders).map(r => `<option value="${r.id}" ${F.rider === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const hOpts = sortByName(db.horses).map(h => `<option value="${h.id}" ${F.horse === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  let groups = '', cur = '';
  for (const x of items) {
    const m = monthOf(x.date);
    if (m !== cur) { if (cur) groups += '</div>'; groups += `<div class="group-h">${monthLabel(m)}</div><div class="list">`; cur = m; }
    groups += itemRow(kind, x);
  }
  if (cur) groups += '</div>';
  const noun = kind === 'lesson' ? 'lesson' : 'ride';
  return `
    <div class="seg" data-filter-key="${key}">
      ${['all', 'unpaid', 'paid'].map(s => `<button data-act="status" data-v="${s}" class="${F.status === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
    <div class="filters" data-filter-key="${key}">
      <select data-filter="rider" aria-label="Rider"><option value="">All riders</option>${rOpts}</select>
      <select data-filter="horse" aria-label="Horse"><option value="">All horses</option>${hOpts}</select>
      <div class="wide"><input type="date" data-filter="from" value="${F.from}" aria-label="From"><span style="color:var(--muted)">–</span><input type="date" data-filter="to" value="${F.to}" aria-label="To"></div>
    </div>
    <div class="summary" id="summary"><b>${items.length}</b> ${noun}${items.length === 1 ? '' : 's'} · ${money(total)}${owed ? ` · <span class="o">${money(owed)} unpaid</span>` : ''}
      ${anyF ? ` · <button class="linkish clear-f" data-act="clear-filters" data-key="${key}">Clear</button>` : ''}</div>
    ${items.length ? groups : `<div class="list"><div class="empty">${anyF ? 'No matches' : `No ${noun}s yet`}</div></div>`}
    <div style="margin-top:14px"><button class="btn big block ${kind === 'lesson' ? '' : 'secondary'}" data-act="add-${kind}">+ ${kind === 'lesson' ? 'Lesson' : 'Practice ride'}</button></div>`;
}

function viewBoarders() {
  const m = ui.boardMonth;
  const list = boardersFor(m);
  const sts = list.map(b => boardStatus(b, m));
  const paidN = sts.filter(s => s.state === 'paid').length;
  const expected = list.reduce((s, b) => s + num(b.rent), 0);
  const got = sts.reduce((s, x) => s + (x.pay ? num(x.pay.amount) : 0), 0);
  const unpaid = list.filter((b, i) => sts[i].state !== 'paid');
  const paid = list.filter((b, i) => sts[i].state === 'paid');
  const former = db.boarders.filter(b => b.active === false && !list.includes(b));
  return `
    <div class="monthnav">
      <button data-act="board-month" data-n="-1" aria-label="Previous month">‹</button>
      <div class="m" id="boardMonth">${monthLabel(m)}<small>${paidN} of ${list.length} paid · ${money(got)} of ${money(expected)}</small></div>
      <button data-act="board-month" data-n="1" aria-label="Next month">›</button>
    </div>
    <div class="progress"><i style="width:${expected ? Math.min(100, got / expected * 100) : 0}%"></i></div>
    ${m !== thisMonth() ? `<div style="text-align:center;margin:-6px 0 10px"><button class="linkish" data-act="board-today">Back to ${monthLabel(thisMonth(), true)}</button></div>` : ''}
    ${!list.length ? `<div class="list"><div class="empty">No boarders${db.boarders.length ? ' this month' : ' yet'}</div></div>` : ''}
    ${unpaid.length ? `<div class="group-h">Unpaid · ${money(unpaid.reduce((s, b) => s + boardStatus(b, m).due, 0))}</div><div class="list" id="boardUnpaid">${unpaid.map(b => boardRow(b, m)).join('')}</div>` : ''}
    ${paid.length ? `<div class="group-h">Paid</div><div class="list" id="boardPaid">${paid.map(b => boardRow(b, m)).join('')}</div>` : ''}
    ${former.length ? `<div class="group-h">Former</div><div class="list">${former.map(b => `<div class="row tap inactive" data-act="edit-boarder" data-id="${b.id}"><div class="avatar boarder">${esc(initials(b.name))}</div><div class="main"><div class="t1">${esc(b.name)}</div><div class="t2">${esc(b.horses || '')}</div></div></div>`).join('')}</div>` : ''}
    <div style="margin-top:14px"><button class="btn big block secondary" data-act="add-boarder">+ Boarder</button></div>`;
}

function viewRiders() {
  const rows = sortByName(db.riders).map(r => {
    const owed = riderOwed(r.id);
    const nL = db.lessons.filter(l => l.riderId === r.id).length, nR = db.rides.filter(x => x.riderId === r.id).length;
    return { r, owed, nL, nR };
  }).sort((a, b) => (b.owed > 0) - (a.owed > 0) || a.r.name.localeCompare(b.r.name));
  const total = rows.reduce((s, x) => s + x.owed, 0);
  return `<div class="summary"><b>${rows.length}</b> riders${total ? ` · <span class="o">${money(total)} owed</span>` : ''}</div>
    <div class="list" id="riderList">${rows.length ? rows.map(({ r, owed, nL, nR }) => `
      <div class="row tap" data-act="edit-rider" data-id="${r.id}"><div class="avatar">${esc(initials(r.name))}</div>
      <div class="main"><div class="t1">${esc(r.name)}</div><div class="t2">${nL} lesson${nL === 1 ? '' : 's'} · ${nR} ride${nR === 1 ? '' : 's'}${r.phone ? ' · ' + esc(r.phone) : ''}</div></div>
      <div class="amt" ${owed ? 'style="color:var(--owed)"' : ''}>${owed ? money(owed) : '<small>Paid up</small>'}${owed ? '<small>owed</small>' : ''}</div></div>`).join('') : '<div class="empty">No riders yet</div>'}</div>
    <div style="margin-top:14px"><button class="btn big block secondary" data-act="add-rider">+ Rider</button></div>`;
}

function viewHorses() {
  const m = ui.horseMonth;
  const use = db.horses.map(h => {
    const nL = db.lessons.filter(l => l.horseId === h.id && monthOf(l.date) === m).length;
    const nR = db.rides.filter(r => r.horseId === h.id && monthOf(r.date) === m).length;
    return { h, nL, nR, n: nL + nR };
  }).sort((a, b) => (b.h.active !== false) - (a.h.active !== false) || b.n - a.n || a.h.name.localeCompare(b.h.name));
  const max = Math.max(1, ...use.map(u => u.n));
  const total = use.reduce((s, u) => s + u.n, 0);
  return `
    <div class="monthnav">
      <button data-act="horse-month" data-n="-1" aria-label="Previous month">‹</button>
      <div class="m">${monthLabel(m)}<small>${total} ride${total === 1 ? '' : 's'} total</small></div>
      <button data-act="horse-month" data-n="1" aria-label="Next month">›</button>
    </div>
    <div class="list" id="horseList">${use.length ? use.map(({ h, nL, nR, n }) => `
      <div class="row tap ${h.active === false ? 'inactive' : ''}" data-act="edit-horse" data-id="${h.id}"><div class="avatar horse">${esc(initials(h.name))}</div>
      <div class="main"><div class="t1">${esc(h.name)}${h.active === false ? '<span class="tag muted">Resting</span>' : ''}</div>
      <div class="t2">${nL} lesson${nL === 1 ? '' : 's'} · ${nR} ride${nR === 1 ? '' : 's'}</div><div class="bar"><i style="width:${n / max * 100}%"></i></div></div>
      <div class="amt" style="font-size:20px">${n}</div></div>`).join('') : '<div class="empty">No horses yet</div>'}</div>
    <div style="margin-top:14px"><button class="btn big block secondary" data-act="add-horse">+ Horse</button></div>`;
}

const ICON = {
  rider: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg>',
  horse: '<svg viewBox="0 0 24 24"><path d="M7 21v-5l-3-2 2-6 5-4 1 2 3 1 4 6-2 2-3-2-1 3v5"/></svg>',
  csv: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};
function menuRow(act, icon, label, right = '', href) {
  const inner = `<div class="ico">${ICON[icon]}</div><div class="main"><div class="t1">${label}</div></div>${right}<span class="chev">›</span>`;
  return href ? `<a class="row tap" href="${href}" style="color:inherit;text-decoration:none">${inner}</a>` : `<button class="row tap" data-act="${act}">${inner}</button>`;
}

function viewMore() {
  const owed = db.riders.reduce((s, r) => s + riderOwed(r.id), 0);
  const last = db.settings.lastBackup;
  return `
    <div class="list menu" style="margin-top:6px">
      ${menuRow('', 'rider', 'Riders', `<div class="amt"><small>${db.riders.length}${owed ? ' · ' + money(owed) + ' owed' : ''}</small></div>`, '#riders')}
      ${menuRow('', 'horse', 'Horses', `<div class="amt"><small>${db.horses.length}</small></div>`, '#horses')}
    </div>
    <div class="section-h"><h2>Backup</h2><span class="meta">${last ? 'Last ' + fmtDate(last) : 'Never backed up'}</span></div>
    <div class="list menu">
      ${menuRow('export-csv', 'csv', 'Export spreadsheet (CSV)')}
      ${menuRow('export-json', 'down', 'Save backup file')}
      ${menuRow('import-json', 'up', 'Restore from backup')}
    </div>
    <div class="section-h"><h2>Data</h2><span class="meta">Stored on this device</span></div>
    <div class="list menu">
      ${menuRow('sample', 'spark', 'Load sample data')}
      ${menuRow('clear-all', 'trash', '<span style="color:var(--owed)">Clear all data</span>')}
    </div>
    <div class="foot">Barn Book · ${db.lessons.length} lessons · ${db.rides.length} rides · ${db.boarders.length} boarders</div>`;
}

/* -------------------------------------------------------------- export */

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildCsv() {
  const head = ['Type', 'Date', 'Time', 'Rider / Boarder', 'Horse', 'Instructor', 'Minutes', 'Month', 'Amount', 'Paid', 'Paid date', 'Method', 'Notes'];
  const rows = [];
  for (const x of sortAsc(db.lessons)) rows.push(['Lesson', fmtDate(x.date), fmtTime(x.time), riderName(x.riderId), x.horseId ? horseName(x.horseId) : '', x.instructor || '', '', '', num(x.price).toFixed(2), x.paid ? 'Yes' : 'No', fmtDate(x.paidDate), x.method || '', x.notes || '']);
  for (const x of sortAsc(db.rides)) rows.push(['Practice ride', fmtDate(x.date), fmtTime(x.time), riderName(x.riderId), x.horseId ? horseName(x.horseId) : '', '', x.duration || '', '', num(x.fee).toFixed(2), x.paid ? 'Yes' : (num(x.fee) > 0 ? 'No' : ''), fmtDate(x.paidDate), x.method || '', x.notes || '']);
  const pays = db.boardPays.slice().sort((a, b) => (a.month + a.date).localeCompare(b.month + b.date));
  for (const p of pays) {
    const b = byId(db.boarders, p.boarderId) || {};
    rows.push(['Board', fmtDate(p.date), '', b.name || '—', b.horses || '', '', '', monthLabel(p.month), num(p.amount).toFixed(2), 'Yes', fmtDate(p.date), p.method || '', p.notes || '']);
  }
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function download(name, mime, text) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportJson() {
  db.settings.lastBackup = todayISO(); save();
  download(`barn-book-backup-${todayISO()}.json`, 'application/json', JSON.stringify({ app: 'barn-book', version: 1, exported: new Date().toISOString(), data: db }, null, 2));
  render(); toast('Backup saved');
}
$('#importFile').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    let parsed;
    try { parsed = JSON.parse(r.result); } catch (err) { toast('Not a Barn Book backup'); return; }
    const d = normalize(parsed);
    const n = d.lessons.length + d.rides.length + d.riders.length + d.horses.length + d.boarders.length;
    if (!n) { toast('Backup is empty'); return; }
    if (!confirm(`Replace everything with this backup?\n${d.lessons.length} lessons · ${d.rides.length} rides · ${d.riders.length} riders · ${d.horses.length} horses · ${d.boarders.length} boarders`)) return;
    const before = snap(); db = d; save(); render(); toast('Backup restored', before);
  };
  r.readAsText(file);
});

/* -------------------------------------------------------------- sample */

function loadSample() {
  const t = todayISO(), m = thisMonth(), pm = addMonth(m, -1);
  const R = ['Emma Collins', 'Lily Tran', 'Noah Fischer', 'Grace Okafor', 'Ava Martinez'].map(name => ({ id: uid(), name, phone: '', notes: '' }));
  const H = ['Biscuit', 'Juniper', 'Dakota', 'Moonshine', 'Pepper'].map(name => ({ id: uid(), name, notes: '', active: true }));
  H[4].active = false; H[4].notes = 'Resting — sore hoof';
  const lessons = [], rides = [];
  const plan = [[-20, 0, 0, '16:00', 65], [-18, 1, 1, '15:30', 65], [-16, 2, 2, '17:00', 75], [-13, 0, 0, '16:00', 65], [-11, 3, 3, '10:00', 65],
    [-9, 1, 1, '15:30', 65], [-6, 4, 0, '09:30', 75], [-6, 0, 0, '16:00', 65], [-4, 2, 2, '17:00', 75], [-3, 3, 1, '10:00', 65],
    [-1, 1, 1, '15:30', 65], [-1, 4, 0, '09:30', 75], [0, 0, 3, '16:00', 65], [0, 2, 2, '17:30', 75]];
  plan.forEach(([d, r, h, time, price], i) => {
    const date = isoAdd(t, d), paid = d < -5 || i % 3 === 1;
    lessons.push({ id: uid(), date, time, riderId: R[r].id, horseId: H[h].id, instructor: i % 2 ? 'Kate' : 'Sam', price, paid, paidDate: paid ? date : '', method: paid ? METHODS[i % 4] : '', notes: '' });
  });
  [[-12, 3, 3, 60, 25, true], [-7, 0, 1, 45, 0, false], [-5, 2, 2, 60, 25, false], [-2, 3, 3, 45, 25, false], [-1, 1, 1, 30, 0, false]].forEach(([d, r, h, dur, fee, paid]) => {
    const date = isoAdd(t, d);
    rides.push({ id: uid(), date, time: '12:00', riderId: R[r].id, horseId: H[h].id, duration: dur, fee, paid, paidDate: paid ? date : '', method: paid ? 'Venmo' : '', notes: '' });
  });
  const B = [['Hannah Price', 'Rosie', 650, 1], ['The Delgado family', 'Copper, Mabel', 1250, 1], ['Marcus Lee', 'Storm', 650, 5], ['Jill Navarro', 'Penny', 700, 15]]
    .map(([name, horses, rent, dueDay]) => ({ id: uid(), name, horses, rent, dueDay, start: addMonth(m, -6), active: true, phone: '', notes: '' }));
  const pays = [];
  B.forEach((b, i) => pays.push({ id: uid(), boarderId: b.id, month: pm, amount: b.rent, date: pm + '-0' + (i + 1), method: METHODS[(i + 1) % 4], notes: '' }));
  pays.push({ id: uid(), boarderId: B[0].id, month: m, amount: 650, date: m + '-01', method: 'Zelle', notes: '' });
  pays.push({ id: uid(), boarderId: B[1].id, month: m, amount: 600, date: m + '-02', method: 'Check', notes: '' });
  return { version: 1, riders: R, horses: H, lessons, rides, boarders: B, boardPays: pays, settings: { lastMethod: 'Cash', lastPrice: 65, lastInstructor: 'Sam' } };
}

/* -------------------------------------------------------------- routes */

const ROUTES = {
  home: { title: 'Barn Book', tab: 'home', view: viewHome },
  lessons: { title: 'Lessons', tab: 'lessons', view: () => viewList('lesson'), add: 'add-lesson' },
  rides: { title: 'Practice rides', tab: 'rides', view: () => viewList('ride'), add: 'add-ride' },
  boarders: { title: 'Boarders', tab: 'boarders', view: viewBoarders, add: 'add-boarder' },
  more: { title: 'More', tab: 'more', view: viewMore },
  riders: { title: 'Riders', tab: 'more', view: viewRiders, add: 'add-rider', back: '#more' },
  horses: { title: 'Horses', tab: 'more', view: viewHorses, add: 'add-horse', back: '#more' }
};
function route() { const r = location.hash.replace('#', ''); return ROUTES[r] ? r : 'home'; }

function render() {
  const name = route(), R = ROUTES[name];
  const y = window.scrollY, same = render.last === name;
  document.title = name === 'home' ? 'Barn Book' : `${R.title} · Barn Book`;
  $('#title').textContent = R.title;
  $('#backBtn').classList.toggle('hidden', !R.back);
  $('#backBtn').dataset.href = R.back || '';
  $('#topRight').innerHTML = R.add ? `<button class="icon-btn" data-act="${R.add}" aria-label="Add">+</button>` : '';
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === R.tab));
  $('#view').innerHTML = R.view();
  window.scrollTo(0, same ? y : 0);
  render.last = name;
}

/* ------------------------------------------------------------- actions */

function del(listName, id, what) {
  const x = byId(db[listName], id); if (!x) return;
  const before = snap();
  db[listName] = db[listName].filter(i => i.id !== id);
  if (listName === 'boarders') db.boardPays = db.boardPays.filter(p => p.boarderId !== id);
  save(); closeSheet(); render(); toast(`${what} deleted`, before);
}

const ACTIONS = {
  'close-sheet': () => closeSheet(),
  'add-lesson': () => lessonForm(null),
  'add-ride': () => rideForm(null),
  'add-boarder': () => boarderForm(null),
  'add-rider': () => riderForm(null),
  'add-horse': () => horseForm(null),
  'edit-lesson': el => lessonForm(el.dataset.id),
  'edit-ride': el => rideForm(el.dataset.id),
  'edit-rider': el => riderForm(el.dataset.id),
  'edit-horse': el => horseForm(el.dataset.id),
  'edit-boarder': el => boarderForm(el.dataset.id),
  'board-row': el => el.dataset.state === 'unpaid' ? boarderForm(el.dataset.id) : boardPayForm(el.dataset.id, el.dataset.month),
  'edit-boardpay': el => boardPayForm(el.dataset.id, el.dataset.month),
  'pay-lesson': el => payItem('lesson', el.dataset.id),
  'pay-ride': el => payItem('ride', el.dataset.id),
  'pay-board': el => payBoard(el.dataset.id, el.dataset.month),
  'del-lesson': el => del('lessons', el.dataset.id, 'Lesson'),
  'del-ride': el => del('rides', el.dataset.id, 'Ride'),
  'del-horse': el => {
    const n = db.lessons.filter(l => l.horseId === el.dataset.id).length + db.rides.filter(r => r.horseId === el.dataset.id).length;
    if (n && !confirm(`${horseName(el.dataset.id)} is on ${n} lesson/ride records. Delete anyway?`)) return;
    del('horses', el.dataset.id, 'Horse');
  },
  'del-rider': el => {
    const id = el.dataset.id;
    const n = db.lessons.filter(l => l.riderId === id).length + db.rides.filter(r => r.riderId === id).length;
    if (n) {
      if (!confirm(`Delete ${riderName(id)} and their ${n} lesson/ride records?`)) return;
      db.lessons = db.lessons.filter(l => l.riderId !== id); db.rides = db.rides.filter(r => r.riderId !== id);
    }
    del('riders', id, 'Rider');
  },
  'del-boarder': el => { if (confirm(`Delete ${byId(db.boarders, el.dataset.id).name} and their payment history?`)) del('boarders', el.dataset.id, 'Boarder'); },
  'del-boardpay': el => {
    const p = byId(db.boardPays, el.dataset.id); if (!p) return;
    const before = snap();
    db.boardPays = db.boardPays.filter(x => x.id !== p.id);
    save(); closeSheet(); render(); toast('Marked unpaid', before);
  },
  'rider-lessons': el => { closeSheet(); Object.assign(ui.lessons, { rider: el.dataset.id, horse: '', from: '', to: '', status: 'all' }); location.hash = '#lessons'; },
  'rider-rides': el => { closeSheet(); Object.assign(ui.rides, { rider: el.dataset.id, horse: '', from: '', to: '', status: 'all' }); location.hash = '#rides'; },
  'goto-unpaid': () => { Object.assign(ui.lessons, { status: 'unpaid', rider: '', horse: '', from: '', to: '' }); location.hash = '#lessons'; if (route() === 'lessons') render(); },
  'status': el => { ui[el.closest('[data-filter-key]').dataset.filterKey].status = el.dataset.v; render(); },
  'clear-filters': el => { Object.assign(ui[el.dataset.key], { status: 'all', rider: '', horse: '', from: '', to: '' }); render(); },
  'board-month': el => { ui.boardMonth = addMonth(ui.boardMonth, +el.dataset.n); render(); },
  'board-today': () => { ui.boardMonth = thisMonth(); render(); },
  'horse-month': el => { ui.horseMonth = addMonth(ui.horseMonth, +el.dataset.n); render(); },
  'export-csv': () => { download(`barn-book-${todayISO()}.csv`, 'text/csv;charset=utf-8', buildCsv()); toast('Spreadsheet exported'); },
  'export-json': () => exportJson(),
  'import-json': () => $('#importFile').click(),
  'sample': () => {
    const has = db.lessons.length + db.rides.length + db.boarders.length + db.riders.length;
    if (has && !confirm('Replace your data with sample data?')) return;
    const before = snap(); db = normalize(loadSample()); save(); location.hash = '#home'; render(); toast('Sample data loaded', before);
  },
  'clear-all': () => {
    if (!confirm('Delete all riders, horses, lessons, rides and boarders on this device?')) return;
    const before = snap(); db = blankDb(); save(); render(); toast('All data cleared', before);
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-filter]');
  if (!el) return;
  ui[el.closest('[data-filter-key]').dataset.filterKey][el.dataset.filter] = el.value;
  render();
});
$('#backBtn').addEventListener('click', () => { location.hash = $('#backBtn').dataset.href || '#home'; });
window.addEventListener('hashchange', () => { closeSheet(); render(); });
window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); render(); } });

render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
