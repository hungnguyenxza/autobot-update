const express = require("express");
const http = require("http");
const ws = require("ws");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "./public")));
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")) });

const httpServer = http.createServer(app);
const wss = new ws.Server({ server: httpServer });
wss.on("connection",
    (ws) => {
        console.log("Client connected");

        ws.onmessage =
            (event) => {
                console.log(`Client messaging:`);
                console.log(event.data);
                const payload = JSON.parse(event.data);
                parseAction(payload, ws);
            }
        // handling what to do when clients disconnects from server
        ws.onclose = () => {
            console.log("the client Disconnected");
            removeConnection(ws);
        };
        // handling client connection error
        ws.onerror = function (err) {
            console.log(err);
            console.log("Some Error occurred")
        }
    });

const port = process.env.PORT || 3000;
httpServer.listen(port, () => { console.log("Server started. Port: ", port); });

console.log("The WebSocket server is running on port 3000");

const Action = Object.freeze({
    "NewUser": 'new-user',
    "SendMessage": 'send-message',
    "UpdateStatus": 'update-status',
});

var ConnectionPool = {};

function parseAction(payload, ws) {
    switch (payload.Action) {
        case Action.NewUser:
            let data = payload.Data;
            if (ConnectionPool[data.Id]) {
                ConnectionPool[data.Id].Ws.push(ws);
                ConnectionPool[data.Id].Data.push(data);
            } else {
                ConnectionPool[data.Id] = {
                    "Ws": [ws],
                    "Data": [data]
                }
            }
            notifyToMaster();
            break;
        case Action.SendMessage:
            let recievers = payload.Recievers;
            recievers = recievers || ['master'];
            for (let i = 0; i < recievers.length; i++) {
                const botId = recievers[i];
                if (ConnectionPool.hasOwnProperty(botId)) {
                    let wsList = ConnectionPool[botId].Ws;
                    for (let j = 0; j < wsList.length; j++) {
                        const ws = wsList[j];
                        ws.send(JSON.stringify(payload.Data || {}));
                    }
                }
            }
            break;
        default:
            break;
    }
}

function removeConnection(ws) {
    for (const key in ConnectionPool) {
        const wsList = ConnectionPool[key].Ws;
        let index = wsList.indexOf(ws);
        if (index >= 0) {
            ConnectionPool[key].Ws.splice(index, 1);
            if (!ConnectionPool[key].Ws.length) {
                delete ConnectionPool[key];
            }
        }
    }
    notifyToMaster();
}

function notifyToMaster() {
    var master = ConnectionPool['master'];
    if (!master) return;
    wsList = ConnectionPool['master'].Ws;
    if (!wsList) return;

    for (let i = 0; i < wsList.length; i++) {
        const wsMaster = wsList[i];
        let data = {
            "Action": Action.NewUser,
            "Data": []
        };
        for (const key in ConnectionPool) {
            if (key.toLocaleLowerCase() !== 'master') {
                for (let j = 0; j < ConnectionPool[key].Data.length; j++) {
                    const bot = ConnectionPool[key].Data[j];
                    data.Data.push(bot);
                }
            }
        }
        wsMaster.send(JSON.stringify(data));

        data.Action = Action.UpdateStatus;
        data.Data = [];
        for (const key in ConnectionPool) {
            if (key.toLocaleLowerCase() !== 'master') {
                for (let j = 0; j < ConnectionPool[key].Ws.length; j++) {
                    const ws = ConnectionPool[key].Ws[j];
                    ws.send(JSON.stringify(data));
                }
            }
        }
    }
}