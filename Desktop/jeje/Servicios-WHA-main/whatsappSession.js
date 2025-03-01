// Importa los módulos necesarios de whatsapp-web.js y otras dependencias
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Clase que maneja una sesión individual de WhatsApp
class WhatsAppSession {
    constructor(sessionId) {
        this.sessionId = sessionId;
        
        // Configuración del cliente de WhatsApp con autenticación local
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: `./sessions/${sessionId}`,
            }),
            puppeteer: {
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--disable-gpu",
                    "--remote-debugging-port=9222"
                ],
                timeout: 60000,
            },
        });

        this.token = null;

        // Crear carpeta para archivos adjuntos si no existe
        const imagesDir = path.join(__dirname, '..', 'public', 'images', sessionId);
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        // Evento cuando el cliente está listo para usar
        this.client.once("ready", () => {
            console.log(`✅ Cliente de WhatsApp listo para la sesión ${sessionId}`);
            // Generar un token JWT para autenticar la sesión
            this.token = jwt.sign({ sessionId }, 'tu_clave_secreta', { expiresIn: '1h' });
            console.log("🔑 Token generado:", this.token);
        });

        // Evento para mostrar el código QR en la terminal para iniciar sesión
        this.client.on("qr", (qr) => {
            console.log(`Escanea este QR para iniciar sesión ${sessionId}:`);
            qrcode.generate(qr, { small: true });
        });

        // Manejo de desconexión y reintento de conexión automática
        this.client.on("disconnected", async (reason) => {
            console.error(`❌ Cliente desconectado (${sessionId}):`, reason);
            // Destruir el cliente y volver a inicializarlo
            await this.client.destroy();
            this.client.initialize();
        });

        // Inicializar el cliente de WhatsApp
        this.client.initialize();
    }

    // Método para obtener el cliente de WhatsApp
    getClient() {
        return this.client;
    }

    // Método para obtener el token de la sesión
    getToken() {
        return this.token;
    }
}

// Exporta la clase para ser utilizada en la gestión de sesiones
module.exports = WhatsAppSession;
