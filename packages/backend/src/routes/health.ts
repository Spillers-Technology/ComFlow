import { Router } from 'express'
import { config } from '../config.js'

export function createHealthRouter() {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({
      ok: true,
      mode: config.mode,
      db: 'ok',
    })
  })

  return router
}
