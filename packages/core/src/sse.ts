import type { RequestHandler } from 'express'

const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8'

function formatSSEChunk(chunk: unknown): string {
    const payload =
        typeof chunk === 'string' ? chunk : (JSON.stringify(chunk) ?? '')
    return `data: ${payload.split(/\r?\n/).join('\ndata: ')}\n\n`
}

export function createSSEMiddleware(): RequestHandler {
    return (_req, res, next) => {
        if (!res.headersSent) {
            res.status(200).set({
                'Content-Type': SSE_CONTENT_TYPE,
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            })
            res.flushHeaders()
        }
        const write = res.write.bind(res) as (...args: unknown[]) => boolean
        res.write = (chunk: unknown, ...args: unknown[]) =>
            write(formatSSEChunk(chunk), ...args)
        next()
    }
}
