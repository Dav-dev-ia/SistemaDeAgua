# Proyecto Agua - Sistema de Gestión de Condominio

Este proyecto es una aplicación Full-Stack para la gestión de pagos, consumos y usuarios de un condominio. Está dividido en dos partes principales:
1. **Frontend**: Interfaz de usuario construida con **React (Vite)**.
2. **Backend**: API construida con **Python (Flask)** y base de datos **SQLite**.

---

## 🛠️ 1. Arquitectura y Cómo Funciona

El sistema funciona con una arquitectura **Cliente-Servidor**:
- **El Frontend (React)** es la interfaz visual. Muestra las pantallas de inicio de sesión, el panel de control y los gráficos. Se comunica con el backend haciendo peticiones HTTP (usando `axios`).
- **El Backend (Flask)** es el motor lógico. Recibe las peticiones del Frontend, verifica la seguridad (usando tokens JWT), consulta o guarda información en la base de datos (SQLite) y devuelve la respuesta en formato JSON.
- **Base de Datos (SQLite)**: Toda la información de usuarios, roles, recibos y consumos se guarda en el archivo local `api/agua_condominio.db`.

---

## 🚀 2. Cómo Inicializar el Proyecto Localmente

Para ejecutar el proyecto en tu computadora de forma local, debes levantar ambos servidores (Backend y Frontend) al mismo tiempo en dos terminales diferentes.

### Paso A: Iniciar el Backend (Terminal 1)
1. Abre una terminal y navega a la carpeta de la API:
   ```bash
   cd api
   ```
2. Instala las dependencias de Python (si no lo has hecho previamente):
   ```bash
   pip install -r requirements.txt
   ```
3. Ejecuta el servidor de desarrollo Flask:
   ```bash
   python run.py
   ```
   *El backend estará corriendo en `http://localhost:5000`*.

### Paso B: Iniciar el Frontend (Terminal 2)
1. Abre una nueva terminal en la carpeta raíz del proyecto (`proyecto_agua_2`).
2. Instala las dependencias de Node (solo la primera vez):
   ```bash
   npm install
   ```
3. Ejecuta el servidor de desarrollo de Vite:
   ```bash
   npm run dev
   ```
   *El frontend estará corriendo en `http://localhost:5173`*.

---

## 🌍 3. Guía de Despliegue (Demo Gratis y Sencilla)

Para subir este proyecto a internet de forma gratuita y que **tus registros de la base de datos no se borren** (manteniendo SQLite), utilizaremos **PythonAnywhere** (para el Backend) y **Vercel** (para el Frontend).

### Fase 1: Configurar PythonAnywhere (Backend y BD)
1. Crea una cuenta gratuita en [PythonAnywhere](https://www.pythonanywhere.com/).
2. Ve a la pestaña **Files** y sube el contenido de tu carpeta `api` a los servidores (puedes subir un `.zip` con la carpeta `api` y extraerlo allí mismo usando una consola bash).
3. Ve a la pestaña **Consoles**, abre una **Bash console** e instala los requerimientos:
   ```bash
   pip3 install -r requirements.txt
   ```
4. Ve a la pestaña **Web** -> haz clic en **Add a new web app** -> Selecciona **Flask** -> Elige tu versión de Python (ej. Python 3.10) -> Acepta la ruta por defecto que te sugiere.
5. En la página de configuración de la Web App, baja hasta la sección **Code** y haz clic en el archivo que está en **WSGI configuration file**. Reemplaza el código existente con este (asegúrate de cambiar `tu_usuario` por tu nombre de usuario real en PythonAnywhere):

```python
import sys

# Agrega la ruta donde subiste tus archivos del backend
# Si los archivos están sueltos en el directorio raíz, usa '/home/tu_usuario'
# Si los metiste dentro de una carpeta api, usa '/home/tu_usuario/api'
path = '/home/tu_usuario/api'
if path not in sys.path:
    sys.path.append(path)

# Importa tu aplicación desde tu archivo run.py
from run import app as application
```
6. Dale al botón verde de **Reload** en la pestaña Web. ¡Tu API ya está en vivo! Copia la URL (será algo como `https://tu_usuario.pythonanywhere.com`).

### Fase 2: Configurar Vercel (Frontend)
1. En la carpeta raíz de tu proyecto (donde está el `package.json`), crea (o edita) un archivo llamado `.env` y añade la URL de tu nuevo backend de la Fase 1:
   ```env
   VITE_API_URL=https://tu_usuario.pythonanywhere.com
   ```
2. Sube todo tu código del proyecto a un repositorio de **GitHub**.
3. Entra a [Vercel.com](https://vercel.com/), regístrate o inicia sesión, crea un nuevo proyecto e importa tu repositorio de GitHub recién creado.
4. Antes de hacer el despliegue final, en la sección de **Environment Variables** (Variables de entorno) de Vercel, añade manualmente:
   * **Key**: `VITE_API_URL`
   * **Value**: `https://tu_usuario.pythonanywhere.com`
5. Presiona **Deploy**. Vercel construirá tu aplicación y te dará una URL en vivo (ej. `https://proyecto-agua-demo.vercel.app`).

### Fase 3: Conectar la Seguridad (CORS)
Ahora que ya tienes la URL de tu frontend en Vercel, debes decirle a tu backend que confíe en ella.
1. Regresa a PythonAnywhere y abre tu archivo `.env` del backend (dentro de tu carpeta de archivos).
2. Modifica o añade la variable `CORS_ORIGINS` con la URL exacta de tu frontend:
   ```env
   CORS_ORIGINS=https://proyecto-agua-demo.vercel.app
   ```
3. Vuelve a la pestaña **Web** de PythonAnywhere y presiona **Reload**.

¡Felicidades! Todo tu sistema está desplegado, funcional, de forma gratuita y sin perder datos.
# SistemaDeAgua
