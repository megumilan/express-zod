import type { RequestHandler } from 'express'
import type { TRouteSchema } from './router'

// export type IsMatchPathParams<S extends string> =
//     S extends `${string}:${string}` ? true : false

// export function isMatchPathParams(path: string) {
//     return path.includes(':')
// }

// export function inferPathParamsSchema(path: string) {
//     const shape: Record<string, ZodType> = {}
//     for (const match of path.matchAll(/:([a-zA-Z0-9_-]+)(})?/g)) {
//         const [, slug, optional] = match
//         shape[slug] = optional ? z.string().optional() : z.string()
//     }
//     return z.object(shape)
// }

export function schemaValidator(schema: Partial<TRouteSchema>): RequestHandler {
    const { responses, ...schemas } = schema
    return (req, _res, next) => {
        try {
            for (const [key, schema] of Object.entries(schemas)) {
                schema.parse(req[key as keyof typeof req])
            }
            next()
        } catch (err) {
            next(err)
        }
    }
}
