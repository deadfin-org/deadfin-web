import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveBuildIdentity, readBuildEnv, probeGit, buildJsonPlugin } from './tools/build-metadata';
import { licensesPlugin } from './tools/licenses';

export default defineConfig(() => {
  const env = readBuildEnv(process.env);
  const { web, pair } = resolveBuildIdentity({
    env,
    git: probeGit(process.cwd(), env.DEADFIN_WEB_VERSION),
  });
  return {
    // Relative asset URLs: the same dist/ works at a site root and from a
    // server's /web/ directory (Deadfin and Jellyfin serve it there).
    base: './',
    plugins: [react(), buildJsonPlugin(pair), licensesPlugin(process.cwd())],
    server: { port: 5210 },
    preview: { port: 5211 },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
    define: {
      __DEADFIN_WEB_BUILD__: JSON.stringify(web),
    },
  };
});
