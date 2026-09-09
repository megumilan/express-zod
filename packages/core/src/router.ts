import {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
    Router,
    type RouterOptions,
} from 'express'
import type { Simplify, Writable } from 'type-fest'
import type { ZodObject, ZodType } from 'zod'
import type { Application } from './application'

class _Router<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends _Router[] = [],
> {
    protected _options?: TRouterOptions
    protected readonly _host: Express | Router = Router()
    protected readonly _routes: TRouteRecord[] = []

    constructor(options?: NoExtraKeys<Options, TRouterOptions>) {
        this._options = (options || {}) as Options
    }

    protected registerRoute<Method extends TRoueMethod>(
        method: Method,
    ): TRouteRegistrar<this, Options, Method, Routes, Routers> {
        return <
            const Path extends string,
            const RouteOptions extends TRouteOptions,
        >(
            path: Path,
            ..._handlers: RequestHandler[] | [RouteOptions, ...RequestHandler[]]
        ) => {
            const [options, handlers] = (
                typeof _handlers[0] === 'function'
                    ? [{}, _handlers]
                    : [_handlers[0], _handlers.slice(1)]
            ) as [RouteOptions, RequestHandler[]]

            let fullPath: string = path
            const prefix = this._options?.prefix?.trim()
            if (prefix) {
                fullPath = joinPath(prefix, path)
            }
            ;(this._host as Router)[method](fullPath, ...handlers)
            this._routes.push({
                method,
                path,
                fullPath,
                options,
            })
            return this as unknown as RedefinedThis<
                this,
                Options,
                Routes,
                Routers,
                Method,
                Path,
                RouteOptions
            >
        }
    }

    /** The original {@link Router Express.Router} */
    get router() {
        return this._host
    }

    /** The records of the registered routes */
    get routes() {
        return this._routes
    }

    get = this.registerRoute('get')
    post = this.registerRoute('post')
    put = this.registerRoute('put')
    delete = this.registerRoute('delete')
    patch = this.registerRoute('patch')
    head = this.registerRoute('head')
    options = this.registerRoute('options')

    use(middleware: RequestHandler | ErrorRequestHandler) {
        this._host.use(middleware)
        return this
    }
}

export type NoExtraKeys<T, S> = { [K in keyof T & keyof S]: T[K] } | (S & {})

// type NoExtraKeys<T, Shape> = T & Record<Exclude<keyof T, keyof Shape>, never>

// type StrictObject<T extends Shape, Shape> = Pick<T, keyof Shape> &
//     Record<Exclude<keyof T, keyof Shape>, never>

export interface TRouterOptions extends RouterOptions {
    /** The prefix applies only to the current router. Other routers registered via the `use` method will not inherit it. */
    prefix?: string
}

export const HTTP_METHODS = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
] as const

export type TRoueMethod = (typeof HTTP_METHODS)[number]

export const ROUTE_SCHEMAS = [
    'params',
    'query',
    'body',
    'responses',
    'headers',
    'cookies',
] as const

export interface TRouteResponseSchema {
    [K: number]: ZodType
}

export interface TRouteSchema {
    params: ZodObject
    query: ZodObject
    body: ZodType
    response: TRouteResponseSchema
    headers: ZodObject
    cookies: ZodObject
}

export interface TRouteRecord {
    method: TRoueMethod
    path: string
    fullPath: string
    options?: TRouteOptions
}

export interface TRouteOptions
    extends Partial<TRouteSchema>,
        ExpressZod.TRouteOptions {}

type JoinPath<Prefix, Path extends string> = Prefix extends string
    ? Prefix extends ''
        ? Path
        : Path extends '' | '/'
          ? Prefix
          : `${Prefix extends `${infer P}/` ? P : Prefix}/${Path extends `/${infer P}` ? P : Path}`
    : Path

type _ExtractRouteSchema<Options extends TRouteOptions | undefined> =
    Options extends undefined
        ? {}
        : {
              [K in keyof Options & keyof TRouteSchema]: K extends keyof Options
                  ? NonNullable<Options[K]>
                  : never
          }

type GenerateRoute<
    Method extends TRoueMethod,
    Path extends string,
    RouteOptions extends TRouteOptions,
    RouterOptions extends TRouterOptions,
> = Simplify<{
    method: Method
    path: Path
    fullPath: RouterOptions extends { prefix: infer P }
        ? JoinPath<P, Path>
        : Path
    options: Writable<RouteOptions>
}>

type RedefinedThis<
    This,
    Options extends TRouterOptions,
    Routes extends TRouteRecord[],
    Routers extends _Router[],
    Method extends TRoueMethod,
    Path extends string,
    RouteOptions extends TRouteOptions,
> = This extends Application
    ? Application<
          Options,
          [...Routes, GenerateRoute<Method, Path, RouteOptions, Options>],
          Routers
      >
    : _Router<
          Options,
          [...Routes, GenerateRoute<Method, Path, RouteOptions, Options>],
          Routers
      >

// type Exact<T, Shape> = T extends Shape
//     ? T & Record<Exclude<keyof T, keyof Shape>, never>
//     : never

export interface TRouteRegistrar<
    This,
    Options extends TRouterOptions,
    Method extends TRoueMethod,
    Routes extends TRouteRecord[],
    Routers extends _Router[],
> {
    <const Path extends string, const RouteOptions extends TRouteOptions>(
        path: Path,
        options: NoExtraKeys<RouteOptions, TRouteOptions>,
        ...handlers: RequestHandler[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path, RouteOptions>
    <const Path extends string, const RouteOptions extends TRouteOptions>(
        path: Path,
        ...handlers:
            | [NoExtraKeys<RouteOptions, TRouteOptions>, ...RequestHandler[]]
            | RequestHandler[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path, {}>
}

function joinPath<const Prefix extends string, const Path extends string>(
    prefix: Prefix,
    path: Path,
): JoinPath<Prefix, Path> {
    if (path === '' || path === '/') {
        return prefix as JoinPath<Prefix, Path>
    }
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path
    return `${normalizedPrefix}/${normalizedPath}` as JoinPath<Prefix, Path>
}

export { _Router as Router }

declare global {
    namespace ExpressZod {
        interface TRouteOptions {}
    }
}
