import type e from 'express'
import type { ZodType } from 'zod'

export const REQUEST_KEYS = [
    'params',
    'query',
    'body',
    'headers',
    'cookies',
] as const

export type RequestKey = (typeof REQUEST_KEYS)[number]

export function schemaValidator(
    options: Partial<Record<RequestKey, ZodType>>,
): e.RequestHandler | null {
    const schemas = REQUEST_KEYS.map((key) => [key, options?.[key]] as const)
        .filter(
            (entry): entry is [RequestKey, ZodType] => entry[1] !== undefined,
        )
        .filter(([, schema]) => !schema.meta()?.skip)

    if (schemas.length === 0) {
        return null
    }

    return (req, _res, next) => {
        for (const [key, schema] of schemas) {
            const parsed = schema.safeParse(req[key])
            if (!parsed.success) {
                next(parsed.error)
                return
            }

            Object.defineProperty(req, key, {
                value: parsed.data,
                writable: true,
                configurable: true,
                enumerable: true,
            })
        }
        next()
    }
}
