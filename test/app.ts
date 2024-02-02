import { MessageBroker } from '@3kles/3kles-amqpbroker';
import { GenericSocket } from '../src/generic/generic-socket';
import { GenericApp } from '@3kles/3kles-corebe';

(async () => {
    process.env.RABBITMQ_USERNAME = 'rabbitmq';
    process.env.RABBITMQ_PASSWORD = 'rabbitmq';
    process.env.RABBITMQ_URL = 'localhost';
    process.env.RABBITMQ_PROTOCOL = 'amqp';
    process.env.RABBITMQ_PORT = '5672';
    process.env.PATTERNS = 'toto';

    const broker = await MessageBroker.getInstance();

    const app = new GenericApp();
    const server = app.startApp();
    const genericSocket = new GenericSocket(broker, server);
    await genericSocket.start();

})();
