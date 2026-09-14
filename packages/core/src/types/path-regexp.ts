import type { Simplify, Split } from 'type-fest'
import type { MarkOptionalIfUndefined } from './utility'

type _Merge<A, B> = Simplify<A & B>

type _AddParam<
    Params,
    Name extends string,
    Value,
    Optional extends boolean = false,
> = Simplify<
    Params & {
        [K in Name]: Optional extends true ? Value | undefined : Value
    }
>

type _Never<T> = {
    [K in keyof T]?: never
}

type _OptionalGroup<Group, Outside> =
    | _Merge<Outside, Group>
    | _Merge<Outside, _Never<Group>>

type _Walk<Chars extends readonly string[], Params = {}> = Chars extends [
    infer Char extends string,
    ...infer Rest extends string[],
]
    ? Char extends '{'
        ? _WalkGroup<Rest, Params>
        : Char extends ':'
          ? _WalkParam<Rest, Params>
          : Char extends '*'
            ? _WalkSplat<Rest, Params>
            : _Walk<Rest, Params>
    : Params

type _WalkParam<
    Chars extends readonly string[],
    Params,
    Name extends string = '',
> = Chars extends [infer Char extends string, ...infer Rest extends string[]]
    ? Char extends '/' | '{' | '}'
        ? _Walk<Chars, _AddParam<Params, Name, string>>
        : _WalkParam<Rest, Params, `${Name}${Char}`>
    : _AddParam<Params, Name, string>

type _WalkSplat<
    Chars extends readonly string[],
    Params,
    Name extends string = '',
> = Chars extends [infer Char extends string, ...infer Rest extends string[]]
    ? Char extends '/' | '{' | '}'
        ? _Walk<Chars, _AddParam<Params, Name, string[] | undefined>>
        : _WalkSplat<Rest, Params, `${Name}${Char}`>
    : _AddParam<Params, Name, string[] | undefined>

type _WalkGroup<
    Chars extends readonly string[],
    Outside,
    Group = {},
    Count extends unknown[] = [],
    First extends boolean = true,
> = Chars extends [infer Char extends string, ...infer Rest extends string[]]
    ? Char extends '}'
        ? _FinishGroup<Rest, Outside, Group, Count>
        : Char extends ':'
          ? _WalkGroupParam<Rest, Outside, Group, Count, First>
          : Char extends '*'
            ? _WalkGroupSplat<Rest, Outside, Group, Count>
            : _WalkGroup<Rest, Outside, Group, Count, First>
    : never

type _WalkGroupParam<
    Chars extends readonly string[],
    Outside,
    Group,
    Count extends unknown[],
    First extends boolean,
    Name extends string = '',
> = Chars extends [infer Char extends string, ...infer Rest extends string[]]
    ? Char extends '/' | '{' | '}'
        ? _WalkGroup<
              Chars,
              Outside,
              _AddParam<Group, Name, string, First>,
              [...Count, unknown],
              false
          >
        : _WalkGroupParam<Rest, Outside, Group, Count, First, `${Name}${Char}`>
    : _FinishGroup<
          [],
          Outside,
          _AddParam<Group, Name, string, First>,
          [...Count, unknown]
      >

type _WalkGroupSplat<
    Chars extends readonly string[],
    Outside,
    Group,
    Count extends unknown[],
    Name extends string = '',
> = Chars extends [infer Char extends string, ...infer Rest extends string[]]
    ? Char extends '/' | '{' | '}'
        ? _WalkGroup<
              Chars,
              Outside,
              _AddParam<Group, Name, string[], true>,
              [...Count, unknown],
              false
          >
        : _WalkGroupSplat<Rest, Outside, Group, Count, `${Name}${Char}`>
    : _FinishGroup<
          [],
          Outside,
          _AddParam<Group, Name, string[], true>,
          [...Count, unknown]
      >

type _FinishGroup<
    Chars extends readonly string[],
    Outside,
    Group,
    Count extends unknown[],
> = Count extends [unknown, unknown, ...unknown[]]
    ? _Walk<Chars, _OptionalGroup<Group, Outside>>
    : _Walk<Chars, _Merge<Outside, Group>>

export type ExtractPathParams<Path extends string> = Simplify<
    MarkOptionalIfUndefined<_Walk<Split<Path, ''>>>
>

export type MergePathParams<T> = Simplify<{
    [K in T extends unknown ? keyof T : never]?: Exclude<
        T extends unknown ? (K extends keyof T ? T[K] : never) : never,
        undefined
    >
}>
