// The scroll stories: a rendered 3D sequence per product line (frames in public/hero/<scene>/,
// rendered by scripts/hero-render) and the copy that fades in over it. `at` is the stretch of
// scroll progress (0..1) over which a line is on screen. The geogrid story opens the home page.

export type StoryScene = "geogrid" | "geomembrane" | "geotextile" | "geocell";

type Beat = { at: readonly [number, number]; title: string; text: string };
type Story = {
  beats: readonly Beat[];
  /** Closing line ("title" then "accent" in orange) and its buttons, the first one filled. */
  end: { title: string; accent: string; links: readonly { href: string; label: string }[] };
};

export const STORIES: Record<StoryScene, Story> = {
  // A roll unrolls, the camera dives to a junction, aggregate locks in, the road builds up.
  geogrid: {
    beats: [
      {
        at: [0.17, 0.33],
        title: "Every junction, engineered.",
        text: "Stiff ribs meet at integral junctions, so the grid keeps its shape when the load arrives.",
      },
      {
        at: [0.43, 0.6],
        title: "Stone locks in.",
        text: "Aggregate settles into the apertures and interlocks with the ribs. The base layer spreads load instead of shifting.",
      },
      {
        at: [0.64, 0.82],
        title: "Built in layers.",
        text: "Subgrade, a geotextile separator, the geogrid-reinforced base, then the surface course.",
      },
    ],
    end: {
      title: "Reinforce the base.",
      accent: "Build to last.",
      links: [
        { href: "/products/geogrid", label: "Explore geogrids" },
        { href: "/applications", label: "See applications" },
      ],
    },
  },
  // Liner panels unroll into a pond, the seams are welded, water fills the basin.
  geomembrane: {
    beats: [
      {
        at: [0.12, 0.3],
        title: "Lines the ground.",
        text: "Wide polyethylene panels roll out across the floor and up the slopes in one continuous sheet.",
      },
      {
        at: [0.4, 0.6],
        title: "Every seam, welded.",
        text: "Overlaps are fused on site into a single barrier, with no gaps for liquid to find.",
      },
      {
        at: [0.66, 0.84],
        title: "Holds what matters.",
        text: "Water, leachate and process liquids stay in. The ground and groundwater stay clean.",
      },
    ],
    end: {
      title: "Contain it.",
      accent: "For good.",
      links: [
        { href: "/quote", label: "Request a quote" },
        { href: "/applications/landfills-and-containment", label: "Containment uses" },
      ],
    },
  },
  // A nonwoven roll unrolls over soil, the camera dives into the fibres, stone goes on top,
  // and water drains down through stone and fabric.
  geotextile: {
    beats: [
      {
        at: [0.24, 0.42],
        title: "Fibre by fibre.",
        text: "A felt of fine polymer fibres: strong, permeable and tough enough to take construction traffic.",
      },
      {
        at: [0.44, 0.6],
        title: "Keeps layers apart.",
        text: "Clean stone stays clean. Soft soil cannot pump up into the base and weaken it.",
      },
      {
        at: [0.64, 0.84],
        title: "Lets water through.",
        text: "Water drains down through the fabric while the soil stays in place.",
      },
    ],
    end: {
      title: "Separate. Filter.",
      accent: "Protect.",
      links: [
        { href: "/quote", label: "Request a quote" },
        { href: "/applications/roads-and-pavements", label: "Road uses" },
      ],
    },
  },
  // A collapsed panel stretches into a honeycomb, the cells fill with soil, grass grows through.
  geocell: {
    beats: [
      {
        at: [0.1, 0.3],
        title: "Opens in seconds.",
        text: "A compact panel stretches out on site into a three-dimensional honeycomb.",
      },
      {
        at: [0.34, 0.5],
        title: "Every cell confines.",
        text: "Perforated walls hold the infill in place and let water pass between the cells.",
      },
      {
        at: [0.56, 0.86],
        title: "Green, stable ground.",
        text: "Filled with soil, sand or stone, the cells carry load, hold slopes and let vegetation take root.",
      },
    ],
    end: {
      title: "Confine the fill.",
      accent: "Hold the ground.",
      links: [
        { href: "/quote", label: "Request a quote" },
        { href: "/applications/erosion-control", label: "Erosion control" },
      ],
    },
  },
};

/** The scroll story for a product line, if it has one. */
export function storyFor(categorySlug: string): StoryScene | null {
  return categorySlug in STORIES ? (categorySlug as StoryScene) : null;
}
