/* Tests for the harmony and timing in index.html.
 *
 * There is no framework and no build. The instrument is one HTML file, so the
 * test pulls the module straight back out of it and imports it as a data URL
 * against a stub DOM. That means what runs here is the shipped source, not a
 * copy of it that can drift.
 *
 *   npm test
 *
 * Only the pure parts are covered - harmony, finger reading, and the timing
 * that decides when a chord commits. Audio and canvas need a browser.
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("index.html", import.meta.url), "utf8");
const open = '<script type="module">';
const body = src.slice(src.indexOf(open) + open.length, src.lastIndexOf("</script>"));

const el = () => ({
  style: {}, className: "", textContent: "", innerHTML: "", value: "", disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, blur() {}, querySelector: () => el(),
});

/* A 2d context that records what it was asked to do. The overlay cannot be
 * seen from here, but it can be proved to run: every drawing call lands on
 * this, and anything undefined or mistyped throws on the way. */
const drawn = [];
const ctx2d = new Proxy({}, {
  get(_, k) {
    if (k === "measureText") return () => ({ width: 120 });
    if (k === "createLinearGradient") return () => ({ addColorStop() {} });
    return (...args) => {
      if (args.some(a => typeof a === "number" && !Number.isFinite(a))) {
        throw new Error("ctx." + String(k) + " got a non-finite number: " + args.join(", "));
      }
      drawn.push(String(k));
    };
  },
  set() { return true; },
});

// createElement("canvas") has to come back usable: the video effects build an
// offscreen buffer for the echo trail.
globalThis.document = {
  getElementById: el,
  createElement: tag => {
    const e = el();
    if (tag === "canvas") { e.width = 1280; e.height = 720; e.getContext = () => ctx2d; }
    return e;
  },
};
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => {};
globalThis.performance = { now: () => 0 };
const canvas = el();
canvas.width = 1280;
canvas.height = 720;
canvas.getContext = () => ctx2d;
globalThis.video = { readyState: 0 };
globalThis.screen = { width: 1920, height: 1080 };   // desktop, so nothing is downgraded
document.getElementById = id => (id === "overlay" ? canvas : el());

// Strip the CDN import, expose the internals, and load it without touching disk.
const module = body.replace(/^import .*$/m, "") + `
export { cfg, diatonicQuality, chordMidis, chordName, romanName, rawDegree,
         settleChord, resetChord, rawVoicing, updateQuality, reaching, render, view, SILENCE,
         handHeight, stepSeconds, arpPool, arpPick, ARP_MODES, GATE_RATES, DIRT_TYPES, curveGain, curveTrim,
         qualityFor, SCALES };
`;
const H = await import("data:text/javascript," + encodeURIComponent(module));

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + name);
  if (!ok) console.log("        got  " + JSON.stringify(got) + "\n        want " + JSON.stringify(want));
};

const gate = (...up) => {
  const g = {};
  for (const f of ["thumb", "index", "middle", "ring", "pinky"]) g[f] = { on: up.includes(f) };
  return g;
};

const ONE = ["middle"], TWO = ["index", "middle"];
const THREE = ["index", "middle", "ring"], FOUR = ["index", "middle", "ring", "pinky"];

/* Each step is [chordPose, ms] or [chordPose, ms, flip, modPose]. Reports
 * every distinct chord the instrument actually sounded, as "degree/quality". */
function play(script, fps, settleMs) {
  H.cfg.settleMs = settleMs;
  H.resetChord();
  const step = 1000 / fps;
  let t = 0;
  const heard = [];
  for (const [set, ms, flip = false, mod = null] of script) {
    for (let e = 0; e < ms; e += step) {
      t += step;
      const h = H.settleChord(gate(...set), flip, mod ? gate(...mod) : null, t);
      const label = h.degree ? h.degree + "/" + h.quality : 0;
      if (heard[heard.length - 1] !== label) heard.push(label);
    }
  }
  return heard;
}
const degreesOf = h => h.map(x => x === 0 ? 0 : +String(x).split("/")[0]);

console.log("-- diatonic quality follows the key --");
H.cfg.mode = "scale"; H.cfg.scale = "Major"; H.cfg.root = 60; H.cfg.octave = 0;
check("C major gives I ii iii IV V vi vii°",
  [1, 2, 3, 4, 5, 6, 7].map(H.diatonicQuality),
  ["maj", "min", "min", "maj", "maj", "min", "dim"]);

H.cfg.scale = "Natural minor";
check("natural minor gives i ii° III iv v VI VII",
  [1, 2, 3, 4, 5, 6, 7].map(H.diatonicQuality),
  ["min", "dim", "maj", "min", "min", "maj", "maj"]);

H.cfg.scale = "Major pentatonic";
check("an exotic scale never yields a non-triad",
  [1, 2, 3, 4, 5, 6, 7].map(H.diatonicQuality).every(q => ["maj", "min", "dim"].includes(q)),
  true);

console.log("\n-- notes and names (scale mode) --");
H.cfg.scale = "Major";
check("I in C is C E G", H.chordMidis(1, "maj", 1, 0), [60, 64, 67]);
check("vi in C is A C E", H.chordMidis(6, "min", 1, 0), [69, 72, 76]);
check("vii° in C is B D F", H.chordMidis(7, "dim", 1, 0), [71, 74, 77]);
check("names read as chord symbols",
  [[1, "maj"], [6, "min"], [7, "dim"]].map(([d, q]) => H.chordName(d, q, 1)),
  ["C", "Am", "B°"]);
check("roman numerals carry the quality in their case",
  [[1, "maj"], [6, "min"], [7, "dim"]].map(([d, q]) => H.romanName(d, q)),
  ["I", "vi", "vii°"]);

H.cfg.octave = -1;
check("the octave select shifts the whole chord", H.chordMidis(1, "maj", 1, 0), [48, 52, 55]);
H.cfg.octave = 0;

H.cfg.root = 65;   // F, to match the reference screenshots
check("F major: 6 fingers-worth is Dm", H.chordName(6, H.diatonicQuality(6), 1), "Dm");
check("F major: the V is C", H.chordName(5, H.diatonicQuality(5), 1), "C");
H.cfg.root = 60;

console.log("\n-- fingers to position --");
check("plain counts are positions 1..5",
  [H.rawDegree(gate("index")), H.rawDegree(gate("index", "middle")),
   H.rawDegree(gate("index", "middle", "ring")),
   H.rawDegree(gate("index", "middle", "ring", "pinky")),
   H.rawDegree(gate("thumb", "index", "middle", "ring", "pinky"))],
  [1, 2, 3, 4, 5]);
check("index+pinky is 6, not a 2", H.rawDegree(gate("index", "pinky")), 6);
check("index+pinky+thumb is 7, not a 3", H.rawDegree(gate("index", "pinky", "thumb")), 7);
check("a near-miss combo falls back to its count", H.rawDegree(gate("index", "ring")), 2);
check("a closed hand is silence", H.rawDegree(gate()), 0);

console.log("\n-- the settle is wall clock, not frames --");
// The reported problem: holding 2, flicking through 3, landing on 4. The flick
// is quick, but "quick" is a duration, and a frame count is not.
const flick = [[TWO, 600], [THREE, 120], [FOUR, 600]];

check("too short a settle lets the flicked-through 3 sound",
  degreesOf(play(flick, 30, 100)).includes(3), true);
check("the shipped 260ms does not", degreesOf(play(flick, 30, 260)).includes(3), false);
check("and it still arrives at the 4 you meant",
  degreesOf(play(flick, 30, 260)).at(-1), 4);

/* The regression this replaced: a frame count is a different amount of time on
 * every webcam, so a flick that was safe at 30fps sounded the 3 at 60. */
const shapes = [15, 24, 30, 60, 90].map(f => degreesOf(play(flick, f, 260)).join(">"));
check("every frame rate hears the same thing", new Set(shapes).size, 1);
check("and that thing is 2 then 4", shapes[0], "0>2>4");

check("a slower flick is still caught if it is under the settle",
  degreesOf(play([[TWO, 600], [THREE, 240], [FOUR, 600]], 30, 260)).includes(3), false);
check("but a pose held past the settle was meant, and sounds",
  degreesOf(play([[TWO, 600], [THREE, 400], [FOUR, 600]], 30, 260)).includes(3), true);

console.log("\n-- other things the settle has to survive --");
check("a single dropped tracking frame does not change the chord",
  degreesOf(play([[TWO, 400], [[], 33], [TWO, 400]], 30, 260)), [0, 2]);
check("releasing to silence cannot blip a lower chord on the way down",
  degreesOf(play([[FOUR, 600], [THREE, 60], [TWO, 60], [ONE, 60], [[], 600]], 30, 260)),
  [0, 4, 0]);
check("the slider's slowest setting still commits, just later",
  degreesOf(play([[TWO, 2000]], 30, 600)), [0, 2]);
check("the reach flag still marks poses that could still be growing",
  [H.reaching(gate("index")), H.reaching(gate("index", "pinky")),
   H.reaching(gate("middle")), H.reaching(gate())],
  [true, true, false, false]);

console.log("\n-- a gesture that changes two things is one change --");
// Letters mode, the default, where flat is major and rotated is minor - so
// "three fingers to one finger minor" means exactly what it sounds like.
H.cfg.mode = "letters"; H.cfg.octave = 0;

/* The reported bug. Going from three fingers flat to one finger rotated moves
 * the count AND the wrist, and they never land on the same frame. Settled
 * separately the count arrives first, so the one-finger MAJOR sounds on the
 * way to the minor. Settled together it does not exist. */
const threeToOneMinor = [
  [THREE, 600, false],        // holding the III, hand flat
  [TWO,    90, false],        // two fingers left, on the way down
  [ONE,   120, false],        // one finger, wrist has not caught up yet
  [ONE,   600, true],         // wrist arrives: one finger, rotated
];
check("three-flat to one-rotated sounds exactly two chords",
  play(threeToOneMinor, 30, 260), [0, "3/maj", "1/min"]);
check("the same at 60fps", play(threeToOneMinor, 60, 260), [0, "3/maj", "1/min"]);

// The wrist can lead instead of lag; it must not matter which.
const rotateFirst = [
  [THREE, 600, false],
  [THREE, 120, true],         // wrist rotates while three fingers are still up
  [TWO,    90, true],
  [ONE,   600, true],
];
check("and it does not matter whether the wrist leads or lags",
  play(rotateFirst, 30, 260), [0, "3/maj", "1/min"]);

// A voicing change on the other hand is part of the same gesture too.
const withVoicing = [
  [THREE, 600, false, ["index"]],
  [TWO,    90, false, ["index"]],
  [ONE,   120, false, ["index", "middle"]],
  [ONE,   600, true,  ["index", "middle", "ring"]],
];
check("a voicing moving at the same time does not add a chord either",
  play(withVoicing, 30, 260).length, 3);

// It must still be possible to change one thing at a time, deliberately.
check("changing only the quality is still one change",
  play([[TWO, 600, false], [TWO, 600, true]], 30, 260), [0, "2/maj", "2/min"]);
check("and changing only the voicing keeps the same degree",
  degreesOf(play([[TWO, 600, false, ["index"]],
                  [TWO, 600, false, ["index", "middle"]]], 30, 260)), [0, 2]);

console.log("\n-- letters mode: is it really key-free? --");
H.cfg.mode = "letters"; H.cfg.octave = 0;
const NAT = [1, 2, 3, 4, 5, 6, 7];
const pc = m => ((m % 12) + 12) % 12;

check("the seven positions are A B C D E F G",
  NAT.map(d => H.chordName(d, "maj", 1, 0)), ["A", "B", "C", "D", "E", "F", "G"]);
check("tilting gives the minor of each",
  NAT.map(d => H.chordName(d, "min", 1, 0)), ["Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm"]);
check("the key and scale settings are ignored in this mode", (() => {
  const a = H.chordMidis(3, "maj", 1, 0);
  H.cfg.root = 65; H.cfg.scale = "Blues";
  const b = H.chordMidis(3, "maj", 1, 0);
  H.cfg.root = 60; H.cfg.scale = "Major";
  return JSON.stringify(a) === JSON.stringify(b);
})(), true);

// The claim the whole mode rests on: naturals plus one sharp reach every root.
const naturals = new Set(NAT.map(d => pc(H.chordMidis(d, "maj", 1, 0)[0])));
const sharped  = new Set(NAT.map(d => pc(H.chordMidis(d, "maj", 1, 1)[0])));
const reachable = new Set([...naturals, ...sharped]);
check("naturals alone reach only 7 of the 12 roots", naturals.size, 7);
check("naturals plus the sharp toggle reach all 12",
  [...reachable].sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8,9,10,11]);
check("so every major and minor triad is playable", reachable.size * 2, 24);

const findChord = want => NAT.flatMap(d => [0, 1].flatMap(sh =>
  ["maj", "min"].map(q => H.chordName(d, q, 1, sh)))).includes(want);
check("F#m is reachable (key of D)", findChord("F#m"), true);
check("C#m is reachable (key of A)", findChord("C#m"), true);
check("A#/Bb is reachable (key of F)", findChord("A#"), true);
check("D#/Eb is reachable", findChord("D#"), true);
check("G#/Ab is reachable", findChord("G#"), true);
check("sevenths still work on a sharped root", H.chordName(4, "maj", 4, 1), "D#7");
check("and inversions name the right bass", H.chordName(1, "min", 2, 0), "Am/C");
check("roman numerals are dropped, since there is no key to number against",
  H.romanName(1, "maj"), "");

console.log("\n-- voicings --");
H.cfg.mode = "scale"; H.cfg.scale = "Major"; H.cfg.root = 60; H.cfg.octave = 0;
check("1 is the plain triad", H.chordMidis(1, "maj", 1, 0), [60, 64, 67]);
check("2 puts the third in the bass", H.chordMidis(1, "maj", 2, 0), [64, 67, 72]);
check("3 on a major chord is a major 7th", H.chordMidis(1, "maj", 3, 0), [60, 64, 67, 71]);
check("3 on a minor chord is a minor 7th", H.chordMidis(6, "min", 3, 0), [69, 72, 76, 79]);
check("4 on a major chord is a dominant 7th", H.chordMidis(5, "maj", 4, 0), [67, 71, 74, 77]);
check("4 on a minor chord is a diminished 7th", H.chordMidis(6, "min", 4, 0), [69, 72, 75, 78]);
check("the octave shift lifts the whole chord", H.chordMidis(1, "maj", 1, 12), [72, 76, 79]);
check("every voicing of every quality is a real chord, not a stack",
  [1, 2, 3, 4].flatMap(v => ["maj", "min", "dim"].map(q => H.chordMidis(1, q, v, 0)))
    .every(ns => ns.length >= 3 && ns.every(Number.isInteger)),
  true);
check("chord symbols name the voicing",
  [[1, "maj", 1], [1, "maj", 2], [1, "maj", 3], [5, "maj", 4], [6, "min", 3], [7, "dim", 3]]
    .map(([d, q, v]) => H.chordName(d, q, v)),
  ["C", "C/E", "Cmaj7", "G7", "Am7", "Bm7♭5"]);

console.log("\n-- modifier hand counts on four fingers, thumb stays free --");
check("the thumb is not part of the voicing count",
  [H.rawVoicing(gate("index")), H.rawVoicing(gate("index", "thumb")),
   H.rawVoicing(gate("index", "middle", "thumb"))], [1, 1, 2]);
check("all four fingers reach voicing 4",
  H.rawVoicing(gate("index", "middle", "ring", "pinky")), 4);
check("a modifier hand doing nothing is the plain triad, same as one finger",
  [H.rawVoicing(gate()), H.rawVoicing(gate("thumb"))], [1, 1]);

console.log("\n-- flip: two stops, and every degree responds --");
check("flat is the key's own opinion",
  NAT.map(d => H.qualityFor(d, false)),
  ["maj", "min", "min", "maj", "maj", "min", "dim"]);
check("flipped is the other one, every time",
  NAT.map(d => H.qualityFor(d, true)),
  ["min", "maj", "maj", "min", "min", "maj", "maj"]);
check("no degree is left unchanged by the tilt — the old dead-stop problem",
  NAT.filter(d => H.qualityFor(d, false) === H.qualityFor(d, true)), []);
check("as chord names in C: flat then flipped",
  [[1, false], [1, true], [6, false], [6, true], [7, false], [7, true]]
    .map(([d, f]) => H.chordName(d, H.qualityFor(d, f), 1)),
  ["C", "Cm", "Am", "A", "B°", "B"]);

console.log("\n-- tilt hysteresis, either direction --");
H.cfg.tiltOn = 25;                       // the shipped default; release derives at ~16
H.updateQuality(0);
check("a flat hand is not flipped", H.updateQuality(0), false);
check("tilting right past the angle flips to minor", H.updateQuality(27), true);
check("it holds through a wobble back to 20", H.updateQuality(20), true);
check("and returns to major under the exit angle", H.updateQuality(14), false);
check("tilting left flips just the same", H.updateQuality(-27), true);
check("holding through a wobble", H.updateQuality(-20), true);
check("and returning", H.updateQuality(-10), false);
check("the angle is reachable in either direction",
  [H.updateQuality(26), H.updateQuality(0), H.updateQuality(-26)], [true, false, true]);

console.log("\n-- getting major back --");
/* The reported bug: a hand does not rest at zero. If its resting tilt sits
 * above the exit angle, a flip to minor is one-way — nothing you can do with
 * that hand gets major back. */
const restsAt = deg => { H.updateQuality(0); H.updateQuality(40); return H.updateQuality(deg); };

H.cfg.tiltOn = 18;                       // what shipped before
check("at 18° a hand resting at 14° is stuck in minor", restsAt(14), true);
H.cfg.tiltOn = 25;
check("at the new 25° the same hand gets major back", restsAt(14), false);
check("and a hand resting at 20° still needs the slider", restsAt(20), true);

check("the exit angle scales with the entry angle, so the feel is constant",
  [15, 25, 35].map(on => {
    H.cfg.tiltOn = on;
    H.updateQuality(0); H.updateQuality(on + 15);
    let a = on;
    while (a > 0 && H.updateQuality(a)) a -= 0.25;
    return Math.round((a / on) * 20) / 20;        // released at this fraction of entry
  }),
  [0.65, 0.65, 0.65]);
H.cfg.tiltOn = 25;

console.log("\n-- the techno sequencer --");
H.cfg.bpm = 140;
const beat = 60 / 140;
check("a step is a 1/32 note", Math.abs(H.stepSeconds() - beat / 8) < 1e-12, true);
check("so eight of them make a beat", Math.abs(H.stepSeconds() * 8 - beat) < 1e-12, true);
H.cfg.bpm = 120;
check("and tempo actually moves it", Math.abs(H.stepSeconds() - 0.0625) < 1e-12, true);
H.cfg.bpm = 140;

// Every rate has to be a whole number of steps, or it would drift off the grid.
check("every arp rate divides the grid evenly",
  Object.values(H.ARP_MODES).filter(Boolean).every(m => 8 % m.every === 0), true);
check("every gate rate does too",
  Object.values(H.GATE_RATES).filter(Boolean).every(n => 8 % n === 0), true);

const triad = [60, 64, 67];
check("the pool is the chord plus itself an octave up",
  H.arpPool(triad), [60, 64, 67, 72, 76, 79]);

const pool = H.arpPool(triad);
check("up runs through the pool and wraps",
  [0, 1, 2, 3, 4, 5, 6, 7].map(i => H.arpPick(pool, i, "up")),
  [60, 64, 67, 72, 76, 79, 60, 64]);
check("up-down turns round without repeating the ends",
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => H.arpPick(pool, i, "updown")),
  [60, 64, 67, 72, 76, 79, 76, 72, 67, 64, 60]);
check("a seventh gives an eight-step run, not six",
  H.arpPool([60, 64, 67, 71]).length, 8);
check("an empty pool yields nothing rather than crashing",
  H.arpPick([], 3, "up"), null);
check("and a one-note pool does not divide by zero",
  [0, 1, 2].map(i => H.arpPick([60], i, "updown")), [60, 60, 60]);

/* The gate is what "cutting the note with the beat" means, so the arithmetic
 * that decides when it opens has to hold at every tempo and depth. */
const gateSpan = rate => H.stepSeconds() * H.GATE_RATES[rate];
check("a 1/8 gate spans half a beat", Math.abs(gateSpan("1/8") - beat / 2) < 1e-12, true);
check("a 1/16 gate spans a quarter of one", Math.abs(gateSpan("1/16") - beat / 4) < 1e-12, true);
check("the open portion always leaves room to close",
  ["1/4", "1/8", "1/16"].every(r => {
    const span = gateSpan(r);
    return Math.max(0.01, Math.min(span * 0.5, span - 0.008)) + 0.006 < span;
  }), true);

console.log("\n-- dirt --");
const curveOf = (name, amount) => {
  H.cfg.dirt = name;
  return H.DIRT_TYPES[name] ? H.DIRT_TYPES[name](amount) : null;
};
// Read the curve at a given input, the way a WaveShaper does.
const at = (curve, x) => curve[Math.round((x + 1) / 2 * (curve.length - 1))];

check("Clean is a real bypass, not a flat curve", curveOf("Clean", 0.5), null);
check("every curve stays inside the rails",
  ["Warm", "Crush", "Fold", "Bits"].every(n =>
    [0, 0.5, 1].every(a => Array.from(curveOf(n, a)).every(v => v >= -1 && v <= 1))),
  true);
check("and every curve is odd, so it adds no DC offset",
  ["Warm", "Crush", "Fold"].every(n => {
    const c = curveOf(n, 0.7);
    return Math.abs(at(c, 0.5) + at(c, -0.5)) < 0.01;
  }), true);

/* The distinction that matters, given the shaper sits after the swell: what
 * each curve does to a QUIET signal. Warm has to leave it alone or it hands
 * back the level the hand just took away; Crush is supposed to flatten
 * everything, which is why it sounds broken. */
const quietGain = (name, amount) => {
  const c = curveOf(name, amount);
  return at(c, 0.08) / 0.08;
};
for (const n of ["Warm", "Crush", "Fold", "Bits"]) {
  console.log("         (" + n.padEnd(6) + " gain on a quiet signal: " +
              quietGain(n, 0.5).toFixed(2) + "x at drive 0.5, " +
              quietGain(n, 1).toFixed(2) + "x at 1.0)");
}
check("Warm barely touches a quiet signal", quietGain("Warm", 0.5) < 1.6, true);
check("Crush very much does, which is the point",
  quietGain("Crush", 0.5) > 4, true);
/* What separates folding from clipping is that the transfer curve stops being
 * monotonic: past a point more input gives LESS output, which is the fold.
 * Clipping only ever flattens. */
const monotonic = curve => {
  for (let i = (curve.length / 2 | 0) + 1; i < curve.length; i++) {
    if (curve[i] < curve[i - 1] - 1e-6) return false;
  }
  return true;
};
check("Fold turns back on itself; Warm and Crush only flatten",
  ["Fold", "Warm", "Crush"].map(n => monotonic(curveOf(n, 1))),
  [false, true, true]);

/* Dirt is supposed to change the tone, not the volume. Each curve has a wildly
 * different gain - Crush is eight times Warm on a quiet signal - so the level
 * is measured off the curve itself and trimmed back out, or picking a dirt
 * would just be picking a loudness. */
const trimmed = (name, amount) => H.curveGain(curveOf(name, amount)) * H.curveTrim(curveOf(name, amount));
check("the three that boost are trimmed back to clean",
  ["Warm", "Crush", "Fold"].every(n =>
    [0.3, 0.6, 1].every(a => Math.abs(trimmed(n, a) - 1) < 0.05)),
  true);
// Bits attenuates rather than boosts, and the trim only ever attenuates -
// pushing it back up would just be a gain control wearing a hat.
check("and nothing ends up louder than clean",
  ["Warm", "Crush", "Fold", "Bits"].every(n =>
    [0.3, 0.6, 1].every(a => trimmed(n, a) <= 1.05)),
  true);
for (const n of ["Warm", "Crush", "Fold"]) {
  console.log("         (" + n.padEnd(6) + " raw gain " +
              H.curveGain(curveOf(n, 1)).toFixed(2) + "x, trimmed to " +
              trimmed(n, 1).toFixed(2) + "x)");
}
check("Bits quantises into steps rather than a smooth ramp", (() => {
  const c = curveOf("Bits", 1);
  const vals = new Set();
  for (let x = 0; x <= 1; x += 0.02) vals.add(at(c, x).toFixed(4));
  return vals.size < 12;                       // a smooth curve would give ~51
})(), true);
H.cfg.dirt = "Clean";

console.log("\n-- hand height does not leak the hand's rotation --");
/* Rotating a hand to ask for a minor chord must not change how loud it is.
 * A synthetic rigid hand is enough to show it: the geometry is the whole
 * claim, and a real one would only add tracking noise on top. */
function rigidHand() {
  const lm = [];
  lm[0] = { x: .50, y: .62 };                                     // wrist
  const mcp = [[.455, .53], [.49, .515], [.525, .52], [.558, .535]];
  const cols = [5, 9, 13, 17];
  for (let i = 0; i < 4; i++) {
    const [mx, my] = mcp[i];
    for (let j = 0; j < 4; j++) {                                 // mcp..tip
      lm[cols[i] + j] = { x: mx + (mx - .5) * j * .35, y: my - j * .035 };
    }
  }
  for (let j = 0; j < 4; j++) lm[1 + j] = { x: .44 - j * .022, y: .60 - j * .018 };
  return lm;
}

// Rotate every landmark about a pivot, the way a hand pivots in place.
const rotateAbout = (lm, deg, px, py) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return lm.map(p => ({
    x: px + (p.x - px) * c - (p.y - py) * s,
    y: py + (p.x - px) * s + (p.y - py) * c,
  }));
};

const flat = rigidHand();
const palmCx = [0, 5, 9, 13, 17].reduce((a, i) => a + flat[i].x, 0) / 5;
const palmCy = [0, 5, 9, 13, 17].reduce((a, i) => a + flat[i].y, 0) / 5;

// How far each measure drifts as the hand tilts through the range that
// crosses the minor threshold and back.
const drift = measure => {
  const base = measure(flat);
  let worst = 0;
  for (let deg = -35; deg <= 35; deg += 5) {
    worst = Math.max(worst, Math.abs(measure(rotateAbout(flat, deg, palmCx, palmCy)) - base));
  }
  return worst;
};

const wristOnly = lm => 1 - lm[0].y;
const palmDrift = drift(H.handHeight);
const wristDrift = drift(wristOnly);

check("a hand rotating in place does not move the measured height at all",
  palmDrift < 1e-9, true);
check("reading the wrist alone did move it", wristDrift > 0.005, true);

/* What that drift was worth, measured rather than guessed. It has to be
 * evaluated mid-band: at the top of the band the volume is clamped at full
 * and hides the whole effect, which is exactly why this only became audible
 * once the band was narrowed. */
const asVolume = h => Math.pow(Math.max(0, Math.min(1, (h - 0.02) / (0.30 - 0.02))), 1.2);
const mid = 0.16;
const cost = asVolume(mid + wristDrift) - asVolume(mid);
console.log("         (wrist drift " + wristDrift.toFixed(4) +
            " = " + Math.round(cost * 100) + "% volume mid-band)");
check("and that drift was audible, not academic", cost > 0.02, true);

// The other half of the bargain: curling fingers must not change it either,
// or the volume would depend on which chord you were playing.
const curled = flat.map((p, i) => (i >= 5 && i % 4 !== 1)
  ? { x: p.x, y: p.y + 0.06 } : p);            // fingertips folded down
check("and curling the fingers does not move it either",
  Math.abs(H.handHeight(curled) - H.handHeight(flat)) < 1e-9, true);

console.log("\n-- the overlay renders --");
/* What the overlay looks like cannot be checked from here. That it runs at
 * all can be: a fake 2d context records every call and throws on any NaN
 * coordinate, which is how a canvas usually fails - silently, by drawing
 * nothing where the number went bad. */
const fakeHand = (cx, cy) =>
  Array.from({ length: 21 }, (_, i) => ({
    x: cx + Math.cos(i) * 0.05,
    y: cy + Math.sin(i) * 0.07,
    z: 0,
  }));

function renderOnce(state) {
  Object.assign(H.view, state);
  drawn.length = 0;
  H.render(1234, 16.7);
  return drawn.length;
}

let threw = null;
try {
  // Nothing in frame.
  renderOnce({ hands: { chord: null, mod: null }, gates: { chord: null, mod: null },
               scores: { chord: null, mod: null }, held: H.SILENCE,
               level: 0, tilt: 0, flip: false, cut: .5, echo: 0 });

  // Both hands, a chord sounding, everything lit up.
  H.cfg.mode = "letters";
  const full = {
    hands: { chord: fakeHand(.3, .5), mod: fakeHand(.7, .55) },
    gates: { chord: gate("index", "middle"), mod: gate("index", "thumb") },
    scores: { chord: { thumb: .04, index: .21, middle: .19, ring: .02, pinky: .01 },
              mod: { thumb: .15, index: .22, middle: .03, ring: .01, pinky: .02 } },
    held: { degree: 6, quality: "min", voicing: 3, shift: 1, flip: true, key: "x" },
    level: 1, tilt: 31, flip: true, cut: .8, echo: .4,
  };
  // Several frames, so the particle system gets to emit, move and expire.
  for (let i = 0; i < 90; i++) renderOnce(full);

  // Every degree and voicing, in both modes, in case any lookup is missing.
  for (const mode of ["letters", "scale"]) {
    H.cfg.mode = mode;
    for (let d = 1; d <= 7; d++) {
      for (let v = 1; v <= 4; v++) {
        renderOnce({ ...full, held: { degree: d, quality: H.qualityFor(d, false),
                                      voicing: v, shift: 0, flip: false, key: "y" } });
      }
    }
  }
} catch (e) {
  threw = e.message;
}

// The video effects have their own branches: off entirely, and full tilt.
try {
  const loud = {
    hands: { chord: fakeHand(.3, .5), mod: fakeHand(.7, .55) },
    gates: { chord: gate("index", "middle"), mod: gate("index") },
    scores: { chord: { thumb: .04, index: .21, middle: .19, ring: .02, pinky: .01 },
              mod: { thumb: .15, index: .22, middle: .03, ring: .01, pinky: .02 } },
    held: { degree: 3, quality: "maj", voicing: 2, shift: 0, flip: false, key: "k" },
    level: 1, tilt: 30, flip: false, cut: 1, echo: 1,
  };
  for (const glitch of [0, 0.01, 0.5, 1]) {
    H.cfg.glitch = glitch;
    for (let i = 0; i < 10; i++) {
      // Alternate the chord key so the change burst fires and decays.
      renderOnce({ ...loud, held: { ...loud.held, key: "k" + (i % 2) } });
    }
  }
} catch (e) {
  threw = threw || e.message;
}

check("rendering never throws, from empty frame to everything at once", threw, null);

/* Draw-call budget. This cannot measure a real browser, but it can catch the
 * shape of a problem: the effects are all blits, and blits are the thing that
 * would sink the frame rate if one of them ended up in a loop it should not. */
H.cfg.glitch = 1;
const worst = {
  hands: { chord: fakeHand(.3, .5), mod: fakeHand(.7, .55) },
  gates: { chord: gate("thumb", "index", "middle", "ring", "pinky"),
           mod: gate("thumb", "index", "middle", "ring", "pinky") },
  scores: { chord: { thumb: .3, index: .3, middle: .3, ring: .3, pinky: .3 },
            mod: { thumb: .3, index: .3, middle: .3, ring: .3, pinky: .3 } },
  held: { degree: 7, quality: "dim", voicing: 4, shift: 1, flip: true, key: "w" },
  level: 1, tilt: 40, flip: true, cut: 1, echo: 1,
};
for (let i = 0; i < 200; i++) renderOnce({ ...worst, held: { ...worst.held, key: "w" + i } });
renderOnce({ ...worst, held: { ...worst.held, key: "wX" } });
const blits = drawn.filter(k => k === "drawImage").length;
console.log("         (worst case: " + blits + " blits, " + drawn.length + " ctx calls per frame)");
check("the blit count per frame stays bounded", blits < 40, true);
check("and the particle system does not grow without limit",
  drawn.filter(k => k === "fillRect").length < 800, true);
H.cfg.glitch = 0.55;
check("and it actually drew something",
  renderOnce({ hands: { chord: fakeHand(.4, .5), mod: null },
               gates: { chord: gate("index"), mod: null },
               scores: { chord: { thumb: 0, index: .2, middle: 0, ring: 0, pinky: 0 }, mod: null },
               held: { degree: 1, quality: "maj", voicing: 1, shift: 0, flip: false, key: "z" },
               level: .6, tilt: 5, flip: false, cut: .5, echo: .2 }) > 100,
  true);

console.log(fails ? `\n${fails} FAILED` : `\nall passed`);
process.exit(fails ? 1 : 0);
