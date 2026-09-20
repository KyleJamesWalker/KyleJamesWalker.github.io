import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";
import { parse as parseYaml } from "yaml";
import { languageColors } from "./site";

const languages = Object.keys(languageColors) as [string, ...string[]];

/**
 * One markdown file per app. Frontmatter drives the cards and the landing
 * header; the body is the landing-page prose.
 */
const apps = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/apps" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      tagline: z.string().max(140),
      // Absent is allowed and renders a fallback tile. A wrong path fails the build.
      screenshot: image().optional(),
      screenshotAlt: z.string().optional(),
      source: z.string().url().optional(),
      featured: z.boolean().default(false),
      order: z.number().default(99),
      tags: z.array(z.string()).default([]),
    }),
});

/** Hand-written repo list. No GitHub API, no build-time fetch. */
const projects = defineCollection({
  loader: file("./src/data/projects.yml", {
    parser: (text) => parseYaml(text),
  }),
  schema: z.object({
    name: z.string(),
    blurb: z.string().max(200),
    language: z.enum(languages),
    url: z.string().url(),
    extraLabel: z.string().optional(),
    extraUrl: z.string().url().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { apps, projects };
