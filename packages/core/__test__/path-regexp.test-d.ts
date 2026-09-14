import type { ExtractPathParams } from '../src/types/path-regexp'

test('Extract path params', () => {
    expectTypeOf<ExtractPathParams<'/:id'>>().toEqualTypeOf<{
        id: string
    }>()
    expectTypeOf<ExtractPathParams<'/:userId'>>().toEqualTypeOf<{
        userId: string
    }>()
    expectTypeOf<ExtractPathParams<'/*splat'>>().toEqualTypeOf<{
        splat?: string[]
    }>()
    expectTypeOf<
        ExtractPathParams<'/users/:id/posts/:postId'>
    >().toEqualTypeOf<{
        id: string
        postId: string
    }>()
    expectTypeOf<ExtractPathParams<'/users{/:id}'>>().toEqualTypeOf<{
        id?: string
    }>()
    expectTypeOf<ExtractPathParams<'/users/{/:id}/posts'>>().toEqualTypeOf<{
        id?: string
    }>()
    expectTypeOf<ExtractPathParams<'/users/{/:id/:name}'>>().toEqualTypeOf<
        | {
              id?: string
              name: string
          }
        | {
              id?: never
              name?: never
          }
    >()
    expectTypeOf<ExtractPathParams<'/users'>>().toEqualTypeOf<{}>()
})
