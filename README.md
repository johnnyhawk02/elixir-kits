# Elixir Kits

Live: https://johnnyhawk02.github.io/elixir-kits/

A page for making new drum kits from the six voices of the Erica Synths LXR-02 (the JavaScript port of its drum
engine used by Elixir Mobile), heard dry: no FX, crossfeed, compressor or rush.

- **New kit** takes each voice from a random LXR-02 kit and varies it (the *vary* fader, drum-safe ranges). Each
  drum has its own *new*, *alter* and *lock*.
- **New pattern** rolls a style, beat, energy, fills and groove from Elixir's pattern styles (heard, not shown or edited).
- **Presets**: Elixir Mobile's built-in presets (their kits), the bundled LXR-02 kits, and the kits saved here.
  *Import kits* reads LXR-02 `.snd` files and Elixir presets files (`.json`).
- **Save kit** keeps it in this browser; **export for Elixir Mobile** writes `elixir-kits.json` (Elixir Mobile's
  presets file, v5, sound only), and **download .snd** writes one kit in the LXR-02's own format.

The engine (`lxr*.js`), grooves, kits and presets are copies taken from
[Elixir Mobile](https://github.com/johnnyhawk02/elixir-mobile); nothing is shared with it, so changes here never
change the phone app. Build with `node build.mjs` (writes `index.html`), then commit and push.

GPL-3.0, as the LXR-02 firmware the engine is ported from.
