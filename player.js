// Runs the LXR-02 engine and a plain step sequencer, and resamples 44 140 Hz to the output rate. Used inside the
// AudioWorklet (or a ScriptProcessor fallback). Only the six voices, panned and mixed as the firmware does: no FX bus,
// no crossfeed, no compressor.
// bar conditions: 0 every bar; n = only the last bar of every n; -n = every bar except that one;
// 100 + n = only the first bar of every n (the bar after a fill)
function barOk(b, bar) {
  if (!b) return true;
  if (b > 100) return bar % (b - 100) === 0;
  if (b > 0) return bar % b === b - 1;
  return bar % -b !== -b - 1;
}
class Player {
  constructor(outRate) {
    this.e = new LXR.LxrEngine();
    this.e.loadInitKit();
    this.ratio = LXR.REAL_FS / outRate;
    this.A = [new Float32Array(64), new Float32Array(64)];
    this.B = [new Float32Array(64), new Float32Array(64)];
    this.idx = 0; this.frac = 0;
    this.pattern = { on: [], acc: [], bar: [] };
    this.groove = { off: Array.from({ length: 7 }, () => new Array(16).fill(0)) };
    this.playing = false; this.bpm = 120; this.vel = 100; this.accGain = 0.5;
    this.step = 0; this.bar = 0; this.toNext = 0; this.queue = []; this.fresh = false;
    // accent: unaccented sequencer hits are turned down by the accent amount, after the engine
    this.gain = new Float32Array(6).fill(1); this.gainTo = new Float32Array(6).fill(1);
    this.muted = new Uint8Array(6);
    this.events = [];
    this._render(this.A); this._render(this.B);
  }
  msg(m) {
    if (m.type === 'param') this.e.setParam(m.par, m.value);
    else if (m.type === 'kit') this.e.loadKit(m.values);
    else if (m.type === 'trig') { this.e.trigger(m.voice, m.vel, 60); this.gainTo[Math.min(m.voice, 5)] = 1; }
    else if (m.type === 'mute') m.muted.forEach((v, n) => { this.muted[n] = v ? 1 : 0; });
    else if (m.type === 'seq') {
      this.pattern = m.pattern; this.groove = m.groove; this.bpm = m.bpm; this.e.bpm = m.bpm; this.vel = m.vel;
      this.accGain = Math.pow(10, -m.accentDb / 20);
      if (m.playing && !this.playing) { this.step = 0; this.bar = 0; this.toNext = 0; this.queue = []; this.fresh = true; }
      this.playing = m.playing;
    }
  }
  // the hits of step s, each due `at` samples from now: the grid time of the step moved by the groove
  schedule(s, bar, at0) {
    const { on, acc, bar: cond } = this.pattern, len = LXR.REAL_FS * 60 / this.bpm / 4, hits = [];
    for (let t = 0; t < 7; t++) {
      if (!on[t] || !on[t][s] || !barOk(cond[t][s], bar) || this.muted[Math.min(t, 5)]) continue;
      this.queue.push({ at: Math.max(0, at0 + this.groove.off[t][s] * len), t, acc: !!acc[t][s] });
      hits.push(t);
    }
    return hits;
  }
  _render(dst) {
    if (this.playing) {
      if (this.toNext <= 0) {
        const len = LXR.REAL_FS * 60 / this.bpm / 4;
        // on starting, this step's own hits; after that each tick books the next step's, a step ahead,
        // so a track pushed early can still come in before its grid time
        let hits = this.nextHits || [];
        if (this.fresh) { this.fresh = false; hits = this.schedule(this.step, this.bar, this.toNext); }
        const next = (this.step + 1) % 16;
        this.nextHits = this.schedule(next, next === 0 ? this.bar + 1 : this.bar, this.toNext + len);
        this.events.push({ type: 'step', step: this.step, bar: this.bar, hits });
        this.step = next;
        if (this.step === 0) this.bar++;
        this.toNext += len;
      }
      this.toNext -= 64;
    } else if (this.queue.length) this.queue = [];
    if (this.queue.length) {
      const keep = [];
      for (const q of this.queue) {
        if (q.at < 64) { if (!this.muted[Math.min(q.t, 5)]) { this.e.trigger(q.t, q.acc ? 127 : this.vel, 60); this.gainTo[Math.min(q.t, 5)] = q.acc ? 1 : this.accGain; } }
        else { q.at -= 64; keep.push(q); }
      }
      this.queue = keep;
    }
    const out = this.e.renderBlock(), e = this.e;
    const pans = [e.drums[0], e.drums[1], e.drums[2], e.snare, e.cymbal, e.hat];
    const [L, R] = dst;
    L.fill(0); R.fill(0);
    for (let n = 0; n < 6; n++) {
      const g0 = this.gain[n], dg = (this.gainTo[n] - g0) / 64;
      const pl = pans[n].triggeredPanL / 32768, pr = pans[n].triggeredPanR / 32768, o = out[n];
      for (let i = 0; i < 64; i++) { const v = o[i] * (g0 + dg * i); L[i] += v * pl; R[i] += v * pr; }
      this.gain[n] = this.gainTo[n];
    }
    // the firmware's output is int16 saturated: keep the mix inside -1..1 the same way
    for (let i = 0; i < 64; i++) { L[i] = Math.max(-1, Math.min(1, L[i])); R[i] = Math.max(-1, Math.min(1, R[i])); }
  }
  process(L, R) {
    for (let n = 0; n < L.length; n++) {
      while (this.idx >= 64) {
        const t = this.A; this.A = this.B; this.B = t;
        this._render(this.B);
        this.idx -= 64;
      }
      const i = this.idx, fr = this.frac;
      const l0 = this.A[0][i], r0 = this.A[1][i];
      const l1 = i < 63 ? this.A[0][i + 1] : this.B[0][0];
      const r1 = i < 63 ? this.A[1][i + 1] : this.B[1][0];
      L[n] = l0 + (l1 - l0) * fr;
      R[n] = r0 + (r1 - r0) * fr;
      this.frac += this.ratio;
      const k = Math.floor(this.frac);
      this.idx += k; this.frac -= k;
    }
  }
}
