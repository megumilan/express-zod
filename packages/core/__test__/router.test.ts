import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Application, Router } from '../src'

describe('Router', () => {
    it('starts with no registered routes', () => {
        expect(new Router().routes).toEqual([])
    })

    it('registers each http method with matching route metadata', () => {
        const router = new Router()
            .get('/get', () => undefined)
            .post('/post', () => undefined)
            .put('/put', () => undefined)
            .patch('/patch', () => undefined)
            .delete('/delete', () => undefined)
            .head('/head', () => undefined)
            .options('/options', () => undefined)

        expect(router.routes.map((route) => route.method)).toEqual([
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'head',
            'options',
        ])
        expect(router.routes.map((route) => route.fullPath)).toEqual([
            '/get',
            '/post',
            '/put',
            '/patch',
            '/delete',
            '/head',
            '/options',
        ])
    })

    it('stores schemas and extra options on the registered route', () => {
        const bodySchema = z.object({ name: z.string() })
        const router = new Router().get(
            '/users',
            { body: bodySchema, meta: { summary: 'List users' } },
            () => undefined,
        )

        const route = router.routes[0]
        expect(route.path).toBe('/users')
        expect(route.routeOptions.body).toBe(bodySchema)
        expect(route.routeOptions).toMatchObject({
            meta: { summary: 'List users' },
        })
    })

    it('prepends the router prefix to fullPath', () => {
        const router = new Router({ prefix: '/api' }).get(
            '/users/:id',
            () => undefined,
        )
        expect(router.routes[0].fullPath).toBe('/api/users/:id')
    })

    it('keeps the prefix when path is empty or root', () => {
        const router = new Router({ prefix: '/api' })
            .get('/', () => undefined)
            .get('', () => undefined)
        expect(router.routes.map((route) => route.fullPath)).toEqual([
            '/api',
            '/api',
        ])
    })

    it('normalizes slashes when joining prefix and path', () => {
        const router = new Router({ prefix: '/api/' }).get(
            '/users/',
            () => undefined,
        )
        expect(router.routes[0].fullPath).toBe('/api/users/')
    })

    it('mounts routers and composes prefixes in metadata', () => {
        const users = new Router({ prefix: '/users' })
            .get('/:id', () => undefined)
            .get('/list', () => undefined)
        const app = new Application({ prefix: '/api' }).use(users)

        expect(app.routes.map((route) => route.fullPath)).toEqual([
            '/api/users/:id',
            '/api/users/list',
        ])
    })

    it('supports nesting routers inside routers', () => {
        const inner = new Router({ prefix: '/v1' }).get(
            '/users',
            () => undefined,
        )
        const outer = new Router({ prefix: '/api' }).use(inner)

        expect(inner.routes[0].fullPath).toBe('/api/v1/users')
        expect(outer.routes.map((route) => route.fullPath)).toEqual([
            '/api/v1/users',
        ])
    })
})
