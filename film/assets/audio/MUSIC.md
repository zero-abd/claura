# Music bed (ElevenLabs Music, take A)
- File: assets/audio/music-src-a.mp3. 122.0 s long, 120 BPM, first downbeat (phase) at 0.485 s, so bars fall at 0.485 + 2k s.
- Analysis comes from bulkhead-studio/tools/beats.py, averaged per bar.
- Cut on bar lines with bulkhead-studio/tools/music_edit.py, which takes segments, breaks and a tail as JSON.

| Section | Time (s) | What happens |
|---|---|---|
| Cold open | 0–12.5 | Low pulse, energy flat |
| Riser | 12.5–16.5 | High band climbs from 41 to 48 |
| Drop | ≈16.5 | Full groove begins; use for the product reveal |
| Groove | 16.5–62.5 | Steady, small lifts at 24.5 and 46.5 |
| One-bar dropout | 62.5 | Near-silent (lo 11) |
| Hit | 64.485 | Strong re-entry; use as the PAYOFF ("Contained/Sealed") |
| Groove | 64.5–78.5 | Steady |
| Second dropout | 78.5 | Near-silent |
| Hit | 80.485 | Re-entry (second accent, e.g. War Room or Secure Shell reveal) |
| Groove | 80.5–112.5 | Builds slightly, peak around 104–110 |
| Final hit and ring-out | ≈112.5–116.5 | Final hit lands about 112.5; silence after about 116.5 |

To align: shift the music so the VO payoff word lands on 64.485 (or edit bars out or in with music_edit.py). Duck the music about 6–8 dB under the voice.
