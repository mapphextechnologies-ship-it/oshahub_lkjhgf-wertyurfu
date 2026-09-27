import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/k.js';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(value = '') {
      this.body = value;
    }
  };
}

test('short next-of-kin link redirects to the confirmation screen without accepting', async () => {
  const previousPublicUrl = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = 'https://www.SALAMA LOCKpay.com';
  const req = {
    method: 'GET',
    url: '/api/k?c=CUS-DA59B5322A&o=785509'
  };
  const res = responseRecorder();

  try {
    await handler(req, res);
  } finally {
    if (previousPublicUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicUrl;
  }

  assert.equal(res.statusCode, 302);
  assert.equal(
    res.headers.location,
    'https://www.SALAMA LOCKpay.com/?customer=CUS-DA59B5322A&otp=785509#/next-of-kin'
  );
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('short next-of-kin link rejects malformed parameters', async () => {
  const req = {
    method: 'GET',
    url: '/api/k?c=bad&o=123'
  };
  const res = responseRecorder();
  res.end = function end(value = '') {
    this.body = value;
  };

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});
