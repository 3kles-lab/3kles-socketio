# @3kles/3kles-socketio

This package contains class to create sockets

## Models

**IGenericMessage** is a model to represent the message exchanged
- **type?: string**: Type of the message
- **to?: string**: Specify to who you want to send the message
- **room?: string**: Specific room where to send to the message
- **content: any**: Content of the message

## Interfaces

**IGenericSocket** is a generic socket interface
- **start(): Promise\<void>**: To initialize the connections
- **getUsers(): Map<string, any>**: To get the users connected
- **addListener(listener?: { event: string, listener: (...args: any[]) => void }): void**: To add a listener

## Install

### npm

```
npm install @3kles/3kles-socketio --save
```

## How to use

How to create a socket

```javascript
const broker = await MessageBroker.getInstance();

const app = new GenericApp();
const server = app.startApp();
const genericSocket = new GenericSocket(broker, server);
await genericSocket.start();
```

Check the [`documentation`](https://doc.3kles-consulting.com) here.
