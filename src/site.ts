export const site = {
  title: "Kyle James Walker",
  brand: { pre: "kyle", mid: "james", post: "walker" },

  headline: ["Open source", "apps, tools", "and libraries."],
  headlineAccentIndex: 0,
  tagline:
    "Browser tools for laser cutters and paper. Rust binaries. Python libraries.",

  description:
    "Open source apps, tools and libraries by Kyle James Walker. Browser tools for laser cutters and paper, Rust binaries, and Python libraries.",

  hero: {
    alt: "Sugar cubes stacked into a cube, lit green, blue and orange against black.",
  },

  about: {
    heading: "About",
    body: [
      "Data engineer by day. The rest of the time I make things that cut, fold, print or present, usually because I wanted one and it did not exist.",
      "Everything here is open source and free to take. The browser apps run entirely on your machine, with no account and no upload.",
    ],
  },

  links: {
    github: "https://github.com/KyleJamesWalker",
    linkedin: "https://www.linkedin.com/in/kylejameswalker",
    email: "mailto:kyle@kylejameswalker.com",
  },

  repo: "https://github.com/KyleJamesWalker/KyleJamesWalker.github.io",
} as const;

export const nav = [
  { label: "Apps", href: "/apps/" },
  { label: "Projects", href: "/projects/" },
  { label: "About", href: "/about/" },
] as const;

/** Language tag colors. content.config.ts validates against these keys. */
export const languageColors = {
  Rust: "bg-orange text-surface",
  Python: "bg-cyan text-surface",
  TypeScript: "bg-pink text-surface",
  JavaScript: "bg-yellow text-surface",
  Shell: "bg-green text-surface",
  C: "bg-purple text-surface",
  Multiple: "bg-muted text-surface",
} as const;

export type Language = keyof typeof languageColors;
