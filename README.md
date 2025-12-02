Huevos Magy Web App
================

Aplicación mínima para gestionar recolección y venta de huevos por talla (S,M,L,XL). Incluye:
- Registro/Inicio de sesión (usuarios con rol 'vendedor' o 'admin')
- Registro diario de recolección (suma automáticamente al inventario)
- Registro de ventas (mayor/menor) que descuentan del inventario
- Inventario total y por talla
- Endpoints API en /api/* y frontend en /

Cómo usar (local):
1. Instalar Node.js (>=16) y npm
2. Descomprimir el proyecto y en la carpeta del proyecto ejecutar:
   npm install
3. Iniciar el servidor:
   npm start
4. Abrir http://localhost:3000 en el navegador.

Notas:
- Cambia la variable SECRET en server.js por una cadena segura para producción.
- La base de datos SQLite se guarda en ./data/eggs.db
- Para pruebas puedes registrar un usuario administrador y usar /api/admin/reset si eres admin.

Render deployment
-----------------
The repository includes a `render.yaml` to help auto-create a web service on Render. Replace `repo` in `render.yaml` with your GitHub repo URL before connecting Render.

If you want me to deploy it for you, provide a Render API key and a public GitHub repo URL, or follow the steps below.
