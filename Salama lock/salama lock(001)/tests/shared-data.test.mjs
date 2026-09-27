import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SharedDataUnavailableError,
  readSharedData
} from '../src/services/sharedDataService.js';

test('shared data reads the live primary source first', async () => {
  let secondaryCalls = 0;
  const records = await readSharedData({
    resource: 'payments',
    primary: async () => [{ id: 'live-payment' }],
    secondary: async () => {
      secondaryCalls += 1;
      return [{ id: 'portal-payment' }];
    }
  });

  assert.deepEqual(records, [{ id: 'live-payment' }]);
  assert.equal(secondaryCalls, 0);
});

test('shared data uses only another live endpoint as fallback', async () => {
  const records = await readSharedData({
    resource: 'payments',
    primary: async () => {
      throw new Error('Primary unavailable');
    },
    secondary: async () => [{ id: 'shared-portal-payment' }]
  });

  assert.deepEqual(records, [{ id: 'shared-portal-payment' }]);
});

test('shared data fails instead of returning device-local records', async () => {
  await assert.rejects(
    readSharedData({
      resource: 'payments',
      primary: async () => {
        throw new Error('Primary unavailable');
      },
      secondary: async () => {
        const error = new Error('Shared portal unavailable');
        error.statusCode = 503;
        throw error;
      }
    }),
    (error) => {
      assert.equal(error instanceof SharedDataUnavailableError, true);
      assert.equal(error.code, 'SHARED_DATA_UNAVAILABLE');
      assert.equal(error.statusCode, 503);
      return true;
    }
  );
});

test('operational portals do not import browser record caches or demo seeds', async () => {
  const serviceFiles = [
    'src/services/adminPortalService.js',
    'src/services/agentPortalService.js',
    'src/services/agentWorkspaceService.js',
    'src/services/commissionService.js',
    'src/services/financeService.js',
    'src/services/inventoryService.js',
    'src/services/notificationService.js',
    'src/services/paymentService.js',
    'src/services/sharedPortalService.js'
  ];

  for (const file of serviceFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /offlineStore|offlineSeeds|readCachedJson|writeCachedJson/);
  }
});
