import { Application, Router } from 'express-zod'

const userRouter = new Router({ prefix: '/users' })
    .post('/')
    .get('/')
    .get('/:id')

export const app = new Application({ prefix: '/api' })
    .use(userRouter)
    .get('/hello')
