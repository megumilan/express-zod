import { defineConfig, mergeConfig, type UserConfig } from 'tsdown'

const baseConfig = {
    entry: ['./src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: true,
    deps: {
        neverBundle: ['express', 'zod'],
    },
} satisfies UserConfig

export function defineTsdown(options: UserConfig = {}) {
    return defineConfig(mergeConfig(baseConfig, options))
}
