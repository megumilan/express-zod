import { type InferOpenAPITags, openapi } from '@express-zod/openapi'
import express from 'express'
import { Application, Router } from 'express-zod'
import z from 'zod'

export const users = Array.from({ length: 10 }).map((_, index) => ({
    id: index + 1,
}))

const router = new Router({ prefix: '/users' })
    .get(
        '/',
        {
            meta: {
                tags: ['User'],
                summary: 'GetUsers',
                description: '查询用户列表',
            },
        },
        (_, res) => {
            res.json(users)
        },
    )
    .get(
        '/:id',
        {
            meta: {
                summary: 'GetUserById',
                tags: ['User'],
            },
        },
        (req, res) => {
            res.json(users.find((item) => item.id === Number(req.params.id)))
        },
    )
    .post(
        '/',
        {
            meta: {
                summary: 'CreateUser',
                tags: ['User'],
            },
            headers: z.object({
                /** Custom header */
                _token: z.string(),
            }),
            body: z.object({
                id: z.number().meta({ title: '用户ID' }),
            }),
            responses: {
                201: z.object({
                    id: z.number(),
                }),
            },
        },
        (req, res) => {
            res.status(201).json({ id: req.body.id })
        },
    )

const docs = openapi({
    openapi: '3.0.1',
    info: { title: 'Your API Document', version: '0.0.1' },
    tags: [
        {
            name: 'User',
            description: '用户管理',
        },
        {
            name: 'Basic',
            description: '基础管理',
        },
    ],
})

export const app = new Application({ prefix: '/api' })
    .use(express.json())
    .use(docs)
    .get(
        '/',
        {
            meta: {
                summary: 'HelloWorld',
                tags: ['Basic'],
            },
            responses: {
                200: z.literal('Hello World'),
            },
        },
        (_, res) => {
            res.json('Hello World')
        },
    )
    .use(router)

app.listen(3000)

declare global {
    namespace ExpressZodOpenAPI {
        interface Tags extends InferOpenAPITags<typeof docs> {
            '# Define the new tag in `openapi` plugin. Do not use this option.': true
        }
    }
}
