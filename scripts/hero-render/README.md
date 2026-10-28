# Scroll story frames

Each product line's scroll story (src/components/site/ScrollStory.tsx, copy in
src/lib/scroll-stories.ts) plays frames rendered from a three.js scene in scenes/: geogrid (also the
home page), geomembrane, geotextile and geocell. scenes/stage.js holds the shared lighting and
camera; scenes/lib.js the textures, stones, sheets and grass.

    npm i                                   # three, in this folder only
    node server.cjs &                       # serves this folder on :4321
    ./render-all.sh                         # all four scenes, or name some: ./render-all.sh geocell

render-all.sh renders 72 landscape (1280x720) and 72 portrait (720x1280) frames per scene into out/
and encodes them to public/hero/<scene>/<land|port>/000..071.webp. Test stills of one scene:

    node shoot-hero.cjs 1280 720 stills out/test geomembrane

If the repo's Playwright has no browser of its own, point CHROME_PATH at an installed Chromium.
Keep the frame counts in src/lib/hero-frames.ts in step. A scene takes about five minutes without a GPU.
