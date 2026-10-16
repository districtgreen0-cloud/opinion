#!/usr/bin/env python3
"""Procedural soundtrack for the promo (120 s, 120 BPM): dark synth-pop → road-trip drop → calm outro. Writes out/music.wav."""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
BPM = 120
BEAT = 60 / BPM
DUR = 120.0
N = int(SR * DUR)
t = np.arange(N) / SR
mix = np.zeros((N, 2))

def env(n, a=0.005, d=0.2, s=0.0, r=0.05, hold=0.0):
    e = np.zeros(n); x = np.arange(n) / SR
    e = np.where(x < a, x / a, np.where(x < a + hold, 1.0, np.where(x < a + hold + d, 1 - (1 - s) * (x - a - hold) / d, s)))
    rel = int(r * SR)
    if rel < n: e[-rel:] *= np.linspace(1, 0, rel)
    return e

def lp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2)); return lfilter(b, a, x)

def add(start, sig, gain=1.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * gain
    mix[i:j, 0] += s * (1 - max(0, pan)); mix[i:j, 1] += s * (1 + min(0, pan))

def kick(start, g=1.0):
    n = int(0.35 * SR); x = np.arange(n) / SR
    f = 150 * np.exp(-x * 18) + 45
    add(start, np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.3, 0, 0.02), 0.9 * g)

def hat(start, g=0.25, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    x = np.random.randn(n); b, a = butter(2, [6000 / (SR / 2), 14000 / (SR / 2)], btype='band')
    add(start, lfilter(b, a, x) * env(n, 0.001, 0.25 if open_ else 0.05, 0, 0.01), g, pan=0.25)

def snare(start, g=0.6):
    n = int(0.2 * SR); x = np.random.randn(n)
    tone = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * 0.5
    add(start, (lp(x, 7000) * 0.7 + tone) * env(n, 0.001, 0.18, 0, 0.02), g)

def bass(start, f, dur, g=0.5, cutoff=600):
    n = int(dur * SR); x = np.arange(n) / SR
    saw = 2 * (x * f - np.floor(0.5 + x * f))
    sub = np.sin(2 * np.pi * f / 2 * x) * 0.6
    add(start, lp(saw, cutoff) * env(n, 0.005, dur * 0.6, 0.4, 0.05) * 0.7 + sub * env(n, 0.005, dur, 0.5, 0.05) * 0.5, g)

def pad(start, freqs, dur, g=0.12):
    n = int(dur * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for k, a in ((1, 1), (2, 0.35), (3, 0.15)):
            s += np.sin(2 * np.pi * f * k * x + 0.3 * np.sin(2 * np.pi * 0.2 * x)) * a
    s = lp(s, 1800) * env(n, 0.8, dur, 0.9, 1.2)
    add(start, s, g, pan=-0.2); add(start, np.roll(s, 400), g, pan=0.2)

def pluck(start, f, g=0.25, dur=0.35):
    n = int(dur * SR); x = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * f * 2 * x) + 0.2 * np.sin(2 * np.pi * f * 3 * x)
    add(start, s * env(n, 0.002, dur * 0.8, 0, 0.03), g, pan=np.random.uniform(-0.5, 0.5))

A2, C3, D3, E3, F2, G2 = 110.0, 130.81, 146.83, 164.81, 87.31, 98.0
chords = [(A2, [220, 261.6, 329.6]), (F2, [174.6, 220, 261.6]), (C3, [261.6, 329.6, 392]), (G2, [196, 246.9, 293.7])]
PENT = [440, 523.3, 587.3, 659.3, 784, 880, 1046.5]
np.random.seed(7)

bar = 4 * BEAT
total_bars = int(DUR / bar)
for b_ in range(total_bars):
    bs = b_ * bar
    sec = bs
    root, tri = chords[b_ % 4]
    # sections
    intro = sec < 7; city = 7 <= sec < 30; road = 30 <= sec < 88; london = 70 <= sec < 88; montage = 88 <= sec < 108; outro = sec >= 108
    pad(bs, tri, bar, g=0.10 if (intro or outro) else 0.14)
    if intro:
        if b_ % 2 == 0: pluck(bs, PENT[b_ % 7], 0.18, 0.8)
        continue
    # bass
    for k in range(8):
        if city and k % 2: continue
        bass(bs + k * BEAT / 2, root, BEAT / 2 * (0.9 if road else 0.6), g=0.45 if road else 0.3, cutoff=900 if road else 500)
    # drums
    for k in range(4):
        if road or montage: kick(bs + k * BEAT)
        elif city and k in (0, 2): kick(bs + k * BEAT, 0.8)
        elif outro and k == 0: kick(bs, 0.5)
        if (road or montage) and k in (1, 3): snare(bs + k * BEAT)
        for h in range(2):
            hat(bs + k * BEAT + h * BEAT / 2, 0.22 if road else 0.14, open_=(h == 1 and k == 3))
    # melody
    if road or montage:
        for k in range(8):
            if np.random.rand() < 0.55: pluck(bs + k * BEAT / 2, PENT[(b_ + k) % 7] * (2 if london else 1), 0.22)
    if outro:
        pluck(bs, PENT[(b_ * 2) % 7], 0.16, 1.2)

# riser into the drop (26–30 s) and a soft swell into the outro
n = int(4 * SR); x = np.arange(n) / SR
add(26, lp(np.random.randn(n), 8000) * (x / 4) ** 2 * 0.25, 1.0)
# master: gentle compression + fade out
m = mix / (np.abs(mix).max() + 1e-9)
m = np.tanh(m * 1.6) / np.tanh(1.6)
fade = np.ones(N); fo = int(3 * SR); fade[-fo:] = np.linspace(1, 0, fo); fade[: int(0.5 * SR)] = np.linspace(0, 1, int(0.5 * SR))
m *= fade[:, None] * 0.9
wavfile.write('out/music.wav', SR, (m * 32767).astype(np.int16))
print('wrote out/music.wav', DUR, 's')
