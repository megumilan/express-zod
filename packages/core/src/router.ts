import type { IncomingHttpHeaders } from 'node:http'
import {
    type ErrorRequestHandler,
    type Express,
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
    Router,
    type RouterOptions,
} from 'express'
import type {
    If,
    IsUnknown,
    MergeDeep,
    OmitIndexSignature,
    Simplify,
    Writable,
} from 'type-fest'
import type { output, ZodObject, ZodOptional, ZodString, ZodType } from 'zod'
import type { Application } from './application'
import {
    type IsMatchPathParams,
    inferPathParamsSchema,
    isMatchPathParams,
    schemaValidator,
} from './schema-validator'

declare global {
    namespace ExpressZod {
        interface TRouteOptions {}
        interface TRouteResponse<
            Responses extends Record<number, unknown>,
            Locals extends Record<string, unknown> = Record<string, unknown>,
            StatusCode extends keyof Responses = 200,
        > extends Omit<
                Response<Responses[StatusCode], Locals>,
                'status' | 'json'
            > {
            status<const Code extends keyof Responses>(
                statusCode: Code,
            ): TRouteResponse<Responses, Locals, Code>
            json(body?: Responses[StatusCode]): this
        }
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

export type TRouteSchemaKey = (typeof ROUTE_SCHEMAS)[number]

export interface TRouteResponseSchema {
    [K: number]: ZodType
}

// export type TRouteSchema = {
//     [K in TRouteSchemaKey]: K extends 'responses'
//         ? TRouteResponseSchema
//         : K extends 'body'
//           ? ZodType
//           : ZodObject
// }

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
        ExpressZod.TRouteOptions {}

// export interface TRouteOptionsWidthPathParams<Path extends string>
//     extends TRouteOptions {
//     params: IsMatchPathParams<Path> extends true ? PathParamsToZod<Path> : {}
// }

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

type PathParamsToZod<Path extends string, T = PathParams<Path>> = ZodObject<{
    [K in keyof T]-?: {} extends Pick<T, K> ? ZodOptional<ZodString> : ZodString
}>

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

type InferRouteSchema<
    Path extends string,
    Options extends TRouteOptions,
> = MergeDeep<
    { params: PathParams<Path> },
    {
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
>

interface TRouteResponse<
    Responses extends Record<number, unknown>,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    StatusCode extends keyof Responses = 200,
> extends ExpressZod.TRouteResponse<Responses, Locals, StatusCode> {}

export type TRouteHandler<
    Path extends string,
    Options extends TRouteOptions,
    Inferred = InferRouteSchema<Path, Options>,
    Params = Inferred extends { params: infer P } ? P : unknown,
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
    Routers extends _Router[],
> {
    <const Path extends string, const RouteOptions extends TRouteOptions>(
        path: If<IsValidPath<Path>, Path, never>,
        options: NoExtraKeys<RouteOptions, TRouteOptions>,
        ...handlers: TRouteHandler<Path, RouteOptions>[]
    ): RedefinedThis<
        This,
        Options,
        Routes,
        Routers,
        Method,
        Path,
        RouteOptions &
            If<IsMatchPathParams<Path>, { params: PathParamsToZod<Path> }, {}>
    >
    <const Path extends string, const RouteOptions extends TRouteOptions = {}>(
        path: If<IsValidPath<Path>, Path, never>,
        ...handlers:
            | [
                  NoExtraKeys<RouteOptions, TRouteOptions>,
                  ...TRouteHandler<Path, RouteOptions>[],
              ]
            | TRouteHandler<Path, RouteOptions>[]
    ): RedefinedThis<
        This,
        Options,
        Routes,
        Routers,
        Method,
        Path,
        RouteOptions &
            If<IsMatchPathParams<Path>, { params: PathParamsToZod<Path> }, {}>
    >
    // <const Path extends string, const RouteOptions extends TRouteOptions>(
    //     path: If<IsValidPath<Path>, Path, never>,
    //     options: NoExtraKeys<RouteOptions, TRouteOptions>,
    //     ...handlers: TRouteHandler<Path, RouteOptions>[]
    // ): RedefinedThis<
    //     This,
    //     Options,
    //     Routes,
    //     Routers,
    //     Method,
    //     Path,
    //     RouteOptions & { params: PathParamsToZod<Path> }
    // >
    // <
    //     const Path extends string,
    //     const RouteOptions extends TRouteOptionsWidthPathParams<Path>,
    // >(
    //     path: If<IsValidPath<Path>, Path, never>,
    //     ...handlers:
    //         | [
    //               NoExtraKeys<RouteOptions, TRouteOptions>,
    //               ...TRouteHandler<Path, RouteOptions>[],
    //           ]
    //         | TRouteHandler<Path, RouteOptions>[]
    // ): RedefinedThis<This, Options, Routes, Routers, Method, Path, RouteOptions>
}

type PathParams<Path extends string> =
    Path extends `${infer Before}{/:${infer Optional}}${infer After}`
        ? Simplify<
              PathParams<Before> & {
                  [K in Optional]?: string
              } & PathParams<After>
          >
        : Path extends `${infer _Before}/:${infer Param}/${infer Rest}`
          ? Simplify<{ [K in Param]: string } & PathParams<`/${Rest}`>>
          : Path extends `${infer _Before}/:${infer Param}`
            ? { [K in Param]: string }
            : {}

type _WithParams<Path extends string, Options extends TRouteOptions> = Omit<
    Options,
    'params'
> & {
    params: PathParams<Path>
}

type IsValidSegment<S extends string> = S extends `{${infer Inner}}`
    ? Inner extends `/${string}`
        ? IsValidPath<Inner extends `/${infer Rest}` ? Rest : never>
        : false
    : S extends Lowercase<S>
      ? S extends `${string}-${string}` | `${string}_${string}`
          ? false
          : true
      : false

/** All path segments must be lowercase and must not contain `-` or `_`. */
export type IsValidPath<S extends string> =
    S extends `${infer Segment}/${infer Rest}`
        ? IsValidSegment<Segment> extends true
            ? IsValidPath<Rest>
            : false
        : IsValidSegment<S>

export type TPluginContext = {
    readonly raw: Router | Express
    readonly instance: _Router | Application
}

export interface TPlugin {
    readonly name: string
    readonly install: (ctx: TPluginContext) => void
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
            ..._handlers:
                | TRouteHandler<Path, RouteOptions>[]
                | [RouteOptions, ...TRouteHandler<Path, RouteOptions>[]]
        ) => {
            const [options, handlers] = (
                typeof _handlers[0] === 'function'
                    ? [{}, _handlers]
                    : [_handlers[0] || {}, _handlers.slice(1)]
            ) as [RouteOptions, RequestHandler[]]

            let staticSchema = {} as Partial<TRouteSchema>
            for (const key of ROUTE_SCHEMAS) {
                if (options[key]) {
                    staticSchema[key] = options[key] as never
                }
            }
            if (isMatchPathParams(path)) {
                const { params, ...rest } = staticSchema
                const paramsInferred = inferPathParamsSchema(path)
                staticSchema = {
                    params: params
                        ? paramsInferred.extend(params.shape)
                        : paramsInferred,
                    ...rest,
                }
            }
            const { responses, ...runtimeSchema } = staticSchema
            if (Object.keys(runtimeSchema).length) {
                handlers.unshift(schemaValidator(runtimeSchema))
            }

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
                options: { ...options, ...staticSchema },
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

    use(middleware: RequestHandler | ErrorRequestHandler): this
    use(plugin: TPlugin): this
    use(target: RequestHandler | ErrorRequestHandler | TPlugin) {
        if (typeof target === 'function') {
            this._host.use(target)
        } else {
            target.install({
                raw: this._host,
                instance: this,
            })
        }
        return this
    }
}

export { _Router as Router }
