import type { RequestHandler } from 'express'
import { type ZodType, z } from 'zod'
import type { TRouteSchema } from './router'

export type IsMatchPathParams<S extends string> =
    S extends `${string}:${string}` ? true : false

export function isMatchPathParams(path: string) {
    return path.includes(':')
}

export function generatePathParamsSchema(path: string) {
    const shape: Record<string, ZodType> = {}

    for (const segment of path.split('/')) {
        if (!segment.startsWith(':')) {
            continue
        }
        const target = segment.slice(1)
        const optional = target.includes('}')
        const slug = optional
            ? target.replace('}', '').replace('{', '').trim()
            : target
        shape[slug] = optional ? z.string().optional() : z.string()
    }

    return z.object(shape)
}

export function schemaValidator(schema: Partial<TRouteSchema>): RequestHandler {
    const { responses, ...schemas } = schema
    return (req, _res, next) => {
        try {
            console.log(schema)
            for (const [key, schema] of Object.entries(schemas)) {
                console.log('validate', key)
                console.log('value', req[key as keyof typeof req])
                schema.parse(req[key as keyof typeof req])
            }
            next()
        } catch (err) {
            next(err)
        }
    }
}
