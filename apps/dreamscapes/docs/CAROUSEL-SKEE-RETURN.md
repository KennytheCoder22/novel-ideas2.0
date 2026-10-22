# Carousel mounts after Skee-Ball

The screenshot's broken Loveseat and White Horse are rendering failures, not missing model assets. The previous carousel used 16 WebGL contexts: one White Horse, fourteen other dedicated mounts, and one shared context for five mounts. The Midway arm and Mara bring the page to 18 before Skee-Ball adds its brass controls and clown. Browser warnings confirmed the oldest contexts were evicted.

All twenty mounts now use the existing shared offscreen WebGL renderer. Their individual transparent display canvases, model registrations, cameras, crop sizes, poles, materials and animation clocks remain unchanged. The carousel uses one context; the full Midway/carousel/Skee-Ball route peaks at five in verification. Skee-Ball's renderers also explicitly release their contexts on actual disposal (rooms remain cached across normal navigation to preserve gameplay).

verification/carousel-skee-return.cjs completes a real nine-ball game and clown sequence, returns to Rides & Games, and repeats the trip twice for each reader band. It verifies all twenty mounts share one context, have visible nonempty 2D display frames, retain their selected styles, and do not lose their graphics state. Eight round trips passed for Teens/Plain, Adults/Ornate, Kids/Stuffed and Pre-Teens/Stuffed. Separate phone verification exercises the same room return.

No GLBs, textures, scene art, placement or Skee-Ball game logic changed.
