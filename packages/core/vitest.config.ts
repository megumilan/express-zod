import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        ui: true,
        open: false,
        globals: true,
        typecheck: {
            enabled: true,
        },
    },
})
