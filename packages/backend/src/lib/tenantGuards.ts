import { HttpError } from './errors.js'
import { tenantRepository } from '../repositories/tenantRepository.js'

/**
 * Block actions for suspended (frozen) tenants — set automatically on a
 * payment dispute or manually by the platform owner. Suspension halts paid
 * actions and inbound service until an operator reactivates the tenant.
 */
export function assertTenantActive(tenantId: string): void {
  const tenant = tenantRepository.getById(tenantId)
  if (tenant && tenant.status !== 'active') {
    throw new HttpError(
      403,
      'This account is suspended. Contact support to reactivate it.'
    )
  }
}
