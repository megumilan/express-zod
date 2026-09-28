import type { Router } from 'express-zod'
import type {
    HasRequiredKeys,
    IsAny,
    IsEmptyObject,
    IsNever,
    Or,
    SetOptional,
    Simplify,
} from 'type-fest'

type ExtractRoutes<R> =
    R extends Router<infer _, infer Routes>
        ? Or<IsAny<Routes>, IsNever<Routes>> extends true
            ? {}
            : Routes
        : {}

type AllMethods<T> = { [Path in keyof T]: keyof T[Path] }[keyof T]

type PathsOfMethod<T, M> = {
    [Path in keyof T as M extends keyof T[Path] ? Path : never]: T[Path][M &
        keyof T[Path]]
}

type OperationIdEntries<Routes> = {
    [Path in keyof Routes as keyof Routes[Path] extends infer M
        ? M extends keyof Routes[Path]
            ? Routes[Path][M] extends {
                  meta: { operationId: infer Id extends string }
              }
                ? Id
                : never
            : never
        : never]: {
        [M in keyof Routes[Path]]: Routes[Path][M] extends {
            meta: { operationId: infer _ extends string }
        }
            ? Omit<Routes[Path][M], 'meta'> & { path: Path; method: M }
            : never
    }[keyof Routes[Path]]
}

type InvertApi<Routes> = {
    [Method in AllMethods<Routes>]: Simplify<PathsOfMethod<Routes, Method>>
} & OperationIdEntries<Routes>

type ArgsOf<Def> = Omit<Def, 'path' | 'method' | 'meta' | 'responses'>

type ResponseOf<Def> = Def extends { responses: infer R }
    ? Promise<
          {
              [K in keyof R]: {
                  status: `${Extract<K, string | number>}`
                  body: R[K]
              }
          }[keyof R]
      >
    : Promise<unknown>

type IsOperationIdEntry<V> = V extends { path: string; method: string }
    ? true
    : false

type SpecifyKeys = 'headers' | 'params' | 'query' | 'body'

type AllOptional<T> = T extends object
    ? HasRequiredKeys<T> extends true
        ? false
        : true
    : true

type OptionalSpecifyKeys<Args> = {
    [K in keyof Args]: K extends SpecifyKeys
        ? AllOptional<Args[K]> extends true
            ? K
            : never
        : never
}[keyof Args]

type MergeInit<T, I> = Partial<Pick<T, Extract<keyof T, keyof I>>> &
    Omit<T, Extract<keyof T, keyof I>>

type DeepOptional<Args, Init> = SetOptional<
    {
        [K in keyof Args]: K extends SpecifyKeys
            ? K extends keyof Init
                ? MergeInit<Args[K], Init[K]>
                : Args[K]
            : Args[K]
    },
    OptionalSpecifyKeys<Args>
>

type RemovePrefix<
    Path extends string,
    Prefix extends string,
> = Prefix extends ''
    ? Path
    : Path extends `${Prefix}${infer Rest}`
      ? Rest extends ''
          ? '/'
          : Rest extends `/${string}`
            ? Rest
            : `/${Rest}`
      : Path

type ResolvePath<Given extends string, Api, Prefix extends string> = {
    [K in keyof Api]: RemovePrefix<K & string, Prefix> extends Given ? K : never
}[keyof Api]

type ApiFns<Api, Init = {}, Prefix extends string = ''> = {
    [K in keyof Api as IsOperationIdEntry<Api[K]> extends true ? never : K]: <
        Given extends RemovePrefix<keyof Api[K] & string, Prefix>,
        A extends object = Simplify<
            DeepOptional<
                ArgsOf<Api[K][ResolvePath<Given, Api[K], Prefix>]>,
                Init
            >
        >,
    >(
        path: Given,
        ...args: IsEmptyObject<A> extends true
            ? []
            : HasRequiredKeys<A> extends true
              ? [args: NoInfer<A>]
              : [args?: NoInfer<A>]
    ) => ResponseOf<Api[K][ResolvePath<Given, Api[K], Prefix>]>
} & {
    [K in keyof Api as IsOperationIdEntry<Api[K]> extends true ? K : never]: <
        A extends object = DeepOptional<ArgsOf<Api[K]>, Init>,
    >(
        ...args: IsEmptyObject<A> extends true
            ? []
            : HasRequiredKeys<A> extends true
              ? [args: NoInfer<A>]
              : [args?: NoInfer<A>]
    ) => ResponseOf<Api[K]>
}

export type Client<Router, Init = {}, Prefix extends string = ''> = ApiFns<
    InvertApi<ExtractRoutes<Router>>,
    Init,
    Prefix
>

const HTTP_METHODS = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
    'query',
] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

export interface ClientInit extends Omit<RequestInit, 'body'> {
    headers?: Record<string, string>
    params?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
}

export interface ClientOptions {
    init?: ClientInit
    onError?: () => void
    onResponse?: () => unknown
}

export function defineClient<
    Init extends ClientInit,
    const Prefix extends string = '',
>(
    host: string,
    options?: Omit<ClientOptions, 'init'> & {
        init?: Init
        prefix?: Prefix
    },
) {
    const globalInit: ClientInit = options?.init ?? {}

    const request = async (
        method: HttpMethod,
        path: string,
        args: any,
    ): Promise<any> => {
        const mergedHeaders = {
            ...(globalInit.headers ?? {}),
            ...(args?.headers ?? {}),
        }
        const mergedParams = {
            ...(globalInit.params ?? {}),
            ...(args?.params ?? {}),
        }
        const mergedQuery = {
            ...(globalInit.query ?? {}),
            ...(args?.query ?? {}),
        }
        const mergedBody =
            args?.body !== undefined ? args.body : globalInit.body

        const url = new URL(path, host)

        let finalPath = url.pathname
        const bodyParams: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(mergedParams)) {
            if (value === undefined || value === null) continue

            const encoded = encodeURIComponent(String(value))
            const oldPath = finalPath

            finalPath = finalPath
                .replace(`:${key}`, encoded)
                .replace(`{${key}}`, encoded)
                .replace(`*${key}`, encoded)

            if (finalPath === oldPath) {
                bodyParams[key] = value
            }
        }

        for (const [key, value] of Object.entries(mergedQuery)) {
            if (value === undefined || value === null) continue
            url.searchParams.append(key, String(value))
        }

        const finalUrl = new URL(finalPath + url.search, host)

        const hasBody =
            method !== 'get' &&
            method !== 'head' &&
            (mergedBody !== undefined || Object.keys(bodyParams).length > 0)
        const finalHeaders: Record<string, string> = { ...mergedHeaders }
        let finalBody: BodyInit | null = null

        if (hasBody) {
            const body =
                Object.keys(bodyParams).length > 0
                    ? {
                          ...(mergedBody &&
                          typeof mergedBody === 'object' &&
                          !Array.isArray(mergedBody)
                              ? mergedBody
                              : {}),
                          '~params': bodyParams,
                      }
                    : mergedBody

            if (
                typeof body === 'string' ||
                body instanceof FormData ||
                body instanceof Blob ||
                body instanceof URLSearchParams
            ) {
                finalBody = body as BodyInit
            } else {
                finalBody = JSON.stringify(body)

                if (!finalHeaders['Content-Type']) {
                    finalHeaders['Content-Type'] = 'application/json'
                }
            }
        }

        const res = await fetch(finalUrl, {
            method: method.toUpperCase(),
            headers: finalHeaders,
            body: finalBody,
        })

        const contentType = res.headers.get('content-type') ?? ''
        let parsedBody: unknown
        if (contentType.includes('application/json')) {
            parsedBody = await res.json()
        } else {
            parsedBody = await res.text()
        }

        return { status: String(res.status), body: parsedBody }
    }

    const as = <App extends Router>() => {
        return new Proxy(
            {},
            {
                get(_target, prop) {
                    if (typeof prop !== 'string') return undefined
                    if ((HTTP_METHODS as readonly string[]).includes(prop)) {
                        const method = prop as HttpMethod
                        return (path: string, args: any = {}) =>
                            request(
                                method,
                                joinPath(options?.prefix || '', path),
                                args,
                            )
                    }
                    return (args: any = {}) =>
                        request(
                            'post',
                            joinPath(options?.prefix || '', `/${prop}`),
                            args,
                        )
                },
            },
        ) as Client<App, Init, Prefix>
    }

    return { as }
}

function joinPath(...paths: string[]) {
    const parts = paths.flatMap((path) => path.split('/')).filter(Boolean)
    return `/${parts.join('/')}`
}
