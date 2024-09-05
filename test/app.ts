import { MessageBroker } from '@3kles/3kles-amqpbroker';
import { GenericSocket } from '../src/generic/generic-socket';
import { GenericApp } from '@3kles/3kles-corebe';
import { IonSocket } from './ion-socket';

(async () => {
    process.env.RABBITMQ_USERNAME = 'guest';
    process.env.RABBITMQ_PASSWORD = 'guest';
    process.env.RABBITMQ_URL = '192.168.111.63';
    process.env.RABBITMQ_PROTOCOL = 'amqp';
    process.env.RABBITMQ_PORT = '5672';
    process.env.PATTERNS = 'toto';
    process.env.EXCHANGE = 'aaaa';
    process.env.JWKS_URI = 'https://mingle-sso.eu1.inforcloudsuite.com/ext/infor/oauthtoken/jwks';
    process.env.JWT_AUTHENTICATION = 'true';

    const broker = await MessageBroker.getInstance();

    const app = new GenericApp();
    const server = app.startApp(8888);
    const genericSocket = new IonSocket(broker, server);

    // genericSocket.addListener({
    //     event: 'toto',
    //     listener: async (socket, response) => {
    //         console.log('ici', response)
    //         console.log('socket', socket)
    //     }
    // });
    await genericSocket.start();
})();


