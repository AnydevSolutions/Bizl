const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const discordToken = process.env.discordToken;
const channelId = process.env.channelId;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let botReady = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

const loginBot = () => {
    client.login(discordToken).catch(err => {
        console.error('Failed to login:', err);
        reconnectAttempts += 1;
        if (reconnectAttempts < maxReconnectAttempts) {
            setTimeout(loginBot, 5000); // Reintentar después de 5 segundos
        } else {
            process.exit(1);
        }
    });
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('online'); // Inicializar como en línea

    // Verificar permisos del bot en el canal
    try {
        const channel = await client.channels.fetch(channelId);
        const botMember = await channel.guild.members.fetch(client.user.id);

        if (!botMember.permissionsIn(channel).has([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
        ])) {
            throw new Error('Bot does not have the necessary permissions in the channel.');
        }

        botReady = true;
        console.log('Bot permissions verified and ready.');
    } catch (error) {
        console.error('Failed to verify bot permissions:', error);
    }
});

loginBot();

app.use(express.json());

const allowedOrigins = ['https://www.splift.mx', 'https://c984a7-7.myshopify.com'];

const corsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed petition'));
        }
    },
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Middleware para registrar todos los headers recibidos
app.use((req, res, next) => {
    console.log('Headers recibidos:', req.headers);
    next();
});

// Middleware para verificar que el bot esté listo
app.use((req, res, next) => {
    if (!botReady) {
        console.error('Bot is not ready.');
        return res.status(503).json({ error: 'Bot is not ready' });
    }
    next();
});

// Ruta para /favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // Responde con 204 No Content
});

// Ruta para la raíz del servidor
app.get('/', (req, res) => {
    res.send('Servidor funcionando');
});

// Ruta para el ping de UptimeRobot
app.get('/ping', (req, res) => {
    console.log('Ping received');
    if (!botReady) {
        console.log('Bot not ready, attempting to login again');
        loginBot();
    }
    res.status(200).send('Pong');
});

app.get('/order/:shopifyOrder', async (req, res) => {
    try {
        const shopifyOrder = req.params.shopifyOrder;
        const channel = await client.channels.fetch(channelId);

        // Buscar en los últimos 3 mensajes
        const messages = await channel.messages.fetch({ limit: 3 });

        let orderInfo = null;
        let estadoActual = null;

        messages.forEach(msg => {
            const matchOrder = msg.content.match(/Shopify_order:\s*(\d+)/);
            const matchEstado = msg.embeds.length > 0 && msg.embeds[0].description.match(/Estado Actual:\s*([\w_]+)/);

            if (matchOrder && matchOrder[1] === shopifyOrder) {
                orderInfo = msg;
                if (matchEstado) {
                    estadoActual = matchEstado[1];
                }
            }
        });

        if (orderInfo) {
            if (estadoActual === 'CANCELLED_BY_BUSINESS') {
                res.json({ error: 'CANCELLED_BY_BUSINESS' });
            } else {
                const smrUrl = orderInfo.content.match(/SMR URL:\s*([\w\d]+)/i);
                const customerTel = orderInfo.content.match(/Customer_Tel:\s*([\+\d]+)/i);

                res.json({
                    shopifyOrder,
                    smrUrl: smrUrl ? smrUrl[1] : 'N/A',
                    estadoPedido: estadoActual,
                    customerTel: customerTel ? customerTel[1] : 'N/A'
                });
            }
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        console.error('Error while fetching order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Manejador para rutas no encontradas
app.use((req, res) => {
    res.status(404).send('Ruta no encontrada');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
