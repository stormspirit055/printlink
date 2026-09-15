import { Redis } from 'ioredis';

export const createCache = (url: string) => new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
