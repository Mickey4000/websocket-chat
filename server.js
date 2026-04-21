const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading page');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const clients = new Set();

function safeSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(payload));
}

function broadcastToChannel(channel, payload) {
  for (const client of clients) {
    if (client.meta?.channel === channel) {
      safeSend(client, payload);
    }
  }
}

function getChannelMembers(channel) {
  const members = [];

  for (const client of clients) {
    if (client.meta?.channel === channel && client.meta.name) {
      members.push(client.meta.name);
    }
  }

  return members;
}

function relayMessage(ws, data) {
  const meta = ws.meta;
  if (!meta?.channel || !meta?.name || !data.topic) {
    return;
  }

  if (data.topic === 'list') {
    const members = getChannelMembers(meta.channel);
    broadcastToChannel(meta.channel, {
      type: 'message',
      topic: 'list',
      name: meta.name,
      message: members
    });
    return;
  }

  broadcastToChannel(meta.channel, {
    type: 'message',
    topic: data.topic,
    name: meta.name,
    message: data.message
  });
}

wss.on('connection', (ws) => {
  ws.meta = {
    channel: null,
    name: null,
    lastMessage: 0
  };
  clients.add(ws);
  console.log('Client connected');

  ws.on('message', (rawMessage) => {
    const text = rawMessage.toString();
    console.log('Message:', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error('Invalid JSON:', error.message);
      return;
    }

    if (data.type === 'init') {
      ws.meta.channel = data.channel || null;
      ws.meta.name = data.name || null;
      ws.meta.lastMessage = data.lastMessage || 0;

      console.log(`Initialized ${ws.meta.name || 'unknown'} in channel ${ws.meta.channel || 'none'}`);
      return;
    }

    if (data.type === 'message') {
      relayMessage(ws, data);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 8008;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BotServer running on port ${PORT}`);
});
