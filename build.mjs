// Builds index.html (the self-contained page) from index.src.html, the page's code and the engine modules.
//   node build.mjs
// The engine (lxr*.js), the grooves and the kits are this repo's own copies, taken from Elixir Mobile; nothing here is
// shared with it, so a change here never changes the phone app.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(f, here), 'utf8');

// strip ES module syntax so the files run as one classic script (page and AudioWorklet)
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export \{[^}]*\};\n/gm, '')
  .replace(/^export (const|function|class) /gm, '$1 ');
const engine = [read('lxr-tables.js'), read('lxr-ui-data.js'), read('lxr-clicks.js'), read('lxr.js')].map(strip).join('\n');
const names = ['LxrEngine', 'PAR', 'REAL_FS', 'PARAM_DTYPES', 'MOD_TARGETS', 'VOICE_PAGES', 'INIT_KIT', 'OSC_WAVE_NAMES',
  'FILTER_TYPE_NAMES', 'LFO_SYNC_NAMES', 'EXTRA_CLICK_NAMES', 'FX_DELAY'];
const bundle = `const LXR = (() => {\n${engine}\nreturn { ${names.join(', ')} };\n})();\n`;

// kit files (.SND) in kits/ and its subfolders: presets, and the sources new kits are made from
const kitDir = new URL('kits/', here);
const kits = readdirSync(kitDir, { recursive: true }).filter((f) => /\.snd$/i.test(f)).sort()
  .map((f) => ({ file: f, data: readFileSync(new URL(f, kitDir)).toString('base64') }));
// Elixir Mobile's built-in presets (presets/*.json): only their name and kit are used
const presetDir = new URL('presets/', here);
const presets = readdirSync(presetDir).filter((f) => /\.json$/i.test(f)).sort()
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, presetDir), 'utf8')).presets || []).map((p) => ({ name: p.name, kit: p.kit }));

const app = ['groove-types.js', 'grooves.js', 'styles.js', 'app.js'].map(read).join('\n');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const page = read('index.src.html')
  .replace('/*@CSS@*/\n', () => read('style.css'))
  .replace('/*@PLAYER@*/\n', () => read('player.js'))
  .replace('/*@APP@*/\n', () => app)
  .replace('/*@ENGINE@*/', () => safe(bundle))
  .replace('/*@KITS@*/', () => `const BUNDLED_KITS = ${JSON.stringify(kits)};`)
  .replace('/*@PRESETS@*/', () => `const BUILTIN_PRESETS = ${safe(JSON.stringify(presets))};`);
// the version by the title: the number of the commit this build goes into
let ver = 1;
try { ver = Number(execSync('git rev-list --count HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString()) + 1; } catch (e) {}
writeFileSync(new URL('index.html', here), page.replaceAll('@VER@', () => ver));
console.log(`index.html: ${(page.length / 1024).toFixed(1)} KB, ${kits.length} kits, ${presets.length} presets`);
