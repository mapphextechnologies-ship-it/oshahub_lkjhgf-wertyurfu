import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhoneLockerPayload,
  getPhoneLockerProvider,
  resolvePhoneLockerProvider
} from '../api/_lib/phone-locker.js';
import { canonicalHonorParameters, getMissingHonorConfigFields } from '../api/_lib/honor.js';
import { mapProviderState as mapApiHonorPhoneLockerState } from '../api/_lib/phone-locker.state.js';
import {
  isHonorDesiredStateNoop,
  resolveTrustonicPhoneLockerDeviceUid
} from '../api/_lib/database.js';
import { publicAppBaseUrl } from '../api/_lib/africastalking.js';
import { resolveLockerCommandDecision } from '../api/_lib/paygo-flow.js';
import { queryDevice as queryTrustonicDevice, unlockDevice as unlockTrustonicDevice } from '../api/_lib/trustonic.js';
import { HonorProvider } from '../src/lockers/honor/honor.provider.js';
import { buildRemindPolicy } from '../src/lockers/honor/honor.service.js';
import { mapProviderState as mapHonorPhoneLockerState } from '../src/lockers/phone-locker.state.js';
import { TrustonicProvider } from '../src/lockers/trustonic/trustonic.provider.js';
import { computePaygoSchedule } from '../src/utils/paygo.js';

const trustonicEnv = {
  TRUSTONIC_API_BASE: 'https://trustonic.example.test',
  TRUSTONIC_API_KEY: 'test-api-key',
  TRUSTONIC_ASSIGNED_POLICY: 'deviceFinancing'
};

const honorEnv = {
  HONOR_API_BASE: 'https://honor.example.test',
  HONOR_APP_ID: 'test-app-id',
  HONOR_APP_KEY: 'test-app-key',
  HONOR_CONTACT_NUMBER: '+254700000000'
};

function withEnv(values, run) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withEnvAsync(values, run) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('locker factory resolves Honor by default and from product rows', () => {
  withEnv({ PHONE_LOCKER_PROVIDER: '' }, () => {
    assert.equal(resolvePhoneLockerProvider(), 'honor');
    assert.equal(resolvePhoneLockerProvider({ product: { locker_provider: 'honor' } }), 'honor');
    assert.equal(getPhoneLockerProvider({ product: { locker_provider: 'honor' } }).name, 'honor');
  });
});

test('locker factory resolves Trustonic without changing Honor rows', () => {
  withEnv({ PHONE_LOCKER_PROVIDER: 'trustonic' }, () => {
    assert.equal(resolvePhoneLockerProvider({ product: { locker_provider: 'trustonic' } }), 'trustonic');
    assert.equal(resolvePhoneLockerProvider({ product: { locker_provider: 'honor' } }), 'honor');
    assert.equal(getPhoneLockerProvider({ product: { locker_provider: 'trustonic' } }).name, 'trustonic');
  });
});

test('publicAppBaseUrl falls back to the current Vercel deployment URL', () => {
  withEnv({
    PUBLIC_APP_URL: '',
    VERCEL_URL: 'SALAMA LOCK-beta.vercel.app'
  }, () => {
    assert.equal(publicAppBaseUrl(), 'https://SALAMA LOCK-beta.vercel.app');
  });
});

test('Honor payload keeps the existing deviceInfos shape', () => {
  const payload = buildPhoneLockerPayload({
    lockerProvider: 'honor',
    action: 'register',
    product: {
      id: 'product-1',
      imei_1: '123456789012345'
    },
    customer: {
      id: 'customer-1'
    }
  });

  assert.equal(payload.provider, 'honor');
  assert.equal(payload.registeredId, '123456789012345');
  assert.deepEqual(payload.deviceInfos, [['123456789012345']]);
});

test('Honor reminder payload uses the API showType schema', () => {
  withEnv(honorEnv, () => {
    const notificationPolicy = buildRemindPolicy({
      notificationTitle: 'Payment reminder title that is too long',
      notificationContent: 'Your financed device is restricted.',
      notificationType: 'headsup'
    });

    assert.equal(notificationPolicy.title, 'Payment reminder tit');
    assert.equal(notificationPolicy.content, 'Your financed device is restricted.');
    assert.equal(notificationPolicy.showType, 0);
    assert.equal(notificationPolicy.contactNumber, '+254700000000');
    assert.equal(Object.hasOwn(notificationPolicy, 'notificationType'), false);
    assert.equal(Object.hasOwn(notificationPolicy, 'notificationTitle'), false);

    assert.equal(buildRemindPolicy({ title: 'Alert', content: 'Open now', type: 'fullscreen' }).showType, 1);
  });
});

test('Honor GET parameters are sorted for signature canonicalization', () => {
  assert.equal(
    canonicalHonorParameters({
      registeredId: '868509080082705',
      pageSize: 10,
      pageNum: 1
    }),
    'pageNum=1|pageSize=10|registeredId=868509080082705'
  );
});

test('Honor config helper lists missing credentials clearly', () => {
  assert.deepEqual(
    getMissingHonorConfigFields({
      apiBase: 'https://apigw.yun.hihonor.com',
      appId: '',
      appKey: ''
    }),
    ['HONOR_APP_ID or HONOR_USERNAME', 'HONOR_APP_KEY or HONOR_PASSWORD']
  );
});

test('Honor config helper trims pasted punctuation from credentials', async () => {
  const previousAppId = process.env.HONOR_APP_ID;
  const previousAppKey = process.env.HONOR_APP_KEY;
  const previousBase = process.env.HONOR_API_BASE;

  process.env.HONOR_API_BASE = 'https://honor.example.test';
  process.env.HONOR_APP_ID = ' "SALAMA LOCK-TEST" ';
  process.env.HONOR_APP_KEY = 'secret-key,, ';

  try {
    const { validateHonorEnvironment } = await import('../api/_lib/honor.js');
    const config = validateHonorEnvironment();
    assert.equal(config.appId, 'SALAMA LOCK-TEST');
    assert.equal(config.appKey, 'secret-key');
  } finally {
    if (previousAppId === undefined) delete process.env.HONOR_APP_ID;
    else process.env.HONOR_APP_ID = previousAppId;
    if (previousAppKey === undefined) delete process.env.HONOR_APP_KEY;
    else process.env.HONOR_APP_KEY = previousAppKey;
    if (previousBase === undefined) delete process.env.HONOR_API_BASE;
    else process.env.HONOR_API_BASE = previousBase;
  }
});

test('Honor request sends both request-id and sign-algos header aliases when HMAC is enabled', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...honorEnv,
    HONOR_SIGN_ALGORITHM: 'HMAC-SHA256'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://honor.example.test/api/devicelock/v1/devices?registeredId=123456789012345&pageNum=1&pageSize=10');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['X-RY-SIGN-ALGOS'], 'HmacSHA256');
      assert.equal(options.headers['x-ry-sign-algos'], 'HmacSHA256');
      assert.equal(options.headers['x-requestId'], options.headers['x-request-id']);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: 20000000, data: [] })
      };
    };

    try {
      const { queryDevice } = await import('../api/_lib/honor.js');
      await queryDevice({ registeredId: '123456789012345' });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Honor device status maps numeric lock codes as locked, unlocked, or pending', () => {
  const locked = mapHonorPhoneLockerState('honor', { body: { status: 2 } }, { action: 'sync' });
  const lockedBy32 = mapHonorPhoneLockerState('honor', { body: { status: 32 } }, { action: 'sync' });
  const released = mapHonorPhoneLockerState('honor', { body: { status: 3 } }, { action: 'sync' });
  const pending = mapHonorPhoneLockerState('honor', { body: { status: 11 } }, { action: 'sync' });
  const unlocked = mapHonorPhoneLockerState('honor', { body: { status: 1 } }, { action: 'sync' });
  const apiPending = mapApiHonorPhoneLockerState('honor', { body: { status: 12 } }, { action: 'sync' });

  assert.equal(locked.providerLockStatus, 'locked');
  assert.equal(locked.finalDeviceState, 'locked');
  assert.equal(lockedBy32.providerLockStatus, 'locked');
  assert.equal(lockedBy32.finalDeviceState, 'locked');
  assert.equal(released.providerLockStatus, 'unlocked');
  assert.equal(released.finalDeviceState, 'unlocked');
  assert.equal(pending.providerLockStatus, 'pending');
  assert.equal(pending.finalDeviceState, 'pending');
  assert.equal(unlocked.providerLockStatus, 'unlocked');
  assert.equal(unlocked.finalDeviceState, 'unlocked');
  assert.equal(apiPending.providerLockStatus, 'pending');
  assert.equal(apiPending.finalDeviceState, 'pending');
});

test('Honor current-state rejection is a no-op only after matching verification', () => {
  const currentStateError = new Error('This operation is not allowed in the current state of the device');
  currentStateError.response = {
    code: 40000201,
    message: 'Policy delivery failed',
    data: [{
      code: 40000101,
      message: 'This operation is not allowed in the current state of the device'
    }]
  };

  assert.equal(isHonorDesiredStateNoop({
    lockerProvider: 'honor',
    error: currentStateError,
    expectedState: 'locked',
    actualState: 'locked'
  }), true);
  assert.equal(isHonorDesiredStateNoop({
    lockerProvider: 'honor',
    error: currentStateError,
    expectedState: 'unlocked',
    actualState: 'unlocked'
  }), true);
  assert.equal(isHonorDesiredStateNoop({
    lockerProvider: 'honor',
    error: currentStateError,
    expectedState: 'locked',
    actualState: 'unlocked'
  }), false);
  assert.equal(isHonorDesiredStateNoop({
    lockerProvider: 'trustonic',
    error: currentStateError,
    expectedState: 'locked',
    actualState: 'locked'
  }), false);

  const authorizationError = new Error('Unauthorized');
  authorizationError.response = { code: 401, message: 'Unauthorized' };
  assert.equal(isHonorDesiredStateNoop({
    lockerProvider: 'honor',
    error: authorizationError,
    expectedState: 'unlocked',
    actualState: 'unlocked'
  }), false);
});

test('Locker command decision skips unlock when the provider already reports the final state', () => {
  const unconfirmed = resolveLockerCommandDecision({
    profile: {
      provider_lock_status: 'unlocked',
      command_status: 'success',
      last_verified_at: '2026-07-11T18:00:00.000Z'
    },
    action: 'unlock',
    currentState: 'unlocked',
    useProfileState: false
  });

  const confirmed = resolveLockerCommandDecision({
    profile: {
      provider_lock_status: 'unlocked',
      command_status: 'success',
      last_verified_at: '2026-07-11T18:00:00.000Z',
      last_unlock_command_at: '2026-07-11T17:55:00.000Z'
    },
    action: 'unlock',
    currentState: 'unlocked',
    useProfileState: false
  });

  const forced = resolveLockerCommandDecision({
    profile: {
      provider_lock_status: 'unlocked',
      command_status: 'success',
      last_verified_at: '2026-07-11T18:00:00.000Z',
      last_unlock_command_at: '2026-07-11T17:55:00.000Z'
    },
    action: 'unlock',
    currentState: 'unlocked',
    useProfileState: false,
    forceUnlock: true
  });

  assert.equal(unconfirmed.shouldSkip, true);
  assert.equal(unconfirmed.skipReason, 'provider-state-matched');
  assert.equal(confirmed.shouldSkip, true);
  assert.equal(confirmed.skipReason, 'confirmed-command-already-matched');
  assert.equal(forced.shouldSkip, false);
  assert.equal(forced.forceUnlock, true);
});

test('Locker command decision skips unlock while the provider is still pending', () => {
  const pending = resolveLockerCommandDecision({
    profile: {
      provider_lock_status: 'pending',
      command_status: 'pending',
      last_verified_at: '2026-07-11T18:00:00.000Z'
    },
    action: 'unlock',
    currentState: 'pending',
    useProfileState: false
  });

  assert.equal(pending.shouldSkip, true);
  assert.equal(pending.skipReason, 'provider-state-pending');
});

test('Trustonic payload uses inventory upload deviceList shape', () => {
  withEnv(trustonicEnv, () => {
    const payload = buildPhoneLockerPayload({
      lockerProvider: 'trustonic',
      action: 'register',
      product: {
        id: 'product-2',
        imei_1: '123456789012345',
        imei_2: '543210987654321'
      },
      customer: {
        id: 'customer-2'
      }
    });

    assert.equal(payload.provider, 'trustonic');
    assert.equal(payload.deviceUid, '123456789012345');
    assert.equal(payload.deviceList.length, 1);
    assert.equal(payload.deviceList[0].deviceUid, '123456789012345');
    assert.equal(payload.deviceList[0].idType, 'imei');
    assert.equal(payload.deviceList[0].serviceList[0].serviceName, 'deviceFinancing');
  });
});

test('Trustonic UID resolver prefers persisted provider payloads over IMEI fallbacks', () => {
  const product = {
    locker_provider: 'trustonic',
    locker_id: 'WRONG-LOCKER-ID',
    imei_1: '9999118321042507'
  };
  const profile = {
    locker_id: 'WRONG-LOCKER-ID',
    imei_1: '9999118321042507',
    locker_sync_payload: {
      action: 'register',
      deviceUid: 'TRUSTONIC-DEVICE-123',
      deviceList: [
        {
          deviceUid: 'TRUSTONIC-DEVICE-123'
        }
      ]
    }
  };

  assert.equal(resolveTrustonicPhoneLockerDeviceUid(product, profile), 'TRUSTONIC-DEVICE-123');
});

test('Trustonic status parses deviceResponseList stateInfo as locked', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/query/devices');
      assert.equal(options.method, 'POST');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceResponseList: [
            {
              deviceUid: '350290812203449',
              stateInfo: 'Locked',
              expirationTime: 1783427034
            }
          ]
        })
      };
    };

    try {
      const result = await queryTrustonicDevice({
        registeredId: '350290812203449',
        product: {
          locker_provider: 'trustonic',
          imei_1: '350290812203449'
        },
        action: 'sync'
      });

      assert.equal(result.rows[0].lockStatus, 'locked');
      assert.equal(result.rows[0].state, 'locked');
      assert.equal(result.body.data[0].lockStatus, 'locked');
      assert.equal(result.body.deviceResponseList[0].stateInfo, 'Locked');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic status prefers locker_id when the device was enrolled under a different UID', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/query/devices');
      assert.equal(options.method, 'POST');

      const payload = JSON.parse(options.body);
      assert.equal(payload.deviceList[0].deviceUid, 'SERIAL-123');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceResponseList: [
            {
              deviceUid: 'SERIAL-123',
              stateInfo: 'Unlocked'
            }
          ]
        })
      };
    };

    try {
      const result = await queryTrustonicDevice({
        registeredId: 'SERIAL-123',
        product: {
          locker_provider: 'trustonic',
          locker_id: 'SERIAL-123',
          imei_1: '350290812203449'
        },
        action: 'sync'
      });

      assert.equal(result.rows[0].deviceUid, 'SERIAL-123');
      assert.equal(result.rows[0].state, 'unlocked');
      assert.equal(result.rows[0].lockStatus, 'unlocked');
      assert.equal(result.body.deviceResponseList[0].stateInfo, 'Unlocked');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic status prefers an explicit deviceUid over a mismatched registeredId', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/query/devices');
      assert.equal(options.method, 'POST');

      const payload = JSON.parse(options.body);
      assert.equal(payload.deviceList[0].deviceUid, 'SERIAL-LOCKER-LOCKED');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceResponseList: [
            {
              deviceUid: 'SERIAL-LOCKER-LOCKED',
              stateInfo: 'Locked'
            }
          ]
        })
      };
    };

    try {
      const result = await queryTrustonicDevice({
        registeredId: '4656936021145230',
        deviceUid: 'SERIAL-LOCKER-LOCKED',
        product: {
          locker_provider: 'trustonic',
          locker_id: 'SERIAL-LOCKER-LOCKED',
          imei_1: '4656936021145230'
        },
        action: 'sync'
      });

      assert.equal(result.rows[0].deviceUid, 'SERIAL-LOCKER-LOCKED');
      assert.equal(result.rows[0].state, 'locked');
      assert.equal(result.rows[0].lockStatus, 'locked');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic status falls back to an unknown state when the device is not found', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/query/devices');
      assert.equal(options.method, 'POST');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceResponseList: [
            {
              deviceUid: 'SERIAL-404',
              resultCode: 'DEVICE_UID_NOT_FOUND',
              resultMessage: 'Not found the device with imei [SERIAL-404]'
            }
          ]
        })
      };
    };

    try {
      const result = await queryTrustonicDevice({
        registeredId: 'SERIAL-404',
        product: {
          locker_provider: 'trustonic',
          locker_id: 'SERIAL-404',
          imei_1: '350290812203449'
        },
        action: 'sync'
      });

      assert.equal(result.rows[0].deviceUid, 'SERIAL-404');
      assert.equal(result.rows[0].state, 'unknown');
      assert.equal(result.rows[0].lockStatus, 'unknown');
      assert.equal(result.body.notFound, true);
      assert.equal(result.body.warningCode, 'DEVICE_UID_NOT_FOUND');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic unlock prefers the registered locker UID over the deviceInfos IMEI fallback', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/device/updateExpiration');
      assert.equal(options.method, 'POST');

      const payload = JSON.parse(options.body);
      assert.equal(payload.updateExpirationList[0].deviceUid, 'SERIAL-LOCKER-UNLOCKED');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          updateExpirationResponseList: [
            {
              deviceUid: 'SERIAL-LOCKER-UNLOCKED',
              stateInfo: 'Unlocked'
            }
          ]
        })
      };
    };

    try {
      const result = await unlockTrustonicDevice({
        registeredIds: ['SERIAL-LOCKER-UNLOCKED'],
        deviceInfos: [['4656936021145230']],
        product: {
          locker_provider: 'trustonic',
          imei_1: '4656936021145230'
        },
        customer: {
          balance: 32,
          paygo_schedule_status: 'active'
        },
        payment: {
          status: 'paid',
          paygo_payment: 8
        }
      });

      assert.equal(result.rows[0].deviceUid, 'SERIAL-LOCKER-UNLOCKED');
      assert.equal(result.rows[0].state, 'unlocked');
      assert.equal(result.rows[0].lockStatus, 'unlocked');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic unlock uses the release endpoint when enabled', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token',
    TRUSTONIC_RELEASE_ON_UNLOCK: 'true'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/device/release');
      assert.equal(options.method, 'PUT');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          deviceReleaseList: [
            {
              deviceUid: '350290812203449',
              stateInfo: 'Released'
            }
          ]
        })
      };
    };

    try {
      const result = await unlockTrustonicDevice({
        registeredIds: ['350290812203449'],
        product: {
          locker_provider: 'trustonic',
          imei_1: '350290812203449'
        }
      });

      assert.equal(result.rows[0].state, 'unlocked');
      assert.equal(result.rows[0].lockStatus, 'unlocked');
      assert.equal(result.body.deviceReleaseList[0].stateInfo, 'Released');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic unlock extends expiration for paid accounts instead of releasing early', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token',
    TRUSTONIC_RELEASE_ON_UNLOCK: 'true'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/device/updateExpiration');
      assert.equal(options.method, 'POST');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          updateExpirationResponseList: [
            {
              deviceUid: '350290812203449',
              stateInfo: 'Unlocked'
            }
          ]
        })
      };
    };

    try {
      const result = await unlockTrustonicDevice({
        registeredIds: ['350290812203449'],
        product: {
          locker_provider: 'trustonic',
          imei_1: '350290812203449'
        },
        customer: {
          balance: 32,
          paygo_schedule_status: 'active'
        },
        payment: {
          status: 'paid',
          paygo_payment: 8
        }
      });

      assert.equal(result.rows[0].state, 'unlocked');
      assert.equal(result.rows[0].lockStatus, 'unlocked');
      assert.equal(result.body.updateExpirationResponseList[0].stateInfo, 'Unlocked');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic release errors are not treated as success', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token',
    TRUSTONIC_RELEASE_ON_UNLOCK: 'true'
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), 'https://trustonic.example.test/api/v2/device/release');
      assert.equal(options.method, 'PUT');

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          releaseResponseList: [
            {
              deviceUid: '350290812203449',
              resultCode: 'DEVICE_STATE_INVALID',
              resultMessage: "The device is unable to assign Action, please check the device's state"
            }
          ]
        })
      };
    };

    try {
      await assert.rejects(
        unlockTrustonicDevice({
          registeredIds: ['350290812203449'],
          product: {
            locker_provider: 'trustonic',
            imei_1: '350290812203449'
          }
        }),
        /DEVICE_STATE_INVALID|unable to assign Action/i
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Trustonic notify skips the in-transition state error', async () => {
  const previousFetch = globalThis.fetch;

  await withEnvAsync({
    ...trustonicEnv,
    TRUSTONIC_BEARER_TOKEN: 'test-bearer-token'
  }, async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        message: "This imei [351481182772613] is in State transition, please wait for the Action complete"
      })
    });

    try {
      const result = await (await import('../src/lockers/trustonic/trustonic.service.js')).sendNotification(
        '351481182772613',
        { notificationTitle: 'Payment reminder' }
      );

      assert.equal(result.skipped, true);
      assert.equal(result.skipReason, 'device-state-notify-unsupported');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('HonorProvider delegates through the provider interface', async () => {
  const calls = [];
  const provider = new HonorProvider({
    service: {
      diagnostics: () => ({
        registerPath: '/honor/register',
        unlockPath: '/honor/unlock'
      }),
      authenticate: async () => {
        calls.push(['authenticate']);
        return { ok: true };
      },
      buildRegistrationPayload: () => ({}),
      buildLockPolicy: () => ({}),
      buildUnlockPolicy: () => ({}),
      enrollDevice: async (device) => {
        calls.push(['enrollDevice', device.imei_1]);
        return { requestId: 'honor-register' };
      },
      updateExpiration: async ({ imei, expiration }) => {
        calls.push(['updateExpiration', imei, expiration]);
        return { requestId: 'honor-update' };
      }
    }
  });

  await provider.authenticate();
  await provider.enrollDevice({ imei_1: '111111111111111' });
  await provider.updateExpiration('111111111111111', Date.now() + 60_000);

  assert.deepEqual(calls, [
    ['authenticate'],
    ['enrollDevice', '111111111111111'],
    ['updateExpiration', '111111111111111', calls[2][2]]
  ]);
});

test('TrustonicProvider delegates through the provider interface', async () => {
  const calls = [];
  const provider = new TrustonicProvider({
    service: {
      diagnostics: () => ({
        notifyPath: '/trustonic/notify',
        pinPath: '/trustonic/pinunlock',
        tokenPath: '/trustonic/token'
      }),
      authenticate: async () => {
        calls.push(['authenticate']);
        return { ok: true };
      },
      buildRegistrationPayload: () => ({}),
      buildLockPolicy: () => ({}),
      buildUnlockPolicy: () => ({}),
      sendNotification: async (imei, notification) => {
        calls.push(['sendNotification', imei, notification.notificationTitle]);
        return { requestId: 'trustonic-notify' };
      },
      offlineUnlock: async (imei, challenge) => {
        calls.push(['offlineUnlock', imei, challenge]);
        return '123456';
      }
    }
  });

  await provider.authenticate();
  await provider.sendNotification('222222222222222', { notificationTitle: 'Payment reminder' });
  const pin = await provider.offlineUnlock('222222222222222', 'challenge-1');

  assert.equal(pin, '123456');
  assert.deepEqual(calls, [
    ['authenticate'],
    ['sendNotification', '222222222222222', 'Payment reminder'],
    ['offlineUnlock', '222222222222222', 'challenge-1']
  ]);
});

test('computePaygoSchedule keeps fully paid accounts unlocked', () => {
  const schedule = computePaygoSchedule({
    customer: {
      total_payable: 1000,
      daily_installment: 100
    },
    payments: [
      {
        id: 'pay-1',
        status: 'paid',
        paid_amount: 1000,
        deposit_credit: 0,
        paygo_payment: 1000,
        date: '2026-07-01T10:00:00.000Z'
      }
    ],
    now: new Date('2026-07-10T10:00:00.000Z')
  });

  assert.equal(schedule.isComplete, true);
  assert.equal(schedule.scheduleStatus, 'paid');
  assert.equal(schedule.deviceState, 'unlocked');
  assert.equal(schedule.recommendedDeviceAction, 'unlock');
  assert.equal(schedule.daysOverdue, 0);
});

test('computePaygoSchedule preserves a later stored unlock window', () => {
  const schedule = computePaygoSchedule({
    customer: {
      total_payable: 1000,
      daily_installment: 100,
      unlock_until: '2026-07-15T00:00:00.000Z'
    },
    payments: [
      {
        id: 'pay-1',
        status: 'paid',
        paid_amount: 100,
        deposit_credit: 0,
        paygo_payment: 100,
        date: '2026-07-01T10:00:00.000Z'
      }
    ],
    now: new Date('2026-07-10T10:00:00.000Z')
  });

  assert.equal(schedule.scheduleStatus, 'active');
  assert.equal(schedule.deviceState, 'unlocked');
  assert.equal(schedule.unlockUntilAt, '2026-07-15T00:00:00.000Z');
});

test('computePaygoSchedule keeps partially paid accounts unlocked after a valid payment', () => {
  const schedule = computePaygoSchedule({
    customer: {
      total_payable: 40,
      daily_installment: 5,
      unlock_until: '2026-07-10T06:00:00.000Z'
    },
    payments: [
      {
        id: 'pay-1',
        status: 'paid',
        paid_amount: 10,
        deposit_credit: 0,
        paygo_payment: 10,
        date: '2026-07-10T05:00:00.000Z'
      },
      {
        id: 'pay-2',
        status: 'paid',
        paid_amount: 8,
        deposit_credit: 0,
        paygo_payment: 8,
        date: '2026-07-10T15:54:33.333Z'
      }
    ],
    now: new Date('2026-07-10T15:54:33.333Z')
  });

  assert.equal(schedule.scheduleStatus, 'active');
  assert.equal(schedule.deviceState, 'unlocked');
  assert.equal(schedule.recommendedDeviceAction, 'unlock');
  assert.ok(schedule.unlockUntilAt > '2026-07-10T06:00:00.000Z');
  assert.ok(schedule.nextDueAt > '2026-07-10T06:00:00.000Z');
});

test('computePaygoSchedule unlocks a deposit payment for 24 hours', () => {
  const schedule = computePaygoSchedule({
    customer: {
      total_payable: 10000,
      daily_installment: 100
    },
    payments: [
      {
        id: 'pay-deposit',
        status: 'paid',
        paid_amount: 5000,
        deposit_credit: 5000,
        paygo_payment: 0,
        date: '2026-07-10T05:00:00.000Z'
      }
    ],
    now: new Date('2026-07-10T12:00:00.000Z')
  });

  assert.equal(schedule.scheduleStatus, 'active');
  assert.equal(schedule.deviceState, 'unlocked');
  assert.equal(schedule.recommendedDeviceAction, 'unlock');
  assert.equal(schedule.paidDays, 1);
  assert.equal(schedule.installmentsPaid, 0);
  assert.equal(schedule.remainingBalance, 5000);
  assert.equal(schedule.unlockUntilAt, '2026-07-11T05:00:00.000Z');
});
