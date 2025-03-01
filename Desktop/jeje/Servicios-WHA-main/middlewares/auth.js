// Importa el módulo jsonwebtoken para manejar tokens JWT
const jwt = require('jsonwebtoken');

// Middleware para verificar el token en las solicitudes
function verifyToken(req, res, next) {
    // Obtiene el token de los encabezados de la solicitud
    const token = req.headers['authorization'];
    
    // Verifica si el token está presente
    if (!token) {
        return res.status(403).json({ error: "Token no proporcionado" });
    }

    // Verifica la validez del token usando la clave secreta
    jwt.verify(token, 'tu_clave_secreta', (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: "Token inválido" });
        }
        
        // Si el token es válido, almacena el sessionId en la solicitud para su uso posterior
        req.sessionId = decoded.sessionId;
        
        // Continúa con la siguiente función en la cadena de middleware
        next();
    });
}

// Exporta la función verifyToken para que pueda ser utilizada en otros archivos
module.exports = verifyToken;
