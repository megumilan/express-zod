import { defineClient } from '@express-zod/client'
import { type InferOpenAPITags, openapi } from '@express-zod/openapi'
import { Application, Router } from 'express-zod'
import z from 'zod'

const userRouter = new Router({ prefix: '/users' }).get(
    '/:id{/:name}',
    {
        query: z.object({ name: z.string().optional() }),
        params: z.object({
            id: z.string(),
        }),
        custom: { auth: true },
        meta: {
            summary: 'GetUserByUserId',
            tags: ['User'],
        },
        responses: {
            200: z
                .object({ data: z.object({ id: z.string() }) })
                .meta({ description: '成功的响应' }),
            400: z.object({ error: z.object({ reason: z.string() }) }),
        },
    },
    (req, res) => {
        console.log('===> {/:id}')
        void req.params.id
        void req.headers
        void req.cookies
        void res.locals
        res.status(200).json({ data: { id: req.query.name || 'no' } })
    },
)

const docs = openapi({
    openapi: '3.0.1',
    info: { title: 'Express Zod Playground API', version: '1.0.0' },
    tags: [
        {
            name: 'User',
            summary: '用户管理',
            kind: 'nav',
            description: '用户的相关操作',
        },
        {
            name: 'UserSelect',
            summary: '用户查询',
            kind: 'audience',
            parent: 'User',
        },
        {
            name: 'Post',
        },
    ],
})

export const app = new Application({})
    .use(userRouter)
    .use(docs)
    .get('/', (_, res) => {
        res.json('Hello World')
    })

const client = defineClient<App>('http://localhost:3000/', {
    headers: {
        authorization: 'Bearer token',
    },
})

app.listen(3000, () => {
    console.log('http://localhost:3000')
    void client
})

export type App = typeof app

declare global {
    namespace ExpressZodOpenAPI {
        interface Tags extends InferOpenAPITags<typeof docs> {}
    }
    namespace ExpressZod {
        interface TRouteOptions {
            custom?: {
                auth?: boolean
                cache?: boolean
            }
        }
    }
}
