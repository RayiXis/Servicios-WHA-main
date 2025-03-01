const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const jwt = require("jsonwebtoken");
const verifyToken = require('./middlewares/auth');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require("socket.io");

console.log("Iniciando servidor...");

// Inicializa Express
const app = express();
const port = 3000;
app.use(express.json()); // Permite recibir JSON en las peticiones
app.use(express.static('public')); // Sirve archivos estáticos desde la carpeta 'public'

// Crear servidor HTTP y configurar Socket.IO para la comunicación en tiempo real
const server = http.createServer(app);
const io = socketIo(server);

// Mapa para almacenar múltiples sesiones de WhatsApp
const sessions = new Map();

// Crear una carpeta para guardar las imágenes si no existe
const imagesDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

// Función para formatear la fecha en la zona horaria local
function formatLocalDate(date) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Hermosillo',
    };
    const formattedDate = new Date(date).toLocaleString('es-MX', options);
    const [datePart, timePart] = formattedDate.split(', ');
    const [day, month, year] = datePart.split('/');
    return `${day}-${month}-${year} ${timePart}`;
}

// Clase personalizada para evitar que se eliminen archivos de sesión al cerrar sesión
class CustomAuth extends LocalAuth {
    async logout() {
        try {
            console.log("Evitando la eliminación de archivos de sesión...");
            // No hacer nada aquí para evitar la eliminación de archivos
        } catch (error) {
            console.error("Error en CustomAuth.logout:", error.message);
        }
    }
}

// Función para crear una nueva sesión de WhatsApp
function createWhatsAppSession(sessionId) {
    if (sessions.has(sessionId)) {
        throw new Error(`La sesión ${sessionId} ya existe.`);
    }

    // Configuración del cliente de WhatsApp
    const client = new Client({
        authStrategy: new CustomAuth({ // Usa CustomAuth para evitar eliminación de archivos
            dataPath: `./sessions/${sessionId}`,
        }),
        puppeteer: {
            headless: true, // Ejecutar en modo sin interfaz gráfica
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--remote-debugging-port=9222"
            ],
        },
    });

    let token = null;

    // Evento cuando el cliente está listo
    client.once("ready", () => {
        console.log(`✅ Cliente de WhatsApp listo para la sesión ${sessionId}`);
        token = jwt.sign({ sessionId }, 'tu_clave_secreta', { expiresIn: '1h' });
        console.log("🔑 Token generado:", token);
    });

    // Evento para generar y mostrar el código QR
    client.on("qr", (qr) => {
        console.log(`Escanea este QR para iniciar sesión ${sessionId}:`);
        qrcode.generate(qr, { small: true });
        io.emit("qr", { sessionId, qr });
    });

    // Manejo de desconexión del cliente
    client.on("disconnected", async (reason) => {
        console.error(`❌ Cliente desconectado (${sessionId}):`, reason);
        try {
            if (client.pupBrowser) {
                console.log(`Cerrando el navegador para la sesión ${sessionId}...`);
                await client.pupBrowser.close();
            }
            await client.destroy();
        } catch (error) {
            console.error("Error al cerrar el navegador o destruir el cliente:", error.message);
        } finally {
            sessions.delete(sessionId);
            console.log(`Reiniciando la sesión ${sessionId}...`);
            createWhatsAppSession(sessionId);
        }
    });

    // Manejo de mensajes recibidos
    client.on("message_create", async (message) => {
        if (message.from === "status@broadcast") return;
        console.log(`📩 Mensaje recibido en la sesión ${sessionId}: ${message.body}`);
        const localDate = formatLocalDate(new Date());
        
        if (message.hasMedia) {
            try {
                const media = await message.downloadMedia();
                if (!media) throw new Error("No se pudo descargar el archivo adjunto.");
                const extension = media.mimetype.split('/')[1] || 'bin';
                const fileName = `file_${Date.now()}.${extension}`;
                const filePath = path.join(imagesDir, fileName);
                fs.writeFileSync(filePath, media.data, 'base64');
                io.emit("message", {
                    sessionId,
                    from: message.from,
                    body: `📁 Archivo recibido: <a href="/images/${fileName}" download>Descargar</a>` ,
                    timestamp: localDate,
                });
            } catch (error) {
                console.error("Error al manejar el archivo adjunto:", error.message);
            }
        } else {
            io.emit("message", { sessionId, from: message.from, body: message.body, timestamp: localDate });
        }
    });

    client.initialize();
    sessions.set(sessionId, { client, token });
}

// Rutas de Express
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para crear una nueva sesión de WhatsApp
app.post("/create-session", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId es requerido" });
    try {
        createWhatsAppSession(sessionId);
        res.json({ success: true, sessionId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Endpoint para cerrar sesión de WhatsApp
app.post("/close-session", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId es requerido" });
    if (!sessions.has(sessionId)) return res.status(404).json({ error: `La sesión ${sessionId} no existe` });
    const session = sessions.get(sessionId);
    try {
        await session.client.destroy();
        sessions.delete(sessionId);
        console.log(`✅ Sesión ${sessionId} cerrada correctamente`);
        res.json({ success: true, message: `Sesión ${sessionId} cerrada correctamente` });
    } catch (error) {
        console.log(`❌ Error al cerrar la sesión ${sessionId}:`, error.message);
        res.status(500).json({ error: "Error al cerrar la sesión", details: error.message });
    }
});

// Endpoint para enviar un mensaje a través de WhatsApp
app.post("/send-message", async (req, res) => {
    const { number, message, authToken } = req.body;

    // Validar los campos requeridos
    if (!number || !message || !authToken) {
        return res.status(400).json({ error: "number, message y authToken son requeridos" });
    }

    try {
        // Verificar el token de autenticación
        const decoded = jwt.verify(authToken, 'tu_clave_secreta');
        const sessionId = decoded.sessionId;

        // Verificar si la sesión existe
        if (!sessions.has(sessionId)) {
            return res.status(404).json({ error: `La sesión ${sessionId} no existe` });
        }

        // Obtener el cliente de WhatsApp asociado a la sesión
        const session = sessions.get(sessionId);
        const client = session.client;

        // Enviar el mensaje
        const chatId = number.includes("@c.us") ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);

        // Responder con éxito
        res.json({ success: true, message: "Mensaje enviado correctamente" });
    } catch (error) {
        console.error("Error al enviar el mensaje:", error.message);
        res.status(500).json({ error: "Error al enviar el mensaje", details: error.message });
    }
});

// Iniciar servidor
server.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});
