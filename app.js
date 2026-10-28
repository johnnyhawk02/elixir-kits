// ---- Elixir Kits: new kits from the LXR-02's six voices, heard on a generated pattern ----
const $ = (id) => document.getElementById(id);
const { PAR, PARAM_DTYPES, MOD_TARGETS, VOICE_PAGES, INIT_KIT, OSC_WAVE_NAMES, FILTER_TYPE_NAMES, LFO_SYNC_NAMES } = LXR;
const NPAR = PAR.END_OF_SOUND_PARAMETERS;

// ---- audio ----
let ctx = null, node = null, fallback = null;
function send(m) { if (node) node.port.postMessage(m); else if (fallback) fallback.msg(m); }
async function startAudio() {
  if (ctx) { if (ctx.state === 'suspended') await ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const src = $('engine').textContent + $('player').textContent + `
      registerProcessor('lxr', class extends AudioWorkletProcessor {
        constructor() { super({ numberOfInputs: 0 }); this.p = new Player(sampleRate); this.port.onmessage = (e) => this.p.msg(e.data); }
        process(_, outputs) { const o = outputs[0]; this.p.process(o[0], o[1] || o[0]);
          if (this.p.events.length) { for (const ev of this.p.events) this.port.postMessage(ev); this.p.events.length = 0; } return true; }
      });`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    node = new AudioWorkletNode(ctx, 'lxr', { numberOfInputs: 0, outputChannelCount: [2] });
    node.port.onmessage = (e) => onEvent(e.data);
    node.connect(ctx.destination);
  } catch (err) {
    // no AudioWorklet: run the same player on the main thread
    fallback = new Player(ctx.sampleRate);
    const sp = ctx.createScriptProcessor(1024, 0, 2);
    sp.onaudioprocess = (e) => {
      fallback.process(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));
      for (const ev of fallback.events) onEvent(ev);
      fallback.events.length = 0;
    };
    sp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') await ctx.resume();
  sendKit(); sendSeq();
}

// ---- kits: .SND files are the 8-character kit name followed by one byte per parameter ----
/*@KITS@*/
function parseSnd(bytes) {
  const name = String.fromCharCode(...bytes.slice(0, 8)).replace(/[^\x20-\x7e]/g, '').trim() || 'Empty';
  const kit = new Uint8Array(NPAR);
  kit.set(bytes.slice(8, 8 + NPAR));
  for (let i = 0; i < 6; i++) {
    // the firmware's own clean-up of out-of-range mod targets and LFO voices
    if (kit[PAR.VEL_DEST_1 + i] >= MOD_TARGETS.length) kit[PAR.VEL_DEST_1 + i] = 0;
    if (kit[PAR.TARGET_LFO1 + i] >= MOD_TARGETS.length) kit[PAR.TARGET_LFO1 + i] = 0;
    if (kit[PAR.VOICE_LFO1 + i] < 1 || kit[PAR.VOICE_LFO1 + i] > 6) kit[PAR.VOICE_LFO1 + i] = 1;
  }
  // a transient that uses a user sample from the SD card would play silent, so it gets a built-in wave instead
  for (let n = 1; n <= 6; n++) if (kit[PAR['TRANS' + n + '_WAVE']] >= 14) kit[PAR['TRANS' + n + '_WAVE']] %= 14;
  return { name, kit };
}
const sourceKits = BUNDLED_KITS.map((k) => ({ ...parseSnd(Uint8Array.from(atob(k.data), (c) => c.charCodeAt(0))), file: k.file }));
/*@PRESETS@*/
const values = new Uint8Array(NPAR);
for (let i = 8; i < NPAR; i++) values[i - 8] = INIT_KIT[i];
const sendKit = () => send({ type: 'kit', values: Array.from(values) });

// knob range for a parameter, from the firmware's parameter_dtypes table (only the top is needed here)
const MENU_MAX = { ON_OFF: 1, '0b1': 1, 'menu:WAVEFORM': OSC_WAVE_NAMES.length - 1, 'menu:FILTER': FILTER_TYPE_NAMES.length - 1,
  'menu:TRANS': 13 + LXR.EXTRA_CLICK_NAMES.length, 'menu:LFO_WAVES': 7, 'menu:SYNC_RATES': LFO_SYNC_NAMES.length - 1, 'menu:RETRIGGER': 6, 'menu:MIX_FM': 1 };
const parMax = (par) => MENU_MAX[PARAM_DTYPES[par]] ?? 127;

// the parameters that belong to voice v (its sound, routing, LFO, level and pan)
function voiceOwned(v) {
  const s = new Set();
  for (const g of VOICE_PAGES[v].groups) for (const [, name] of g.params) s.add(PAR[name]);
  for (const n of ['AUDIO_OUT1', 'VOICE_LFO1', 'TARGET_LFO1', 'VOL1', 'PAN1']) if (PAR[n] !== undefined) s.add(PAR[n] + v);
  return [...s];
}
// ---- the drum-safe randomiser (as Elixir's): each parameter moves inside a range that still sounds like a drum,
// and the ones that turn a drum into something else (waveforms, filter type, LFO, bit crush, repeat) stay put ----
const NO_RANDOM = /^(VOL\d|VEL_DEST|VOICE_LFO|TARGET_LFO|MIDI|AUDIO_OUT)/;
const SAFE = {
  WAVEFORM: 'lock', PWM: 'lock', REPEAT: 'lock', MODE: 'lock', FILTER_TYPE: 'lock', PAN: 'lock', SAMPLE_RATE: 'lock',
  VEL_AMT: 'lock', VEL_MOD_VOL: 'lock',
  FREQ_LFO: 'lock', SYNC_LFO: 'lock', MOD_LFO: 'lock', WAVE_LFO: 'lock', RETRIGGER_LFO: 'lock', OFFSET_LFO: 'lock',
  COARSE: 'pitch', FINE: [48, 78], ATTACK: [0, 6], EG_SLOPE: [0, 127], NOISE: [0, 127], MIX: [0, 127],
  PITCH_DECAY: [2, 80], MOD_AMOUNT: [0, 110], FM_AMOUNT: [0, 50], FM_FREQ: [0, 127],
  MOD_OSC1_FREQ: [0, 127], MOD_OSC2_FREQ: [0, 127], MOD_OSC1_GAIN: [0, 127], MOD_OSC2_GAIN: [0, 127],
  TRANSIENT_WAVE: [0, 13], TRANSIENT_VOLUME: [0, 100], TRANSIENT_FREQ: [0, 127],
  FILTER_F: [45, 127], FILTER_RESO: [0, 60], FILTER_DRIVE: [0, 50], DRIVE: [30, 95],
};
const DECAY = { 0: [3, 55], 1: [3, 55], 2: [3, 55], 3: [3, 50], 4: [20, 110] };
const safeRange = (text, voice, name) => {
  if (name.startsWith('PITCH_SLOPE')) return [0, 90];
  if (name.startsWith('VOL_SLOPE')) return [0, 80];
  if (text === 'DECAY') return DECAY[voice] || [3, 70];
  if (text === 'DECAY_CLOSED') return [2, 30];
  if (text === 'DECAY_OPEN') return [8, 70];
  return SAFE[text] || [0, 127];
};
function varyVoice(voice, depth) {
  for (const g of VOICE_PAGES[voice].groups) for (const [text, name] of g.params) {
    if (NO_RANDOM.test(name)) continue;
    const par = PAR[name], max = parMax(par), h = values[par], range = safeRange(text, voice, name);
    let v = h;
    if (range === 'lock') continue;
    if (range === 'pitch') v = Math.round(h + (Math.random() * 2 - 1) * depth * 12); // up to an octave either way
    else if (max < 20) { if (Math.random() < depth) v = range[0] + Math.floor(Math.random() * (Math.min(max, range[1]) - range[0] + 1)); }
    else {
      const lo = Math.min(range[0], h), hi = Math.max(range[1], h); // the current value always stays reachable
      v = Math.max(lo, Math.min(hi, Math.round(h + (Math.random() * 2 - 1) * depth * (hi - lo))));
    }
    values[par] = Math.max(0, Math.min(max, v));
  }
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- the kit being made: where each voice came from, locks, undo ----
const DRUMS = ['drum 1', 'drum 2', 'drum 3', 'snare', 'cymbal', 'hihat'];
const from = new Array(6).fill('init');
const locked = new Array(6).fill(false);
let kitName = 'init', undo = null;
const vary = () => Number($('vary').value) / 100;
function remember() { presetId = ''; undo = { values: values.slice(), from: from.slice(), kitName }; $('undo').disabled = false; }
// voice v from a random source kit, then varied
function newVoice(v) {
  const k = pick(sourceKits);
  for (const par of voiceOwned(v)) values[par] = k.kit[par];
  from[v] = k.name.toLowerCase();
  varyVoice(v, vary());
}
function newKit() {
  remember();
  // everything that isn't a voice's (the FX slot, mostly; not heard here) from one more source kit
  const base = pick(sourceKits).kit, owned = new Set([0, 1, 2, 3, 4, 5].flatMap(voiceOwned));
  for (let p = 0; p < NPAR; p++) if (!owned.has(p)) values[p] = base[p];
  for (let v = 0; v < 6; v++) if (!locked[v]) newVoice(v);
  kitName = alienName(); kitChanged();
}
function kitChanged() { sendKit(); drawDrums(); $('kit-name').textContent = kitName; drawSaved(); }
function useKit(kit, name) {
  remember();
  for (let p = 0; p < NPAR; p++) values[p] = kit[p] || 0;
  from.fill(name.toLowerCase()); kitName = name; kitChanged();
}

// two made-up words, as Elixir's preset names
const ONSETS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'x', 'kr', 'dr', 'th', 'zh', 'qu', 'vr'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'aa', 'ou', 'y'];
const CODAS = ['n', 'x', 'k', 'r', 'l', 'th', 'z', 'm'];
function alienWord() {
  const n = Math.random() < 0.6 ? 2 : 3;
  const w = Array.from({ length: n }, (_, i) => pick(ONSETS) + pick(VOWELS) + (i === n - 1 || Math.random() < 0.4 ? pick(CODAS) : '')).join('');
  return w[0].toUpperCase() + w.slice(1, 7);
}
function alienName() {
  for (let i = 0; i < 50; i++) { const n = alienWord() + ' ' + alienWord(); if (n.length <= 16 && !saved.some((k) => k.name === n)) return n; }
  return alienWord();
}

// ---- drum rows: tap the name to hear it; new, alter and lock per voice ----
function drawDrums() {
  const box = $('drums');
  if (!box.children.length) DRUMS.forEach((d, v) => {
    const row = document.createElement('div'); row.className = 'drum';
    row.innerHTML = `<button class="pad" type="button">${d}<small></small></button><button type="button">new</button><button type="button">alter</button><button class="lock" type="button">lock</button>`;
    const [pad, nw, alt, lock] = row.children;
    pad.dataset.key = v + 1; pad.title = `Play ${d} (${v + 1})`;
    pad.addEventListener('pointerdown', async () => { await startAudio(); send({ type: 'trig', voice: v, vel: 110 }); flash(v); });
    nw.addEventListener('click', async () => { await startAudio(); remember(); newVoice(v); kitChanged(); send({ type: 'trig', voice: v, vel: 110 }); });
    alt.addEventListener('click', async () => { await startAudio(); remember(); varyVoice(v, 0.1); kitChanged(); send({ type: 'trig', voice: v, vel: 110 }); });
    lock.addEventListener('click', () => { locked[v] = !locked[v]; drawDrums(); });
    box.append(row);
  });
  [...box.children].forEach((row, v) => {
    row.querySelector('small').textContent = `from ${from[v]}`;
    row.querySelector('.lock').classList.toggle('on', locked[v]);
  });
}
const flashT = [];
function flash(v) {
  const pad = $('drums').children[v]?.firstChild; if (!pad) return;
  pad.classList.add('hit'); clearTimeout(flashT[v]); flashT[v] = setTimeout(() => pad.classList.remove('hit'), 110);
}

// ---- the pattern: the five Elixir styles, from beat, energy and fills ----
const ROW = ['k', 'lo', 'hi', 's', 'cy', 'ch', 'oh'];
const perf = { style: 0, beat: 0, energy: 60, fills: 40, tempo: 124 };
const groove = { type: 'straight', depth: 60 };
const blankPage = () => ({ on: blankFill(), acc: blankFill(), bar: blankFill() });
let pattern = blankPage(), playing = false;
function fillShape(fills) {
  if (!fills) return null;
  return { every: fills < 34 ? 8 : fills < 67 ? 4 : 2, len: 2 * Math.round(1 + fills / 100 * 3), busy: fills >= 50 };
}
const grooveLevel = () => (perf.energy ? 1 + perf.energy / 100 * 8 : 0);
function generate() {
  const st = STYLES[perf.style], g = st.grooves[perf.beat], T = grooveLevel(), energy = perf.energy;
  const fill = T >= 2 ? fillShape(perf.fills) : null;
  const { on: fillOn, yields } = fill ? st.fill(fill) : { on: blankFill(), yields: [] };
  const P = blankPage();
  for (let t = 0; t < 7; t++) {
    const lv = g[ROW[t]], alt = (g.alt && g.alt[ROW[t]]) || '';
    for (let s = 0; s < 16; s++) {
      const c = lv[s], reg = c !== '.' && Number(c) <= T;
      const win = fill && s >= 16 - fill.len, inFill = win && yields.includes(t); // these tracks give way to the fill
      const fil = !!fillOn[t][s];
      let on = 0, cond = 0;
      if (inFill) { if (reg && fil) on = 1; else if (reg) { on = 1; cond = -fill.every; } else if (fil) { on = 1; cond = fill.every; } }
      else if (reg) on = 1;
      else if (win && fil) { on = 1; cond = fill.every; }
      else if (!win && alt[s] && alt[s] !== '.' && Number(alt[s]) <= T) { on = 1; cond = 2; } // the second bar's extra hits
      if (fill && t === 4 && s === 0 && !on && T >= 3) { on = 1; cond = 100 + fill.every; } // crash after each fill
      P.on[t][s] = on; P.bar[t][s] = cond;
      P.acc[t][s] = on && ((c === '1' && energy >= 55) || (t === 6 && energy >= 85) || (fil && cond > 0 && (s % 4 === 0 || s === 15))) ? 1 : 0;
    }
  }
  pattern = P;
  drawPattern(); sendSeq();
}
const grooveMsg = () => {
  const g = GROOVE_TYPES.find((x) => x.name === groove.type) || GROOVE_TYPES[0], d = groove.depth / 100;
  return { off: Array.from({ length: 7 }, (_, t) => Array.from({ length: 16 }, (_, s) => g.off(t, s) * d)) };
};
const sendSeq = () => send({ type: 'seq', pattern, groove: grooveMsg(), bpm: perf.tempo, vel: 100, accentDb: 6, playing });
function newPattern() {
  perf.style = Math.floor(Math.random() * STYLES.length);
  perf.beat = Math.floor(Math.random() * STYLES[perf.style].grooves.length);
  perf.energy = 35 + Math.floor(Math.random() * 61);
  perf.fills = Math.floor(Math.random() * 101);
  groove.type = pick(GROOVE_TYPES).name; groove.depth = 50 + Math.floor(Math.random() * 51);
  drawCtl(); generate();
}

// the pattern is only heard, not shown: its name, and the drum pads flash as it plays
function drawPattern() {
  const st = STYLES[perf.style];
  $('pat-name').textContent = `${st.name} · ${st.grooves[perf.beat].name.toLowerCase()}`;
}
function onEvent(ev) {
  if (ev.type === 'step') for (const t of ev.hits) flash(Math.min(t, 5));
}

// ---- pattern controls ----
const ENERGY_NAMES = [[1, 'empty'], [15, 'minimal'], [35, 'low'], [60, 'groove'], [85, 'driving'], [101, 'peak']];
function drawCtl() {
  $('style').value = perf.style; $('groove').value = groove.type;
  for (const k of ['energy', 'fills', 'tempo']) $(k).value = perf[k];
  $('depth').value = groove.depth;
  const st = STYLES[perf.style];
  $('beat-out').textContent = `${st.grooves[perf.beat].name.toLowerCase()} ${perf.beat + 1}/${st.grooves.length}`;
  $('energy-out').textContent = `${ENERGY_NAMES.find(([x]) => perf.energy < x)[1]} ${perf.energy}`;
  const f = grooveLevel() >= 2 ? fillShape(perf.fills) : null;
  $('fills-out').textContent = f ? `every ${f.every}` : 'off';
  $('tempo-out').textContent = `${perf.tempo} bpm`;
  $('depth-out').textContent = `${groove.depth}%`;
}
function buildCtl() {
  STYLES.forEach((st, i) => $('style').add(new Option(st.name, i)));
  GROOVE_TYPES.forEach((g) => $('groove').add(new Option(g.name, g.name)));
  $('style').addEventListener('change', () => { perf.style = Number($('style').value); perf.beat %= STYLES[perf.style].grooves.length; drawCtl(); generate(); });
  const beat = (d) => { const n = STYLES[perf.style].grooves.length; perf.beat = (perf.beat + d + n) % n; drawCtl(); generate(); };
  $('beat-prev').addEventListener('click', () => beat(-1));
  $('beat-next').addEventListener('click', () => beat(1));
  for (const k of ['energy', 'fills']) $(k).addEventListener('input', () => { perf[k] = Number($(k).value); drawCtl(); generate(); });
  $('tempo').addEventListener('input', () => { perf.tempo = Number($('tempo').value); drawCtl(); sendSeq(); });
  $('groove').addEventListener('change', () => { groove.type = $('groove').value; drawCtl(); sendSeq(); });
  $('depth').addEventListener('input', () => { groove.depth = Number($('depth').value); drawCtl(); sendSeq(); });
}

// ---- saved kits (this browser), .snd download and export for Elixir Mobile ----
const SAVE_KEY = 'elixir-kits-saved';
let saved = [];
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch (e) { saved = []; }
const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) {} };
function drawSaved() {
  const ul = $('saved'); ul.textContent = '';
  saved.forEach((k, i) => {
    const li = document.createElement('li');
    li.className = k.name === kitName ? 'cur' : '';
    li.innerHTML = '<span></span><button type="button">load</button><button type="button">delete</button>';
    li.firstChild.textContent = k.name;
    const [, load, del] = li.children;
    load.addEventListener('click', () => loadPreset('s' + i));
    del.addEventListener('click', () => { if (confirm(`Delete ${k.name}?`)) { saved.splice(i, 1); presetId = ''; store(); drawSaved(); } });
    ul.append(li);
  });
  $('saved-count').textContent = saved.length ? `${saved.length}` : 'none yet';
  $('export').disabled = !saved.length;
  drawPresets();
}
// ---- presets: Elixir Mobile's built-in presets (their kits only), the LXR-02 kits it makes new kits from, and the
// ones saved here; ‹ › step through them in menu order ----
const KIT_GROUPS = { '': 'LXR-02 kits', factory: 'LXR-02 factory', 'hrtl-untz': 'hrtl untz' };
const presetList = () => [
  ...BUILTIN_PRESETS.map((p, i) => ({ id: 'b' + i, group: 'Elixir Mobile', name: p.name, kit: p.kit })),
  ...sourceKits.map((k, i) => {
    const dir = k.file.includes('/') ? k.file.split('/')[0] : '';
    return { id: 'k' + i, group: KIT_GROUPS[dir] || dir, name: k.name, kit: k.kit, file: k.file };
  }),
  ...saved.map((k, i) => ({ id: 's' + i, group: 'Saved', name: k.name, kit: k.kit, saved: k })),
];
let presetId = '';
function drawPresets() {
  const sel = $('preset'), list = presetList();
  sel.textContent = '';
  sel.add(new Option(presetId ? '' : '— new kit —', ''));
  const groups = {};
  for (const p of list) {
    if (!groups[p.group]) { groups[p.group] = document.createElement('optgroup'); groups[p.group].label = p.group; sel.append(groups[p.group]); }
    groups[p.group].append(new Option(p.name.toLowerCase(), p.id));
  }
  sel.value = list.some((p) => p.id === presetId) ? presetId : '';
  $('preset-count').textContent = `${list.length}`;
}
async function loadPreset(id) {
  const p = presetList().find((x) => x.id === id); if (!p) return;
  await startAudio();
  useKit(p.kit, p.name);
  if (p.saved && p.saved.from) from.splice(0, 6, ...p.saved.from);
  presetId = id; drawDrums(); drawPresets();
}
$('preset').addEventListener('change', () => loadPreset($('preset').value));
const stepPreset = (d) => {
  const list = presetList(), i = list.findIndex((p) => p.id === presetId);
  loadPreset(list[(i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length)].id);
};
$('preset-prev').addEventListener('click', () => stepPreset(-1));
$('preset-next').addEventListener('click', () => stepPreset(1));
$('random-preset').addEventListener('click', () => loadPreset(pick(presetList()).id));
// import: LXR-02 .snd kit files and Elixir presets files ({ presets: [...] }, or one preset); they join the saved kits
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const files = [...$('import-file').files]; $('import-file').value = '';
  const got = [], bad = [];
  for (const f of files) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.json$/i.test(f.name) || bytes[0] === 0x7b) {
        const d = JSON.parse(new TextDecoder().decode(bytes));
        const list = Array.isArray(d) ? d : d.presets || [d];
        for (const p of list) if (p && Array.isArray(p.kit) && p.kit.length >= NPAR - 8) got.push({ name: String(p.name || f.name).slice(0, 24), kit: p.kit.slice(0, NPAR).map((v) => Math.max(0, Math.min(255, v | 0))) });
      } else {
        if (bytes.length < 9) throw new Error('too short');
        const k = parseSnd(bytes);
        got.push({ name: k.name === 'Empty' ? f.name.replace(/\.snd$/i, '') : k.name, kit: Array.from(k.kit) });
      }
    } catch (e) { bad.push(f.name); }
  }
  let added = 0;
  for (const k of got) {
    let name = k.name, n = 2;
    while (saved.some((x) => x.name === name)) name = `${k.name} ${n++}`;
    saved.unshift({ name, kit: k.kit, from: new Array(6).fill(name.toLowerCase()) }); added++;
  }
  if (added) { store(); presetId = 's0'; drawSaved(); loadPreset('s0'); }
  $('import-msg').textContent = `${added ? `imported ${added} kit${added > 1 ? 's' : ''}` : 'nothing imported'}${bad.length ? ` · couldn't read ${bad.join(', ')}` : ''}`;
});
$('save-top').addEventListener('click', () => $('save').click());
$('save').addEventListener('click', () => {
  if (kitName === 'init' || saved.some((k) => k.name === kitName)) kitName = alienName();
  saved.unshift({ name: kitName, kit: Array.from(values), from: from.slice() }); store();
  presetId = 's0'; $('kit-name').textContent = kitName; drawSaved();
});
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('snd').addEventListener('click', () => {
  const short = kitName.replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().replace(/ /g, '').slice(0, 8).padEnd(8, '_');
  const bytes = new Uint8Array(8 + NPAR);
  for (let i = 0; i < 8; i++) bytes[i] = short.charCodeAt(i);
  bytes.set(values, 8);
  download(`${short}.SND`, bytes, 'application/octet-stream');
});
// an Elixir Mobile presets file (v5): each kit as a sound-only preset, with its echo and ring mod sends and the
// crossfeed at zero so it plays dry there too (the phone keeps its own pattern)
$('export').addEventListener('click', () => {
  const presets = saved.map((k) => {
    const kit = k.kit.slice(); kit[PAR.FX_TYPE] = LXR.FX_DELAY; // no ring mod or distortion sends seeded from the kit
    return { v: 5, name: k.name, kit, xm: { amt: new Array(36).fill(0), target: ['fm', 'fm', 'fm', 'filter', 'fm', 'ring'] }, fx: new Array(6).fill(0), fav: false };
  });
  download('elixir-kits.json', JSON.stringify({ elixir: 1, presets }), 'application/json');
});

// ---- transport ----
$('play').addEventListener('click', async () => {
  await startAudio();
  playing = !playing; $('play').classList.toggle('on', playing); $('play').textContent = playing ? 'stop' : 'play';
  sendSeq();
});
$('new-kit').addEventListener('click', async () => { await startAudio(); newKit(); });
$('new-pat').addEventListener('click', async () => { await startAudio(); newPattern(); });
$('undo').addEventListener('click', () => {
  if (!undo) return;
  values.set(undo.values); from.splice(0, 6, ...undo.from); kitName = undo.kitName;
  undo = null; $('undo').disabled = true; kitChanged();
});
$('vary').addEventListener('input', () => { $('vary-out').textContent = $('vary').value + '%'; });

// ---- the pattern card folds away (remembered in this browser) ----
const FOLD_KEY = 'elixir-kits-pattern-folded';
function setFold(f) {
  $('pat-fold').closest('.card').classList.toggle('folded', f);
  $('pat-fold').setAttribute('aria-expanded', String(!f));
  $('pat-fold').title = f ? 'Show the pattern' : 'Fold the pattern';
  try { localStorage.setItem(FOLD_KEY, f ? '1' : ''); } catch (e) {}
}
$('pat-fold').addEventListener('click', () => setFold(!$('pat-fold').closest('.card').classList.contains('folded')));
try { setFold(localStorage.getItem(FOLD_KEY) === '1'); } catch (e) {}

// ---- keyboard (desktop): space play/stop, k new kit, p new pattern, u undo, s save, 1-6 drums, ← → presets, r random ----
const KEYS = { ' ': 'play', k: 'new-kit', p: 'new-pat', u: 'undo', s: 'save', r: 'random-preset', ArrowLeft: 'preset-prev', ArrowRight: 'preset-next' };
const typing = (el) => el && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'range'));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.target.type === 'range' && k.startsWith('Arrow')) return; // arrows still move a fader
  if (k >= '1' && k <= '6') {
    if (e.repeat) return;
    const v = Number(k) - 1;
    startAudio().then(() => { send({ type: 'trig', voice: v, vel: 110 }); flash(v); });
    e.preventDefault(); return;
  }
  if (!KEYS[k]) return;
  e.preventDefault();
  if (!e.repeat && !$(KEYS[k]).disabled) $(KEYS[k]).click();
});
// a space must not also press the button that has focus (the one last clicked)
document.addEventListener('keyup', (e) => { if (e.key === ' ' && !typing(e.target)) e.preventDefault(); });

buildCtl(); drawCtl(); generate(); drawDrums(); drawSaved();
// start on a fresh kit, so the page always opens on something new
newKit(); undo = null; $('undo').disabled = true;
