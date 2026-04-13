import path from 'node:path'

const packageRoot = process.cwd()
const dataDir = path.join(packageRoot, 'data')

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mode: process.env.COMFLOW_MODE === 'real' ? 'real' : 'fake',
  packageRoot,
  dataDir,
  recordingsDir: path.join(dataDir, 'recordings'),
  databasePath: path.join(dataDir, 'comflow.db'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  seedDemo: process.env.COMFLOW_SEED_DEMO !== 'false',
}
