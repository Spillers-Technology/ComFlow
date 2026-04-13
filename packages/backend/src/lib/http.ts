import { NextFunction, Request, Response } from 'express'
import { ZodType } from 'zod'
import { HttpError } from './errors.js'

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new HttpError(
      400,
      result.error.issues.map(issue => issue.message).join('; ')
    )
  }
  return result.data
}

export function asyncHandler(
  fn: (
    request: Request,
    response: Response,
    next: NextFunction
  ) => Promise<void> | void
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(fn(request, response, next)).catch(next)
  }
}
