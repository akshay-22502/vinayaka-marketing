# Home page hero frames

The scroll sequence on the home page (src/components/site/home/ScrollHero.tsx) is a three.js scene
(scenes/hero.js) rendered frame by frame in headless Chromium, then encoded to WebP.

    npm i                                   # three, in this folder only
    node server.cjs &                       # serves this folder on :4321
    node shoot-hero.cjs 1280 720 72 out/land
    node shoot-hero.cjs 720 1280 72 out/port
    ./encode-hero.sh land 60 72 1280        # -> public/hero/land/000..071.webp
    ./encode-hero.sh port 60 72 720         # -> public/hero/port/000..071.webp

`node shoot-hero.cjs 1280 720 stills out/s` renders a dozen test stills. Keep the frame counts in
src/lib/hero-frames.ts in step. Each set takes about five minutes without a GPU.
