# Controls reference (shared/input.js)

Why this exists: docs/DESIGN.md §6. Games declare input; the layer handles devices. A new device or touch scheme
is added in `shared/input.js` once, and every game gets it.

## Pointer model: board and card games

```js
input: {
  model: 'pointer',
  targets: '.hole',          // CSS selector for interactive things (cells, cards, piles) inside ctx.root
  drag: false,               // true → dragstart/dragmove/drop events (touch-action: none on the root)
  secondary: true,           // true → long-press / right-click / F key emit 'secondary' (e.g. flag a mine)
  wrap: false,               // keyboard cursor wraps around rows/columns
  focusRing: true,           // false if your own "selected" style already shows the cursor
  keys: { u: 'undo', 1: 'digit:1' },   // extra keys → command names (single characters lowercase)
  navigate: (el, dir) => el, // optional: custom cursor movement; default is geometric (nearest target that way)
}
```

Events: `ctx.input.on(type, fn)`

| Event | Fired by | Args |
|---|---|---|
| `select` | pointer down on a target, keyboard cursor move | `(el, { by })` |
| `activate` | tap/click (no drag), Enter/Space on the cursor | `(el, { by })` |
| `doubleactivate` | two taps on the same target within 320 ms (also fires two `activate`s first) | `(el)` |
| `secondary` | long-press (touch), right-click, F or Shift+Enter | `(el, { by })` |
| `dragstart` / `dragmove` / `drop` | pointer moved > 8 px from a target (only with `drag: true`) | `(from)`, `({x, y, dx, dy, over, from})`, `(over \| null, from)` |
| `command` | `keys` map, Ctrl/Cmd+Z → `'undo'`, Ctrl/Cmd+Shift+Z → `'redo'`, H → `'hint'`, N → `'new'`, Esc → `'back'` | `(name)` |

Other: `ctx.input.focus(el)` moves the keyboard cursor without emitting `select`; `ctx.input.cursor` is the current target.

Keyboard play with drag games: use tap-tap. `activate` on a source selects it, `activate` on a destination moves
there. Implement tap-tap anyway, because it's also the best one-thumb touch control.

Esc runs your `ctx.onBack` handlers, then leaves to the home screen. `?` shows your `help` lines.

## Action model: arcade games

```js
input: {
  model: 'action',
  stage: '.stage',            // selector for the playfield; gestures/halves listen here (default: ctx.root)
  actions: [
    { id: 'left',  kind: 'button', repeat: { delay: 170, rate: 50 } },  // held → pressed() pulses after delay, every rate ms
    { id: 'rotate', kind: 'button' },
    { id: 'move',  kind: 'dir4', latch: true },  // 4-way; latch keeps the last direction after release (maze games)
    { id: 'aim',   kind: 'axis2' },              // analogue {x, y} in -1..1 from a stick; keys give -1/0/1
    { id: 'pause', kind: 'button' },             // Esc and P map here automatically; call ctx.pause() when pressed
  ],
  keys: { z: 'rotate', ' ': 'drop', ArrowLeft: 'left' },  // key → action, or 'move.left' for one direction of a dir4
  touch: {                     // schemes this game supports; the first is the default, players switch in the pause menu
    gestures: { tap: 'rotate', swipeDown: 'drop', swipeUp: 'hold', stepLeft: 'left', stepRight: 'right', stepDown: 'softDrop', step: 30 },
    console:  { dpad: 'move', a: 'rotate', b: 'drop', c: 'hold', labels: { a: '⟳' } },
    halves:   { left: { button: 'flipperL' }, right: { button: 'flipperR', swipeUp: 'launch' } },
  },
}
```

Arrows and WASD are bound to every `dir4`/`axis2` action automatically unless you map them yourself.

Each simulation step:

```js
ctx.input.update();                 // once per fixed step, before reading
ctx.input.pressed('rotate')         // went down since the last update (a tap shorter than a frame is never lost)
ctx.input.held('left')              // currently down (from any device)
ctx.input.released('drop')
ctx.input.dir('move')               // 'up' | 'down' | 'left' | 'right' | null
ctx.input.pressedDir('move')        // direction newly pressed this step: buffer it for the next junction
ctx.input.clearDir('move')          // forget a latched direction (e.g. on respawn)
ctx.input.axis('aim')               // { x, y }
ctx.input.label('rotate')           // "Z", "A", "Tap"… for on-screen hints, matches the last-used device
```

### Touch schemes

| Scheme | Fields | Notes |
|---|---|---|
| `gestures` | `tap`, `swipeUp/Down/Left/Right` (on release, flick-aware), `stepLeft/Right/Down` + `step` px (continuous while dragging), or `swipe: '<dir4 id>'` (fires during the move, for steering) | nothing drawn; buttons inside the stage still work |
| `console` | `dpad` (dir4 id, or `{up, down, left, right}` → action ids), `a`, `b`, `c`, `labels` | bar under the stage; hidden when the player uses keyboard/mouse. Leave room: your stage should be `flex: 1` |
| `halves` | `left` / `right`: `{ button }` or `{ stick }` (floating), plus optional `swipeUp` / `swipeDown` | transparent zones over the stage, multi-touch |

## Not offered on purpose

On-screen D-pads and thumbsticks are not offered for pointer games (Sudoku, Solo Test, Solitaire, Mines); tapping the board is better.
Gamepads come later (issue #10) as one adapter in `shared/input.js`, with no game changes.
