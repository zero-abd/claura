# Word timings for a voice-over: faster-whisper word timestamps, aligned onto the script's own tokens so the build's
# word indices hold. Writes the chars format build.mjs reads ({"chars":[{c,s,e}]}).
# Usage: .venv-tts/bin/python tools/words.py <audio> <script.txt> <out.json>
import difflib, json, re, sys
import os, subprocess, tempfile
import soundfile as sf
from faster_whisper import WhisperModel

audio, script, out = sys.argv[1:4]
toks = re.sub(r'\[[^\]]*\]', '', open(script).read()).split()
norm = lambda w: re.sub(r'[^a-z0-9]', '', w.lower())
model = WhisperModel('base.en', device='cpu', compute_type='int8')
tmp = tempfile.mktemp(suffix='.wav')
subprocess.run([os.path.expanduser('~/repos/bulkhead-studio/bin/ffmpeg'), '-v', 'error', '-y', '-i', audio, '-ac', '1', '-ar', '16000', tmp], check=True)
pcm, _sr = sf.read(tmp, dtype='float32')
segs, _ = model.transcribe(pcm, word_timestamps=True, initial_prompt='Bulkhead, IOMMU, GPU, Nemotron, SpacetimeDB, Sentry, Triage, Warden, Scribe')
heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
# split heard acronyms like "GPU" / "IOMMU" / "DB" into letters to match "G. P. U." tokens
hx = []
for w, s, e in heard:
    n = norm(w)
    if n in ('gpu', 'iommu', 'db') or (n.endswith('db') and n != 'db'):
        if n.endswith('db') and n != 'db':
            hx.append((n[:-2], s, s + (e - s) * 0.6)); n = 'db'; s = s + (e - s) * 0.6
        L = len(n)
        for k, ch in enumerate(n): hx.append((ch, s + (e - s) * k / L, s + (e - s) * (k + 1) / L))
    else:
        hx.append((n, s, e))
A = [norm(t) for t in toks]; B = [h[0] for h in hx]
times = [None] * len(toks)
for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, A, B, autojunk=False).get_opcodes():
    if tag in ('equal', 'replace'):
        for k in range(i2 - i1):
            j = j1 + min(k, j2 - j1 - 1) if j2 > j1 else None
            if j is not None: times[i1 + k] = (hx[j][1], hx[j][2])
# fill gaps by interpolation
for i, tm in enumerate(times):
    if tm is None:
        p = next((times[k] for k in range(i - 1, -1, -1) if times[k]), (0, 0))
        n = next((times[k] for k in range(i + 1, len(times)) if times[k]), (p[1] + 0.3, p[1] + 0.6))
        times[i] = (p[1], max(p[1] + 0.05, n[0]))
chars = []
for t, (s, e) in zip(toks, times):
    L = max(1, len(t))
    for k, ch in enumerate(t): chars.append({'c': ch, 's': round(s + (e - s) * k / L, 3), 'e': round(s + (e - s) * (k + 1) / L, 3)})
    chars.append({'c': ' ', 's': round(e, 3), 'e': round(e, 3)})
json.dump({'chars': chars}, open(out, 'w'))
miss = sum(1 for a in A if a not in B)
print('tokens', len(toks), 'heard', len(B), 'unmatched-ish', miss, 'end', round(times[-1][1], 2))
