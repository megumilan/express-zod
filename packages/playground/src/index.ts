import { openapi } from '@express-zod/openapi'
import express from 'express'
import { Router } from 'express-zod'

const user = new Router()
    .get('/users', { meta: { tags: ['Basic'] } }, () => 'users')
    .get('/users/:id', (_req) => `Hello ${_req.params.id}`)

const docs = openapi({
    openapi: '3.0.1',
    info: {
        title: 'Test',
        version: '0.0.1',
    },
    tags: [
        {
            name: 'Basic',
        },
    ],
})

const app = new Router({ prefix: '/api' })
    .use(express.json())
    .use(docs)
    .get(
        '/',
        {
            meta: {
                summary: 'Hello',
            },
        },
        () => 'Hello World',
    )
    .use(user)

app.listen(3030)
