import { defineConfig } from 'vitest/config'

// The tracker's feature flags are compiled in per variant (build.mjs), so a
// test file runs against one combination. Three projects, because the consent
// modules deliberately change what the core does — they start the script with
// no cookie and nothing stored — while the core tests describe a script built
// without them, which is what /js/t.js is.
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'core', include: ['test/core.test.ts'] },
        define: { __GOALS__: 'true', __OUTBOUND__: 'true', __CHECKOUT__: 'true', __VITALS__: 'true', __CONSENT__: 'false', __BANNER__: 'false', __FORMS__: 'true' },
      },
      {
        test: { name: 'consent', include: ['test/consent.test.ts'] },
        define: { __GOALS__: 'true', __OUTBOUND__: 'true', __CHECKOUT__: 'true', __VITALS__: 'true', __CONSENT__: 'true', __BANNER__: 'false', __FORMS__: 'true' },
      },
      {
        test: { name: 'banner', include: ['test/banner.test.ts'] },
        define: { __GOALS__: 'true', __OUTBOUND__: 'true', __CHECKOUT__: 'true', __VITALS__: 'true', __CONSENT__: 'false', __BANNER__: 'true', __FORMS__: 'false' },
      },
    ],
  },
})
