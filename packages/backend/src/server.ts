import { createApp } from './app.js'
import { config } from './config.js'

const app = createApp()
const sockets = new Set<import('node:net').Socket>()
let shuttingDown = false

const server = app.listen(config.port, () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : config.port
  console.log(`ComFlow backend listening on http://localhost:${port}`)
})

server.on('connection', socket => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}; draining ComFlow.`)

  const background = app.stopBackground()
  const forceClose = setTimeout(() => {
    for (const socket of sockets) socket.destroy()
  }, 8_000)
  forceClose.unref()
  const hardStop = setTimeout(() => {
    console.error('ComFlow shutdown exceeded its grace period.')
    try {
      app.closeStorage()
    } finally {
      process.exit(1)
    }
  }, 9_500)
  hardStop.unref()

  server.close(error => {
    void background
      .then(() => {
        app.closeStorage()
        clearTimeout(forceClose)
        clearTimeout(hardStop)
        if (error) {
          console.error(`HTTP shutdown failed: ${error.message}`)
          process.exit(1)
        }
        console.log('ComFlow shutdown complete.')
        process.exit(0)
      })
      .catch(reason => {
        console.error(`ComFlow shutdown failed: ${(reason as Error).message}`)
        try {
          app.closeStorage()
        } catch {
          // Preserve the original shutdown error below.
        }
        process.exit(1)
      })
  })
  server.closeIdleConnections()
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
