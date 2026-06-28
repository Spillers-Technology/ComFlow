import { Router } from 'express'
import {
  EngineKindSchema,
  UpdateSipSettingsRequestSchema,
  UpdateEngineSettingsRequestSchema,
} from '../../../shared/src/index.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { BaresipManagementService } from '../services/baresipManagementService.js'
import { EngineService } from '../services/engineService.js'

export function createSettingsRouter(
  engineService: EngineService,
  baresipManagementService: BaresipManagementService
) {
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
      const input = parseBody(UpdateEngineSettingsRequestSchema, request.body)
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

  router.get(
    '/sip',
    asyncHandler(async (_request, response) => {
      response.json(await baresipManagementService.getSettingsResponse())
    })
  )

  router.put(
    '/sip',
    asyncHandler(async (request, response) => {
      const input = parseBody(UpdateSipSettingsRequestSchema, request.body)
      response.json(await baresipManagementService.updateSettings(input))
    })
  )

  router.get(
    '/sip/status',
    asyncHandler(async (_request, response) => {
      response.json({ status: await baresipManagementService.getStatus() })
    })
  )

  router.post(
    '/sip/restart',
    asyncHandler(async (_request, response) => {
      response.json(await baresipManagementService.restart())
    })
  )

  return router
}
