import crypto from 'node:crypto';
import { getSupabase } from './supabase.js';
import { logInfo, logWarn } from './logging.js';

function normalizeLockName(value) {
  return String(value || '').trim().toLowerCase();
}

function positiveInteger(value, fallback = 900, max = 3600) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

export async function claimSchedulerLock(lockName, {
  holderId = crypto.randomUUID(),
  ttlSeconds = 900,
  metadata = {}
} = {}) {
  const normalizedLockName = normalizeLockName(lockName);
  const normalizedHolderId = String(holderId || '').trim() || crypto.randomUUID();
  if (!normalizedLockName) {
    throw new Error('Scheduler lock name is required.');
  }

  const rpcArgs = {
    p_lock_name: normalizedLockName,
    p_holder_id: normalizedHolderId,
    p_ttl_seconds: positiveInteger(ttlSeconds, 900, 3600),
    p_metadata: metadata && typeof metadata === 'object' ? metadata : {}
  };

  const claim = await getSupabase()
    .rpc('claim_scheduler_lock', rpcArgs);

  if (claim.error) {
    logWarn('scheduler_lock.rpc_error', {
      operation: 'claim',
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      signature: 'claim_scheduler_lock(p_lock_name, p_holder_id, p_ttl_seconds, p_metadata)',
      error: claim.error.message || String(claim.error)
    });
    logWarn('scheduler_lock.claim_failed', {
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      error: claim.error.message || String(claim.error)
    });
    return {
      acquired: false,
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      error: claim.error
    };
  }

  const record = Array.isArray(claim.data) ? claim.data[0] : claim.data;
  const acquired = Boolean(record?.acquired);

  if (!acquired) {
    logWarn('scheduler_lock.not_acquired', {
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      currentLockHolderId: record?.holder_id || null,
      currentLockExpiresAt: record?.expires_at || null,
      currentLockName: record?.lock_name || null
    });
  } else {
    logInfo('scheduler_lock.acquired', {
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      expiresAt: record?.expires_at || null
    });
  }

  return {
    acquired,
    lockName: normalizedLockName,
    holderId: normalizedHolderId,
    expiresAt: record?.expires_at || null,
    record
  };
}

export async function releaseSchedulerLock(lockName, holderId) {
  const normalizedLockName = normalizeLockName(lockName);
  const normalizedHolderId = String(holderId || '').trim();
  if (!normalizedLockName || !normalizedHolderId) return { released: false };

  const release = await getSupabase()
    .rpc('release_scheduler_lock', {
      p_lock_name: normalizedLockName,
      p_holder_id: normalizedHolderId
    });

  if (release.error) {
    logWarn('scheduler_lock.rpc_error', {
      operation: 'release',
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      signature: 'release_scheduler_lock(p_lock_name, p_holder_id)',
      error: release.error.message || String(release.error)
    });
    logWarn('scheduler_lock.release_failed', {
      lockName: normalizedLockName,
      holderId: normalizedHolderId,
      error: release.error.message || String(release.error)
    });
    return { released: false, error: release.error };
  }

  const record = Array.isArray(release.data) ? release.data[0] : release.data;
  const released = Boolean(record?.released);
  if (released) {
    logInfo('scheduler_lock.released', { lockName: normalizedLockName, holderId: normalizedHolderId });
  }

  return { released, record };
}
