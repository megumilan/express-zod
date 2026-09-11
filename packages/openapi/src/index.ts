/// <reference types="zod-openapi" />

import type { Express } from 'express'
import type { TPlugin, TRouteRecord, TRouteSchema } from 'express-zod'
import type { Except, OmitIndexSignature } from 'type-fest'
import type { ZodType } from 'zod'
import {
    createDocument,
    type ZodOpenApiObject,
    type ZodOpenApiOperationObject,
    type ZodOpenApiPathsObject,
    type ZodOpenApiResponsesObject,
} from 'zod-openapi'

declare global {
    namespace ExpressZodOpenAPI {
        interface Tags {
            [K: string]: boolean
        }
    }
    namespace ExpressZod {
        interface TRouteOptions {
            meta?: Except<
                ZodOpenApiOperationObject,
                | 'requestBody'
                | 'responses'
                | 'parameters'
                | 'callbacks'
                | 'requestParams'
                | 'tags'
            > & { tags?: EnabledTags[] }
            // meta?: Partial<{
            //     tags: string[]
            //     summary: string
            //     description: string
            //     operationId: string
            //     externalDocs: string
            //     deprecated: boolean
            // }>
        }
    }
}

type EnabledTags<
    T extends
        ExpressZodOpenAPI.Tags = OmitIndexSignature<ExpressZodOpenAPI.Tags>,
> = {
    [K in keyof T]: T[K] extends true ? K : never
}[keyof T]

interface TOpenAPIOptions<Tags = []>
    extends Except<ZodOpenApiObject, 'paths' | 'tags'> {
    path?: {
        json?: string
        ui?: string
    }
    tags?: Tags | (TOpenAPITag[] & {})
}

function toOpenapiSchema(schema: TRouteSchema) {
    return Object.entries(schema).reduce((acc, [key, schema]) => {
        if (!schema) {
            return acc
        }

        if (key === 'params') {
            acc.requestParams ??= {}
            acc.requestParams.path = schema
        }

        if (key === 'query') {
            acc.requestParams ??= {}
            acc.requestParams.query = schema
        }

        if (key === 'body') {
            acc.requestBody = {
                content: {
                    'application/json': {
                        schema,
                    },
                },
            }
        }

        if (key === 'responses') {
            const _responses = schema as Record<number, ZodType>

            acc.responses = Object.entries(_responses).reduce(
                (acc, [key, schema]) => {
                    const status = key as `${1 | 2 | 3 | 4 | 5}${string}`
                    acc[status] = {
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
    return path.replace(/\{?\/:([a-zA-Z0-9_]+)\}?/g, '/{$1}')
}

function generateOpenapiPaths(routes: TRouteRecord[]) {
    return Object.values(routes).reduce(
        (acc, { fullPath, method, options }) => {
            const { meta, ...rest } = options ?? {}
            const schema = rest as TRouteSchema
            const path = toOpenapiPath(fullPath)
            if (acc[path]) {
                acc[path][method] = {
                    ...meta,
                    ...toOpenapiSchema(schema),
                } as ZodOpenApiOperationObject
            } else {
                acc[path] ??= {
                    [method]: { ...meta, ...toOpenapiSchema(schema) },
                }
            }
            return acc
        },
        {} as ZodOpenApiPathsObject,
    )
}

function docsJson(
    routes: TRouteRecord[],
    options: TOpenAPIOptions,
): ReturnType<typeof createDocument> {
    return createDocument({
        paths: generateOpenapiPaths(routes),
        ...options,
    } as ZodOpenApiObject)
}

function ui(options: TOpenAPIOptions) {
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

export declare const openapiTags: unique symbol

export type TOpenAPIPlugin<Tags extends TOpenAPITag[]> = TPlugin & {
    readonly [openapiTags]?: Tags
}

export type InferOpenAPITags<T> =
    T extends TOpenAPIPlugin<infer Tags>
        ? {
              [K in Tags[number]['name']]: true
          }
        : never

export type InferOpenAPITagNames<T> = keyof InferOpenAPITags<T>

const defaultOptions: Partial<TOpenAPIOptions> = {
    path: {
        json: '/openapi.json',
        ui: '/openapi',
    },
}

function openapi<const Tags extends TOpenAPITag[] = []>(
    options: TOpenAPIOptions<Tags>,
): TOpenAPIPlugin<Tags> {
    options = {
        ...defaultOptions,
        ...options,
    } as never
    return {
        name: 'openapi',
        install: ({ raw, instance }) => {
            const app = raw as Express
            const jsonPath = options.path?.json as string
            const uiPath = options.path?.ui as string
            app.get(jsonPath, (_, res) => {
                res.json(docsJson(instance.routes, options as never))
            })
            app.get(uiPath, (_, res) => {
                res.type('html').send(ui(options as never))
            })
        },
    }
}

export { openapi }
