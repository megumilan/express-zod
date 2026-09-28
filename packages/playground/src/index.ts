import { defineClient } from '@express-zod/client'
import { clientRedirect } from '@express-zod/client/plugin'
import { openapi } from '@express-zod/openapi'
import express from 'express'
import { Router } from 'express-zod'

const user = new Router({ prefix: '/nest' })
    .get('/users', { meta: { operationId: 'getUsers' } }, () => {
        return 'users'
    })
    .get(
        '/users/:id{/:name}{/*splat}',
        {
            meta: { operationId: 'getUserById' },
        },
        (req) => ({
            id: req.params.id,
            name: req.params.name,
        }),
    )

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
                operationId: 'Hello',
            },
        },
        () => 'Hello World',
    )
    .use(user)
    .use(clientRedirect())

app.listen(3030)

const client = defineClient('http://localhost:3030/', {
    prefix: '/api',
}).as<typeof app>()
setTimeout(() => {
    client
        .getUserById({ params: { id: '123', splat: ['1', '2', '3'] } })
        .then(console.log)
}, 1000)
