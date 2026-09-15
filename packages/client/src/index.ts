import {
    HTTP_METHODS,
    type Router,
    type TRoueMethod,
    type TRouteOptions,
    type TRouteRecord,
} from 'express-zod'
import type {
    ArrayLength,
    HasRequiredKeys,
    If,
    IsEmptyObject,
    RequiredKeysOf,
    Simplify,
    Writable,
} from 'type-fest'
import type { output } from 'zod'

type MarkOptionalIfNoRequiredKeys<T extends object> = Simplify<
    {
        [K in keyof T as T[K] extends object
            ? RequiredKeysOf<T[K]> extends never
                ? never
                : K
            : K]: T[K]
    } & {
        [K in keyof T as T[K] extends object
            ? RequiredKeysOf<T[K]> extends never
                ? K
                : never
            : never]?: T[K]
    }
>

type OmitUnknown<T> = Simplify<{
    [K in keyof T as unknown extends T[K] ? never : K]: T[K]
}>

type RemoveUndefinedIfOptional<T> = T extends (...args: unknown[]) => unknown
    ? T
    : T extends readonly unknown[]
      ? {
            [K in keyof T]: RemoveUndefinedIfOptional<T[K]>
        }
      : T extends object
        ? {
              [K in keyof T]: {} extends Pick<T, K>
                  ? RemoveUndefinedIfOptional<Exclude<T[K], undefined>>
                  : RemoveUndefinedIfOptional<T[K]>
          }
        : T

type InferSchema<Options extends TRouteOptions> = OmitUnknown<{
    [K in keyof Options]: K extends 'responses'
        ? Simplify<
              Writable<{
                  [Status in keyof Options[K]]: RemoveUndefinedIfOptional<
                      output<Options[K][Status]>
                  >
              }>
          >
        : RemoveUndefinedIfOptional<output<Options[K]>>
}>

type InferOptions<
    Options extends TRouteOptions,
    Schema = InferSchema<Options>,
    Arguments = Simplify<
        MarkOptionalIfNoRequiredKeys<Omit<Schema, 'responses'>>
    >,
> = Simplify<{
    _required: HasRequiredKeys<Arguments & {}>
    arguments: Arguments
    responses: Schema extends {
        responses: infer Responses
    }
        ? Responses extends { 200: infer _ }
            ? Responses
            : { 200: unknown }
        : { 200: unknown }
}>

type RouterRecords<R extends Router> =
    R extends Router<infer _, infer Routes, infer Routers>
        ? {
              [Method in Routes[number] extends infer Route
                  ? Route extends TRouteRecord
                      ? Route['method']
                      : never
                  : never]: {
                  [Route in Routes[number] as Route extends TRouteRecord
                      ? Route['method'] extends Method
                          ? Route['fullPath']
                          : never
                      : never]: Route extends TRouteRecord
                      ? InferOptions<Route['options'] & {}>
                      : never
              }
          } & (ArrayLength<Routers> extends 0
              ? {}
              : RouterRecords<Routers[number]>)
        : {}

type RouterToFunctions<
    R extends Router,
    Routes extends Record<
        string,
        Record<
            string,
            {
                _required: boolean
                arguments: unknown
                responses: Record<number, unknown>
            }
        >
    > = RouterRecords<R>,
> = Simplify<{
    [Method in keyof Routes]: <const Path extends keyof Routes[Method]>(
        path: Path,
        ..._args: If<
            IsEmptyObject<Routes[Method][Path]['arguments']>,
            [],
            If<
                Routes[Method][Path]['_required'],
                [args: Routes[Method][Path]['arguments']],
                [args?: Routes[Method][Path]['arguments']]
            >
        >
    ) => Promise<Routes[Method][Path]['responses'][200]>
}>

export interface TClientOptions {
    errorCallback?: (err: unknown) => void
    headers?: Record<string, string | (() => string)>
}

type RuntimeArguments = {
    params?: Record<string, unknown>
    query?: Record<string, unknown>
    headers?: Record<string, string>
    cookies?: Record<string, string>
    body?: unknown
}

export function defineClient<R extends Router>(
    host: string,
    options?: TClientOptions,
) {
    return new Proxy(
        {},
        {
            get(_target, prop: string) {
                if (!HTTP_METHODS.includes(prop as TRoueMethod)) {
                    return (() => {
                        console.error(`Unknown HTTP method: ${prop}`)
                        return undefined
                    })()
                }

                const method = prop as TRoueMethod

                return async (path: string, args?: RuntimeArguments) => {
                    let pathname = path

                    // params
                    if (args?.params) {
                        for (const [key, value] of Object.entries(
                            args.params,
                        )) {
                            const encoded =
                                value == null
                                    ? ''
                                    : encodeURIComponent(String(value))

                            pathname = pathname
                                .replace(
                                    `{/:${key}}`,
                                    encoded ? `/${encoded}` : '',
                                )
                                .replace(
                                    `/:${key}`,
                                    encoded ? `/${encoded}` : '',
                                )
                        }
                    }

                    const url = new URL(
                        pathname,
                        host.endsWith('/') ? host : `${host}/`,
                    )

                    // query
                    if (args?.query) {
                        for (const [key, value] of Object.entries(args.query)) {
                            if (value == null) {
                                continue
                            }

                            if (Array.isArray(value)) {
                                for (const item of value) {
                                    if (item == null) {
                                        continue
                                    }

                                    url.searchParams.append(key, String(item))
                                }
                            } else {
                                url.searchParams.set(key, String(value))
                            }
                        }
                    }

                    const headers = new Headers()

                    // global headers
                    for (const [key, value] of Object.entries(
                        options?.headers ?? {},
                    )) {
                        headers.set(
                            key,
                            typeof value === 'function' ? value() : value,
                        )
                    }

                    // request headers
                    for (const [key, value] of Object.entries(
                        args?.headers ?? {},
                    )) {
                        headers.set(key, value)
                    }

                    const requestInit: RequestInit = {
                        method,
                        headers,
                    }

                    // body
                    if (args?.body !== undefined) {
                        requestInit.body = JSON.stringify(args.body)

                        if (!headers.has('Content-Type')) {
                            headers.set('Content-Type', 'application/json')
                        }
                    }

                    try {
                        const response = await fetch(url, requestInit)

                        if (!response.ok) {
                            throw new Error(
                                `HTTP ${response.status}: ${response.statusText}`,
                            )
                        }

                        const contentType = response.headers.get('content-type')

                        if (contentType?.includes('application/json')) {
                            return await response.json()
                        }

                        return await response.text()
                    } catch (error) {
                        if (options?.errorCallback) {
                            options.errorCallback(error)
                        } else {
                            throw error
                        }
                    }
                }
            },
        },
    ) as RouterToFunctions<R>
}
