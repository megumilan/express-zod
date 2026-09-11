import supertest from 'supertest'
import { expect, test } from 'vitest'
import { application, users } from '.'

// @ts-expect-error
const app = application._host

test('GET /', async () => {
    await supertest(app).get('/').expect(200)
})

test('GET /users', async () => {
    const response = await supertest(app).get('/users').expect(200)
    expect(response.body).toStrictEqual(users)
})

test('GET /users/:id', async () => {
    const id = 1
    const response = await supertest(app).get(`/users/${id}`).expect(200)
    expect(response.body).toStrictEqual(users.find((item) => item.id === id))
})

test('POST /users', async () => {
    const data = { id: 111 }
    const response = await supertest(app)
        .post('/users')
        .send(data)
        .set('Accept', 'application/json')
        .expect(201)
    expect(response.body).toStrictEqual(data)
})
