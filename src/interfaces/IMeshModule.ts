import { IMeshApp } from './IMeshApp';

export interface IMeshModule {
    readonly name: string;
    
    onInit?(app: IMeshApp): void | Promise<void>;
    onBind?(app: IMeshApp): void | Promise<void>;
    onReady?(app: IMeshApp): void | Promise<void>;
    onStop?(app: IMeshApp): void | Promise<void>;
    health?(): Promise<boolean>;
}
