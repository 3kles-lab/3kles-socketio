import { ServerOptions } from 'socket.io';
import { RoomAccessControl } from './access/room-access.interface';

export interface IGenericSocket {
    initAuth?(): void;
    start(): Promise<void>;
    getUsers(): Map<string, any>;
    addListener(listener?: { event: string; listener: (...args: any[]) => void }): void;
}

export interface GenericSocketLogger {
    debug?(message: string, metadata?: unknown): void;
    info?(message: string, metadata?: unknown): void;
    warn?(message: string, metadata?: unknown): void;
    error?(message: string, metadata?: unknown): void;
}


export interface GenericSocketOptions extends Partial<ServerOptions> {
    authRequired?: boolean;
    jwksURI?: string;
    jwtSecretKey?: string;
    multipleConnexion?: boolean;
    logger?: GenericSocketLogger;
    roomAccessControl?: RoomAccessControl;
    roomAccessControlRequired?: boolean; // If true, any subscription is rejected when no roomAccessControl is configured
}
