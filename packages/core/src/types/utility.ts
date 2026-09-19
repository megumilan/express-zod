import type { If, IsAny, IsNever, Simplify } from 'type-fest'

export type MarkOptionalIfUndefined<T> = T extends unknown
    ? Simplify<
          {
              [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
                  T[K],
                  undefined
              >
          } & {
              [K in keyof T as undefined extends T[K] ? never : K]: T[K]
          }
      >
    : never

/** Fallback when T is any or never */
export type IsUnexpected<T, Fallback> = If<IsAny<T> | IsNever<T>, Fallback, T>
