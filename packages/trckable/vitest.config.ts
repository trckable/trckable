import { defineConfig } from 'vitest/config'

// The package bundles the tracker, whose feature flags are compiled in per
// variant (tracker/build.mjs). Tests run with every feature on, the same way
// the published bundle does.
export default defineConfig({
  define: { __GOALS__: 'true', __OUTBOUND__: 'true', __CHECKOUT__: 'true', __VITALS__: 'false', __CONSENT__: 'false', __BANNER__: 'false', __FORMS__: 'false' },
})
