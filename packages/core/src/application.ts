import express, { type Express } from 'express'
import type { TRouteRecord, TRouterOptions } from './router'
import { Router } from './router'

export class Application<
    const Options extends Pick<TRouterOptions, 'prefix'> = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends Router[] = [],
> extends Router<Options, Routes, Routers> {
    protected override readonly host: Express = express()

    override get get() {
        return this.registerRoute('get')
    }
    override get post() {
        return this.registerRoute('post')
    }
    override get put() {
        return this.registerRoute('put')
    }
    override get delete() {
        return this.registerRoute('delete')
    }
    override get patch() {
        return this.registerRoute('patch')
    }
    override get head() {
        return this.registerRoute('head')
    }
    override get options() {
        return this.registerRoute('options')
    }

    listen = this.host.listen.bind(this.host)

    override get routes() {
        return this.getRoutes(this.host.router)
    }
}
