# Fallen Midway sign navigation regression

The Midway EXIT sign remains fallen when a path makes the source scene inert, throughout the departure transition, and after returning. The arm stops when leaving and does not replay after a knockdown. Leaving before contact still cancels the animation and permits a new visit. Leaving during the fall settles the sign on the ground.

Verification: `verify-navigation-state.cjs` exercises every declared path and functional destination sign: 16 directed edges across all seven scenes, with 37 transitions per layout on desktop/adults and mobile/kids. It samples the Midway sign during every transition, checks return persistence beyond the 12-second start window, toggles reduced motion, and activates the fallen EXIT by keyboard. Additional cases cover pre-contact cancellation, departure during the fall, and a failed destination image load. Results are in `navigation-state-results.json`.

The original module was separately replayed with the same Ferris Wheel departure and reproduced the upright reset. The existing sign-flick regression now returns through the actual Tent Row path and checks the appropriate upright or fallen state.

Run with `PLAYWRIGHT_MODULE` and optional `BROWSER_PATH`, `DREAMSCAPES_URL`, `CARNIVAL_PATH`, and `DREAMSCAPES_EVIDENCE_DIR`. The default target is the local development server; set `CARNIVAL_PATH=/carnival/` for the deployed site.
