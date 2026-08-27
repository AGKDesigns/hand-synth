# Hand Synth

A synthesiser you play by waving at your webcam. MediaPipe finds 21 landmarks
on each hand, the code decides which fingers are up, and Web Audio turns that
into notes. One HTML file, no build step, no dependencies.

Prototype. The point is to find out which gestures feel like an instrument and
which feel like fighting a computer, so the mapping is meant to be argued with.

## Running

```powershell
cd D:\github\hand-synth
npm start                  # http://localhost:5173
```

Then hit **Start** and allow the camera. First run downloads about 8MB of hand
model from Google's CDN; after that the browser caches it.

Opening `index.html` directly off disk does not work. `getUserMedia` needs a
secure context, and the ES module import from a `file://` page comes from origin
`null`, which CORS rejects. `serve.mjs` is a dozen lines of Node standard
library that solves both by being localhost.

## Playing it

**Right hand picks the notes. Left hand changes what those notes mean.** The
note hand never has to move, which leaves its height and tilt free to be
expressive instead of competing with note choice.

### Right hand — notes

| Gesture | Note |
|---|---|
| Closed fist | Degree 1 (the root) |
| Thumb | Degree 2 |
| Index | Degree 3 |
| Middle | Degree 4 |
| Ring | Degree 5 |
| Pinky | Degree 6 |

Polyphonic — raise three fingers and you get a three-note chord. The fist
counts as a note only when no fingers are up, which is what buys six degrees
out of five fingers.

| Movement | Effect |
|---|---|
| Height | Brightness (filter cutoff, ~220 Hz to ~8 kHz) |
| Tilt | Pitch bend, ±1 to ±12 semitones |

Bend is applied to the running oscillators, so a held note slides rather than
retriggers.

### Left hand — control

| Gesture | Effect |
|---|---|
| Closed fist | Mute everything |
| Thumb | Sustain — held notes stay after the finger drops |
| Index | Octave up |
| Middle | Sharp (+1 semitone) |
| Ring | Octave down |
| Pinky | Vibrato |

| Movement | Effect |
|---|---|
| Height | Echo send |
| Tilt | Filter resonance — flat is smooth, tilted is squelchy |

**With the left hand out of frame you get plain notes and no modifiers.** That
is deliberate: one hand alone should be playable.

### Resting

A fist is a note, so a closed hand drones — which is the point if you want to
hold a root and shape it with the left hand. To stop, take the right hand out
of frame. Rest is a position, not a gesture.

If the drone gets in the way, untick **Fist = root** and a closed hand goes
silent instead. Both behaviours are one click apart on purpose; which one feels
right is exactly what this prototype is for.

## Why it is built the way it is

- **Finger detection is measured from the wrist and scaled by hand size**, not
  by asking whether a fingertip is above a knuckle. The naive version breaks
  the moment you rotate your hand — which this instrument asks you to do
  constantly, because tilt is the bend control.

- **The thumb needs its own test.** It folds across the palm rather than back
  toward the wrist, so wrist distance barely changes when it closes. It is
  measured against the pinky knuckle instead.

- **Every gate is a Schmitt trigger with a frame count.** A finger sitting on
  the threshold flickers, and a flickering finger machine-guns its note. Two
  thresholds plus a two-frame hold is the whole difference between an
  instrument and a noise. The fist waits five frames, because moving between
  two notes passes through "all fingers down" and would otherwise blip the root
  in between.

- **Continuous controls are smoothed.** Raw landmark positions jitter enough to
  be audible as a warble on the filter.

- **Vibrato is one shared LFO** wired into every voice's detune, so a chord
  wobbles together instead of each note drifting on its own.

- **Sustain never survives a mute or a hand leaving frame.** A stuck note with
  no way to stop it is worse than no sustain at all.

## Known rough edges

- **Handedness may come out backwards.** MediaPipe labels hands from the
  camera's point of view; the picture is mirrored, so the label is flipped in
  code. If your hands are the wrong way round, hit **Swap hands**.

- **Tracking wants light.** Backlit hands, or hands against a busy background,
  drop out. The status line says how many hands it can see.

- **The webcam sets the ceiling on responsiveness.** At 30fps a frame is 33ms,
  so a note can be up to that late before Web Audio is even involved. It is
  fine for pads and lines; it is not a drum trigger.

- **Modifiers apply at note-on.** Adding a sharp while a note is already
  sounding does not retune it. Predictable beat expressive, for now — bend is
  the control that moves live notes.

## Ideas not built yet

- Scale quantised bend, so tilt slides between scale degrees rather than
  through the cracks
- Pinch distance (thumb to index) as a continuous control — finer than height
- Hand distance from camera (z) as a third axis
- MIDI out, so the tracking drives a real instrument instead of this one
- Recording a loop, so one hand can play over what the other laid down
