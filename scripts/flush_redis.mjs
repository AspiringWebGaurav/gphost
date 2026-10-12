import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL.replace(/['"]/g, ''),
  token: process.env.UPSTASH_REDIS_REST_TOKEN.replace(/['"]/g, ''),
});

const res = await redis.del('gpn:release:latest:manifest');
console.log('Redis key deleted:', res);
