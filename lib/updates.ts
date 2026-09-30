import type { ContainerUpdate } from '../types';

/**
 * Which pending updates to launch for "update everything": containers that
 * get recreated anyway along with another (behind the VPN…) aren't queued twice.
 */
export function updateQueue(pending: ContainerUpdate[]): ContainerUpdate[] {
  const covered = new Set(pending.flatMap(p => p.dependents));
  return pending.filter(p => !covered.has(p.container) || !pending.some(o => o.dependents.includes(p.container)));
}
