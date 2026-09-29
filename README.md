# Déksa Compiler

Elegí una seed en el navegador, presioná **Compilar** y descargá una ROM `.gba`
lista para jugar. No hay que aplicar parches. La misma seed y la misma versión
del código producen el mismo juego.

## Uso desde otro dispositivo

La compilación ocurre en una computadora anfitriona con Linux o macOS y las
herramientas de FireRed instaladas. Quien juega puede usar Windows, macOS,
Linux, iOS o Android: solo necesita abrir la dirección del anfitrión en un
navegador y descargar el `.gba` terminado. Para compartirla con otra persona,
usá una red privada como Tailscale y definí una clave:

```sh
DEKSA_HOST=IP_DE_TAILSCALE DEKSA_ACCESS_KEY='una-clave-larga' bash ./start.sh
```

Abrí `http://IP_DE_TAILSCALE:52655` desde el otro dispositivo. Usuario:
`deksa`; contraseña: el valor de `DEKSA_ACCESS_KEY`. No abras este servicio
directamente a Internet público.

## Instalar el anfitrión

Se necesitan Git, Node.js 20+, Python 3, make, GCC/G++, binutils
`arm-none-eabi` y las dependencias de [pret/pokefirered](https://github.com/pret/pokefirered/blob/master/INSTALL.md).
Después de instalarlas:

```sh
bash ./setup.sh
bash ./start.sh
```

La app local abre en `http://127.0.0.1:52655`. El primer comando obtiene
revisiones fijadas de `pret/pokefirered` y `pret/agbcc`, aplica los cambios
Déksa e instala el compilador GBA. No sobrescribe carpetas preexistentes.
En Windows, el camino simple para jugar es acceder desde el navegador al
anfitrión; una instalación nativa de las herramientas no está probada aquí.

La ROM compilada se guarda también en `compiler/output/` del anfitrión.
El paquete fuente no incluye ROMs ni archivos de guardado. No publiques ROMs
generadas en GitHub.

## Licencias y procedencia

El código nuevo de `compiler/` usa [MIT](compiler/LICENSE). FireRed base,
`agbcc`, los cambios al juego y los datos de Déksa tienen procedencias y
condiciones separadas; esta licencia MIT no los cubre automáticamente.
El paquete fija ambos commits base en `bundle-manifest.json` y contiene
`fire-red-changes.patch` y `overlay/` para reproducir el juego modificado.
