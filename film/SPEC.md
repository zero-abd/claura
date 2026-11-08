GOAL:    a HackUTD judge understands in one viewing: when an AI workload escapes its VM and the attacker already owns email,
         phones and the file share, Claura (the immune system for AI data centers) contains it from outside the network,
         with policy, not the model, deciding and a human on the one high-impact step.
OUTPUT:  HyperFrames, 1920x1080, 30 fps, 118.0 s (VO 0.05-113.95 s, end card held to 118.0).
TIME:    the voice is the clock (assets/vo/vo.json, phrase-cued scenes in film.config.mjs). Music 120 BPM, bars at 0.485 + 2k s:
         drop 22.485 ("This is Claura"), payoff hit 60.485 (the Command-Enter press), hit 76.485 (the break-glass code), final bar
         110.485 (the app icon lands). Music volume 0.5, ducked -7 dB under the voice (-3 dB for 0.9 s after each hit).
LOOK:    Liquid Glass, matched to the product (bulkhead/src/style.css): a deep wallpaper (#05070d with blue #2642D6, violet #7434DE,
         teal #109CBA and magenta blobs that drift in film time, 8% grain, vignette), glass panes = backdrop blur 34 px + saturate 1.9,
         a specular top edge, a 1.5 px inner rim and a layered shadow; radius 28-40 px. Ink white 97% / 74% / 54%.
         Type: Inter 500/600 as the SF stand-in, tight tracking (-0.02 to -0.05 em); reading text >= 28 px; captions 46 px on a
         dark scrim sized to the line. Signal orange #FF5A1F = brand and breach (one accent per frame, the hot word, stamps,
         the breach rack); sealed green #2FBF71 only for contained (the orb, the counter, the contained tone). The ground's tone
         follows the incident: nominal (blue), breach (an ember light top right), contained (a green light), as a 1 s colour flood.
         The logo is never given a glow: the light is on the ground behind it.
OBJECTS: the product's own screens in a macOS window with glass chrome (real screen recordings, time-mapped; 16:10, >= 79% of the
         frame width, pushed in 1.6-2.4x so reading text is >= 26 px); the DFW-2 facility in 3D (bulkhead-3d, live three.js);
         glass panes for the motion-graphic beats (mail, phone, file share, six tool windows, a playbook card, the out-of-band
         diagram, the policy gate, two consoles on SpacetimeDB, a network of AI clouds); the Cradle mark, the app icon, the lockup.
MOTION:  arrivals expo.out 0.45-0.6 s (scale 0.94 -> 1 with blur 10 -> 0); camera power2.inOut 0.5-0.9 s; exits power3.in
         0.2-0.3 s; words blur in on the voice's own word times; focus rings land 0.28 s expo.out; stamps slam power4.in 0.16 s
         plus a 2-frame shake; count-up 1.4 s expo.out; key press 0.06 s down, 0.16 s up, on the music hit.
TRANSITIONS (5 kinds, each caused by an object): morph (a glass pane becomes the next pane), zoom through (a tile or row's
         fill grows into the next world), iris (from the clicked/pressed point), whip (between app screens), cut (matched carries:
         the chips into the tools, the fragments into the orb, the mark into the command pane; continuous camera on one screen).
SHOTS:   see review/FILM-NOTES.md (scene table with times, stills vs clips).
BANNED:  a small window floating in a void; product UI tilted in 3D; a title over a dimmed screenshot; the logo docked in a
         corner; glow/neon on the logo; every element fading and sliding up; HUD brackets; three cards in a row; invented UI
         presented as the product (the gate, sync and network beats are labelled diagrams); unlabelled demo numbers.
QA:      frame 0 shows the mail window; every product shot >= 79% of the frame width; the Command-Enter keys press on 60.485;
         "Contained" + 9.4 s lands with "in our simulation"; the app icon lands on 110.485 and the end card holds >= 4 s.
