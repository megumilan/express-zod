import { Application, Router } from 'express-zod'
import z from 'zod'

const userRouter = new Router({ prefix: '/users' }).get(
    '/:id',
    {
        params: z.object({ id: z.string() }),
        custom: { auth: true },
        meta: { tags: ['user', 'id'] },
    },
    (_, res) => {
        res.json(`Get User by ${_.params.id}`)
    },
)

export const app = new Application({ prefix: '/api' })
    .use(userRouter)
    .get('/', (_, res) => {
        res.json('Hello World')
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
