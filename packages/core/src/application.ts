import express, {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
} from 'express'
import type { Simplify } from 'type-fest'
import type {
    NoExtraKeys,
    TPlugin,
    TRouteRecord,
    TRouterOptions,
} from './router'
import { Router } from './router'

export class Application<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends Router[] = [],
> extends Router<Options, Routes, Routers> {
    protected _host: Express = express()
    private readonly _routers: Router[] = []

    constructor(options?: NoExtraKeys<Options, TRouterOptions>) {
        void super(options)
    }

    override use(middleware: RequestHandler | ErrorRequestHandler): this
    override use<const R extends Router>(
        router: R,
    ): Application<Options, Routes, [...Routers, R]>
    override use(plugin: TPlugin): this
    override use(
        target: RequestHandler | ErrorRequestHandler | Router | TPlugin,
    ) {
        if (typeof target === 'function') {
            this._host.use(target)
        }
        if (target instanceof Router) {
            this._host.use(target.router)
            this._routers.push(target)
        }
        if (typeof target === 'object' && 'install' in target) {
            target.install({
                raw: this._host,
                instance: this,
            })
        }
        return this
    }

    override get = this.registerRoute('get')
    override post = this.registerRoute('post')
    override put = this.registerRoute('put')
    override delete = this.registerRoute('delete')
    override patch = this.registerRoute('patch')
    override head = this.registerRoute('head')
    override options = this.registerRoute('options')

    get listen() {
        return this._host.listen.bind(this._host)
    }

    get routers() {
        return this._routers
    }

    override get routes() {
        return [...this._routes, ...this.routers.flatMap((r) => r.routes)]
    }
}

type _UpdateRoutesFullPath<R extends Router, Prefix extends string> =
    R extends Router<infer Options, infer Routes, infer Routers>
        ? Router<
              Options,
              {
                  [K in keyof Routes]: Routes[K] extends {
                      fullPath: infer FullPath extends string
                  }
                      ? Simplify<
                            Omit<Routes[K], 'fullPath'> & {
                                fullPath: `${Prefix}${FullPath}`
                            }
                        >
                      : Routes[K]
              },
              Routers
          >
        : never
