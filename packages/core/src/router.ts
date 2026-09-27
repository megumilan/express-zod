import type e from 'express'
import express, { Router as ExpressRouter } from 'express'
import type {
    IsAny,
    IsNever,
    OmitIndexSignature,
    Or,
    Simplify,
    Writable,
} from 'type-fest'
import type { output, ZodObject, ZodType } from 'zod'
import { toResponse } from './response'
import { schemaValidator } from './schema-validator'
import type { ErrorRequestHandler, RequestHandler } from './types/handler'
import type { IntelliSense, NoExtraKeys } from './types/utility'

declare global {
    namespace ExpressZod {
        interface RouteOptions {}
        interface Request<Schema extends Record<string, any>> {}
        interface Response<
            Responses extends Record<number, unknown>,
            Locals extends Record<string, any> = Record<string, any>,
            StatusCode extends keyof Responses = 201 extends keyof Responses
                ? 201
                : 200,
        > {}
    }
}

declare module 'zod' {
    interface GlobalMeta {
        /** Skip validation */
        skip?: boolean
    }
}

export type HttpMethod =
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options'
    | 'all'
    | 'query'

export interface IRouterOptions extends e.RouterOptions {
    prefix?: string
    name?: string
}

export interface ISchema {
    params?: ZodObject
    query?: ZodObject
    body?: ZodType
    headers?: ZodObject
    cookies?: ZodObject
    responses?: Record<number, ZodType>
    locals?: ZodObject
}

export type InferRouteOptions<Options extends object> = {
    -readonly [K in keyof Options]: K extends keyof ISchema
        ? _InferSchema<Extract<Options, ISchema>, K>
        : Options[K]
}

type _InferSchema<
    S extends ISchema,
    K extends keyof ISchema,
> = K extends 'responses' ? _InferResponsesSchema<S> : Writable<output<S[K]>>

type _InferResponsesSchema<Options extends IRouteOptions> = Options extends {
    responses: infer Responses
}
    ? {
          -readonly [Status in keyof Responses]: output<Responses[Status]>
      }
    : unknown

export interface IRouteOptions extends ISchema, ExpressZod.RouteOptions {}

type AnyHandler =
    | ErrorRequestHandler
    | RequestHandler
    | e.RequestHandler
    | e.ErrorRequestHandler

type RouteMethods = {
    [Method in HttpMethod]?: object | undefined
}

export interface IRouteRecords {
    [Path: string]: RouteMethods
}

type JoinPath<Prefix, Path extends string> = Prefix extends string
    ? Prefix extends ''
        ? Path
        : Path extends '' | '/'
          ? Prefix
          : `${Prefix extends `${infer P}/` ? P : Prefix}/${Path extends `/${infer P}` ? P : Path}`
    : Path

/** Runtime counterpart of {@link JoinPath}. */
function joinPath(prefix: string, path: string) {
    if (!prefix) {
        return path
    }
    if (!path || path === '/') {
        return prefix
    }
    return `${prefix.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

type PrefixOf<Options> = Options extends { prefix: infer Prefix extends string }
    ? Prefix
    : ''

type PrefixRecords<Records extends IRouteRecords, Prefix extends string> = {
    [Path in keyof Records as JoinPath<Prefix, Path & string>]: Records[Path]
} extends infer Reb extends IRouteRecords
    ? Reb
    : never

type AddMethod<Existing, Method extends HttpMethod, Options extends object> = {
    [M in Method | keyof Existing]: M extends Method
        ? Simplify<InferRouteOptions<Options>>
        : M extends keyof Existing
          ? Existing[M]
          : never
}

type AddRoute<
    Records extends IRouteRecords,
    Path extends string,
    Method extends HttpMethod,
    Options extends object,
> = Simplify<{
    [Key in keyof Records | Path]: Key extends Path
        ? Simplify<
              AddMethod<
                  Key extends keyof Records ? Records[Key] : {},
                  Method,
                  Options
              >
          >
        : Key extends keyof Records
          ? Records[Key]
          : never
}>

type AddMethods<
    Existing extends RouteMethods,
    NewMethods extends RouteMethods,
> = Simplify<{
    [Method in
        | keyof Existing
        | keyof NewMethods]: Method extends keyof NewMethods
        ? NewMethods[Method]
        : Method extends keyof Existing
          ? Existing[Method]
          : never
}>

/** Merges `NewRecords` into `Records`; a later method on the same path wins. */
type AddRoutes<
    Records extends IRouteRecords,
    NewRecords extends IRouteRecords,
> = Simplify<{
    [Path in keyof Records | keyof NewRecords]: Path extends keyof NewRecords
        ? Path extends keyof Records
            ? AddMethods<Records[Path], NewRecords[Path]>
            : NewRecords[Path]
        : Path extends keyof Records
          ? Records[Path]
          : never
}>

export interface IRouteRegistrar<
    RouterOptions extends IRouterOptions,
    Records extends IRouteRecords,
    Method extends HttpMethod,
> {
    /**
     * Registers a route with options.
     *
     * @param path The route path.
     * @param options The route options.
     * @param handlers The route handlers.
     *
     * @example
     * ```ts
     * new Router().get('/', { query: z.object({ name: z.string() }) }, (req) => `Hello ${req.query.name}`)
     * ```
     */
    <const Path extends string, const Options extends IRouteOptions = {}>(
        path: Path,
        options: NoExtraKeys<Options, IRouteOptions>,
        ...handlers: RequestHandler<Simplify<InferRouteOptions<Options>>>[]
    ): Router<
        RouterOptions,
        AddRoute<
            Records,
            JoinPath<PrefixOf<RouterOptions>, Path>,
            Method,
            Options
        >
    >
    /**
     * Registers a route without options.
     *
     * @param path The route path.
     * @param handler The route handler.
     *
     * @example
     * ```ts
     * new Router().get('/', (req) => 'Hello World')
     * ```
     */
    <const Path extends string, const Options extends IRouteOptions = {}>(
        path: Path,
        ...handlers:
            | [
                  NoExtraKeys<Options, IRouteOptions>,
                  ...RequestHandler<Simplify<InferRouteOptions<Options>>>[],
              ]
            | RequestHandler<Simplify<InferRouteOptions<Options>>>[]
    ): Router<
        RouterOptions,
        AddRoute<Records, JoinPath<PrefixOf<RouterOptions>, Path>, Method, {}>
    >
}

export interface IRoute extends e.IRoute {
    '~path': string
    '~options': IRouteOptions
}

export interface IPlugin<_Routes extends IRouteRecords = {}> {
    readonly name: string
    readonly install: (router: Router) => void
}

export class Router<
    const RouterOptions extends IRouterOptions = {},
    const Records extends IRouteRecords = {},
> {
    '~name': string | undefined
    '~prefix': string
    /** {@link e.Express Express} */
    '~express': e.Express | undefined
    /**
     * The root router of the routes mounted.
     */
    '~router': e.Router
    '~mounted' = false

    constructor(
        options: Writable<IntelliSense<RouterOptions, IRouterOptions>> &
            IRouterOptions = {} as any,
    ) {
        this['~name'] = options.name
        this['~prefix'] = options.prefix || ''
        this['~router'] = ExpressRouter(options)
    }

    get get() {
        return this['~register']('get')
    }
    get post() {
        return this['~register']('post')
    }
    get put() {
        return this['~register']('put')
    }
    get patch() {
        return this['~register']('patch')
    }
    get delete() {
        return this['~register']('delete')
    }
    get head() {
        return this['~register']('head')
    }
    get options() {
        return this['~register']('options')
    }
    get all() {
        return this['~register']('all')
    }
    get query() {
        return this['~register']('query')
    }

    /**
     * Registers middleware or error-handling middleware with options.
     *
     * Pass options as the first argument, followed by one or more handlers.
     * Use `'error'` as the first generic argument to register error handlers.
     *
     * @param options Middleware options.
     * @param handlers Middleware handlers or error handlers.
     *
     * @example
     * ```ts
     * router.use({ params: z.object({ id: z.string() }) }, (req, res, next) => {
     *     req.params.id // string
     * })
     *
     * router.use<'error'>({  }, (err, req, res, next) => {})
     * ```
     */
    use<
        const _Type extends 'error' | undefined = undefined,
        const Options extends IRouteOptions = {},
    >(
        options: NoExtraKeys<Options, IRouteOptions>,
        ...handlers: _Type extends 'error'
            ? ErrorRequestHandler[]
            : RequestHandler<Simplify<InferRouteOptions<Options>>>[]
    ): this
    /**
     * Registers middleware without options.
     *
     * @param handlers Middleware handlers.
     *
     * @example
     * ```ts
     * router.use((req, res, next) => {})
     * ```
     */
    use(
        ...handlers:
            | [IRouteOptions, RequestHandler<Simplify<InferRouteOptions<{}>>>]
            | RequestHandler<Simplify<InferRouteOptions<{}>>>[]
    ): this
    /**
     * Registers middleware, same as {@link e.IRouter.use the original use}
     *
     * @param handlers Middleware handlers.
     *
     * @example
     * ```ts
     * new Router().use(express.json())
     * ```
     */
    use(...handlers: e.RequestHandler[]): this
    /**
     * Registers error-handling middleware without options.
     *
     * Pass `'error'` as the generic argument to enable type-safe
     * parameter inference for error handlers. Without it, the handler
     * parameters may be inferred as `any`.
     *
     * @param handlers Error handlers.
     *
     * @example
     * ```ts
     * new Router().use<'error'>((_err, _req, _res, _next) => {})
     * ```
     */
    use<const _Type extends 'error', const Options extends IRouteOptions = {}>(
        ...handlers:
            | [
                  options: NoExtraKeys<Options, IRouteOptions>,
                  ...handlers: ErrorRequestHandler[],
              ]
            | [...handlers: ErrorRequestHandler[]]
    ): this
    /**
     * Registers a router.
     *
     * Mounts the router and incorporates its route records into the current
     * router's type, including the current router's prefix.
     *
     * @param router Router to mount.
     *
     * @example
     * ```ts
     * const users = new Router({ prefix: '/users' }).get('/', handler)
     *
     * const app = new Router({ prefix: '/api' }).use(users)
     * // Routes include /api/users
     * ```
     */
    use<R extends Router>(
        router: R,
    ): R extends Router<infer _, infer Routes extends IRouteRecords>
        ? Or<IsAny<Routes>, IsNever<Routes>> extends true
            ? this
            : Router<
                  RouterOptions,
                  AddRoutes<
                      Records,
                      PrefixRecords<Routes, PrefixOf<RouterOptions>>
                  >
              >
        : this
    /**
     * Registers a router with prefix.
     *
     * Mounts the router and incorporates its route records into the current
     * router's type, including the current router's prefix.
     *
     * @param router Router to mount.
     *
     * @example
     * ```ts
     * const users = new Router({ prefix: '/users' }).get('/', handler)
     *
     * const app = new Router({ prefix: '/api' }).use('/extra', users)
     * // Routes include /api/extra/users
     * ```
     */
    use<const P extends string, R extends Router>(
        prefix: P,
        router: R,
    ): R extends Router<infer _, infer Routes extends IRouteRecords>
        ? Or<IsAny<Routes>, IsNever<Routes>> extends true
            ? this
            : Router<
                  RouterOptions,
                  AddRoutes<
                      Records,
                      PrefixRecords<
                          Routes,
                          JoinPath<PrefixOf<RouterOptions>, P>
                      >
                  >
              >
        : this
    /**
     * Registers a plugin.
     *
     * @param plugin The plugin.
     */
    use<const Plugin extends IPlugin>(
        plugin: Plugin,
    ): Plugin extends IPlugin<infer Routes>
        ? Or<IsAny<Routes>, IsNever<Routes>> extends true
            ? this
            : Routes extends IRouteRecords
              ? Router<
                    RouterOptions,
                    AddRoutes<
                        Records,
                        PrefixRecords<
                            OmitIndexSignature<Routes>,
                            PrefixOf<RouterOptions>
                        >
                    >
                >
              : this
        : this
    use(
        first?: IRouteOptions | AnyHandler | Router | string | IPlugin,
        ...rest: AnyHandler[]
    ): this {
        if (first instanceof Router) {
            this['~router'].use(first['~prefix'], first['~router'])
            this['~updateRoutes'](first['~router'])
            return this
        }

        if (typeof first === 'string' && rest[0] instanceof Router) {
            const router = rest[0]
            this['~router'].use(
                joinPath(first, router['~prefix']),
                router['~router'],
            )
            this['~updateRoutes'](router['~router'], first)
            return this
        }

        if (
            typeof first === 'object' &&
            'name' in first &&
            'install' in first &&
            typeof first.install === 'function'
        ) {
            first.install(this)
            return this
        }

        const leading = first as IRouteOptions | AnyHandler | undefined
        const handlers =
            typeof leading === 'function' ? [leading, ...rest] : rest
        const validation =
            typeof leading === 'function'
                ? null
                : schemaValidator(leading ?? {})

        this['~router'].use(
            ...(validation ? [validation] : []),
            ...handlers.map((handler) => this['~wrap'](handler)),
        )
        return this
    }

    get listen() {
        const app = this['~mount']()
        return app.listen.bind(app)
    }

    '~register'<const Method extends HttpMethod>(method: Method) {
        const register = (
            path: string,
            ...args: [IRouteOptions, RequestHandler[]] | RequestHandler[]
        ) => {
            let options: IRouteOptions
            let handlers: RequestHandler[]

            if (typeof args[0] === 'function') {
                options = {} as IRouteOptions
                handlers = args as RequestHandler[]
            } else {
                options = args[0]
                handlers = args.slice(1) as RequestHandler[]
            }

            const validation = schemaValidator(options)

            const dispatch = this['~router'][method] as (
                path: string,
                ...handlers: e.RequestHandler[]
            ) => unknown

            dispatch.call(
                this['~router'],
                path,
                ...(validation ? [validation] : []),
                ...handlers.map((handler) => toResponse(handler)),
            )
            this['~updateRoute'](joinPath(this['~prefix'], path), options)
            return this
        }
        return register as unknown as IRouteRegistrar<
            RouterOptions,
            Records,
            Method
        >
    }

    '~wrap'(handler: AnyHandler) {
        return (
            handler.length === 4
                ? handler
                : toResponse(handler as RequestHandler, { autoNext: false })
        ) as e.RequestHandler | e.ErrorRequestHandler
    }

    '~mount'() {
        if (!this['~express']) {
            this['~express'] = express()
        }
        if (!this['~mounted']) {
            this['~express'].use(this['~prefix'], this['~router'])
            this['~mounted'] = true
        }
        return this['~express']
    }

    /** The registered routes */
    get '~routes'() {
        return this['~getRoues'](this['~router'])
    }

    '~getRoues'(router: e.Router) {
        const routes: IRoute[] = []

        for (const layer of router.stack) {
            if (layer.route) {
                routes.push(layer.route as IRoute)
                continue
            }

            const childRouter = layer.handle as unknown as e.IRouter

            if (Array.isArray(childRouter.stack)) {
                routes.push(...this['~getRoues'](childRouter))
            }
        }

        return routes
    }

    '~updateRoute'(path: string, options: IRouteOptions) {
        const target = this['~routes'].at(-1)
        if (target) {
            target['~path'] = path
            target['~options'] = options
        }
    }

    '~updateRoutes'(router: e.Router, prefix: string = '') {
        const routes = this['~getRoues'](router)
        for (const route of routes) {
            Object.assign(route, {
                '~path': joinPath(
                    joinPath(this['~prefix'], prefix),
                    route['~path'],
                ),
            })
        }
    }
}
