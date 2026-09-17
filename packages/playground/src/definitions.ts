import {
    dependencies as deps,
    devDependencies as devDeps,
} from '../package.json'

export const definitions = import.meta.glob(
    [
        '../node_modules/express-zod/dist/index.d.mts',

        '../node_modules/@express-zod/client/dist/index.d.mts',
        '../node_modules/@express-zod/openapi/dist/index.d.mts',
        '../node_modules/type-fest/**/*.d.ts',
        '../node_modules/zod-openapi/**/*.d.mts',

        '../node_modules/zod/**/*.d.ts',
        '../node_modules/zod/**/*.d.mts',
        '../node_modules/zod/**/*.d.cts',

        '../node_modules/@types/**/*.d.ts',
        '../node_modules/@types/**/*.d.mts',
        '../node_modules/@types/**/*.d.cts',
    ],
    {
        query: '?raw',
        import: 'default',
        eager: true,
    },
) as Record<string, string>

export const modulePaths = {
    'express-zod': ['node_modules/express-zod/dist/index.d.mts'],
    express: [
        'node_modules/@types/express/index.d.ts',
        'node_modules/@types/express-serve-static-core/index.d.ts',
    ],
    zod: ['node_modules/zod/index.d.cts'],
    '@express-zod/client': [
        'node_modules/@express-zod/client/dist/index.d.mts',
    ],
    '@express-zod/openapi': [
        'node_modules/@express-zod/openapi/dist/index.d.mts',
    ],
    'type-fest': ['node_modules/type-fest/index.d.ts'],
    'zod-openapi': ['node_modules/zod-openapi/lib/index.d.mts'],
}

export const dependencies = {
    express: deps.express,
    cors: deps.cors,
    'express-zod': deps['express-zod'],
    '@express-zod/client': deps['@express-zod/client'],
    '@express-zod/openapi': deps['@express-zod/openapi'],
    zod: deps.zod,
}

export const devDependencies = {
    typescript: devDeps.typescript,
    tsx: 'latest',
    vite: '^6.0.0',
    '@types/node': devDeps['@types/node'],
    '@types/express': devDeps['@types/express'],
    '@types/cors': devDeps['@types/cors'],
    '@types/express-serve-static-core':
        devDeps['@types/express-serve-static-core'],
}
