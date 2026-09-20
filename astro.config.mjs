// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.kylejameswalker.com',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  redirects: {
    '/info': '/about',
    '/applications': '/apps',
    '/applications/cardboard-slicer': '/apps/cardboard-slicer',
    '/applications/dirty-little-zine-plus': '/apps/dirty-little-zine-plus',
    '/applications/folding-boxes': '/apps/folding-boxes',
    '/applications/lead-scanner': '/apps/lead-scanner',
    '/applications/voronoi-shapes': '/apps/voronoi-shapes',
  },
});
