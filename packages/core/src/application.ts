import express, {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
} from 'express'
import type { Simplify } from 'type-fest'
import type { NoExtraKeys, TRouteRecord, TRouterOptions } from './router'
import { Router } from './router'

export class Application<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends Router[] = [],
> extends Router<Options, Routes, Routers> {
    protected _host: Express = express()

    constructor(options?: NoExtraKeys<Options, TRouterOptions>) {
        void super(options)
    }

    override use(middleware: RequestHandler | ErrorRequestHandler): this
    override use<const R extends Router>(
        router: R,
    ): Application<Options, Routes, [...Routers, R]>
    override use(target: RequestHandler | ErrorRequestHandler | Router) {
        if (typeof target === 'function') {
            this._host.use(target)
        } else {
            this._host.use(target.router)
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
