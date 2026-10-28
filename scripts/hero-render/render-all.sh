#!/bin/bash
# render-all.sh [scene...]: render and encode both frame sets of each scene (default: all four).
set -e
cd "$(dirname "$0")"
scenes=${@:-geogrid geomembrane geotextile geocell}
for s in $scenes; do
  node shoot-hero.cjs 1280 720 72 out/$s-land $s
  node shoot-hero.cjs 720 1280 72 out/$s-port $s
  ./encode-hero.sh $s land 60 72 1280
  ./encode-hero.sh $s port 60 72 720
done
