import * as http from 'http';
import { Server, Socket } from 'socket.io';
import { GenericSocketLogger, GenericSocketOptions, IGenericSocket } from './generic-socket.interface';
import { v4 as uuidv4 } from 'uuid';
import { IGenericMessage } from '../models';
import { IGenericAuth } from './auth/generic-auth.interface';
import { GenericJWTAuth } from './auth/generic-jwt-auth';
import { GenericJWKSAuth } from './auth/generic-jwks-auth';
import { RoomOperationResult } from './access/room-access.interface';

export const authRequired = process.env.JWT_AUTHENTICATION === 'true' || false;
export const jwtSecretKey = process.env.JWT_SECRET_KEY;

export abstract class AbstractGenericSocket implements IGenericSocket {
    public readonly io: Server;
    private readonly users: Map<string, any> = new Map<string, any>();
    private listeners: { event: string; listener: (socket: Socket, ...args: any[]) => void }[] = [];
    protected config: GenericSocketOptions;
    public authClient: IGenericAuth | undefined;

    protected readonly logger: GenericSocketLogger;

    constructor(server: http.Server, c?: GenericSocketOptions) {
        this.config = {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
            path: process.env.SOCKET_PATH
                ? process.env.SOCKET_PATH.startsWith('/')
                    ? process.env.SOCKET_PATH
                    : `/${process.env.SOCKET_PATH}`
                : '/socket.io/',
            connectTimeout: process.env.CONNECT_TIMEOUT ? +process.env.CONNECT_TIMEOUT : 45000,
            pingTimeout: process.env.PING_TIMEOUT ? +process.env.PING_TIMEOUT : 20000,
            pingInterval: process.env.PING_INTERVAL ? +process.env.PING_INTERVAL : 25000,
            maxHttpBufferSize: process.env.MAX_HTTP_BUFFER_SIZE ? +process.env.MAX_HTTP_BUFFER_SIZE : 1e5,
            authRequired: process.env.JWT_AUTHENTICATION === 'true',
            jwksURI: process.env.JWKS_URI,
            jwtSecretKey: process.env.JWT_SECRET_KEY,
            multipleConnexion: process.env.MULTIPLE_CONNEXION !== undefined ? process.env.MULTIPLE_CONNEXION === 'true' : false, // allow multiple connections with the same account
            roomAccessControlRequired: process.env.ROOM_ACCESS_CONTROL_REQUIRED === 'true',
            ...c,
        };

        this.logger = this.config.logger ?? console;

        const { authRequired, jwksURI, jwtSecretKey, multipleConnexion, roomAccessControl, roomAccessControlRequired, logger, ...socketOptions } =
            this.config;

        this.io = new Server(server, socketOptions);
    }

    public addListener(listener?: { event: string; listener: (socket: Socket, ...args: any[]) => void }): void {
        if (listener) {
            this.listeners.push(listener);
        }
    }

    public async start(): Promise<void> {
        this.initAuth();
        this.initMiddlewares();
        this.initConnection();
    }

    public getUsers(): Map<string, any> {
        return this.users;
    }

    public initAuth(): void {
        if (!this.config.authRequired) {
            return;
        }
        if (this.config.jwtSecretKey && this.config.jwksURI) {
            throw new Error('JWT_SECRET_KEY and JWKS_URI cannot be configured together');
        }
        if (this.config.jwtSecretKey) {
            this.authClient = new GenericJWTAuth(this.config.jwtSecretKey);
        } else if (this.config.jwksURI) {
            this.authClient = new GenericJWKSAuth({
                jwksUri: this.config.jwksURI,
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 10,
                algorithms: ['RS256'],
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE,
                userIdClaim: process.env.JWT_USER_ID_CLAIM ?? 'sub',
            });
        } else {
            throw new Error('Authentication is required but no JWT authentication provider is configured');
        }
    }

    protected initMiddlewares(): void {
        this.io.use(async (socket, next) => {
            await this.auth(socket, next);
        });

        this.io.use(async (socket, next) => {
            await this.createSession(socket, next);
        });

        this.io.use(async (socket, next) => {
            await this.multipleConnection(socket, next);
        });
    }

    protected initConnection(): void {
        this.io.on('connection', async (socket) => {
            await this.onConnection(socket);

            await this.onNewUserConnected({
                sessionID: socket.data.sessionID,
                userID: socket.data.userID,
            });

            this.listeners.forEach((listener) => {
                socket.on(listener.event, (args) => {
                    listener.listener(socket, args);
                });
            });

            socket.on('subscribe', async (room: string | string[], callback?: (result: RoomOperationResult | RoomOperationResult[]) => void) => {
                const result = await this.onSubscribe(socket, room);
                console.log(result);
                callback?.(result);
            });

            socket.on('unsubscribe', async (room: string, callback?: (result: RoomOperationResult) => void) => {
                const result = await this.onUnsubscribe(socket, room);
                callback?.(result);
            });

            socket.on('disconnect', async () => {
                await this.onDisconnect(socket);
            });

            socket.on('error', async (err) => {
                await this.onError(socket, err);
            });

            socket.on('connect_error', async (err) => await this.handleErrors(err));
            socket.on('connect_failed', async (err) => await this.handleErrors(err));
        });
    }

    protected async auth(socket: Socket<any, any, any>, next: (err?: any) => void): Promise<void> {
        if (this.config.authRequired) {
            if (socket.handshake.auth?.token) {
                try {
                    const decoded = await this.authClient?.verify(socket.handshake.auth.token);
                    socket.data.auth = decoded;
                } catch (error) {
                    this.logger.error?.('Error auth', {
                        userID: socket.data.userID,
                        error,
                    });

                    return next(error);
                }
            } else {
                return next(new Error('No token'));
            }
        }
        next();
    }

    protected async createSession(socket: Socket<any>, next: (err?: any) => void): Promise<void> {
        try {
            const authenticatedUserId = this.authClient ? this.authClient.getUserId(socket.data.auth) : uuidv4();

            const requestedSessionId = socket.handshake.auth?.sessionID;
            if (requestedSessionId) {
                const session = this.users.get(requestedSessionId);

                if (session && session.userID === authenticatedUserId) {
                    socket.data.sessionID = requestedSessionId;
                    socket.data.userID = authenticatedUserId;
                    return next();
                }
            }

            socket.data.sessionID = uuidv4();
            socket.data.userID = authenticatedUserId;

            next();
        } catch {
            next(new Error('Invalid authenticated user'));
        }
    }

    protected async multipleConnection(socket: Socket<any>, next: (err?: any) => void): Promise<void> {
        if (this.config.multipleConnexion) {
            return next();
        }

        for (const [sessionId, session] of this.users.entries()) {
            const sameUser = session.userID === socket.data.userID;
            const differentSession = sessionId !== socket.data.sessionID;

            if (sameUser && differentSession && session.connected) {
                session.socket?.disconnect(true);
                this.users.delete(sessionId);
            }
        }

        next();
    }

    protected async emitMessage(message: IGenericMessage): Promise<void> {
        if (message.to) {
            const user = Array.from(this.users.values())
                .filter((user) => user.connected)
                .find((user) => user.userID === message.to);

            if (user) {
                this.io.to(user.userID).emit(message.type || 'notification', message.content);
            }
        } else if (message.room) {
            this.io.to(message.room).emit(message.type || 'notification', message.content);
        } else {
            this.io.emit(message.type || 'notification', message.content);
        }
    }

    protected async onConnection(socket: Socket<any, any, any>): Promise<void> {
        this.users.set(socket.data.sessionID, {
            userID: socket.data.userID,
            connected: true,
            socket,
        });

        socket.emit('session', {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });

        socket.join(socket.data.userID);
    }

    protected async onSubscribe(socket: Socket<any>, requestedRooms: string | string[]): Promise<RoomOperationResult | RoomOperationResult[]> {
        const results: RoomOperationResult[] = [];

        const rooms = Array.isArray(requestedRooms) ? [...new Set(requestedRooms)] : [requestedRooms];

        for (const room of rooms) {
            if (!this.isValidRoom(room)) {
                this.logger.warn?.('Room not valid', {
                    userID: socket.data.userID,
                    room,
                });
                results.push({
                    success: false,
                    room: String(room),
                    error: 'INVALID_ROOM',
                });
                continue;
            }

            const authorized = await this.canAccessRoom(socket, room, 'subscribe');

            if (!authorized) {
                this.logger.warn?.('Room access denied', {
                    userID: socket.data.userID,
                    room,
                });

                results.push({
                    success: false,
                    room,
                    error: 'ACCESS_DENIED',
                });

                continue;
            }

            try {
                socket.join(room);
                results.push({
                    success: true,
                    room,
                });
            } catch (error) {
                this.logger.error?.('Error joining room', {
                    userID: socket.data.userID,
                    room,
                    error,
                });

                results.push({
                    success: false,
                    room,
                    error: 'SUBSCRIBE_ERROR',
                });
            }
        }

        return results;
    }

    protected async onUnsubscribe(socket: Socket<any>, room: string): Promise<RoomOperationResult> {
        if (!this.isValidRoom(room)) {
            this.logger.warn?.('Room not valid', {
                userID: socket.data.userID,
                room,
            });

            return {
                success: false,
                room: String(room),
                error: 'INVALID_ROOM',
            };
        }

        const authorized = await this.canAccessRoom(socket, room, 'unsubscribe');

        if (!authorized) {
            this.logger.warn?.('Room access denied', {
                userID: socket.data.userID,
                room,
            });

            return {
                success: false,
                room,
                error: 'ACCESS_DENIED',
            };
        }

        try {
            socket.leave(room);
            return {
                success: true,
                room,
            };
        } catch (error) {
            this.logger.error?.('Error leaving room', {
                userID: socket.data.userID,
                room,
                error,
            });

            return {
                success: false,
                room,
                error: 'UNSUBSCRIBE_ERROR',
            };
        }
    }
    protected async onNewUserConnected(user: any): Promise<void> {
        /**
         *
         */
    }

    protected async onDisconnect(socket: Socket<any>): Promise<void> {
        this.users.delete(socket.data.sessionID);
    }
    protected async onError(socket: Socket<any>, error: any): Promise<void> {
        if (error && error.message === 'invalid token') {
            this.users.delete(socket.data.sessionID);
            socket.disconnect(); // disconnect invalid user
        }
        await this.handleErrors(error);
    }

    protected async handleErrors(error: any): Promise<void> {
        this.logger.error?.('Socket error', {
            error,
        });
    }

    protected isValidRoom(room: unknown): room is string {
        return typeof room === 'string' && room.length > 0 && room.length <= 200 && /^[a-zA-Z0-9:_-]+$/.test(room);
    }

    protected async canAccessRoom(socket: Socket, room: string, action: 'subscribe' | 'unsubscribe'): Promise<boolean> {
        const accessControl = this.config.roomAccessControl;

        if (!accessControl) {
            return !this.config.roomAccessControlRequired;
        }

        try {
            return await accessControl({
                socket,
                userID: socket.data.userID,
                auth: socket.data.auth,
                room,
                action,
            });
        } catch (error) {
            this.logger.error?.('Room access control error', {
                userID: socket.data.userID,
                room,
                action,
                error,
            });

            return false;
        }
    }
}
