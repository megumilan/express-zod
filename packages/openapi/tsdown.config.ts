import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['./src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: {
        sideEffects: true,
    },
    deps: {
        neverBundle: true,
        alwaysBundle: ['type-fest'],
    },
})
