// Each style's fill, over the last `len` steps of the fill bar: it returns the hits (track x step) and the
// tracks that give way to it there. A crash marks the first bar after each fill.
const blankFill = () => Array.from({ length: 7 }, () => new Array(16).fill(0));
const STYLES = [
  { name: 'electro', grooves: GROOVES, fill(f) {
    // snare roll (16ths when busy, 8ths otherwise), toms falling from high to low in the gaps, a kick to start it
    const on = blankFill(), start = 16 - f.len;
    for (let s = start; s < 16; s++) {
      const r = s - start, half = r < f.len / 2;
      if (r % 2 === 0 || f.busy && s >= 14) on[3][s] = 1;
      else on[half ? 2 : 1][s] = 1;
    }
    on[0][start] = 1;
    if (!f.busy) on[1][15] = 1;
    return { on, yields: [0, 1, 2, 3] };
  } },
  { name: 'techno', grooves: TECHNO, fill(f) {
    // a snare build (8ths, or 16ths when busy) with an open hat at the end; a busy fill drops the kick out
    const on = blankFill(), start = 16 - f.len;
    for (let s = start; s < 16; s++) if (f.busy || (s - start) % 2 === 0) on[3][s] = 1;
    on[6][15] = 1;
    return { on, yields: f.busy ? [0, 1, 2, 3] : [1, 2, 3] };
  } },
  { name: 'broken beat', grooves: BROKEN, fill(f) {
    // threes across the bar: snare, a kick when busy, then a tom (high, then low)
    const on = blankFill(), start = 16 - f.len;
    for (let s = start; s < 16; s++) {
      const r = s - start;
      if (r % 3 === 0) on[3][s] = 1;
      else if (r % 3 === 2) on[r < f.len / 2 ? 2 : 1][s] = 1;
      else if (f.busy) on[0][s] = 1;
    }
    on[0][start] = 1;
    if (f.busy) on[3][15] = 1;
    return { on, yields: [0, 1, 2, 3] };
  } },
  { name: 'IDM', grooves: IDM, fill(f) {
    // a stutter: the kick repeats through the first half and the snare through the second (every 16th when busy,
    // 8ths otherwise), with the high tom on the last step; a busy fill cuts the closed hat too
    const on = blankFill(), start = 16 - f.len;
    for (let s = start; s < 16; s++) {
      const r = s - start;
      if (!f.busy && r % 2 && f.len > 2) continue;
      on[r < f.len / 2 ? 0 : 3][s] = 1;
    }
    on[2][15] = 1;
    return { on, yields: f.busy ? [0, 1, 2, 3, 5] : [0, 1, 2, 3] };
  } },
  { name: 'breakcore', grooves: BREAKCORE, fill(f) {
    // a snare roll that speeds up: 8ths in the first half and 16ths in the second (16ths all through when busy),
    // a kick to start it and the high tom on the last step; a busy fill cuts the hats too
    const on = blankFill(), start = 16 - f.len;
    for (let s = start; s < 16; s++) {
      const r = s - start;
      if (f.busy || r >= f.len / 2 || r % 2 === 0) on[3][s] = 1;
    }
    on[0][start] = 1;
    on[2][15] = 1;
    return { on, yields: f.busy ? [0, 1, 2, 3, 5, 6] : [0, 1, 2, 3] };
  } },
];
