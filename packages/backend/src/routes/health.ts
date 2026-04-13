import { Router } from 'express'
import { EngineService } from '../services/engineService.js'

export function createHealthRouter(engineService: EngineService) {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({
      ok: true,
      db: 'ok',
      ...engineService.getSettingsResponse(),
    })
  })

  return router
}
