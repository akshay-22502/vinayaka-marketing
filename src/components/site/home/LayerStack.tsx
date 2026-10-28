import type { CSSProperties } from "react";

/*
 * The hero's exploded road build-up, drawn as isometric slabs in SVG so each layer can move on
 * its own. On load the layers drop in from the subgrade up (the order they are laid on site) and
 * each label slides in as its layer lands; then the four geosynthetic layers take turns lifting
 * out while a caption says where that product is used. All of it is CSS (globals.css, "Hero
 * layer stack"), so there is no client JavaScript, and with reduced motion the finished stack is
 * shown still.
 */

type Layer = {
  key: string;
  name: string;
  role: string;
  /** Slab thickness, in viewBox units. */
  thickness: number;
  /** Where it is used; only the geosynthetic layers have one and take part in the highlight loop. */
  usedIn?: string;
};

// Top to bottom, as they sit in the road.
const LAYERS: Layer[] = [
  { key: "road", name: "Road surface", role: "Carries the traffic", thickness: 12 },
  { key: "aggregate", name: "Aggregate base", role: "Crushed stone", thickness: 22 },
  {
    key: "geogrid",
    name: "Geogrid",
    role: "Reinforces the base",
    thickness: 2,
    usedIn: "road bases, railway track beds and retaining walls",
  },
  {
    key: "geocell",
    name: "Geocell",
    role: "Confines the fill",
    thickness: 18,
    usedIn: "slope protection, load support on soft soil and channel lining",
  },
  {
    key: "geotextile",
    name: "Geotextile",
    role: "Separates and filters",
    thickness: 3,
    usedIn: "separation under roads, drainage and erosion control",
  },
  {
    key: "geomembrane",
    name: "Geomembrane",
    role: "Seals out water",
    thickness: 3,
    usedIn: "landfill liners, ponds, canals and tanks",
  },
  { key: "soil", name: "Subgrade", role: "The natural ground", thickness: 34 },
];

// Slightly flattened isometric geometry. Each slab's top face is a 100 x 100 square mapped onto a
// rhombus 2 * HALF wide and DEPTH tall; STEP is the vertical gap between slab tops when exploded.
const VIEW_W = 320;
const CX = VIEW_W / 2;
const HALF = 150;
const FLAT = 0.42;
const DEPTH = 2 * HALF * FLAT;
const SCALE = HALF / 100;
const STEP = 56;
const PAD = 10;
const VIEW_H = PAD + (LAYERS.length - 1) * STEP + DEPTH + LAYERS[LAYERS.length - 1].thickness + PAD;

/** Seconds: when the last layer has landed, and how long each product stays lifted. */
const ASSEMBLED_S = 2.2;
const FOCUS_S = 3;

type Faces = { top: string; left: string; right: string };

const FACES: Record<string, Faces> = {
  road: { top: "url(#ls-road)", left: "#2a2f37", right: "#363c46" },
  aggregate: { top: "url(#ls-aggregate)", left: "#8d9299", right: "#a2a6ac" },
  geogrid: { top: "url(#ls-geogrid)", left: "#111827", right: "#1f2937" },
  geocell: { top: "url(#ls-geocell)", left: "url(#ls-geocell-side-l)", right: "url(#ls-geocell-side-r)" },
  geotextile: { top: "url(#ls-geotextile)", left: "#c4cad2", right: "#d9dde3" },
  geomembrane: { top: "url(#ls-geomembrane)", left: "#0d0f12", right: "#181b20" },
  soil: { top: "url(#ls-soil)", left: "url(#ls-soil-side-l)", right: "url(#ls-soil-side-r)" },
};

function Slab({ y, thickness, faces }: { y: number; thickness: number; faces: Faces }) {
  const l = CX - HALF;
  const r = CX + HALF;
  const mid = y + DEPTH / 2;
  const bottom = y + DEPTH;
  const t = thickness;
  return (
    <>
      <polygon points={`${l},${mid} ${CX},${bottom} ${CX},${bottom + t} ${l},${mid + t}`} fill={faces.left} />
      <polygon points={`${CX},${bottom} ${r},${mid} ${r},${mid + t} ${CX},${bottom + t}`} fill={faces.right} />
      <g transform={`matrix(${SCALE} ${SCALE * FLAT} ${-SCALE} ${SCALE * FLAT} ${CX} ${y})`}>
        <rect width="100" height="100" fill={faces.top} stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
      </g>
    </>
  );
}

/** Hexagon outline (pointy top) centred on x, y. */
function hex(x: number, y: number, r: number) {
  const w = (Math.sqrt(3) / 2) * r;
  return `M${x},${y - r} L${x + w},${y - r / 2} L${x + w},${y + r / 2} L${x},${y + r} L${x - w},${y + r / 2} L${x - w},${y - r / 2} Z`;
}

// Crushed stone: x, y, radius, colour, scattered over a 20 x 20 tile.
const STONES: [number, number, number, string][] = [
  [2.5, 3, 2.2, "#d9dbde"],
  [8, 2, 1.5, "#8e939a"],
  [13.5, 4, 2.4, "#e6e7e9"],
  [18.5, 2.5, 1.3, "#7f848b"],
  [5, 8.5, 1.8, "#9da1a7"],
  [10.5, 8, 2.3, "#c9ccd0"],
  [16.5, 9.5, 1.9, "#eceded"],
  [1.5, 13.5, 1.6, "#868b92"],
  [7, 14, 2.4, "#e1e3e5"],
  [12.5, 13.5, 1.4, "#80858c"],
  [17, 15.5, 2.1, "#bfc2c6"],
  [3.5, 18.5, 1.5, "#cfd2d5"],
  [10, 18.5, 1.8, "#959aa1"],
  [15, 19.5, 1.2, "#dfe1e3"],
];

const HEX_R = 6;
const HEX_W = Math.sqrt(3) * HEX_R;
const HEX_H = 3 * HEX_R;

function Patterns() {
  return (
    <defs>
      <pattern id="ls-road" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="#424954" />
        {[6, 28, 50, 72].map((x) => (
          <rect key={x} x={x} y="48.5" width="12" height="3" fill="#f8fafc" />
        ))}
      </pattern>
      <pattern id="ls-aggregate" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#aeb2b8" />
        {STONES.map(([x, y, r, fill], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.8} fill={fill} />
        ))}
      </pattern>
      <pattern id="ls-geogrid" width={100 / 12} height={100 / 12} patternUnits="userSpaceOnUse">
        <rect width={100 / 12} height="1.5" fill="#111827" />
        <rect width="1.5" height={100 / 12} fill="#111827" />
      </pattern>
      <pattern id="ls-geocell" width={HEX_W} height={HEX_H} patternUnits="userSpaceOnUse">
        <rect width={HEX_W} height={HEX_H} fill="#c9bfae" />
        <path
          d={[
            hex(HEX_W / 2, HEX_R, HEX_R),
            hex(0, 2.5 * HEX_R, HEX_R),
            hex(HEX_W, 2.5 * HEX_R, HEX_R),
            hex(0, -0.5 * HEX_R, HEX_R),
            hex(HEX_W, -0.5 * HEX_R, HEX_R),
          ].join(" ")}
          fill="none"
          stroke="#e08a45"
          strokeWidth="1.4"
        />
      </pattern>
      <pattern id="ls-geocell-side-l" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#c06a2e" />
        <circle cx="4" cy="4" r="0.9" fill="#8f4a1c" />
      </pattern>
      <pattern id="ls-geocell-side-r" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#d97a3a" />
        <circle cx="4" cy="4" r="0.9" fill="#a8531a" />
      </pattern>
      <pattern id="ls-geotextile" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#eef0f3" />
        <path d="M0,3 L12,5 M2,0 L4,12 M0,9 L12,8 M8,0 L9,12" stroke="#d5dae1" strokeWidth="0.5" />
      </pattern>
      <linearGradient id="ls-geomembrane" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1b1e23" />
        <stop offset="0.45" stopColor="#3b414a" />
        <stop offset="0.55" stopColor="#2a2f36" />
        <stop offset="1" stopColor="#15181c" />
      </linearGradient>
      <pattern id="ls-soil" width="9" height="9" patternUnits="userSpaceOnUse">
        <rect width="9" height="9" fill="#b88c5d" />
        <circle cx="2" cy="2" r="0.9" fill="#9c7246" />
        <circle cx="6.5" cy="5" r="0.7" fill="#d0a878" />
        <circle cx="3.5" cy="7.5" r="0.6" fill="#8f6640" />
      </pattern>
      <pattern id="ls-soil-side-l" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#8c6741" />
        <circle cx="3" cy="3" r="0.8" fill="#6f5032" />
        <circle cx="8" cy="7" r="0.7" fill="#a47c52" />
      </pattern>
      <pattern id="ls-soil-side-r" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#a37a4e" />
        <circle cx="3" cy="3" r="0.8" fill="#866139" />
        <circle cx="8" cy="7" r="0.7" fill="#bb9364" />
      </pattern>
    </defs>
  );
}

type Vars = CSSProperties & Record<`--${string}`, string>;

export function LayerStack() {
  const count = LAYERS.length;
  let slot = 0;
  const rows = LAYERS.map((layer, index) => {
    const y = PAD + index * STEP;
    return {
      ...layer,
      y,
      // Built from the bottom up, so the subgrade lands first.
      order: count - 1 - index,
      slot: layer.usedIn ? slot++ : null,
      // Label sits level with the slab's right-hand corner, so the labels are evenly spaced.
      labelTop: ((y + DEPTH / 2) / VIEW_H) * 100,
    };
  });
  const cycle = `${slot * FOCUS_S}s`;

  const vars = (row: (typeof rows)[number]): Vars => ({
    "--order": String(row.order),
    "--focus-delay": row.slot === null ? "0s" : `${ASSEMBLED_S + row.slot * FOCUS_S}s`,
    "--focus-cycle": cycle,
  });

  return (
    <figure className="layer-stack mx-auto w-full max-w-md lg:max-w-none">
      <div className="relative grid grid-cols-[minmax(0,60%)_minmax(0,1fr)]">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full overflow-visible"
          aria-hidden="true"
          focusable="false"
        >
          <Patterns />
          {/* Painted bottom layer first, so the slabs above overlap the ones below. */}
          {[...rows].reverse().map((row) => (
            <g key={row.key} className="ls-drop" style={vars(row)}>
              <g className={row.slot === null ? undefined : "ls-focus"}>
                <Slab y={row.y} thickness={row.thickness} faces={FACES[row.key]} />
              </g>
            </g>
          ))}
        </svg>
        <ol className="relative" aria-label="Layers, top to bottom">
          {rows.map((row) => (
            <li
              key={row.key}
              className="ls-label absolute left-0 right-0 -translate-y-1/2 pl-3 sm:pl-4"
              style={{ ...vars(row), top: `${row.labelTop}%` }}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-px w-2 bg-white/50 sm:w-3"
              />
              <span
                className={`block text-xs font-semibold leading-tight sm:text-sm ${
                  row.slot === null ? "text-white/75" : "ls-label-name text-white"
                }`}
              >
                {row.name}
              </span>
              <span className="block text-[11px] leading-tight text-white/60 sm:text-xs">{row.role}</span>
            </li>
          ))}
        </ol>
      </div>
      {/* Where each product is used, one at a time in step with its layer lifting. Decorative
          repetition of the product pages, so hidden from screen readers and when motion is reduced. */}
      <figcaption className="relative mt-3 h-12 motion-reduce:hidden" aria-hidden="true">
        {rows
          .filter((row) => row.usedIn)
          .map((row) => (
            <p key={row.key} className="ls-caption absolute inset-x-0 top-0 text-sm text-white/85" style={vars(row)}>
              <span className="font-semibold text-orange">{row.name}</span>
              <span className="text-white/60"> is used in </span>
              {row.usedIn}
            </p>
          ))}
      </figcaption>
    </figure>
  );
}
