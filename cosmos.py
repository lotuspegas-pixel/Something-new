#!/usr/bin/env python3
"""
COSMOS — An Emergent Universe

A living particle simulation where gravity, electromagnetism, and entropy
interact to produce structures you cannot predict. Philosophical commentary
emerges from the state of the universe itself.

Controls:  g gravity  e EM-force  n new cluster  b big bang  p pause  ? oracle  h help  q quit
"""

import curses
import json
import math
import os
import random
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import List, Tuple, Dict, Optional

# ─── Persistence ─────────────────────────────────────────────────────────────

SAVE_FILE = Path.home() / ".cosmos_universe.json"

# ─── Color pair IDs ──────────────────────────────────────────────────────────

C_NORMAL = 1
C_DARK   = 2
C_LIGHT  = 3
C_VOID   = 4
C_UI     = 5
C_ORACLE = 6
C_TITLE  = 7
C_DIM    = 8
C_NEBULA = 9
C_FLASH  = 10

# ─── Oracle wisdom (generated from simulation state) ─────────────────────────

ORACLE_WISDOM = [
    "Order emerges not from decree, but from the patient dance of simple rules.",
    "Every particle carries within it the memory of the Big Bang.",
    "What we call chaos is merely complexity we have not yet learned to read.",
    "The void between particles is not emptiness — it is potential.",
    "In the universe, nothing is lost. Only transformed.",
    "Gravity whispers: all things yearn to be closer to all other things.",
    "The universe does not hurry, yet everything is accomplished.",
    "Even in the darkest matter, there is movement. Movement is life.",
    "A particle alone is a point. Particles together are a story.",
    "Time is the canvas. Motion is the paint. Existence is the brushstroke.",
    "The same forces that bind atoms bind galaxies. Scale is an illusion.",
    "Every collision is a conversation. Every orbit is a relationship.",
    "There is no outside observer. To watch is to participate.",
    "A thought ripples outward to the edges of being.",
    "What separates order from chaos is only the question you are asking.",
    "In the long run, entropy wins. In the short run, you have time to dance.",
    "Light travels toward us from stars that no longer exist. We are made of old news.",
    "A universe in balance is not still — it is vibrantly, endlessly exchanging.",
    "The laws of physics are the same everywhere. This is the universe's deepest promise.",
    "You cannot step into the same universe twice. It has already moved on.",
    "Dark matter does not speak, yet its gravity shapes everything you see.",
    "Charge is memory: the particle remembers every field it has ever touched.",
    "The void consumes — yet even the void obeys the law of conservation.",
    "Kinetic energy is the universe's way of refusing to be still.",
    "In a universe without observers, is beauty still beautiful?",
    "Complexity is simplicity given enough time.",
    "The attractor does not command. It merely makes a place worth moving toward.",
    "Every orbit is a failed escape attempt that became something more graceful.",
]

ORACLE_EVENTS = {
    "collision":  "Two become one — and in that union, neither is lost.",
    "void_eaten": "A particle vanishes into the void. It does not cease; it transforms.",
    "cluster":    "Gravity has spoken: here, things belong together.",
    "sparse":     "In the silence between particles, the universe breathes.",
    "dense":      "The density approaches a threshold — something is about to happen.",
    "fast":       "Kinetic fire: the universe burns brightest at its edges.",
    "still":      "At low energy, structure crystallizes. Beauty slows down.",
    "born":       "New matter condenses from the quantum foam...",
}

# ─── Nebula background noise ──────────────────────────────────────────────────

NEBULA_CHARS = [" ", " ", " ", ".", ",", "·", ":", ";", "-", "~", "+"]

def nebula_value(x: int, y: int, t: float) -> float:
    """Multi-octave pseudo-noise for nebula rendering."""
    s = 0.04
    t0 = t * 0.008
    v  = (math.sin(x * s       + t0 * 1.1) *
          math.cos(y * s * 1.3 - t0 * 0.9) *
          math.sin((x + y) * s * 0.6 + t0 * 0.7))
    v += (math.sin(x * s * 2.1 - t0 * 1.5) *
          math.cos(y * s * 1.7  + t0 * 1.2)) * 0.4
    return (v + 1.4) / 2.8  # normalise roughly to [0, 1]

# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class Particle:
    x:      float
    y:      float
    vx:     float
    vy:     float
    mass:   float
    charge: int    # −1 / 0 / +1
    ptype:  str    # "normal" | "dark" | "light" | "void"
    age:    int = 0
    alive:  bool = True
    trail:  List[Tuple[float, float]] = field(default_factory=list)

    def speed(self) -> float:
        return math.sqrt(self.vx * self.vx + self.vy * self.vy)

    def ke(self) -> float:
        return 0.5 * self.mass * (self.vx * self.vx + self.vy * self.vy)


# ─── Universe simulation ──────────────────────────────────────────────────────

class Universe:
    PARTICLE_CHARS = {
        "normal": ("·", "•", "◦", "○", "●"),
        "dark":   ("·", "◦", "○", "◎", "●"),
        "light":  ("∘", "✦", "✧", "★", "✸"),
        "void":   ("░", "▒", "▓", "■", "▬"),
    }
    PARTICLE_COLORS = {
        "normal": C_NORMAL,
        "dark":   C_DARK,
        "light":  C_LIGHT,
        "void":   C_VOID,
    }

    def __init__(self, width: int, height: int):
        self.width  = width
        self.height = height
        self.particles: List[Particle] = []
        self.t               = 0
        self.gravity_on      = True
        self.em_on           = True
        self.total_born      = 0
        self.total_died      = 0
        self.sessions        = 1
        self.last_event_key  = ""
        self.last_event_time = 0

    # ── Initialisation ────────────────────────────────────────────────────────

    def big_bang(self, n: int = 80):
        self.particles.clear()
        cx, cy = self.width / 2, self.height / 2
        for _ in range(n):
            angle = random.uniform(0, 2 * math.pi)
            spd   = abs(random.gauss(2.5, 1.2))
            ptype = random.choices(
                ["normal", "dark", "light", "void"],
                weights=[55, 22, 18, 5]
            )[0]
            self.particles.append(Particle(
                x      = cx + random.gauss(0, 2.5),
                y      = cy + random.gauss(0, 1.2),
                vx     = math.cos(angle) * spd + random.gauss(0, 0.3),
                vy     = math.sin(angle) * spd * 0.5 + random.gauss(0, 0.15),
                mass   = random.uniform(0.6, 3.5) if ptype != "void" else 0.2,
                charge = random.choices([-1, 0, 1], weights=[3, 4, 3])[0],
                ptype  = ptype,
            ))
        self.total_born += n

    def spawn_cluster(self, cx: float, cy: float, n: int = 12):
        for _ in range(n):
            angle = random.uniform(0, 2 * math.pi)
            spd   = random.uniform(0.4, 2.2)
            ptype = random.choices(
                ["normal", "dark", "light"],
                weights=[6, 2, 2]
            )[0]
            self.particles.append(Particle(
                x      = cx + random.gauss(0, 2),
                y      = cy + random.gauss(0, 1),
                vx     = math.cos(angle) * spd,
                vy     = math.sin(angle) * spd * 0.5,
                mass   = random.uniform(0.5, 3.0),
                charge = random.choices([-1, 0, 1], weights=[3, 4, 3])[0],
                ptype  = ptype,
            ))
        self.total_born += n
        self._emit("born")

    # ── Physics step ──────────────────────────────────────────────────────────

    def step(self):
        dt    = 0.16
        alive = [p for p in self.particles if p.alive]

        for p in alive:
            ax = ay = 0.0
            for o in alive:
                if o is p:
                    continue
                dx     = o.x - p.x
                dy     = o.y - p.y
                dist_sq = dx * dx + dy * dy + 0.25
                dist    = math.sqrt(dist_sq)

                # Void absorption
                if dist < 1.2:
                    if o.ptype == "void" and p.ptype != "void":
                        p.alive = False
                        self.total_died += 1
                        self._emit("void_eaten")
                        break
                    continue

                if dist > 45:
                    continue  # Skip very distant particles

                inv_dist = 1.0 / dist

                # Gravity (all types attract by mass)
                if self.gravity_on:
                    gf  = p.mass * o.mass / dist_sq * 0.28
                    ax += gf * dx * inv_dist / p.mass
                    ay += gf * dy * inv_dist / p.mass

                # Electrostatics (charges interact)
                if self.em_on and p.charge and o.charge:
                    ef  = -p.charge * o.charge * 2.8 / dist_sq
                    ax += ef * dx * inv_dist / p.mass
                    ay += ef * dy * inv_dist / p.mass

            if not p.alive:
                continue

            p.vx = (p.vx + ax * dt) * 0.994
            p.vy = (p.vy + ay * dt) * 0.994

            # Speed cap
            spd = p.speed()
            if spd > 9.0:
                scale = 9.0 / spd
                p.vx *= scale
                p.vy *= scale

            # Trail (keep last 4 positions)
            p.trail.append((p.x, p.y))
            if len(p.trail) > 4:
                p.trail.pop(0)

            p.x += p.vx * dt
            p.y += p.vy * dt

            # Wrap-around space
            p.x %= self.width
            p.y %= self.height
            p.age += 1

        self.particles = [p for p in self.particles if p.alive]

        # Ensure minimum population
        if len(self.particles) < 8 and self.t % 60 == 0:
            cx = random.uniform(4, self.width  - 4)
            cy = random.uniform(2, self.height - 2)
            self.spawn_cluster(cx, cy, 6)

        self.t += 1

        # Periodic commentary events
        if self.t % 400 == 0:
            self._emit(self._sense())

    def _sense(self) -> str:
        """Pick an event key based on the current state."""
        if not self.particles:
            return "sparse"
        avg_ke  = sum(p.ke() for p in self.particles) / len(self.particles)
        density = len(self.particles) / (self.width * self.height)
        if density > 0.05:
            return "dense"
        if density < 0.005:
            return "sparse"
        if avg_ke > 4.0:
            return "fast"
        if avg_ke < 0.3:
            return "still"
        return "cluster"

    def _emit(self, key: str):
        self.last_event_key  = key
        self.last_event_time = self.t

    def stats(self) -> Dict:
        counts: Dict[str, int] = {}
        total_ke = 0.0
        for p in self.particles:
            counts[p.ptype] = counts.get(p.ptype, 0) + 1
            total_ke += p.ke()
        return {
            "n":       len(self.particles),
            "t":       self.t,
            "ke":      total_ke,
            "born":    self.total_born,
            "died":    self.total_died,
            "counts":  counts,
            "gravity": self.gravity_on,
            "em":      self.em_on,
        }

    # ── Rendering helpers ──────────────────────────────────────────────────────

    def char_for(self, p: Particle) -> Tuple[str, int]:
        chars = self.PARTICLE_CHARS[p.ptype]
        spd   = p.speed()
        idx   = min(int(spd * 0.6), len(chars) - 1)
        color = self.PARTICLE_COLORS[p.ptype]
        return chars[idx], color

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "t":         self.t,
            "total_born": self.total_born,
            "total_died": self.total_died,
            "sessions":  self.sessions,
            "particles": [
                {
                    "x": p.x, "y": p.y, "vx": p.vx, "vy": p.vy,
                    "mass": p.mass, "charge": p.charge,
                    "ptype": p.ptype, "age": p.age,
                }
                for p in self.particles
            ],
        }

    def from_dict(self, d: dict, new_w: int, new_h: int):
        self.t          = d.get("t", 0)
        self.total_born = d.get("total_born", 0)
        self.total_died = d.get("total_died", 0)
        self.sessions   = d.get("sessions", 1) + 1
        for pd in d.get("particles", []):
            # Scale positions to new terminal size
            rx = pd["x"] / max(d.get("width", new_w), 1) * new_w
            ry = pd["y"] / max(d.get("height", new_h), 1) * new_h
            self.particles.append(Particle(
                x=rx, y=ry, vx=pd["vx"], vy=pd["vy"],
                mass=pd["mass"], charge=pd["charge"],
                ptype=pd["ptype"], age=pd["age"],
            ))


# ─── Splash screen ────────────────────────────────────────────────────────────

TITLE_ART = [
    " ██████╗ ██████╗ ███████╗███╗   ███╗ ██████╗ ███████╗",
    "██╔════╝██╔═══██╗██╔════╝████╗ ████║██╔═══██╗██╔════╝",
    "██║     ██║   ██║███████╗██╔████╔██║██║   ██║███████╗",
    "██║     ██║   ██║╚════██║██║╚██╔╝██║██║   ██║╚════██║",
    "╚██████╗╚██████╔╝███████║██║ ╚═╝ ██║╚██████╔╝███████║",
    " ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝",
]

TAGLINE = "An Emergent Universe  ·  Born From Simple Rules"

def draw_splash(screen, returning: bool, sessions: int):
    h, w = screen.getmaxyx()
    screen.erase()

    # Animated starfield
    stars = [(random.randint(0, w - 2), random.randint(0, h - 1),
              random.choice("·✦✧★∘◦")) for _ in range(40)]

    sy = max(1, h // 2 - len(TITLE_ART) // 2 - 2)

    # Draw title
    for i, line in enumerate(TITLE_ART):
        x = max(0, (w - len(line)) // 2)
        y = sy + i
        if 0 < y < h - 1:
            try:
                screen.addstr(y, x, line[:w - x - 1],
                              curses.color_pair(C_TITLE) | curses.A_BOLD)
            except curses.error:
                pass

    ty = sy + len(TITLE_ART) + 1
    if 0 < ty < h - 1:
        tx = max(0, (w - len(TAGLINE)) // 2)
        try:
            screen.addstr(ty, tx, TAGLINE[:w - tx - 1],
                          curses.color_pair(C_ORACLE))
        except curses.error:
            pass

    msg = ("Continuing universe…  " if returning else "Initiating creation…  ") + \
          f"[Session {sessions}]  ·  Press any key"
    my = ty + 2
    if 0 < my < h - 1:
        mx = max(0, (w - len(msg)) // 2)
        try:
            screen.addstr(my, mx, msg[:w - mx - 1], curses.color_pair(C_UI))
        except curses.error:
            pass

    # Animate stars briefly
    for _ in range(90):
        for sx_, sy_, sc in stars:
            if 0 <= sy_ < h and 0 <= sx_ < w - 1:
                try:
                    screen.addch(sy_, sx_, sc, curses.color_pair(C_DIM))
                except curses.error:
                    pass
        screen.refresh()
        screen.timeout(22)
        if screen.getch() != -1:
            break

    screen.timeout(-1)


# ─── Help overlay ─────────────────────────────────────────────────────────────

HELP_LINES = [
    ("COSMOS — Controls", C_TITLE),
    ("─" * 32, C_DIM),
    ("g  toggle gravity",          C_UI),
    ("e  toggle EM forces",        C_UI),
    ("n  spawn new particle cluster", C_UI),
    ("b  Big Bang (restart)",      C_UI),
    ("p  pause / resume",          C_UI),
    ("?  next oracle message",     C_UI),
    ("h  toggle this help panel",  C_UI),
    ("q  quit (state is saved)",   C_UI),
    ("─" * 32, C_DIM),
    ("Particle types:", C_ORACLE),
    ("  ● normal — attracts by mass + charge",  C_NORMAL),
    ("  ◎ dark   — strong gravity, no charge",  C_DARK),
    ("  ★ light  — light pressure repulsion",   C_LIGHT),
    ("  ▓ void   — absorbs nearby particles",   C_VOID),
]


def draw_help(screen):
    h, w = screen.getmaxyx()
    bw = 38
    bh = len(HELP_LINES) + 2
    sy = max(1, (h - bh) // 2)
    sx = max(1, (w - bw) // 2)

    for i, (line, color) in enumerate(HELP_LINES):
        y = sy + i + 1
        if 0 < y < h - 1 and sx + 1 < w:
            try:
                screen.addstr(y, sx + 1, line[:bw - 2].ljust(bw - 2),
                              curses.color_pair(color) |
                              (curses.A_BOLD if i == 0 else 0))
            except curses.error:
                pass


# ─── Main simulation loop ──────────────────────────────────────────────────────

def run(screen):
    # ── Colour setup ──────────────────────────────────────────────────────────
    curses.start_color()
    curses.use_default_colors()
    curses.init_pair(C_NORMAL, curses.COLOR_WHITE,   -1)
    curses.init_pair(C_DARK,   curses.COLOR_BLUE,    -1)
    curses.init_pair(C_LIGHT,  curses.COLOR_YELLOW,  -1)
    curses.init_pair(C_VOID,   curses.COLOR_MAGENTA, -1)
    curses.init_pair(C_UI,     curses.COLOR_CYAN,    -1)
    curses.init_pair(C_ORACLE, curses.COLOR_GREEN,   -1)
    curses.init_pair(C_TITLE,  curses.COLOR_YELLOW,  -1)
    curses.init_pair(C_DIM,    curses.COLOR_BLACK,   -1)  # bright black = dark gray
    curses.init_pair(C_NEBULA, curses.COLOR_BLUE,    -1)
    curses.init_pair(C_FLASH,  curses.COLOR_WHITE,   -1)

    curses.curs_set(0)
    screen.nodelay(True)
    screen.keypad(True)

    h, w = screen.getmaxyx()
    sim_h = max(4, h - 5)  # rows reserved for UI borders + oracle
    sim_w = max(8, w - 2)

    # ── Load saved universe or start fresh ────────────────────────────────────
    universe  = Universe(sim_w, sim_h)
    returning = False

    if SAVE_FILE.exists():
        try:
            with open(SAVE_FILE) as f:
                d = json.load(f)
            d["width"]  = d.get("width",  sim_w)
            d["height"] = d.get("height", sim_h)
            universe.from_dict(d, sim_w, sim_h)
            returning = True
        except Exception:
            universe.big_bang(80)
    else:
        universe.big_bang(80)

    draw_splash(screen, returning, universe.sessions)

    # ── Oracle state ──────────────────────────────────────────────────────────
    wisdom         = list(ORACLE_WISDOM)
    random.shuffle(wisdom)
    oracle_idx     = 0
    oracle_text    = wisdom[0]
    oracle_changed = time.time()

    # ── Loop state ────────────────────────────────────────────────────────────
    paused    = False
    show_help = False
    frame     = 0

    while True:
        # ── Input ─────────────────────────────────────────────────────────────
        key = screen.getch()

        if key in (ord('q'), ord('Q')):
            break
        elif key in (ord('g'), ord('G')):
            universe.gravity_on = not universe.gravity_on
        elif key in (ord('e'), ord('E')):
            universe.em_on = not universe.em_on
        elif key in (ord('n'), ord('N')):
            cx = random.uniform(4, universe.width  - 4)
            cy = random.uniform(2, universe.height - 2)
            universe.spawn_cluster(cx, cy, 15)
        elif key in (ord('b'), ord('B')):
            universe.big_bang(80)
            oracle_text    = "In the beginning — again."
            oracle_changed = time.time()
        elif key in (ord('p'), ord('P')):
            paused = not paused
        elif key in (ord('?'), ord('/')):
            oracle_idx  = (oracle_idx + 1) % len(wisdom)
            oracle_text = wisdom[oracle_idx]
            oracle_changed = time.time()
        elif key in (ord('h'), ord('H')):
            show_help = not show_help

        # ── Simulate ──────────────────────────────────────────────────────────
        if not paused:
            universe.step()

        # ── Render ────────────────────────────────────────────────────────────
        screen.erase()
        h, w = screen.getmaxyx()
        sim_h = max(4, h - 5)
        sim_w = max(8, w - 2)
        universe.width  = sim_w
        universe.height = sim_h

        # -- Nebula background -------------------------------------------------
        t_f = float(frame)
        for ny in range(1, sim_h + 1):
            for nx in range(1, sim_w + 1):
                v   = nebula_value(nx, ny, t_f)
                idx = int(v * (len(NEBULA_CHARS) - 1))
                ch  = NEBULA_CHARS[max(0, min(idx, len(NEBULA_CHARS) - 1))]
                if ch != " ":
                    try:
                        screen.addch(ny, nx, ch, curses.color_pair(C_DIM))
                    except curses.error:
                        pass

        # -- Particle trails ---------------------------------------------------
        for p in universe.particles:
            for tx, ty in p.trail:
                ix = int(tx) + 1
                iy = int(ty) + 1
                if 1 <= iy <= sim_h and 1 <= ix < sim_w:
                    try:
                        screen.addch(iy, ix, '·', curses.color_pair(C_DIM))
                    except curses.error:
                        pass

        # -- Particles ---------------------------------------------------------
        for p in universe.particles:
            ix = int(p.x) + 1
            iy = int(p.y) + 1
            if 1 <= iy <= sim_h and 1 <= ix < sim_w:
                ch, color = universe.char_for(p)
                attrs = curses.color_pair(color)
                if p.ptype == "light":
                    attrs |= curses.A_BOLD
                try:
                    screen.addstr(iy, ix, ch, attrs)
                except curses.error:
                    pass

        # -- Top status bar ----------------------------------------------------
        st   = universe.stats()
        gstr = "G:on " if st["gravity"] else "G:OFF"
        estr = "EM:on" if st["em"]      else "EM:OFF"
        mode = "PAUSED" if paused else f"t={st['t']}"
        cnts = st["counts"]

        bar = (f" COSMOS │ {mode} │ "
               f"∑{st['n']} "
               f"●{cnts.get('normal',0)} "
               f"◎{cnts.get('dark',0)} "
               f"★{cnts.get('light',0)} "
               f"▓{cnts.get('void',0)} │ "
               f"KE={st['ke']:.0f} │ {gstr} {estr} │ "
               f"born={st['born']} died={st['died']} │ [h]help [q]quit")

        if h > 1:
            try:
                screen.addstr(0, 0, bar[:w - 1],
                              curses.color_pair(C_UI) | curses.A_BOLD)
            except curses.error:
                pass

        # -- Bottom divider ----------------------------------------------------
        div_y = sim_h + 1
        if 0 < div_y < h:
            try:
                screen.addstr(div_y, 0, ("─" * (w - 1))[:w - 1],
                              curses.color_pair(C_DIM))
            except curses.error:
                pass

        # -- Oracle message (typing effect) ------------------------------------
        elapsed    = time.time() - oracle_changed
        visible    = min(int(elapsed * 45), len(oracle_text))
        partial    = oracle_text[:visible]
        oracle_y   = div_y + 1

        if 0 < oracle_y < h:
            prefix = "∴ "
            try:
                screen.addstr(oracle_y, 0, prefix,
                              curses.color_pair(C_ORACLE) | curses.A_BOLD)
                screen.addstr(oracle_y, len(prefix), partial[:w - len(prefix) - 1],
                              curses.color_pair(C_ORACLE))
            except curses.error:
                pass

        # -- Event line --------------------------------------------------------
        event_y = oracle_y + 1
        if universe.last_event_key and 0 < event_y < h:
            age_t = universe.t - universe.last_event_time
            if age_t < 180:
                ev_text = ORACLE_EVENTS.get(universe.last_event_key, "")
                fade    = max(0, 1.0 - age_t / 180.0)
                if ev_text and fade > 0.1:
                    try:
                        screen.addstr(event_y, 2, ev_text[:w - 3],
                                      curses.color_pair(C_DIM) | curses.A_DIM)
                    except curses.error:
                        pass

        # -- Help overlay ------------------------------------------------------
        if show_help:
            draw_help(screen)

        # -- Auto-rotate oracle every 14 s ------------------------------------
        if elapsed > 14:
            oracle_idx     = (oracle_idx + 1) % len(wisdom)
            oracle_text    = wisdom[oracle_idx]
            oracle_changed = time.time()

        screen.refresh()
        time.sleep(max(0.0, 1 / 30 - 0.002))  # ~30 fps
        frame += 1

    # ── Save state ────────────────────────────────────────────────────────────
    try:
        SAVE_FILE.parent.mkdir(parents=True, exist_ok=True)
        state = universe.to_dict()
        state["width"]  = universe.width
        state["height"] = universe.height
        with open(SAVE_FILE, "w") as f:
            json.dump(state, f)
    except Exception:
        pass


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    if "--help" in sys.argv:
        print(__doc__)
        return

    if sys.platform == "win32":
        import subprocess
        subprocess.run(["python", "-m", "curses"], check=False)

    try:
        curses.wrapper(run)
    except KeyboardInterrupt:
        pass

    print("\n∴  The universe continues, whether observed or not.\n"
          f"   State saved to {SAVE_FILE}\n")


if __name__ == "__main__":
    main()
