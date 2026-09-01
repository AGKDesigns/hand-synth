# Hand Synth

A synthesiser you play by waving at your webcam. MediaPipe finds 21 landmarks
on each hand, the code counts which fingers are up, and Web Audio turns that
into chords. One HTML file, no build step, no dependencies.

Prototype. The point is to find out which gestures feel like an instrument and
which feel like fighting a computer, so the mapping is meant to be argued with.

## Running

```powershell
cd D:\github\hand-synth
npm start                  # http://localhost:5173
```

Then hit **Start** and allow the camera. First run downloads about 8MB of hand
model from Google's CDN; after that the browser caches it.

```powershell
npm test                   # no dependencies, no framework
```

The tests pull the module straight back out of `index.html` and import it as a
data URL against a stub DOM, so what runs is the shipped source rather than a
copy of it that can drift. They cover the harmony, the finger reading and the
timing that decides when a chord commits, plus a smoke test that renders the
overlay against a fake 2d context and fails on any non-finite coordinate. What
the overlay *looks* like still needs eyes; the audio needs a browser.

Opening `index.html` directly off disk does not work. `getUserMedia` needs a
secure context, and the ES module import from a `file://` page comes from origin
`null`, which CORS rejects. `serve.mjs` is a dozen lines of Node standard
library that solves both by being localhost.

## Playing it

**One hand owns the chord. The other only modifies it.** The chord hand decides
which chord you hear — the degree from its finger count, major or minor from
its tilt, how loud from its height. The modifier hand cannot reach a chord the
first hand is not already playing; it restacks, transposes and colours what it
is given.

By default the chord hand is your **right**. **Swap hands** trades them.

### Chord hand — which chord

How many fingers are up picks the chord. Which fingers they are does not
matter, with two named exceptions.

| Fingers up | Scale mode | Letters mode |
|---|---|---|
| 0 | Silence | Silence |
| 1 | I | A |
| 2 | II | B |
| 3 | III | C |
| 4 | IV | D |
| 5 | V | E |
| index + pinky | VI | F |
| index + pinky + thumb | VII | G |

One chord at a time. Changing it moves the chord rather than stacking another
on top of it.

**Letters mode is the default.** **Scale mode** locks you to a key. The seven positions are its seven degrees,
so you cannot play a wrong note — and cannot leave the key either.

**Letters mode** drops the key. The positions are the seven natural roots, and
the modifier hand's thumb sharpens them. That matters more than it sounds:
sharping the naturals gives A♯ C♯ D♯ F♯ G♯ — exactly the five black keys, since
B♯ and E♯ are just C and F — so seven positions plus one toggle reach **all
twelve roots**, and flats come free enharmonically (B♭ = A♯, E♭ = D♯). Twelve
roots by two qualities is every common triad, so any song is playable.

Without that sharp toggle the mode would be a trap: A–G major and minor covers
C and G, but the key of D needs F♯m, A needs C♯m, F needs B♭. Naturals alone
reach 7 of 12 roots. There is a test that asserts the sharp closes the gap.

Key and Scale are disabled in letters mode, since neither has anything to say.

### Chord hand — what kind, and how loud

| Tilt | Scale mode | Letters mode |
|---|---|---|
| Flat | The chord that belongs to the key | Major |
| Tilt either way | The other one | Minor |

Flipping swaps major and minor; the diminished vii becomes major. In C that
gives you C·Cm, Dm·D, Em·E, F·Fm, G·Gm, Am·A, B°·B — a pair on every degree.

Direction does not matter, so tilt whichever way your wrist prefers. You enter
minor past 25° and return to major under about 16°; the **Rotation** slider
moves both together. The **Tilt** meter shows your live angle beside whichever
of the two currently applies, so you can see where your own neutral sits.

| Movement | Effect |
|---|---|
| Height | Volume |

Height is the theremin part: raise the hand to swell in, lower it to fade out.

### Modifier hand — optional

Its **four fingers** count the voicing. The thumb is deliberately not part of
that count, which leaves it free to be the octave.

| Fingers up | Voicing |
|---|---|
| 0 or 1 | Root position |
| 2 | 1st inversion |
| 3 | Seventh — maj7 on a major chord, m7 on a minor one |
| 4 | Dominant 7th on a major chord, diminished 7th on a minor one |

| Gesture | Effect |
|---|---|
| Thumb | Octave up in scale mode, **sharp** in letters mode |
| Tilt | Filter — tilt left darkens, tilt right brightens (~500 Hz to ~8 kHz) |
| Height | Echo send |

**Leave this hand out of frame and you get plain triads and nothing else
changes.** Every chord is reachable from the chord hand alone, which is the
point of putting the whole harmony on one hand.

### Techno voice

The **Voice** setting swaps the pad for a sequencer. The hands mean the same
things; what happens to the chord changes completely.

| Part | What it does |
|---|---|
| Arp | Plays the chord one note at a time instead of holding it, at 1/8, 1/16 or 1/32, up or up-down |
| Gate | Chops whatever is sounding in time with the beat — a trance gate |
| Sub | A triangle an octave under the root, brought in by the modifier thumb |
| Dirt | Four transfer curves, off by default: Warm, Crush, Fold, Bits |
| Drive | How hard the chosen curve is pushed |

The arpeggio runs over the chord *plus itself an octave up*, so a triad is a
six-step run and a seventh is eight — long enough to sound like a sequence
without adding a note that is not in the chord. Voicing still picks which
notes those are, so the modifier hand chooses the shape of the run.

**In techno the modifier thumb brings in the sub** rather than transposing.
That is the one collision in the whole layout: in letters mode the thumb is
the sharp, so letters and techno together lose access to accidental roots. One
binary gate cannot be two things, and techno tends to stay in one key, so
Scale mode is the natural pairing.

Tempo, arp rate, gate rate and depth, drive and sub level are all panel
settings — the hands were full already, and adding gestures is how the first
version of this instrument became unplayable.

The video glitch fires on the beat in this mode, so the picture keeps time.

### Resting and pausing

Close your chord hand, take it out of frame, or lower it — all three are
silence. **Space** (or the Pause button) is a real stop: it drops the chord,
closes the swell, and forgets every gate, so coming back does not sound the
pose you happened to be holding.

## Why it is built the way it is

- **Dirt is one node with four curves, and the difference between them is
  what they do to a QUIET signal.** The shaper sits after the swell, so a
  curve with a big small-signal gain hands back exactly the level your hand
  just took away. Warm is near unity at the bottom and bends only near full
  scale, so how hard you play decides how hard it is driven. Crush is
  deliberately the opposite — everything arrives flattened against the ceiling
  however gently it was played, which is the wrong shape for an expressive
  instrument and the right one for sounding broken on purpose. Fold turns back
  on itself past full scale rather than flattening, which is where the
  metallic harmonics come from. Bits quantises amplitude; a waveshaper cannot
  touch the sample rate, so it is the bit-depth half of a bitcrusher only, and
  at full drive quiet signals fall into the bottom step and vanish.

- **Dirt changes the tone, not the volume.** The curves differ in gain by a
  factor of eight, so the level is measured off each curve — a sine run
  through it, RMS compared against clean — and trimmed back out. Without that,
  choosing a dirt would mostly be choosing a loudness. The trim only ever
  attenuates: pushing a quiet curve back up would just be a gain control
  wearing a hat.

- **Drive sits after the swell.** A clipper in front of the volume control
  sees full level no matter how quietly you are playing, so it distorts
  everything equally and the quiet end gets quieter rather than cleaner. That
  was a real bug: the pad was being crushed at every volume.

- **The filter is two poles, not one.** A single biquad is 12dB an octave,
  which rolls the top off but never sounds like the filter is closing.
  Stacking a second makes it 24, and the range went from 500Hz-8kHz to
  120Hz-9kHz, which is far enough down to leave almost nothing but the sub.
  Resonance is on the first stage only; doubling it as well would howl.

- **The sequencer books notes ahead, it does not fire them.** Web Audio
  cannot be driven from a render loop: a note wanted on a frame boundary lands
  wherever the frame lands, which at 60fps is up to 16ms of jitter and audible
  as sloppy timing. The loop only ever looks 150ms ahead and books notes at
  exact times on the audio clock, which then plays them itself.

- **Everything is quantised to a 1/32 note.** That is the finest division any
  rate asks for, so every arp and gate rate is a whole number of steps and
  nothing has to cope with a fractional grid. There is a test that every rate
  divides it evenly.

- **The sub is wired around the filter and the drive.** Sweeping the filter
  should take the top off without taking the bottom out, and a distorted sine
  is just a worse sine. It is still gated, because a bass ignoring the gate is
  a bass playing a different song.

- **Sub level sits outside the settle.** The pitch follows the chord and only
  moves when the chord does, but the level rides the thumb directly — so the
  bass can be brought in and out mid-phrase without restarting the arpeggio.

- **One hand owns the harmony.** Splitting "which chord" and "what kind" across
  two hands means neither hand is playable alone and every chord change is a
  two-hand coordination problem. Putting the degree and the quality on the same
  hand costs that hand a tilt — but what it was doing with that tilt was a
  modifier, and modifiers are what the other hand is for.

- **The modifier hand counts on four fingers, not five.** Its thumb carries the
  octave, and a finger cannot be both a digit in a count and a separate toggle
  without the two fighting over the same knuckle. Four is also exactly how many
  voicings there are, so nothing is lost.

- **The whole chord settles as one thing, not each part separately.** This
  replaced an earlier design with a settler per hand, and that design was
  wrong. A chord here is a position, a quality, a voicing and a shift, and
  almost no change moves all four on the same frame — going from three fingers
  to one-finger-minor drops two fingers *and* rotates the wrist. Settled
  separately, whichever lands first commits on its own, so you hear the
  one-finger major on the way to the minor. No amount of debouncing the count
  fixes that, because the count was never wrong. Waiting until the whole
  description has stopped moving is what turns a gesture back into one change.
  There are tests for the wrist leading, the wrist lagging, and a voicing
  moving at the same time.

- **Voicings come from a table of named chords, not from stacking scale
  degrees.** A seventh built by indexing four steps up an exotic scale is not
  reliably a seventh. Looking up "minor 7th" and transposing it always is.

- **The degree is the finger *count*, not which finger.** A gesture-per-chord
  layout means memorising a chart before you can play a progression. A count is
  something you already know.

- **Two named finger sets buy the last two degrees.** Five fingers only counts
  to five and a key has seven. `index+pinky` and `index+pinky+thumb` are tested
  before the count, because as counts they would read as II and III.

- **The count is debounced separately from the fingers.** Fingers do not all
  arrive on the same frame, so going from two to four reads as three on the way
  through — and when the count *is* the chord, that three is audibly wrong.
  Debouncing each finger does not help, because each finger is behaving
  correctly; the degree they add up to is what has to settle.

- **Every wait is measured in milliseconds, not frames.** The loop runs once
  per camera frame, so a frame count is a different amount of time on every
  webcam — 7 frames is 230ms at 30fps and 117ms at 60fps. A finger transition
  takes however long it takes regardless, so a debounce fast enough on one
  machine let chords through on another. There is a test that replays the same
  gesture at 15, 24, 30, 60 and 90fps and asserts all five hear the same thing.

- **How long to settle is a setting, because it is a question about you.**
  What has to be waited out is the gap between your first finger arriving and
  your last, and that is a fact about hands, not about code. The default is
  260ms; the **Settle** slider runs 60 to 600. It is a straight trade — the
  cost is paid on every change, including the ones you meant. The **Camera**
  readout shows your actual frame rate and what the settle works out to in
  frames on your machine.

- **Poses that might still be turning into a combo get a slow attack.**
  Reaching for `index+pinky` passes through index alone, which settles and
  sounds the I before the pinky arrives. Rather than make every chord wait
  longer for the sake of two of them, index-alone swells in over ~190ms: a
  chord you did not mean is replaced before it has finished arriving, and one
  you did mean reads as intent rather than lag.

- **Chords are built from canonical triads, not from the raw stack.** The key
  decides major/minor/diminished by stacking thirds, but the notes that sound
  are always a real triad. The pentatonic and blues scales stack into shapes
  that are not chords at all, and this is what stops that being audible.

- **Two stops on the tilt, not three.** Naming absolute qualities — left for
  minor, flat for the key, right for major — sounds like three choices but is
  really two and a half: on the I, "major" is what the key already said, and on
  the ii it is "minor" that changes nothing. Which stop is dead moves with the
  chord, which is worse than either. A flip always changes something, so the
  control is never inert.

- **The flip reads tilt magnitude, not direction.** Wrists are not symmetric —
  rotating away from the body is a much shorter throw than across it — so
  needing only one of the two directions roughly halves what the gesture asks
  for. It also lets the threshold come down, because there is no longer a wrong
  direction to overshoot into.

- **Quality uses hysteresis, not a frame count.** The tilt is already smoothed,
  so two angles are enough to stop it flapping at the boundary.

- **The exit angle is derived from the entry angle, not set beside it.** A
  fixed exit does not survive the entry moving — raise the angle you have to
  reach and the gate gets stickier, because the exit stayed where it was. Worse,
  a hand whose resting tilt happens to sit above a low exit can never get back
  to major at all: the flip becomes one-way. The exit is two thirds of the
  entry, so the feel is the same at every setting, and there is a test that a
  hand resting at 14° can still return.

- **Finger detection is measured from the wrist and scaled by hand size**, not
  by asking whether a fingertip is above a knuckle. The naive version breaks
  the moment you rotate your hand — which this instrument asks you to do
  constantly, because tilt is two of the controls.

- **The thumb needs its own test.** It folds across the palm rather than back
  toward the wrist, so wrist distance barely changes when it closes. It is
  measured against the pinky knuckle instead.

- **And its own threshold.** That measurement covers a much smaller range than
  the fingers do, so one number for both meant a thumb you had to stick right
  out to register. Sliding both on a single control cannot fix it either:
  loosening the thumb enough to fire drops the fingers below where they start
  to chatter. It has its own **Thumb** slider now, and its hysteresis gap is
  proportional — a fixed gap would put the release below zero at the loose end,
  leaving a gate that could only let go of an actively folded thumb.

- **The thumb default is deliberately strict.** It was dropped from 0.12 to
  0.07 to make it easier to fire, and that turned out to be worse: a thumb
  that fires when you did not mean it is a sharpened chord in letters mode,
  which is far more audible than a missed one. It sits at 0.11 now, with the
  slider spanning 0.16 to 0.06 — the cost of a false positive is higher than
  the cost of a false negative, so the default leans strict.

- **Height is remapped to the band a hand actually goes to.** Straight 0-to-1
  across the frame put full volume at the very top — a place you can reach but
  not hold, so playing loud meant playing with your arm up. Worse, the squared
  curve on top of it meant a wrist near the top of frame was still only at 64%.
  The band runs from a resting floor to the **Reach** setting, and everything
  above that is headroom nobody needs. Reach defaults to 30% — full volume with
  the wrist about seventy percent of the way down the frame, which is where a
  hand actually sits when your elbow is on a desk. The slider goes down to 15%.

- **Height is the average of the palm, not the wrist.** One landmark is one
  point, so anything that moves it moves the volume — and rotating a hand to
  ask for a minor chord moves the wrist. Averaging the wrist and the four
  knuckles fixes it by construction: rotating a rigid hand about the middle of
  its palm leaves the average exactly where it was, which is asserted. Fingers
  are deliberately excluded from that average; including them would make the
  volume depend on how many were up, which is to say on which chord you were
  playing. On a synthetic hand the old wrist reading drifted 0.017 across a
  ±35° tilt, worth about 6% of volume mid-band.

- **The Volume meter shows the raw hand height next to the level.** Every
  attempt to tune this by feel was really a disagreement about where a hand
  sits in frame, which is a number, and now it is on screen. If the reading is
  0.15 when your arm is comfortable, set Reach near 15.

- **The curve is gentle, not gone.** Gain linear in position reads as most of
  the travel doing nothing and then a jump at the top, so height is still
  raised to 1.4 — but the band remap does the heavy lifting now, not the
  exponent.

- **The echo is fed post-swell.** Dropping your hand stops feeding the delay but
  lets what is already in it ring out, so you can swell in, cut, and let the
  tail answer.

- **Resonance is fixed and modest.** It used to be on the left tilt, but a
  three-note chord through a resonant filter turns to mud.

- **The overlay is load-bearing, not decoration.** It is what makes the
  instrument legible on a recording — you can see what a hand position did
  without knowing anything about the mapping. Landmarks are squares and the
  skeleton is a hairline because blobs and thick bones read as a cartoon,
  while ticks and numbers read as a measurement. Every fingertip carries its
  own extension score, which is the number the finger gate is actually
  thresholding, so the picture and the decision are the same thing.

- **The video is graded and glitched by the sound, not by a timer.** The
  filter sets the colour grade and the width of the chromatic split, the echo
  send becomes a literal feedback trail — each new frame drawn at less than
  full alpha leaves the older ones decaying underneath — the volume drives the
  scanlines and the tearing, and every chord change punches a burst of slice
  displacement that decays over a quarter second. Randomised glitch would look
  the same on any input; this way the picture is doing what you are hearing.

- **All of it is drawImage, never getImageData.** A per-pixel loop at 720p
  cannot hold 60fps next to MediaPipe inference. The chromatic split leans on
  sepia+saturate+hue-rotate, which tints an arbitrary image to a single hue and
  so avoids an offscreen pass per channel; the slice displacement blits the
  canvas onto itself. Worst case is 15 blits and about 630 canvas calls a
  frame, and there is a test that fails if either runs away.

- **The Glitch slider turns all of it off.** Taste varies and so do machines,
  so the whole effect chain scales from one control, and the frame rate is on
  screen next to it.

- **Particles carry the volume because nothing else could.** The filter has
  the waveform and the chord has its name, but "how hard am I playing" has no
  natural picture. Emission rate, launch speed and turbulence all scale with
  level, so quiet is a drift and loud is a scatter.

- **Drawing is split from detection.** Detection is capped at the camera frame
  rate; drawing is not. Running them together meant the whole overlay
  stuttered along at whatever the webcam managed, which is fine for a skeleton
  and useless for particles. The renderer works from a `view` object that the
  last detection left behind.

## On a phone

The layout stacks below 820px or in portrait: video on top, controls under it.
Side by side assumes a window wider than it is tall, which a phone is not, and
a 300px column beside a 16:9 video leaves neither of them big enough to use.

The camera is asked for `facingMode: "user"` — without it a phone hands back
the rear camera, the one pointing away from your hands — and the resolution is
a preference rather than a demand, so a device that cannot manage 720p gives
what it has and the canvas follows.

Glitch starts at 30 rather than 55 on a small screen, because a phone is
running the hand model and a full-frame effect chain on one GPU. The slider is
still there; this only changes where it starts.

## Known rough edges

- **Handedness may come out backwards.** MediaPipe labels hands from the
  camera's point of view; the picture is mirrored, so the label is flipped in
  code. If your hands are the wrong way round, hit **Swap hands**.

- **Tracking wants light.** Backlit hands, or hands against a busy background,
  drop out. The status line and the big readout say what it thinks you played.

- **Reaching for the VI still makes a sound.** The slow attack makes the
  passed-through I quiet rather than absent. Getting to actual silence would
  mean waiting long enough to be sure the hand had stopped moving, which costs
  every other chord.

- **Triads only.** No inversions, no sevenths. The reference this borrows from
  puts those on a second counting hand; that would mean both hands counting at
  once, which is the thing this layout is trying to avoid.

- **Pitch bend is gone.** The modifier hand's tilt is the filter now, which is
  what the reference does with it, and there was nowhere else to put a bend
  that would not collide with the quality flip. Sustain and sharp went earlier.

- **The octave gesture only goes up.** The reference reads a thumb position as
  both directions; a binary finger gate gives one. Thumb out is +12, and the
  Octave dropdown sets the register you start from.

- **Scale mode locks you to one key at a time.** The seven degrees are the
  seven notes of whatever Key and Scale say, so that mode is fourteen chords
  and changing key means reaching for a dropdown. That is what makes it hard
  to play a wrong note, and it is also the ceiling. Letters mode lifts the
  ceiling and removes the protection with it — nothing stops you playing a
  chord that does not belong.

- **Letters mode has no octave gesture.** The modifier thumb is the sharp
  there, and a binary gate cannot be two things at once. Use the Octave
  dropdown.

- **Letters mode spells everything with sharps.** B♭ shows as A♯ and E♭ as
  D♯. They are the same chord; the name will look wrong on a lead sheet.

- **Pentatonic and blues are not really seven-degree scales.** They are stored
  padded out to seven entries, so some degrees repeat an earlier one an octave
  up rather than being new chords: on both pentatonics that is degrees 6 and 7,
  on blues just degree 7. Fine for the five-finger counts, misleading for the
  combos.

- **You cannot ask for a specific quality, only for the other one.** Playing a
  minor iii means knowing the key already gave you one, so you leave the hand
  flat. That is the trade for a control that always does something.

- **Changing two things at once costs no more than changing one.** The settle
  starts again each time any part of the description changes, so a sprawling
  two-handed change waits from the last thing to move, not from the first.
  That is the point, but it does mean a hand that never quite settles never
  commits.

- **The webcam sets the ceiling on responsiveness.** At 30fps a frame is 33ms,
  and the settle adds 260ms on top by default, so a chord lands about a third
  of a second after you ask for it. Fine for pads and progressions; not a drum
  trigger. Drop **Settle** if you want it tighter and can move your fingers
  together.

- **Thumb and pinky are the least reliable fingers to count on.** Three fingers
  as index-middle-ring tracks better than thumb-index-pinky, even though both
  are "three".

- **Inversions stop at the first.** The reference has the same limit. Second
  inversion would be a fifth voicing and the modifier hand has run out of
  fingers to count with.

## Ideas not built yet

- A key change on some gesture, so the single-key ceiling stops being a
  dropdown reach
- Pinch distance (thumb to index) as a continuous control — finer than height
- Hand distance from camera (z) as a third axis
- MIDI out, so the tracking drives a real instrument instead of this one
- Recording a loop, so one hand can play over what the other laid down
