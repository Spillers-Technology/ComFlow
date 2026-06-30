import { config } from '../config.js'
import { ensurePrimaryTenant } from '../db/client.js'
import { seedFakeData } from './fakeData.js'

seedFakeData(ensurePrimaryTenant(config.defaultTenant))
console.log('Seeded ComFlow fake data.')
