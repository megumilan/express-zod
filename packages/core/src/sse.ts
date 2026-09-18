import type { RequestHandler, Response } from 'express'
import type { SSEStream } from './types/utility'

const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8'

export interface SSEController {
    readonly cancelled: boolean
    onCancel(handler: (reason?: unknown) => void): this
    cancel(reason?: unknown): this
}

export interface SSEEvent<T = unknown> {
    event?: string
    data: T
}

export type SSEChunk<T = unknown> = T | SSEEvent<T>

export type SSEInput<T = unknown> = SSEStream<SSEChunk<T>> | SSEChunk<T>

export interface SSEContext<T = unknown> {
    sse(input: SSEInput<T>): SSEController
}

export interface SSEResponse extends Response, SSEContext {}

interface SSEControllerImpl {
    cancelled: boolean
    finished: boolean
    reason: unknown
    handlers: ((reason?: unknown) => void)[]
    onCancel: (handler: (reason?: unknown) => void) => SSEControllerImpl
    cancel: (reason?: unknown) => SSEControllerImpl
}

function isSSEEvent(value: unknown): value is SSEEvent {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const keys = Object.keys(value)
    return (
        keys.includes('data') &&
        keys.every((key) => key === 'event' || key === 'data')
    )
}

function formatEvent(chunk: unknown): string {
    const { event, data } = isSSEEvent(chunk) ? chunk : { data: chunk }
    const payload =
        typeof data === 'string' ? data : (JSON.stringify(data) ?? '')
    const lines = `data: ${payload.split(/\r?\n/).join('\ndata: ')}`
    return event ? `event: ${event}\n${lines}\n\n` : `${lines}\n\n`
}

function createController(): SSEControllerImpl {
    const controller: SSEControllerImpl = {
        cancelled: false,
        finished: false,
        reason: undefined,
        handlers: [],
        onCancel(handler) {
            if (this.cancelled) {
                handler(this.reason)
            } else {
                this.handlers.push(handler)
            }
            return this
        },
        cancel(reason) {
            if (this.cancelled) {
                return this
            }
            this.cancelled = true
            this.reason = reason
            const handlers = this.handlers.splice(0)
            for (const handler of handlers) {
                handler(reason)
            }
            return this
        },
    }
    return controller
}

function isStream(
    value: unknown,
): value is Iterable<SSEChunk<unknown>> | AsyncIterable<SSEChunk<unknown>> {
    return (
        typeof value === 'object' &&
        value !== null &&
        (Symbol.iterator in value || Symbol.asyncIterator in value)
    )
}

async function pipeSSE(
    res: Response,
    input: SSEInput<unknown>,
    controller: SSEControllerImpl,
) {
    let closeReason: unknown
    res.on('error', (error) => {
        closeReason = error
    })
    res.socket?.on('error', (error) => {
        closeReason = error
    })
    if (!res.headersSent) {
        res.status(200).set({
            'Content-Type': SSE_CONTENT_TYPE,
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        })
        res.flushHeaders()
    }
    res.on('close', () => {
        if (controller.finished) {
            return
        }
        if (res.writableEnded) {
            controller.finished = true
            return
        }
        controller.cancel(closeReason ?? new Error('client disconnected'))
    })
    try {
        const stream = isStream(input) ? input : [input]
        for await (const chunk of stream) {
            if (controller.cancelled || res.destroyed || res.writableEnded) {
                break
            }
            res.write(formatEvent(chunk))
        }
    } catch (error) {
        res.destroy(error instanceof Error ? error : undefined)
    } finally {
        controller.finished = true
        if (!res.destroyed) {
            res.end()
        }
    }
}

function createSSE(res: Response): SSEContext['sse'] {
    return (input) => {
        const controller = createController()
        void pipeSSE(res, input, controller)
        return controller
    }
}

export const sseMiddleware: RequestHandler = (_req, res, next) => {
    ;(res as SSEResponse).sse = createSSE(res)
    next()
}
