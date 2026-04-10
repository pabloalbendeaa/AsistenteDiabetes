import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 3000;

// Necesario para usar rutas con ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Arrancar servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor funcionando en http://localhost:${port}`);
});