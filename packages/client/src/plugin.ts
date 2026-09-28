import type { IPlugin } from 'express-zod'
import { compile, pathToRegexp } from 'path-to-regexp'

/**
 * Expose routes with an `operationId` as POST endpoints for client-side dispatch.
 *
 * Use on the server side.
 */
export function clientRedirect(): IPlugin {
    return {
        name: '@express-zod/client/redirect-plugin',
        install: (router) => {
            router['~router'].post('/{*path}', (req, res) => {
                const target = router['~routes'].find((route) => {
                    const options = route['~options']
                    if ('meta' in options) {
                        const operationId = (options.meta as any)?.operationId
                        if (!operationId) {
                            return false
                        }
                        return req.path.replace('/', '') === operationId
                    }
                    return false
                })
                if (target) {
                    const targetPath = target['~path']
                    const bodyParams = req.body['~params'] ?? {}
                    const { keys } = pathToRegexp(targetPath)
                    const toPath = compile(targetPath)
                    const params: Record<string, any> = {}
                    for (const key of keys) {
                        if (key.type === 'param' || key.type === 'wildcard') {
                            const param = bodyParams?.[key.name]
                            if (param) {
                                params[key.name] = param
                            }
                        }
                    }
                    res.redirect(toPath(params))
                }
            })
        },
    }
}
