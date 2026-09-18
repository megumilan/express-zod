import type { Express } from 'express'

export function getHost(app: unknown): Express {
    return (app as { host: Express }).host
}
