import * as http from 'http';
import { AbstractGenericSocket } from './generic-socket.abstract';
import { MessageBroker } from '@3kles/3kles-amqpbroker';
import { GenericSocketOptions } from './generic-socket.interface';

export class GenericSocket extends AbstractGenericSocket {
    constructor(
        protected broker: MessageBroker,
        server: http.Server,
        config?: GenericSocketOptions,
    ) {
        super(server, config);
    }

    public async start(): Promise<void> {
        await super.start();

        const patterns = process.env.PATTERNS ? Array.from(new Set(process.env.PATTERNS.split(','))) : '#';
        const exchange = process.env.EXCHANGE || 'event';

        this.logger.info?.('Broker subscribe', {
            exchange,
            patterns
        });

        try {
            await this.broker.subscribeExchange(
                '',
                exchange,
                patterns,
                'topic',
                async (msg, ack) => {
                    if (msg) {
                        try {
                            const notification = JSON.parse(msg.content.toString());
                            await this.emitMessage(notification);
                        } catch (error) {
                            this.logger.error?.('Failed to process notification message', {
                                error,
                            });
                        }
                        ack();
                    }
                },
                { durable: false },
            );
        } catch (error) {
            this.logger.error?.('Broker subscribe error', {
                error,
            });
        }
    }

    protected async onNewUserConnected(user: any): Promise<void> {
        const detectNewUser = process.env.DETECT_NEW_USER === 'true' || false;

        if (detectNewUser) {
            this.broker.send('new_user_connected', Buffer.from(JSON.stringify(user)), { persistent: true });
        }
    }
}
