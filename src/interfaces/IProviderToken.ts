export type IProviderToken<T> = (string | symbol | (new (...args: any[]) => T)) & { __brand?: T };
