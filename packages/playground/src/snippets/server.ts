import { type InferOpenAPITags, openapi } from '@express-zod/openapi'
import cors from 'cors'
import express from 'express'
import { Application, Router } from 'express-zod'
import { z } from 'zod'

const userSchema = z.object({
    id: z.number().int(),
    name: z.string().min(1),
    email: z.email(),
})

const createUserSchema = userSchema.omit({ id: true })

// OpenAPI plugin
const docs = openapi({
    openapi: '3.0.1',
    info: {
        title: 'express-zod API',
        version: '0.0.1',
    },
    tags: [
        {
            // Changing this tag to break all associated routes
            name: 'User',
        },
    ],
})

const users = new Router({ prefix: '/users' })
    .get(
        '/',
        {
            query: z.object({
                page: z.number().int().min(1).default(1),
                limit: z.number().int().min(1).max(100).default(10),
            }),
            responses: {
                200: z.object({
                    items: z.array(userSchema),
                    total: z.number().int(),
                }),
            },
            meta: {
                summary: 'List users',
                /** Type-safe tags. see {@link ExpressZodOpenAPI.Tags} */
                tags: ['User'],
            },
        },
        (req, res) => {
            const { page } = req.query
            res.json({
                items: [
                    { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
                ],
                total: page * 1,
            })
        },
    )
    .get(
        '/:id',
        {
            params: z.object({ id: z.number().int().positive() }),
            responses: {
                200: userSchema,
                404: z.object({ message: z.string() }),
            },
            meta: { summary: 'Get a user' },
        },
        (req, res) => {
            if (req.params.id !== 1) {
                return res.status(404).json({ message: 'User not found' })
            }
            res.json({ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' })
        },
    )
    .post(
        '/',
        {
            body: createUserSchema,
            responses: {
                201: userSchema,
                400: z.object({ message: z.string() }),
            },
            meta: { summary: 'Create a user' },
        },
        (req, res) => {
            const { name, email } = req.body
            res.status(201).json({ id: 2, name, email })
        },
    )

const app = new Application({ prefix: '/api' })
    .use(express.json())
    .use(cors())
    .use(docs)
    .use(users)

app.listen(3000, () => {
    console.log('Server listening on http://localhost:3000')
    console.log('OpenAPI UI: http://localhost:3000/openapi')
})

export type App = typeof app

declare global {
    namespace ExpressZodOpenAPI {
        // Define the Type-safe tags
        interface Tags extends InferOpenAPITags<typeof docs> {}
    }
}
