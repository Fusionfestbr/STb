import { store } from './store.js';

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.LOGIN_MAX_ATTEMPTS) || 10);

export async function loginRateLimit(ip) {
  const key = 'admin:ratelimit:' + ip.replace(/[^a-zA-Z0-9.:_-]/g, '');
  const attempts = await store.incr(key);

  if (attempts === 1) {
    await store.expire(key, WINDOW_SECONDS);
  }

  return {
    allowed: attempts <= MAX_ATTEMPTS,
    attempts,
    max: MAX_ATTEMPTS,
    retryAfter: WINDOW_SECONDS
  };
}
