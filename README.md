# COSMOS — An Emergent Universe

A living particle simulation that runs entirely in your terminal.  
No dependencies. Just Python 3 and a universe full of potential.

```
python3 cosmos.py
```

---

## What it is

COSMOS is a real-time physics simulation rendered in ASCII.  
Four types of matter interact through gravity and electromagnetism,
producing structures, orbits, and patterns that no one — including the author —
can fully predict.

A philosophical **Oracle** watches the simulation and speaks as the universe evolves.  
The universe is **saved** when you quit and **continues** where it left off next session,
accumulating time like a living thing.

---

## Particle types

| Symbol | Type   | Behaviour                                      |
|--------|--------|------------------------------------------------|
| `●`    | Normal | Attracts by mass; repels/attracts by charge    |
| `◎`    | Dark   | Strong gravitational pull; no EM charge        |
| `★`    | Light  | Radiative repulsion between light particles    |
| `▓`    | Void   | Slowly absorbs any particle that touches it    |

---

## Controls

| Key | Action                        |
|-----|-------------------------------|
| `g` | Toggle gravity                |
| `e` | Toggle electromagnetic force  |
| `n` | Spawn a new particle cluster  |
| `b` | Big Bang — restart universe   |
| `p` | Pause / resume                |
| `?` | Cycle oracle wisdom           |
| `h` | Help overlay                  |
| `q` | Quit (state is saved)         |

---

## The nebula

The shifting background is a two-octave pseudo-noise field evolving in real time —  
a visual representation of the quantum foam between particles.  
The character density at any point reflects the interference of sine waves in three dimensions.

---

## The Oracle

The Oracle draws from 28 philosophical fragments, cycling every 14 seconds.  
Each message appears with a typing animation.  
When notable events occur — void absorption, high kinetic energy, new matter condensing —  
a secondary event message appears below the Oracle.

---

## State persistence

`~/.cosmos_universe.json` stores:
- Full particle positions, velocities, types
- Cumulative born/died counts across all sessions
- Universe age (`t`)
- Session count

The universe is never truly reset unless you run **Big Bang** (`b`)  
or delete the save file.

---

## Technical notes

- Pure Python 3 standard library only (`curses`, `math`, `json`, `random`)
- ~30 fps render loop via `curses`
- O(n²) force calculations — smooth for n < 200 particles
- Wrap-around boundary conditions (toroidal space)
- Speed cap of 9 units/step prevents numerical explosion
