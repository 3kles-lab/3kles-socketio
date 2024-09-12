import { ServerOptions } from "socket.io";
import * as http from "http";
import { AbstractGenericSocket } from "./generic-socket.abstract";
import { MessageBroker } from "@3kles/3kles-amqpbroker";

export class GenericSocket extends AbstractGenericSocket {

    constructor(protected broker: MessageBroker, server: http.Server,
        config?: Partial<ServerOptions & { authRequired?: boolean, jwksURI?: string, jwtSecretKey?: string, multipleConnexion?: boolean }>) {
        super(server, config);
    }

    public async start(): Promise<void> {
        await super.start();

        const patterns = process.env.PATTERNS ? Array.from(new Set(process.env.PATTERNS.split(','))) : [];
        const exchange = process.env.EXCHANGE || 'event';

        console.log('exchange', exchange);
        console.log('patterns', patterns);

        try {
            await this.broker.subscribeExchange('', exchange, patterns, 'topic', async (msg, ack) => {
                if (msg) {
                    try {
                        const notification = JSON.parse(msg.content.toString());
                        await this.emitMessage(notification);
                    } catch (err) {
                        console.error(err);
                    }
                    ack();
                }
            }, { durable: false });
        } catch (err) {
            console.error(err);
        }
    }

    protected async onNewUserConnected(user: any): Promise<void> {
        const detectNewUser = (process.env.DETECT_NEW_USER === 'true') || false;

        if (detectNewUser) {
            this.broker.send('new_user_connected', Buffer.from(JSON.stringify(user)), { persistent: true });
        }
    }
}
