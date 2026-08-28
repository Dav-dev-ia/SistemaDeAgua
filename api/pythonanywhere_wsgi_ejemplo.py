import sys

# Agrega la ruta donde estara la carpeta api en PythonAnywhere
# Ejemplo: '/home/TU_USUARIO/api'
path = '/home/tu_usuario/api'
if path not in sys.path:
    sys.path.append(path)

# Importamos app desde run.py para que PythonAnywhere la reconozca como 'application'
from run import app as application
