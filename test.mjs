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
const noop = new Proxy({}, { get: () => () => {} });

globalThis.document = { getElementById: el, createElement: el };
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => {};
globalThis.performance = { now: () => 0 };
const canvas = el();
canvas.getContext = () => noop;
document.getElementById = id => (id === "overlay" ? canvas : el());

// Strip the CDN import, expose the internals, and load it without touching disk.
const module = body.replace(/^import .*$/m, "") + `
export { cfg, diatonicQuality, chordMidis, chordName, romanName, rawDegree,
         settleChord, resetChord, rawVoicing, updateQuality, reaching,
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

console.log(fails ? `\n${fails} FAILED` : `\nall passed`);
process.exit(fails ? 1 : 0);
