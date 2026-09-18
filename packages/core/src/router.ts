import type { IncomingHttpHeaders } from 'node:http'
import {
    type ErrorRequestHandler,
    type Express,
    Router as ExpressRouter,
    type IRoute,
    type IRouter,
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
    type RouterOptions,
} from 'express'
import type {
    If,
    IsEmptyObject,
    IsNever,
    IsUnknown,
    OmitIndexSignature,
    Simplify,
    Writable,
} from 'type-fest'
import type { output, ZodObject, ZodType } from 'zod'
import type { Application } from './application'
import { schemaValidator } from './schema-validator'
import type { IsUnexpected, MarkOptionalIfUndefined } from './types/utility'

declare global {
    namespace ExpressZod {
        interface RouteOptions {}
        interface RouteResponse<
            Responses extends Record<number, unknown>,
            Locals extends Record<string, unknown> = Record<string, unknown>,
            StatusCode extends keyof Responses = 200,
        > extends Omit<
                Response<Responses[StatusCode], Locals>,
                'status' | 'json'
            > {
            status<const Code extends keyof Responses>(
                statusCode: Code,
            ): RouteResponse<Responses, Locals, Code>
            json(
                ...args: If<
                    IsNever<Responses[StatusCode]>,
                    [],
                    [body: Responses[StatusCode]]
                >
            ): this
        }
    }
}

export type NoExtraKeys<T, S> = { [K in keyof T & keyof S]: T[K] } | (S & {})

export interface TRouterOptions extends RouterOptions {
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

export type TRouteSchemaKey = (typeof ROUTE_SCHEMAS)[number]

export interface TRouteResponseSchema {
    [K: number]: ZodType
}

export interface TRouteSchema {
    params: ZodObject
    query: ZodObject
    body: ZodType
    responses: TRouteResponseSchema
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
        ExpressZod.RouteOptions {}

type JoinPath<Prefix, Path extends string> = Prefix extends string
    ? Prefix extends ''
        ? Path
        : Path extends '' | '/'
          ? Prefix
          : `${Prefix extends `${infer P}/` ? P : Prefix}/${Path extends `/${infer P}` ? P : Path}`
    : Path

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
    Routers extends Router[],
    Method extends TRoueMethod,
    Path extends string,
    RouteOptions extends TRouteOptions,
> = This extends Application
    ? Application<
          Options,
          [...Routes, GenerateRoute<Method, Path, RouteOptions, Options>],
          Routers
      >
    : Router<
          Options,
          [...Routes, GenerateRoute<Method, Path, RouteOptions, Options>],
          Routers
      >

type InferRouteSchema<Options extends TRouteOptions> = {
    [K in keyof Options]: K extends 'responses'
        ? {
              [Status in keyof Options[K]]: output<Options[K][Status]>
          }
        : K extends 'headers'
          ? If<
                IsUnknown<output<Options[K]>>,
                OmitIndexSignature<IncomingHttpHeaders>,
                OmitIndexSignature<IncomingHttpHeaders> & output<Options[K]>
            >
          : output<Options[K]>
}

interface TRouteResponse<
    Responses extends Record<number, unknown>,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    StatusCode extends keyof Responses = 200,
> extends ExpressZod.RouteResponse<Responses, Locals, StatusCode> {}

export type TRouteHandler<
    Options extends TRouteOptions,
    Inferred = InferRouteSchema<Options>,
    Params = Inferred extends { params: infer P }
        ? MarkOptionalIfUndefined<P>
        : unknown,
    Responses = Inferred extends { responses: infer R } ? R : unknown,
    Resp = Responses extends { 200: infer S } ? S : unknown,
    Body = Inferred extends { body: infer B } ? B : unknown,
    Query = Inferred extends { query: infer Q } ? Q : unknown,
    Headers = Inferred extends { headers: infer H }
        ? H
        : OmitIndexSignature<IncomingHttpHeaders>,
    Cookies = Inferred extends { cookies: infer C } ? C : unknown,
> = (
    req: Omit<Request<Params, Resp, Body, Query>, 'headers' | 'cookies'> & {
        headers: Headers
        cookies: Cookies
    },
    res: TRouteResponse<Responses & {}>,
    next: NextFunction,
) => unknown

export interface TRouteRegistrar<
    This,
    Options extends TRouterOptions,
    Method extends TRoueMethod,
    Routes extends TRouteRecord[],
    Routers extends Router[],
> {
    <const Path extends string, const RouteOptions extends TRouteOptions>(
        path: Path,
        options: IsEmptyObject<RouteOptions> extends true
            ? RouteOptions
            : NoExtraKeys<RouteOptions, TRouteOptions>,
        ...handlers: TRouteHandler<RouteOptions>[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path, RouteOptions>
    <const Path extends string, const RouteOptions extends TRouteOptions = {}>(
        path: Path,
        ...handlers:
            | [
                  IsEmptyObject<RouteOptions> extends true
                      ? RouteOptions
                      : NoExtraKeys<RouteOptions, TRouteOptions>,
                  ...TRouteHandler<RouteOptions>[],
              ]
            | TRouteHandler<RouteOptions>[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path, RouteOptions>
}

export type TPluginContext = {
    readonly raw: ExpressRouter | Express
    readonly instance: Router | Application
}

export interface TPlugin<_Routes extends TRouteRecord[] = []> {
    readonly name: string
    readonly install: (ctx: TPluginContext) => void
}

export interface TRoute extends IRoute {
    method: TRoueMethod
    fullPath: string
    routeOptions: TRouteOptions
}

export type PrefixOf<O extends TRouterOptions> = O extends {
    prefix: infer P extends string
}
    ? P
    : ''

export type UpdateRoutesFullPath<
    Routes extends TRouteRecord[],
    Prefix extends string,
> = {
    [K in keyof Routes]: Routes[K] extends {
        fullPath: infer FullPath extends string
    }
        ? Simplify<
              Omit<Routes[K], 'fullPath'> & {
                  fullPath: JoinPath<Prefix, FullPath>
              }
          >
        : Routes[K]
} extends infer Routes
    ? Routes extends readonly TRouteRecord[]
        ? Routes
        : never
    : never

export type UpdateFullPath<R extends Router, Prefix extends string> =
    R extends Router<infer Options, infer Routes, infer Routers>
        ? Router<Options, UpdateRoutesFullPath<Routes, Prefix>, Routers>
        : never

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

class Router<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends Router[] = [],
> {
    protected readonly _options?: TRouterOptions
    protected readonly host: IRouter = ExpressRouter()

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
            ..._handlers:
                | TRouteHandler<RouteOptions>[]
                | [RouteOptions, ...TRouteHandler<RouteOptions>[]]
        ) => {
            const [options, handlers] = (typeof _handlers[0] === 'function'
                ? [{}, _handlers]
                : [_handlers[0] || {}, _handlers.slice(1)]) as unknown as [
                RouteOptions,
                RequestHandler[],
            ]

            const staticSchema = {} as Partial<TRouteSchema>
            for (const key of ROUTE_SCHEMAS) {
                if (options[key]) {
                    staticSchema[key] = options[key] as never
                }
            }
            const { responses: _, ...runtimeSchema } = staticSchema
            if (Object.keys(runtimeSchema).length) {
                handlers.unshift(schemaValidator(runtimeSchema))
            }

            let fullPath: string = path
            const prefix = this._options?.prefix?.trim() || ''
            if (prefix) {
                fullPath = joinPath(prefix, path)
            }
            this.host[method](fullPath, ...handlers)
            this.updateLastRoute({
                method,
                fullPath,
                routeOptions: { ...options, ...staticSchema },
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

    /** The registered routes */
    get routes() {
        return this.getRoutes(this.host)
    }

    get get() {
        return this.registerRoute('get')
    }
    get post() {
        return this.registerRoute('post')
    }
    get put() {
        return this.registerRoute('put')
    }
    get delete() {
        return this.registerRoute('delete')
    }
    get patch() {
        return this.registerRoute('patch')
    }
    get head() {
        return this.registerRoute('head')
    }
    get options() {
        return this.registerRoute('options')
    }

    use<const M extends RequestHandler | ErrorRequestHandler>(
        middleware: M,
    ): this
    use<const P extends TPlugin>(
        plugin: P,
    ): P extends TPlugin<infer _Routes>
        ? IsUnexpected<
              Router<
                  Options,
                  [
                      ...Routes,
                      ...UpdateRoutesFullPath<_Routes, PrefixOf<Options>>,
                  ],
                  Routers
              >,
              this
          >
        : this
    use<const R extends Router>(
        router: R,
    ): Router<
        Options,
        Routes,
        [...Routers, UpdateFullPath<R, PrefixOf<Options>>]
    >
    use<const T extends Router>(
        target: RequestHandler | ErrorRequestHandler | T | TPlugin,
    ) {
        return this.handleUse(target)
    }

    protected handleUse<const T extends Router>(
        target: RequestHandler | ErrorRequestHandler | T | TPlugin,
    ) {
        if (typeof target === 'function') {
            this.host.use(target)
        }
        if (target instanceof Router) {
            this.host.use(this._options?.prefix || '', target.host)
            this.splicePrefix(this._options?.prefix || '', target.host)
        }
        if (typeof target === 'object' && 'install' in target) {
            target.install({
                raw: this.host,
                instance: this,
            })
        }
        return this as
            | Application<Options, Routes, [...Routers, T]>
            | Router<Options, Routes, [...Routers, T]>
    }

    protected getRoutes(router: IRouter) {
        const routes: TRoute[] = []
        for (const layer of router.stack) {
            if (layer.route) {
                routes.push(layer.route as TRoute)
                continue
            }
            const childRouter = layer.handle as unknown as IRouter
            if (Array.isArray(childRouter?.stack)) {
                routes.push(...this.getRoutes(childRouter))
            }
        }
        return routes
    }

    protected updateLastRoute(
        data: Pick<TRoute, 'method' | 'fullPath' | 'routeOptions'>,
    ) {
        const target = this.routes.at(-1)
        if (target) {
            target.method = data.method
            target.fullPath = data.fullPath
            target.routeOptions = data.routeOptions
        }
    }

    protected splicePrefix(prefix: string, router?: IRouter) {
        if (router) {
            const routes = this.getRoutes(router)
            return routes.forEach((route) => {
                route.fullPath = joinPath(prefix, route.fullPath || route.path)
            })
        }
        const target = this.routes.at(-1)
        if (target) {
            target.fullPath = joinPath(prefix, target.fullPath || target.path)
        }
    }
}

export { Router }
