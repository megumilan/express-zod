import {
    type Application,
    HTTP_METHODS,
    type Router,
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

type CapitalizeSegment<Segment extends string> =
    Segment extends `:${infer Param}`
        ? `By${Capitalize<Param>}`
        : Capitalize<Segment>

type PathToCamel<Path extends string> =
    Path extends `${infer Before}{/:${infer Param}}${infer After}`
        ? `${PathToCamel<Before>}By${Capitalize<Param>}Optional${After extends ''
              ? ''
              : 'And'}${PathToCamel<After>}`
        : Path extends `/${infer Segment}/${infer Rest}`
          ? `${CapitalizeSegment<Segment>}${Segment extends `:${string}`
                ? 'And'
                : ''}${PathToCamel<`/${Rest}`>}`
          : Path extends `/${infer Segment}`
            ? CapitalizeSegment<Segment>
            : ''

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

type SetOptionalIfNoRequiredKeys<T extends object> = Simplify<
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

type InferRouteOptions<Route extends TRouteRecord> = OmitUnknown<{
    [K in keyof Route['options']]: K extends 'responses'
        ? Simplify<
              Writable<{
                  [Status in keyof Route['options'][K]]: RemoveUndefinedIfOptional<
                      output<Route['options'][K][Status]>
                  >
              }>
          >
        : RemoveUndefinedIfOptional<output<Route['options'][K]>>
}>

type RouteFunction<
    Route extends TRouteRecord,
    Schema = SetOptionalIfNoRequiredKeys<InferRouteOptions<Route>>,
    R = Schema extends {
        responses: infer Responses extends Record<number, unknown>
    }
        ? Responses[200]
        : unknown,
    Args = Simplify<Omit<Schema, 'responses'>>,
    IsRequired extends boolean = HasRequiredKeys<Schema & {}>,
> = If<
    IsRequired,
    (args: Args) => Promise<R>,
    If<IsEmptyObject<Args>, () => Promise<R>, (args?: Args) => Promise<R>>
>

type RouterToFunctions<R extends Router> =
    R extends Router<infer _, infer Routes, infer Routers>
        ? Simplify<
              {
                  [Route in Routes[number] as Route extends TRouteRecord
                      ? `${Route['method']}${PathToCamel<Route['fullPath']>}`
                      : never]: Route extends TRouteRecord
                      ? RouteFunction<Route>
                      : never
              } & (ArrayLength<Routers> extends 0
                  ? {}
                  : RouterToFunctions<Routers[number]>)
          >
        : {}

type TApplicationToClient<App extends Application> = RouterToFunctions<App>

function splitCamelCase(value: string): string[] {
    return value.split(/(?=[A-Z])/)
}

enum PathKeyword {
    By = 'By',
    Optional = 'Optional',
    And = 'And',
}

function uncapitalize<T extends string>(value: T): Uncapitalize<T> {
    return (value.charAt(0).toLowerCase() + value.slice(1)) as Uncapitalize<T>
}

function parseApiName(name: string) {
    const method = HTTP_METHODS.find((method) => name.startsWith(method))

    if (!method) {
        throw new Error(`Invalid API name: ${name}`)
    }

    const splitted = splitCamelCase(name)

    const slugs: string[] = []
    let slugStart = splitted.length
    let slugEnd = splitted.length

    const segments = splitted.map((segment, index) => {
        if (index === 0) {
            return ''
        }
        if (segment === PathKeyword.By) {
            slugStart = index + 1
            return ''
        }
        if (segment === PathKeyword.Optional) {
            slugs.push(segment)
            if (index === splitted.length - 1) {
                slugEnd = index
                const slug = uncapitalize(
                    slugs
                        .filter((slug) => slug !== PathKeyword.Optional)
                        .join(''),
                )
                return `{/:${slug}}`
            }
            return ''
        }
        if (index >= slugStart && index < slugEnd) {
            slugs.push(segment)
        }
        if (index === splitted.length - 1 || segment === PathKeyword.And) {
            slugEnd = index
            const slug = uncapitalize(
                slugs.filter((slug) => slug !== PathKeyword.Optional).join(''),
            )
            if (slugs.includes(PathKeyword.Optional)) {
                return `{/:${slug}}`
            }
            return `/:${slug}`
        }
        if (index >= slugStart) {
            return ''
        }
        return `/${segment.toLowerCase()}`
    })

    return {
        method,
        path: segments.filter(Boolean).join(''),
    }
}

export interface TClientOptions {
    errorCallback?: (err: unknown) => void
    headers?: {
        [K: string]: string | (() => string)
    }
}

function defineClient<App extends Application>(
    host: string,
    options?: TClientOptions,
) {
    return new Proxy(
        {},
        {
            get(_target, property) {
                if (typeof property !== 'string') {
                    return undefined
                }

                return async (args: {
                    params?: Record<string, unknown>
                    query?: Record<string, unknown>
                    body?: unknown
                }) => {
                    console.log('prop', property)
                    const { method, path } = parseApiName(property)

                    console.log('method', method)
                    console.log('path', path)

                    let pathname = path

                    if (args?.params) {
                        for (const [key, value] of Object.entries(
                            args.params,
                        )) {
                            pathname = pathname
                                .replace(
                                    `{/:${key}}`,
                                    value == null
                                        ? ''
                                        : `/${encodeURIComponent(String(value))}`,
                                )
                                .replace(
                                    `/:${key}`,
                                    value == null
                                        ? ''
                                        : `/${encodeURIComponent(String(value))}`,
                                )
                        }
                    }

                    const url = new URL(
                        pathname,
                        host.endsWith('/') ? host : `${host}/`,
                    )

                    if (args?.query) {
                        for (const [key, value] of Object.entries(args.query)) {
                            if (value == null) continue
                            if (Array.isArray(value)) {
                                for (const item of value) {
                                    url.searchParams.append(key, String(item))
                                }
                            } else {
                                url.searchParams.set(key, String(value))
                            }
                        }
                    }

                    const headers = new Headers()
                    for (const [key, value] of Object.entries(
                        options?.headers ?? {},
                    )) {
                        headers.set(
                            key,
                            typeof value === 'function' ? value() : value,
                        )
                    }

                    const body = (
                        args?.body ? JSON.stringify(args.body) : undefined
                    ) as never
                    if (body !== undefined) {
                        headers.set('Content-Type', 'application/json')
                    }

                    console.log('url', url)
                    console.log('headers', headers)

                    try {
                        const res = await fetch(url, {
                            method,
                            body,
                            headers,
                        })
                        if (!res.ok) {
                            throw new Error(res.statusText)
                        }
                        return res.json()
                    } catch (err) {
                        if (options?.errorCallback) {
                            options.errorCallback(err)
                        } else {
                            throw err
                        }
                    }
                }
            },
        },
    ) as TApplicationToClient<App>
}

export { defineClient }
