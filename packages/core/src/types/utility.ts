import type { IsAny, IsNever, Primitive, UnknownArray } from 'type-fest'

// export type IntelliSense<T, S> = T | (S & {})
export type IntelliSense<T, S> = { [K in keyof T & keyof S]?: T[K] }

export type NoExtraKeys<T, S> = ({ [K in keyof T & keyof S]?: T[K] } & {
    [K in Exclude<keyof T, keyof S>]?: never
}) &
    (S & {
        [K in Exclude<keyof T, keyof S>]?: never
    })

type NotAnObject =
    | Primitive
    | UnknownArray
    | ((...args: never[]) => unknown)
    | (new (
          ...args: never[]
      ) => unknown)

export type IsObject<T> =
    IsAny<T> extends true
        ? false
        : IsNever<T> extends true
          ? false
          : T extends NotAnObject
            ? false
            : T extends object
              ? true
              : false

export type IsFunction<T> = T extends (...args: any[]) => any ? true : false
