/**
 * IDatabaseAdapter — Abstract interface for persistence layers.
 * Supports both document-style and sql-style operations.
 */
export interface IDatabaseAdapter {
    // Document/Key-Value Style
    find<T = unknown>(query: any): Promise<T[]>;
    findOne<T = unknown>(query: any): Promise<T | null>;
    insert<T = unknown>(data: T): Promise<T>;
    update<T = unknown>(query: any, data: Partial<T>): Promise<number>;
    delete(query: any): Promise<number>;

    // SQL/Relational Style (used by Raft/Auth)
    run(sql: string, params?: unknown[]): Promise<{ lastID?: string | number, changes?: number }>;
    get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
    all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}
