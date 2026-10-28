#!/bin/bash
# encode-hero.sh <scene> <set> <quality> <frames> <width>: <frames> evenly spaced out/<scene>-<set>/f*.png
# (first and last included) -> repo public/hero/<scene>/<set>/NNN.webp
set -e
cd "$(dirname "$0")"
scene=$1; set=$2; q=${3:-60}; n=${4:-72}; w=${5:-1280}; dst=../../public/hero/$scene/$set
mkdir -p $dst; rm -f $dst/*.webp
files=($(ls out/$scene-$set/f*.png | sort)); total=${#files[@]}
for ((i=0; i<n; i++)); do
  k=$(( (i * (total - 1) * 2 + (n - 1)) / (2 * (n - 1)) ))
  ffmpeg -y -loglevel error -i ${files[$k]} -vf scale=$w:-2 -c:v libwebp -quality $q -compression_level 6 $dst/$(printf %03d $i).webp
done
du -sh $dst; ls $dst | wc -l
