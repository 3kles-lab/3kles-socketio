import { Socket } from 'socket.io';

export type RoomAction = 'subscribe' | 'unsubscribe';

export interface RoomAccessContext {
    socket: Socket;
    userID: string;
    auth?: unknown;
    room: string;
    action: RoomAction;
}

export type RoomAccessControl = (context: RoomAccessContext) => boolean | Promise<boolean>;

export interface RoomOperationResult {
    success: boolean;
    room: string;
    error?: 'INVALID_ROOM' | 'ACCESS_DENIED' | 'SUBSCRIBE_ERROR' | 'UNSUBSCRIBE_ERROR';
}
