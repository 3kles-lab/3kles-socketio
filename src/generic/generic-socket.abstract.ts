import * as http from "http";
import { ServerOptions, Server, Socket } from "socket.io";
import { IGenericSocket } from "./generic-socket.interface";
import { v4 as uuidv4 } from 'uuid';
import { IGenericMessage } from "../models";
import { IGenericAuth } from "./auth/generic-auth.interface";
import { GenericJWTAuth } from "./auth/generic-jwt-auth";
import { GenericJWKSAuth } from "./auth/generic-jwks-auth";

export const authRequired = (process.env.JWT_AUTHENTICATION === 'true') || false;
export const jwtSecretKey = process.env.JWT_SECRET_KEY;

export abstract class AbstractGenericSocket implements IGenericSocket {
    public readonly io: Server;
    private readonly users: Map<string, any> = new Map<string, any>();
    private listeners: { event: string; listener: (socket: Socket, ...args: any[]) => void }[] = [];
    public authClient: IGenericAuth;

    constructor(server: http.Server, protected config: Partial<ServerOptions & { authRequired?: boolean, jwksURI?: string, jwtSecretKey?: string, multipleConnexion?: boolean }>) {
        this.config.authRequired = process.env.JWT_AUTHENTICATION === 'true' || this.config.authRequired;
        this.config.jwksURI = process.env.JWKS_URI || this.config.jwksURI;
        this.config.jwtSecretKey = process.env.JWT_SECRET_KEY || this.config.jwtSecretKey;
        this.config.multipleConnexion = process.env.MULTIPLE_CONNEXION !== undefined ?
            (process.env.MULTIPLE_CONNEXION === 'true') : (this.config.multipleConnexion !== undefined ? this.config.multipleConnexion : true); // allow multiple connections with the same account
        this.io = new Server(server, config);
    }

    public addListener(listener?: { event: string; listener: (socket: Socket, ...args: any[]) => void }): void {
        this.listeners.push(listener);
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
        if (this.config.jwtSecretKey) {
            this.authClient = new GenericJWTAuth(this.config.jwtSecretKey);
        } else if (this.config.jwksURI) {
            this.authClient = new GenericJWKSAuth({
                jwksUri: this.config.jwksURI,
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 10
            });
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

            socket.on('subscribe', async (room) => {
                await this.onSubscribe(socket, room);
            });

            socket.on('unsubscribe', async (room) => {
                await this.onUnsubscribe(socket, room);
            });

            socket.on("disconnect", async () => {
                await this.onDisconnect(socket);
            });

            socket.on("error", async (err) => {
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
                    const decoded = await this.authClient.verify(socket.handshake.auth.token);
                    socket.data.auth = decoded;
                } catch (err) {
                    return next(err);
                }
            } else {
                return next(new Error('No token'));
            }
        }
        next();
    }

    protected async createSession(socket: Socket<any>, next: (err?: any) => void): Promise<void> {
        const sessionID = socket.handshake.auth.sessionID;

        if (sessionID) {
            const session = this.users.get(sessionID);
            if (session) {
                socket.data.sessionID = sessionID;
                socket.data.userID = session.userID;
                return next();
            }
        }
        socket.data.sessionID = uuidv4();
        socket.data.userID = this.authClient?.getUserId(socket.data.auth) || uuidv4();
        next();
    }

    protected async multipleConnection(socket: Socket<any>, next: (err?: any) => void): Promise<void> {
        if (!this.config.multipleConnexion && this.authClient) {
            Object.entries(this.users)
                .filter(([sessionId, value]) => value.connected)
                .filter(([sessionId, value]) => sessionId !== socket.data.sessionID)
                .forEach(([sessionId, value]) => {
                    value.socket?.disconnect(true);
                    this.users.delete(sessionId);
                });
        }
        next();
    }

    protected async emitMessage(message: IGenericMessage): Promise<void> {
        if (message.to) {
            Array.from(this.users.values())
                .filter((user) => user.connected)
                .filter((user) => user.userID === message.to)
                .forEach((user) => {
                    this.io.to(user.userID).emit(message.type || 'notification', message.content);
                });
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
            socket
        });

        socket.emit("session", {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });

        socket.join(socket.data.userID);
    }

    protected async onSubscribe(socket: Socket<any>, room: any): Promise<void> {
        try {
            socket.join(room);
        } catch (err) {
            console.error('Error join room', err);
        }
    }

    protected async onUnsubscribe(socket: Socket<any>, room: any): Promise<void> {
        try {
            socket.leave(room);
        } catch (err) {
            console.error('Error leave room', err);
        }

    }
    protected async onNewUserConnected(user: any): Promise<void> {
        /**
         *
         */
    }

    protected async onDisconnect(socket: Socket<any>): Promise<void> {
        const matchingSockets = await this.io.in(socket.data.userID).allSockets();
        const isDisconnected = matchingSockets.size === 0;
        if (isDisconnected) {
            this.users.set(socket.data.sessionID, {
                userID: socket.data.userID,
                connected: false,
            });
        }

    }
    protected async onError(socket: Socket<any>, error: any): Promise<void> {
        if (error && error.message === "invalid token") {
            socket.disconnect();    // disconnect invalid user
        }
        await this.handleErrors(error);

    }

    protected async handleErrors(error: any): Promise<void> {
        console.error(error);
    }

}
