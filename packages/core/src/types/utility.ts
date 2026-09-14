import type { Simplify } from 'type-fest'

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
