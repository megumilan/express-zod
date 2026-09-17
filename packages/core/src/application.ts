import express, {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
} from 'express'
import type {
    PrefixOf,
    TPlugin,
    TRouteRecord,
    TRouterOptions,
    UpdateFullPath,
} from './router'
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

    override use<const M extends RequestHandler | ErrorRequestHandler>(
        middleware: M,
    ): this
    override use<const P extends TPlugin>(plugin: P): this
    override use<const R extends Router>(
        router: R,
    ): Application<
        Options,
        Routes,
        [...Routers, UpdateFullPath<R, PrefixOf<Options>>]
    >
    override use<const T extends Router>(
        target: RequestHandler | ErrorRequestHandler | T | TPlugin,
    ) {
        return this.handleUse(target)
    }

    listen = this.host.listen.bind(this.host)

    override get routes() {
        return this.getRoutes(this.host.router)
    }
}
