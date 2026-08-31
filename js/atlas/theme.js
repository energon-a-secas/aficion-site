// ── Canvas colour ────────────────────────────────────────────
// A 2D context cannot read a CSS custom property, so every colour the map draws
// is resolved here once and cached as a plain string. This is a read of the
// canonical tokens in CDN base.css, not a redeclaration of them, and it is the
// only file under js/atlas/ allowed to name a colour.
//
// Resolution goes through a probe element rather than getPropertyValue: the
// computed value of a custom property is a token stream, so --accent set to a
// colour function would reach the canvas unparsed. Reading `color` off a probe
// always comes back as rgb()/rgba(), which every engine's canvas accepts.

let probe = null;
let cached = null;
let observer = null;
const listeners = new Set();

function getProbe() {
  if (probe && probe.isConnected) return probe;
  probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;pointer-events:none';
  document.body.appendChild(probe);
  return probe;
}

function readVar(name, fallback) {
  const el = getProbe();
  el.style.color = fallback;
  el.style.color = `var(${name}, ${fallback})`;
  return getComputedStyle(el).color || fallback;
}

function parse(rgb) {
  const m = rgb.match(/-?[\d.]+/g);
  if (!m) return [255, 255, 255, 1];
  return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])];
}

/** Same hue, a fraction of the opacity. Every dim variant in the map is one. */
export function withAlpha(color, a) {
  const [r, g, b, base] = parse(color);
  return `rgba(${r},${g},${b},${(base * a).toFixed(3)})`;
}

/** Same hue, scaled toward black or white, for the second stop of a gradient. */
export function shade(color, factor) {
  const [r, g, b, a] = parse(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

function build() {
  const bg = readVar('--bg', '#040714');
  const accent = readVar('--accent', '#fbbf24');
  const bright = readVar('--accent-bright', '#fcd34d');
  const primary = readVar('--text-primary', '#f9f9f9');
  const secondary = readVar('--text-secondary', '#cacaca');
  const muted = readVar('--text-muted', 'rgba(255,255,255,.55)');
  const strong = readVar('--border-strong', 'rgba(255,255,255,.22)');
  const core = readVar('--atlas-core', '#6fd6c8');
  const accents = {
    ember: readVar('--atlas-accent-ember', '#ff8a5b'),
    cyan: readVar('--atlas-accent-cyan', '#57d9f2'),
    violet: readVar('--atlas-accent-violet', '#b98cff'),
    jade: readVar('--atlas-accent-jade', '#6fe0a8'),
  };

  return {
    // ctx.font takes no var(), so the family is read off the page rather than
    // named here: the canvas then uses whatever base.css set.
    font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
    bg,
    void: shade(bg, 0.72),
    hull: withAlpha(strong, 0.18),
    hullEdge: withAlpha(strong, 0.36),
    edge: withAlpha(strong, 0.95),
    edgeDim: withAlpha(strong, 0.42),
    edgeSoft: withAlpha(core, 0.1),
    edgeSoftLit: withAlpha(core, 0.38),
    node: withAlpha(secondary, 0.62),
    nodeCore: core,
    nodeNotable: primary,
    hub: bright,
    route: accent,
    routeBright: bright,
    halo: accent,
    hover: primary,
    select: primary,
    // Two channels that land on the same node often enough that they must never
    // share a colour: focus is what the visitor asked to see (a traced bridge, a
    // build cursor), suggest is what the map is offering them unasked. The
    // reference product runs both through one highlight and its own forum
    // carries the complaint.
    focus: accents.cyan,
    suggest: accents.ember,
    compareBoth: accents.jade,
    compareMine: accent,
    compareTheirs: accents.violet,
    label: withAlpha(primary, 0.94),
    labelDim: withAlpha(muted, 0.9),
    labelShadow: shade(bg, 0.3),
    accents,
  };
}

/** Reads the CSS custom properties once and caches the flat colour strings. */
export function resolveTheme() {
  if (!cached) cached = build();
  return cached;
}

/**
 * The Header Kit sets <html data-theme> for a visitor theme and the CDN
 * season.css can move the defaults underneath us, so re-resolve when the root
 * element's attributes change.
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  if (!observer) {
    observer = new MutationObserver(() => {
      cached = null;
      const next = resolveTheme();
      for (const cb of listeners) cb(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  }
  return () => listeners.delete(fn);
}
