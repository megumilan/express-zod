// Type-safe client API
// Usage: client.get(url, args) ...

import { defineClient } from '@express-zod/client'
import type { App } from './server'

const client = defineClient<App>('your host')
void client.get('/api/users/:id', { params: { id: 1 } }).then((resp) => {
    console.log('resp is', resp) // typed response
})

// Remove the `name` -> Property 'name' is missing in type '{ email: string; }' but required in type '{ name: string; email: string; }'.
void client.post('/api/users', { body: { email: '', name: '' } })
