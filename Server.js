const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('Someone connected');

  ws.on('message', (message) => {
    const text = message.toString();
    console.log('Message:', text);

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });

  ws.on('close', () => {
    clients = clients.filter(c => c !== ws);
    console.log('Someone disconnected');
  });
});

console.log('Server running on ws://localhost:8080');