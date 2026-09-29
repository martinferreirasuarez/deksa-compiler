# Compilador Déksa

La app local genera una ROM `.gba` lista para jugar a partir de una seed.
El selector es el mismo que usa el taller: una seed determina la fauna y un
paquete A/B/C por lote, respetando la continuidad de personajes recurrentes.

El motor ya prepara conjuntamente los doce tramos revisados y la fauna Beta 5.
El writer de `pokefirered/tools/deksa_rebuild/write_beta5_full.py` aplica
una seed a los 452 encuentros y las 315 tablas. `app/server.mjs` ofrece la
interfaz de un botón y descarga la ROM terminada. Cada compilación trabaja en
una copia temporal del código y verifica el resultado antes de ofrecerlo.

Para usarla en esta máquina:

```sh
node compiler/app/server.mjs
```

Abrir `http://127.0.0.1:52655`. Para compartirla dentro de Tailscale, definir
`DEKSA_HOST` con la IP privada y `DEKSA_ACCESS_KEY` con una contraseña larga.
El navegador remoto solo recibe el `.gba`: no necesita compiladores ni parches.
No abrir este servicio directamente a Internet público.

`compiler/share/create-source.mjs` prepara un paquete fuente mínimo sin ROMs,
con instalación limpia de los dos repositorios base fijados. El código nuevo de
`compiler/` está bajo [MIT](LICENSE); esa licencia no se extiende por defecto
al código base ni a los recursos de FireRed. La instalación limpia y una
recompilación con hash idéntico se probaron en Linux. macOS como anfitrión y
Windows como anfitrión aún no están verificados; ambos pueden ser clientes web.

Prueba local, sin instalar dependencias del compilador:

```sh
node --test compiler/*.test.mjs
node compiler/seed-plan-cli.mjs --seed random
node compiler/seed-plan-cli.mjs --seed mi-seed-01
node compiler/preview-cli.mjs --seed mi-seed-01
```

`build-gate.mjs` comprueba por separado que W01–W12 tengan exportaciones
revisadas. Una ventana parcial o faltante impide anunciar una ROM completa.
`selected-trainers.mjs` proyecta el paquete A/B/C elegido sin modificar los
exports. `rom-build-data.mjs` lo vincula a los registros físicos FireRed.
`fauna-beta5.mjs` reutiliza el generador ecológico existente con la clasificación
por campaña y los caps de las doce ventanas Beta 5. Produce las 315 tablas y
2.065 slots determinísticamente; el writer local los escribe en la ROM.
`compilation-inputs.mjs` une ambas salidas bajo una sola seed. En modo final
exige W01–W12 revisadas; mientras falten ventanas sólo admite `preview: true`
y marca el resultado `preview-only`.
El preview muestra cuántas ventanas de entrenadores están revisadas y las
huellas de fauna/equipos; no escribe archivos ni ROM.
`generate-fauna-view.mjs` publica en la wiki la elegibilidad por ventana de
las 157 familias salvajes, sin elegir una seed ni prometer un spawn concreto.

La fauna conserva el 10 % familiar de no-spawn y las reglas ecológicas. De las
157 familias salvajes, 144 tienen mínimo de campaña certificado, 11 usan una
proyección editorial posliga basada en fuentes nativas y dos conservan la
excepción editorial anterior sin testigo salvaje ordinario (Hitmonlee y
Togetic). Estos 13 casos están identificados en la salida, no presentados como
datos certificados. W11 admite dos debuts por tabla para no perder a Ledyba;
tres tablas tempranas de Caña Vieja admiten una sola familia legal después
del no-spawn. La disponibilidad de Surf comienza en 05G, después de Koga.

La verificación `verify_beta5_full_rom.py` coteja equipos y fauna con los bytes
compilados. Los ROMs generados se guardan solo en `compiler/output/` y no se
incluyen en el paquete fuente ni deben publicarse en el repositorio.
