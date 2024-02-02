import * as http from "http";
import { ServerOptions, Server, Socket } from "socket.io";
import * as jwt from 'jsonwebtoken';
import { IGenericSocket } from "./generic-socket.interface";
import { v4 as uuidv4 } from 'uuid';
import { IGenericMessage } from "../models";

export const authRequired = (process.env.JWT_AUTHENTICATION === 'true') || false;
export const jwtSecretKey = process.env.JWT_SECRET_KEY;

export const multipleConnexion = (process.env.MULTIPLE_CONNEXION === 'true') || false; // allow multiple connections with the same account

export abstract class AbstractGenericSocket implements IGenericSocket {
    public readonly io: Server;
    private readonly users: Map<string, any> = new Map<string, any>();

    constructor(server: http.Server, config: Partial<ServerOptions>) {
        this.io = new Server(server, config);
    }

    public async start(): Promise<void> {
        this.initMiddlewares();
        this.initConnection();
    }

    public getUsers(): Map<string, any> {
        return this.users;
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
                login: socket.data.login,
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
        if (authRequired) {
            if (socket.handshake.auth && socket.handshake.auth.token) {
                jwt.verify(socket.handshake.auth.token, jwtSecretKey, (err, decoded) => {
                    if (err) {
                        return next(new Error('invalid token'));
                    }
                    socket.data.login = decoded.login;
                });
            }
            return next(new Error('invalid token'));
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
        socket.data.userID = uuidv4();
        next();
    }

    protected async multipleConnection(socket: Socket<any>, next: (err?: any) => void): Promise<void> {
        if (socket.data.login && !multipleConnexion) {
            Array.from(this.users.values())
                .filter((user) => user.connected)
                .filter((user) => user.login === socket.data.login && user.userID !== socket.data.userID)
                .forEach((user) => {
                    user.socket?.disconnect(true);
                    this.users.delete(user.sessionID);
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
            login: socket.data.login,
            connected: true,
            socket
        });

        socket.emit("session", {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
            login: socket.data.login,
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
                login: socket.data.login,
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
