import express, {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
} from 'express'
import type { Simplify } from 'type-fest'
import type { TRouteRecord, TRouterOptions } from './router'
import { Router } from './router'

export class Application<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends Router[] = [],
> extends Router<Options, Routes, Routers> {
    protected _host: Express = express()

    constructor(options?: Options | (TRouterOptions & {})) {
        super(options)
        this._host.use(express.json())
        this._host.use(express.urlencoded({ extended: true }))
    }

    override use(middleware: RequestHandler | ErrorRequestHandler): this
    override use<const R extends Router>(
        router: R,
    ): Application<
        Options,
        Routes,
        [
            ...Routers,
            Options extends { prefix: infer Prefix extends string }
                ? UpdateRoutesFullPath<R, Prefix>
                : R,
        ]
    >
    override use(target: RequestHandler | ErrorRequestHandler | Router) {
        if (typeof target === 'function') {
            this._host.use(target)
        } else {
            this._host.use(target.setOptions(this._options || {}).router)
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
}

type UpdateRoutesFullPath<R extends Router, Prefix extends string> =
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
