import express from 'express'
import z from 'zod'
import { Application, Router } from '../src'

export const users = Array.from({ length: 10 }).map((_, index) => ({
    id: index + 1,
}))

const router = new Router({ prefix: '/users' })
    .get('', (_, res) => {
        res.json(users)
    })
    .get('/:id', (req, res) => {
        res.json(users.find((item) => item.id === +req.params.id))
    })
    .post(
        '/',
        {
            body: z.object({
                id: z.number(),
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

export const application = new Application()
    .use(express.json())
    .use(router)
    .get('', (_, res) => {
        res.end()
    })
