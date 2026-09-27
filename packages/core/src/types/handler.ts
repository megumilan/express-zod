import type { IncomingHttpHeaders } from 'node:http'
import type e from 'express'
import type { If, IsEmptyObject, IsNever, Or } from 'type-fest'
import type { InferRouteOptions, IRouteOptions } from '../router'
import type { IsObject } from './utility'

export interface IRequest<Schema extends InferRouteOptions<IRouteOptions>>
    extends Omit<
            e.Request<
                Schema['params'],
                Schema['responses'],
                Schema['body'],
                Schema['query'],
                Schema['locals'] & {}
            >,
            'headers' | 'cookies'
        >,
        Express.Request,
        ExpressZod.Request<Schema> {
    headers: Schema extends { headers: infer Headers }
        ? IsObject<Headers> extends true
            ? IncomingHttpHeaders & Headers
            : IncomingHttpHeaders
        : IncomingHttpHeaders
    cookies: Schema['cookies']
}

export interface IResponse<
    Responses extends Record<number, unknown> = {},
    Locals extends Record<string, any> = Record<string, any>,
    StatusCode extends keyof Responses = 201 extends keyof Responses
        ? 201
        : 200,
> extends Omit<
            e.Response<Responses[StatusCode], Locals>,
            'status' | 'json' | 'write'
        >,
        Express.Response,
        ExpressZod.Response<Responses, Locals, StatusCode> {
    status: If<
        Or<IsEmptyObject<Responses>, IsNever<Responses[StatusCode]>>,
        <Code extends keyof Responses>(
            statusCode: Code | number,
        ) => IResponse<Responses, Locals, StatusCode>,
        <Code extends keyof Responses>(
            statusCode: Code,
        ) => IResponse<Responses, Locals, Code>
    >
    json: If<
        Or<IsEmptyObject<Responses>, IsNever<Responses[StatusCode]>>,
        (
            body?: Responses[StatusCode],
        ) => IResponse<Responses, Locals, StatusCode>,
        (
            body: Responses[StatusCode],
        ) => IResponse<Responses, Locals, StatusCode>
    >
}

/** The response of {@link RequestHandler} */
type ResponseBody<Responses> =
    IsObject<Responses> extends true
        ? Responses extends { 201: infer Created }
            ? Created
            : Responses extends { 200: infer Ok }
              ? Ok
              : unknown
        : unknown

export type RequestHandler<
    Schema extends InferRouteOptions<IRouteOptions> = {},
> = (
    req: IRequest<Schema>,
    res: IResponse<Schema['responses'] & {}, Schema['locals'] & {}>,
    next: e.NextFunction,
) =>
    | void
    | ResponseBody<Schema['responses']>
    | PromiseLike<void | ResponseBody<Schema['responses']>>

export type ErrorRequestHandler<
    Err = Error,
    Schema extends InferRouteOptions<IRouteOptions> = {},
> = (
    err: Err,
    req: IRequest<Schema>,
    res: IResponse<Schema['responses'] & {}, Schema['locals'] & {}>,
    next: e.NextFunction,
) => unknown

export type RespondedHandler<
    Req extends e.Request = e.Request,
    Res extends e.Response = e.Response,
> = (req: Req, res: Res, next: e.NextFunction) => void
