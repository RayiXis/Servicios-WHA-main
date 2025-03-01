// Importa la clase WhatsAppSession desde el archivo correspondiente
const WhatsAppSession = require('./whatsappSession');

// Clase para gestionar múltiples sesiones de WhatsApp
class SessionManager {
    constructor() {
        // Mapa para almacenar las sesiones activas
        this.sessions = new Map();
    }

    /**
     * Crea una nueva sesión de WhatsApp
     * @param {string} sessionId - Identificador único de la sesión
     * @returns {WhatsAppSession} - La sesión recién creada
     * @throws {Error} - Si la sesión ya existe
     */
    createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            throw new Error(`La sesión ${sessionId} ya existe.`);
        }
        // Crea una nueva sesión y la almacena en el mapa
        const session = new WhatsAppSession(sessionId);
        this.sessions.set(sessionId, session);
        return session;
    }

    /**
     * Obtiene una sesión existente
     * @param {string} sessionId - Identificador de la sesión
     * @returns {WhatsAppSession | undefined} - La sesión encontrada o undefined si no existe
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Elimina una sesión existente
     * @param {string} sessionId - Identificador de la sesión a eliminar
     */
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }
}

// Exporta una única instancia de SessionManager para ser utilizada globalmente
module.exports = new SessionManager();
