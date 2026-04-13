import { Router } from 'express'
import {
  EngineKindSchema,
  UpdateEngineSettingsInputSchema,
} from '../../../shared/src/index.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { EngineService } from '../services/engineService.js'

export function createSettingsRouter(engineService: EngineService) {
  const router = Router()

  router.get(
    '/engines',
    asyncHandler((_request, response) => {
      response.json(engineService.getSettingsResponse())
    })
  )

  router.patch(
    '/engines',
    asyncHandler((request, response) => {
      const input = parseBody(UpdateEngineSettingsInputSchema, request.body)
      response.json(engineService.updateSettings(input))
    })
  )

  router.post(
    '/engines/test/:engine',
    asyncHandler(async (request, response) => {
      const engine = EngineKindSchema.parse(request.params.engine)
      const result = await engineService.testEngine(engine)
      response.json({ result })
    })
  )

  return router
}
