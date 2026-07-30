import { MessageBroker } from '@3kles/3kles-amqpbroker';
import { GenericSocket } from '../src/generic/generic-socket';
import { GenericApp } from '@3kles/3kles-corebe';

(async () => {
    process.env.RABBITMQ_USERNAME = 'guest';
    process.env.RABBITMQ_PASSWORD = 'guest';
    process.env.RABBITMQ_URL = '192.168.111.63';
    process.env.RABBITMQ_PROTOCOL = 'amqp';
    process.env.RABBITMQ_PORT = '5672';
    process.env.PATTERNS = 'process.event';
    process.env.EXCHANGE = 'cockpitdata.event';
    process.env.JWKS_URI = 'https://mingle-sso.eu1.inforcloudsuite.com/ext/infor/oauthtoken/jwks';

    const broker = await MessageBroker.getInstance();

    const app = new GenericApp();
    const server = app.startApp(1234);
    const genericSocket = new GenericSocket(broker, server, {
        roomAccessControlRequired: false,
        roomAccessControl: (context) => {
            if (context.action === 'unsubscribe') {
                return true;
            }

            const claims = context.auth as {
                tid?: string;
                roles?: string[];
            };

            if (context.room.startsWith('user:')) {
                return context.room === `user:${context.userID}`;
            }

            if (context.room.startsWith('tenant:')) {
                const requestedTenantId = context.room.substring('tenant:'.length);
                return requestedTenantId === claims.tid;
            }

            if (context.room === 'admin') {
                return claims.roles?.includes('Socket.Admin') === true;
            }

            return false;
        },
    });

    await genericSocket.start();
})();

//   roomAccessControl: async ({
//             userID,
//             auth,
//             room,
//             action,
//         }) => {
//             if (action === 'unsubscribe') {
//                 return true;
//             }

//             const claims = auth as {
//                 tid?: string;
//                 roles?: string[];
//             };

//             /*
//              * Room personnelle.
//              */
//             if (room.startsWith('user:')) {
//                 return room === `user:${userID}`;
//             }

//             /*
//              * Room Entra tenant.
//              */
//             if (room.startsWith('tenant:')) {
//                 const requestedTenantId = room.substring('tenant:'.length);

//                 return requestedTenantId === claims.tid;
//             }

//             /*
//              * Room réservée aux administrateurs.
//              */
//             if (room === 'admin') {
//                 return claims.roles?.includes('Socket.Admin') === true;
//             }

//             /*
//              * Room projet : vérification métier externe.
//              */
//             if (room.startsWith('project:')) {
//                 const projectId = room.substring('project:'.length);

//                 return projectAccessService.userCanAccessProject(
//                     userID,
//                     projectId,
//                 );
//             }

//             /*
//              * Toute room inconnue est refusée.
//              */
//             return false;
//         },
//     },
