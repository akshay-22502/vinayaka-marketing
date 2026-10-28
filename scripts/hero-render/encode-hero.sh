#!/bin/bash
# encode-hero.sh <set> <quality> <frames> <width>: <frames> evenly spaced out/<set>/f*.png (first and last
# included) -> repo public/hero/<set>/NNN.webp
set -e
cd "$(dirname "$0")"
set=$1; q=${2:-60}; n=${3:-70}; w=${4:-1280}; dst=../../public/hero/$set
mkdir -p $dst; rm -f $dst/*.webp
files=($(ls out/$set/f*.png | sort)); total=${#files[@]}
for ((i=0; i<n; i++)); do
  k=$(( (i * (total - 1) * 2 + (n - 1)) / (2 * (n - 1)) ))
  ffmpeg -y -loglevel error -i ${files[$k]} -vf scale=$w:-2 -c:v libwebp -quality $q -compression_level 6 $dst/$(printf %03d $i).webp
done
du -sh $dst; ls $dst | wc -l
