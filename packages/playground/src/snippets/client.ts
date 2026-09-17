import { defineClient } from '@express-zod/client'
import type { App } from './server'

const baseUrl = window.location.origin
const apiUrl = new URLSearchParams(location.search).get('api') ?? baseUrl

const endpoint = document.querySelector('#api-endpoint')
if (endpoint) {
    endpoint.textContent = apiUrl
}

type TestResult = {
    label: string
    url: string
    status: number
    ok: boolean
    body: string
}

async function testFetch(label: string, url: string): Promise<TestResult> {
    try {
        const res = await fetch(url)
        const body = await res.text()
        return { label, url, status: res.status, ok: res.ok, body }
    } catch (err) {
        return { label, url, status: 0, ok: false, body: String(err) }
    }
}

const client = defineClient<App>(baseUrl)

async function testClient(): Promise<TestResult> {
    const url = `${baseUrl}/api/users?page=1&limit=10`
    try {
        const data = await client.get('/api/users', {
            query: { page: 1, limit: 10 },
        })
        return {
            label: 'defineClient GET (typed)',
            url,
            status: 200,
            ok: true,
            body: JSON.stringify(data),
        }
    } catch (err) {
        return {
            label: 'defineClient GET (typed)',
            url,
            status: 0,
            ok: false,
            body: String(err),
        }
    }
}

console.log('baseUrl', baseUrl)

const tests = await Promise.all([
    testFetch(
        'GET via Vite proxy (same-origin)',
        `${baseUrl}/api/users?page=1&limit=10`,
    ),
    testFetch(
        'GET via forwarded backend URL',
        `${apiUrl}/api/users?page=1&limit=10`,
    ),
    testClient(),
])

for (const t of tests) {
    console.log(`[${t.ok ? '✓' : '✗'}] ${t.label} — HTTP ${t.status}`, t.body)
}

const output = document.querySelector('#result') as HTMLPreElement
output.textContent = tests
    .map(
        (t) =>
            `[${t.ok ? '✓' : '✗'}] ${t.label} (HTTP ${t.status})\n    ${t.url}\n    ${t.body}`,
    )
    .join('\n\n')
