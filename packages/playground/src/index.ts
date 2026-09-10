import { Application, Router } from 'express-zod'
import z from 'zod'

const userRouter = new Router({ prefix: '/users' }).get(
    '/:id',
    {
        query: z.object({ name: z.string().optional() }),
        custom: { auth: true },
        meta: { tags: ['user', 'id'] },
        responses: {
            200: z.object({ data: z.object({ id: z.string() }) }),
            400: z.object({ error: z.object({ reason: z.string() }) }),
        },
    },
    (req, res) => {
        console.log('===> /:id')
        void req.params.id
        void req.headers
        void req.cookies
        void res.locals
        res.status(200).json({ data: { id: '' } })
    },
)

export const app = new Application({})
    .use(userRouter)
    .get('/', (_, res) => {
        res.json('Hello World')
    })
    .get('{/:name}', (_, res) => {
        console.log('===> {/:name}')
        res.json({
            from: '{/:name}',
            name: _.params.name,
        })
    })

app.listen(3000, () => {
    console.log('http://localhost:3000')
})

export type App = typeof app

declare global {
    namespace ExpressZod {
        interface TRouteOptions {
            custom?: {
                auth?: boolean
                cache?: boolean
            }
            meta?: Partial<{
                tags: string[]
                summary: string
                description: string
                operationId: string
                externalDocs: string
                deprecated: boolean
            }>
        }
    }
}
