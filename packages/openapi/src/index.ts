/// <reference types="zod-openapi" />

import type { IPlugin, IRoute, ISchema } from 'express-zod'
import { merge } from 'lodash-es'
import type { Except } from 'type-fest'
import type { ZodType } from 'zod'
import {
    createDocument,
    type ZodOpenApiObject,
    type ZodOpenApiOperationObject,
    type ZodOpenApiParameters,
    type ZodOpenApiPathsObject,
    type ZodOpenApiResponsesObject,
} from 'zod-openapi'

declare global {
    namespace ExpressZod {
        interface RouteOptions {
            meta?: Except<
                ZodOpenApiOperationObject,
                | 'requestBody'
                | 'responses'
                | 'parameters'
                | 'callbacks'
                | 'requestParams'
            >
        }
    }
}

interface IOpenAPIPath {
    json?: string
    ui?: string
}

export interface IOpenAPIOptions<
    Path extends IOpenAPIPath = Record<string, unknown>,
> extends Except<ZodOpenApiObject, 'paths' | 'tags'> {
    path?: Path
    tags?: TOpenAPITag[]
}

const paramsKeys = ['params', 'query', 'headers', 'cookies'] as const

type ParamsKey = (typeof paramsKeys)[number]

const paramsMap: Record<ParamsKey, keyof ZodOpenApiParameters> = {
    params: 'path',
    query: 'query',
    headers: 'header',
    cookies: 'cookie',
}

function isParamsKey(key: string): key is ParamsKey {
    return paramsKeys.includes(key as ParamsKey)
}

function toOpenapiSchema(schema: ISchema) {
    return Object.entries(schema).reduce((acc, [key, value]) => {
        if (!value) {
            return acc
        }

        if (isParamsKey(key)) {
            acc.requestParams ??= {}
            acc.requestParams[paramsMap[key]] = value
        }

        if (key === 'body') {
            acc.requestBody = {
                content: {
                    'application/json': {
                        schema: value,
                    },
                },
            }
        }

        if (key === 'responses') {
            const responses = value as Record<number, ZodType<any, any, any>>

            acc.responses = Object.entries(responses).reduce(
                (acc, [status, schema]) => {
                    acc[status as `${1 | 2 | 3 | 4 | 5}${string}`] = {
                        content: {
                            'application/json': {
                                schema,
                            },
                        },
                    }
                    return acc
                },
                {} as ZodOpenApiResponsesObject,
            )
        }

        return acc
    }, {} as ZodOpenApiOperationObject)
}

function toOpenapiPath(path: string) {
    return path?.replace(/\{?\/:([a-zA-Z0-9_]+)\}?/g, '/{$1}')
}

/** The HTTP methods an OpenAPI path item accepts. */
const pathItemMethods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
] as const

/** The method a route was registered with, e.g. `get`. */
function toOpenapiMethod(route: IRoute) {
    const method = route.stack[0]?.method
    return pathItemMethods.find((candidate) => candidate === method)
}

function generateOpenapiPaths(routes: IRoute[]) {
    const paths: ZodOpenApiPathsObject = {}

    for (const route of routes) {
        const method = toOpenapiMethod(route)
        const path = toOpenapiPath(route['~path'])

        if (!method || !path) {
            continue
        }

        const { meta, ...schema } = route['~options'] ?? {}

        paths[path] = {
            ...paths[path],
            [method]: {
                ...meta,
                ...toOpenapiSchema(schema),
            },
        } as ZodOpenApiPathsObject[string]
    }

    return paths
}

function docsJson(
    routes: IRoute[],
    options: IOpenAPIOptions,
): ReturnType<typeof createDocument> {
    return createDocument({
        paths: generateOpenapiPaths(routes),
        ...options,
    } as ZodOpenApiObject)
}

function ui(options: IOpenAPIOptions) {
    return `
<!doctype html>
<html>
<head>
    <title>${options.info.title || 'API Reference'}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
    <script
        id="api-reference"
        data-url="${options.path?.json}"
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
    ></script>
</body>
</html>
    `
}

interface TOpenAPITagBase {
    name: string
    summary?: string
    description?: string
    externalDocs?: { description?: string; url: string }
    [extensionName: `x-${string}`]: { name?: string; tag: string[] }[]
}

interface TOpenAPITagNav extends TOpenAPITagBase {
    kind?: 'nav'
}
interface TOpenAPITagAudience extends TOpenAPITagBase {
    kind?: 'audience'
    parent: string
}

interface TOpenAPITagBadge extends TOpenAPITagBase {
    kind?: 'badge'
}

type TOpenAPITag = TOpenAPITagNav | TOpenAPITagAudience | TOpenAPITagBadge

const defaultOptions = {
    path: {
        json: '/openapi.json',
        ui: '/openapi',
    },
}

export function openapi<const Path extends IOpenAPIPath = {}>(
    options: IOpenAPIOptions<Path>,
): IPlugin<{}> {
    options = merge({}, defaultOptions, options)
    if (options.path?.json === options.path?.ui) {
        throw new Error('OpenAPI JSON path and UI path cannot be the same')
    }
    return {
        name: 'openapi',
        install: (router) => {
            const app = router['~mount']()
            const jsonPath = options.path?.json as string
            const uiPath = options.path?.ui as string
            app.get(jsonPath, (_, res) => {
                res.json(docsJson(router['~routes'], options as never))
            })
            app.get(uiPath, (_, res) => {
                res.type('html').send(ui(options as never))
            })
        },
    }
}
