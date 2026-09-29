# Déksa Compiler

Este repositorio permite compilar **en tu propia computadora** una ROM `.gba`
lista para jugar. Elegís una seed en una página local y presionás **Compilar**.
No depende de la computadora del autor ni requiere aplicar parches a la ROM.

## Inicio sencillo (Windows, macOS o Linux)

1. Instalá y abrí [Docker Desktop](https://docs.docker.com/desktop/) en Windows
   o macOS. En Linux, instalá Docker Engine con el complemento Compose.
2. Descargá este repositorio como ZIP desde GitHub y descomprimilo.
3. En Windows, abrí `iniciar-windows.bat`; en macOS, `iniciar-mac.command`;
   en Linux, ejecutá `bash iniciar-linux.sh`.
4. Se abrirá `http://127.0.0.1:52655`. Usuario: `deksa`; clave local: `local`.
   Elegí una seed o usá la generada al azar. Descargá el `.gba` terminado.

La **primera vez** hay que descargar y preparar el compilador de FireRed: puede
tardar varios minutos y necesita Internet. Después, la compilación ocurre
localmente. La ROM también queda en la carpeta `output/` de esta computadora.
Para detenerlo: `docker compose down` desde la carpeta del repositorio. Docker
no expone el servicio fuera de `127.0.0.1`, por lo que la clave `local` es solo
para este uso local; no cambies esa configuración para publicar la app.

El contenedor usa Linux x86-64 para mantener un único toolchain reproducible.
En Macs con Apple Silicon, Docker lo ejecutará mediante emulación y la primera
compilación puede ser más lenta. **La ruta Docker está probada en Linux x86-64;**
Windows y macOS aún requieren una prueba real de usuario antes de considerarse
certificados.

## Instalación manual para desarrolladores

En Linux o macOS, si ya tenés Node.js 20+, Python 3, make, GCC/G++, Git,
binutils `arm-none-eabi` y las dependencias de
[pret/pokefirered](https://github.com/pret/pokefirered/blob/master/INSTALL.md):

```sh
bash ./setup.sh
bash ./start.sh
```

`setup.sh` obtiene revisiones fijadas de `pret/pokefirered` y `pret/agbcc`,
aplica los cambios Déksa e instala el compilador GBA. No sobrescribe carpetas
preexistentes.

## Código y procedencia

El código nuevo de `compiler/` usa [MIT](compiler/LICENSE). FireRed base,
`agbcc`, los cambios al juego y los datos de Déksa tienen procedencias y
condiciones separadas; MIT no los cubre automáticamente. El paquete fija los
commits base en `bundle-manifest.json` y contiene `fire-red-changes.patch` y
`overlay/` para reproducir el juego modificado.

El repositorio **no incluye ROMs ni partidas guardadas**. No publiques ROMs
generadas en GitHub.
