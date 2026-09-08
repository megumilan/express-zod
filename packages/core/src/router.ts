import {
    type ErrorRequestHandler,
    type Express,
    type RequestHandler,
    Router,
    type RouterOptions,
} from 'express'
import type { ZodObject, ZodType } from 'zod'

class _Router<
    const Options extends TRouterOptions = {},
    const Routes extends TRouteRecord[] = [],
    const Routers extends _Router[] = [],
> {
    protected _options?: TRouterOptions
    protected readonly _host: Express | Router = Router()
    protected readonly _routes: TRouteRecord[] = []

    constructor(options?: Options | (TRouterOptions & {})) {
        this._options = options || {}
    }

    setOptions<const Options extends TRouterOptions>(options: Options) {
        const prefix = joinPath(
            this._options?.prefix || '',
            options.prefix || '',
        )
        this._options = { ...this._options, ...options, prefix }
        return this
    }

    protected registerRoute<Method extends TRoueMethod>(
        method: Method,
    ): TRouteRegistrar<this, Options, Method, Routes, Routers> {
        return <const Path extends string>(
            path: Path,
            _options: TRoueOptions | RequestHandler,
            ..._handlers: RequestHandler[]
        ) => {
            this._routes.push({
                method,
                path,
                fullPath: '',
            })
            return this as unknown as RedefinedThis<
                this,
                Options,
                Routes,
                Routers,
                Method,
                Path
            >
        }
    }

    get router() {
        return this._host
    }

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

    use(middleware: RequestHandler | ErrorRequestHandler): this {
        this._host.use(middleware)
        return this
    }
}

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

export interface TRouteResponseSchema {
    [K: number]: ZodType
}

export interface TRoutSchema {
    params: ZodObject
    query: ZodObject
    body: ZodType
    response: TRouteResponseSchema
    headers: ZodObject
    cookies: ZodObject
}

export interface TRouteMeta {
    tags: string[]
    summary: string
    description: string
    operationId: string
    externalDocs: string
    deprecated: false
}

export interface TRouteRecord {
    method: TRoueMethod
    path: string
    fullPath: string
    meta?: TRouteMeta
    schema?: TRoutSchema
}

export interface TRoueOptions extends Partial<TRoutSchema> {
    meta?: Partial<TRouteMeta>
}

type JoinPath<Prefix, Path extends string> = Prefix extends string
    ? Prefix extends ''
        ? Path
        : Path extends '' | '/'
          ? Prefix
          : `${Prefix extends `${infer P}/` ? P : Prefix}/${Path extends `/${infer P}` ? P : Path}`
    : Path

type RedefinedThis<
    This,
    Options extends TRouterOptions,
    Routes extends TRouteRecord[],
    Routers extends _Router[],
    Method extends TRoueMethod,
    Path extends string,
> = This extends _Router
    ? _Router<
          Options,
          [
              ...Routes,
              {
                  method: Method
                  path: Path
                  fullPath: Options extends { prefix: infer P }
                      ? JoinPath<P, Path>
                      : Path
              },
          ],
          Routers
      >
    : 'Application'

export interface TRouteRegistrar<
    This,
    Options extends TRouterOptions,
    Method extends TRoueMethod,
    Routes extends TRouteRecord[],
    Routers extends _Router[],
> {
    <const Path extends string>(
        path: Path,
        ...handlers: RequestHandler[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path>
    <const Path extends string>(
        path: Path,
        options: TRoueOptions,
        ...handlers: RequestHandler[]
    ): RedefinedThis<This, Options, Routes, Routers, Method, Path>
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
