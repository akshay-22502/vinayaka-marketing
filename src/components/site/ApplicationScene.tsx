import type { CSSProperties, ReactNode } from "react";

/*
 * Animated cross-sections, one per starter application, shown instead of the default image
 * until a photo is uploaded. Each scene builds itself in the order the work is done on site,
 * with our products in orange and labelled, then keeps one small loop going (traffic, water,
 * rain). The animation classes (sc-*) live in globals.css and only run once ScrollReveal marks
 * the scene as in view; without JavaScript, or with reduced motion, the finished drawing shows.
 */

const W = 320;
const H = 180;
// The drawings sit low in their 320 x 180 frame, so the view starts TOP units down to trim the
// empty sky, and ground fills run down to BOTTOM to cover the frame.
const TOP = 24;
const BOTTOM = H + TOP;

const C = {
  soil: "#b88c5d",
  soilDark: "#9c7246",
  grass: "#79b85f",
  aggregate: "#aeb2b8",
  stone: "#8a8f96",
  asphalt: "#3f4651",
  block: "#d5d9de",
  water: "#4c8fd6",
  waste: "#7d7a72",
  membrane: "#d97a3a",
  textile: "#f4e2c8",
  grid: "#f0a56e",
};

/** Delay, in seconds, for one animated piece. */
const d = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

/** A small dark tag with a leader line to the point it names. */
function Tag({ x, y, to, text, delay }: { x: number; y: number; to: [number, number]; text: string; delay: number }) {
  const w = text.length * 5.2 + 12;
  return (
    <g className="sc-fade" style={d(delay)}>
      <line x1={x + w / 2} y1={y} x2={to[0]} y2={to[1]} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.8" />
      <circle cx={to[0]} cy={to[1]} r="1.6" fill="#ffffff" />
      <rect x={x} y={y - 8} width={w} height="16" rx="3" fill="#0f172a" fillOpacity="0.85" />
      <text x={x + w / 2} y={y + 3} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#ffffff">
        {text}
      </text>
    </g>
  );
}

/** A scatter of stones over a box, the same every render. */
function Stones({ x, y, w, h, n }: { x: number; y: number; w: number; h: number; n: number }) {
  const stones = [];
  for (let i = 0; i < n; i++) {
    const sx = x + ((i * 37) % 100) / 100 * w;
    const sy = y + ((i * 61) % 100) / 100 * h;
    stones.push(<circle key={i} cx={sx} cy={sy} r={1 + ((i * 13) % 10) / 10} fill={C.stone} />);
  }
  return <>{stones}</>;
}

function Truck({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="-22" width="34" height="16" rx="1.5" fill="#e2e8f0" />
      <path d="M34,-16 h9 l5,6 v4 h-14 z" fill={C.membrane} />
      <circle cx="8" cy="-4" r="4" fill="#1e293b" />
      <circle cx="38" cy="-4" r="4" fill="#1e293b" />
    </g>
  );
}

function Roads() {
  return (
    <>
      <rect x="0" y="118" width={W} height={BOTTOM - 118} fill={C.soil} />
      <rect className="sc-drop" style={d(0.9)} x="0" y="96" width={W} height="22" fill={C.aggregate} />
      <g className="sc-drop" style={d(0.9)}>
        <Stones x={4} y={99} w={W - 8} h={16} n={60} />
      </g>
      <line className="sc-draw" style={d(0.2)} x1="0" y1="118" x2={W} y2="118" pathLength={1} stroke={C.textile} strokeWidth="3" />
      <line className="sc-grow-x" style={d(0.6)} x1="0" y1="108" x2={W} y2="108" stroke={C.grid} strokeWidth="2.5" strokeDasharray="5 2" />
      <rect className="sc-drop" style={d(1.4)} x="0" y="86" width={W} height="10" fill={C.asphalt} />
      <g className="sc-drive" style={d(2.2)}>
        <Truck x={140} y={86} />
      </g>
      <Tag x={16} y={146} to={[60, 118]} text="Geotextile separates" delay={1} />
      <Tag x={186} y={146} to={[230, 108]} text="Geogrid reinforces" delay={1.2} />
    </>
  );
}

function Slopes() {
  const lifts = [0, 1, 2, 3];
  return (
    <>
      <rect x="0" y="140" width={W} height={BOTTOM - 140} fill={C.soil} />
      <rect x="0" y="136" width="70" height="4" fill={C.grass} />
      {lifts.map((i) => {
        const y = 120 - i * 20;
        const t = 0.3 + i * 0.6;
        return (
          <g key={i}>
            <rect className="sc-drop" style={d(t + 0.15)} x="84" y={y} width={W - 84} height="20" fill={i % 2 ? C.soil : C.soilDark} />
            <rect className="sc-drop" style={d(t)} x="70" y={y} width="14" height="20" fill={C.block} stroke="#94a3b8" strokeWidth="0.6" />
            <line className="sc-grow-x" style={d(t + 0.4)} x1="80" y1={y + 0.5} x2="250" y2={y + 0.5} stroke={C.grid} strokeWidth="2.5" strokeDasharray="5 2" />
          </g>
        );
      })}
      <rect className="sc-fade" style={d(2.8)} x="70" y="56" width={W - 70} height="4" fill={C.grass} />
      <Tag x={176} y={40} to={[200, 80.5]} text="Geogrid layers" delay={2.4} />
      <Tag x={8} y={88} to={[77, 90]} text="Wall facing" delay={2.6} />
    </>
  );
}

// Pit outline for the landfill and pond, inset by `i` so liners can sit inside each other.
const pit = (top: number, bottom: number, x1: number, x2: number, b1: number, b2: number, i = 0) =>
  `M${x1 + i},${top} L${b1 + i * 0.6},${bottom - i} L${b2 - i * 0.6},${bottom - i} L${x2 - i},${top}`;

function Landfill() {
  return (
    <>
      <path d={`M0,80 L80,80 L120,145 L200,145 L240,80 L${W},80 V${BOTTOM} H0 Z`} fill={C.soil} />
      <rect x="0" y="76" width="80" height="4" fill={C.grass} />
      <rect x="240" y="76" width="80" height="4" fill={C.grass} />
      <path className="sc-draw" style={d(0.2)} d={pit(80, 145, 80, 240, 120, 200, 1.5)} pathLength={1} fill="none" stroke={C.membrane} strokeWidth="3.5" />
      <path className="sc-draw" style={d(1)} d={pit(80, 145, 80, 240, 120, 200, 5)} pathLength={1} fill="none" stroke={C.textile} strokeWidth="2.5" />
      <path className="sc-grow-y" style={d(1.8)} d="M87,80 L124,139 L196,139 L233,80 Q160,52 87,80 Z" fill={C.waste} />
      <path className="sc-draw" style={d(2.6)} d="M84,79 Q160,48 236,79" pathLength={1} fill="none" stroke={C.membrane} strokeWidth="3" />
      <path className="sc-fade" style={d(3.1)} d="M82,77 Q160,44 238,77 Q160,52 82,77 Z" fill={C.grass} />
      <Tag x={214} y={160} to={[218, 112]} text="Geomembrane liner" delay={1} />
      <Tag x={14} y={160} to={[103, 112]} text="Geotextile" delay={1.6} />
      <Tag x={112} y={40} to={[160, 58]} text="Capping liner" delay={3} />
    </>
  );
}

function Ponds() {
  return (
    <>
      <path d={`M0,70 L60,70 L110,140 L210,140 L260,70 L${W},70 V${BOTTOM} H0 Z`} fill={C.soil} />
      <rect x="0" y="66" width="56" height="4" fill={C.grass} />
      <rect x="264" y="66" width="56" height="4" fill={C.grass} />
      <path className="sc-draw" style={d(0.2)} d={`M44,68.5 L61.5,68.5 ${pit(70, 140, 60, 260, 110, 210, 1.5).replace("M", "L")} L276,68.5`} pathLength={1} fill="none" stroke={C.membrane} strokeWidth="3.5" />
      <path className="sc-grow-y" style={d(1.3)} d="M69,82 L112,138 L208,138 L251,82 Z" fill={C.water} fillOpacity="0.9" />
      <g className="sc-fade" style={d(2.2)}>
        <path className="sc-wave" style={d(2.2)} d="M60,84 q8,-3 16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0" fill="none" stroke="#bfdbfe" strokeWidth="1.2" />
      </g>
      <Tag x={180} y={44} to={[236, 70]} text="Geomembrane lining" delay={1} />
      <Tag x={120} y={160} to={[160, 140]} text="No seepage" delay={2.4} />
    </>
  );
}

function Erosion() {
  // Along the slope from the toe (90,150) to the crest (250,60).
  const angle = (Math.atan2(-90, 160) * 180) / Math.PI;
  const length = Math.hypot(160, 90);
  const cells = 8;
  const cellW = length / cells;
  const drops = [40, 110, 170, 230, 290, 75, 205, 140];
  return (
    <>
      <path d={`M0,150 L90,150 L250,60 L${W},60 V${BOTTOM} H0 Z`} fill={C.soil} />
      <rect x="0" y="146" width="90" height="4" fill={C.grass} />
      <rect x="250" y="56" width="70" height="4" fill={C.grass} />
      <g transform={`translate(90 150) rotate(${angle})`}>
        {Array.from({ length: cells }, (_, i) => (
          <rect
            key={i}
            className="sc-pop"
            style={d(0.2 + i * 0.12)}
            x={i * cellW}
            y="-9"
            width={cellW}
            height="9"
            fill="#c9a476"
            stroke={C.membrane}
            strokeWidth="1.6"
          />
        ))}
        {Array.from({ length: cells * 2 }, (_, i) => (
          <path
            key={i}
            className="sc-grow-y"
            style={d(1.4 + i * 0.05)}
            d={`M${i * (cellW / 2) + 3},-9 l2,-6 l2,6 l2,-5 l2,5 z`}
            fill={C.grass}
          />
        ))}
      </g>
      {drops.map((x, i) => (
        <line key={i} className="sc-rain" style={d(2.4 + (i % 4) * 0.35)} x1={x} y1="0" x2={x - 3} y2="8" stroke="#bfdbfe" strokeOpacity="0.7" strokeWidth="1" />
      ))}
      <Tag x={180} y={150} to={[175, 100]} text="Geocell holds the soil" delay={1.2} />
    </>
  );
}

function Railways() {
  const sleepers = Array.from({ length: 9 }, (_, i) => 84 + i * 18);
  return (
    <>
      <rect x="0" y="135" width={W} height={BOTTOM - 135} fill={C.soil} />
      <line className="sc-draw" style={d(0.2)} x1="0" y1="135" x2={W} y2="135" pathLength={1} stroke={C.textile} strokeWidth="3" />
      <path className="sc-drop" style={d(0.8)} d="M50,135 L270,135 L240,103 L80,103 Z" fill={C.aggregate} />
      <g className="sc-drop" style={d(0.8)}>
        <Stones x={70} y={107} w={180} h={25} n={45} />
      </g>
      <line className="sc-grow-x" style={d(0.5)} x1="60" y1="124" x2="260" y2="124" stroke={C.grid} strokeWidth="2.5" strokeDasharray="5 2" />
      {sleepers.map((x, i) => (
        <rect key={x} className="sc-drop" style={d(1.3 + i * 0.06)} x={x} y="97" width="9" height="6" fill="#64748b" />
      ))}
      <rect className="sc-grow-x" style={d(2)} x="70" y="93" width="180" height="4" fill="#cbd5e1" />
      <g className="sc-drive" style={d(2.6)}>
        <g transform="translate(110 93)">
          <rect x="0" y="-26" width="70" height="22" rx="3" fill={C.membrane} />
          <rect x="6" y="-21" width="12" height="8" fill="#e2e8f0" />
          <rect x="24" y="-21" width="12" height="8" fill="#e2e8f0" />
          <rect x="42" y="-21" width="12" height="8" fill="#e2e8f0" />
          <circle cx="12" cy="-3" r="3.5" fill="#1e293b" />
          <circle cx="58" cy="-3" r="3.5" fill="#1e293b" />
        </g>
      </g>
      <Tag x={16} y={158} to={[40, 135]} text="Geotextile" delay={1} />
      <Tag x={200} y={158} to={[240, 124]} text="Geogrid in ballast" delay={1.2} />
    </>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  "roads-and-pavements": Roads,
  "slopes-and-retaining-walls": Slopes,
  "landfills-and-containment": Landfill,
  "ponds-and-canals": Ponds,
  "erosion-control": Erosion,
  railways: Railways,
};

export function hasApplicationScene(slug: string): boolean {
  return slug in SCENES;
}

/** The animated cross-section for a starter application; fills its parent, which sets the size. */
export function ApplicationScene({ slug }: { slug: string }) {
  const Scene = SCENES[slug];
  if (!Scene) return null;
  return (
    <div data-scene="" className="absolute inset-0 bg-gradient-to-b from-[#2b4a80] to-[#1f3563]">
      <svg viewBox={`0 ${TOP} ${W} ${H}`} className="h-full w-full" aria-hidden="true" focusable="false">
        <Scene />
      </svg>
    </div>
  );
}
