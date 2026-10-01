# Compilador Déksa

La app prepara una ROM `.gba` lista para jugar a partir de una seed y del
FireRed original del usuario (inglés, versión 1.0). El archivo original se
valida y procesa en un worker del navegador; nunca se sube al servidor.
El servidor compila la seed, genera un parche BPS y comprueba que reconstruya
exactamente la ROM. Sólo publica el parche; el navegador aplica los cambios,
verifica el resultado y ofrece la descarga `.gba`. ROM Patcher JS se incluye
localmente, con su licencia MIT y revisión fijada; no se cargan scripts remotos.
La seed determina la fauna y un paquete guardado por lote. Los paquetes
equilibrados mezclan equipos A/B/C completos de distintos entrenadores;
los lotes ligados por continuidad conservan una misma letra A/B/C.
Las mezclas y sus probabilidades se preparan una sola vez: el compilador sólo
las sortea, sin generar equipos ni optimizarlos durante la compilación. Cada
entrenador conserva aproximadamente un tercio de probabilidad para A/B/C
(25–41,7 %); ninguna variante queda favorecida con probabilidades de 75–83 %.
La biblioteca guarda hasta 24 paquetes distintos por lote cuando son legales,
sin duplicarlos para inflar el número. Los originales siguen disponibles.

El motor ya prepara conjuntamente los doce tramos revisados y la fauna Beta 5.
El writer de `pokefirered/tools/deksa_rebuild/write_beta5_full.py` aplica
una seed a los 452 encuentros y las 315 tablas. `app/server.mjs` ofrece la
interfaz de un botón y descarga la ROM terminada. Cada compilación trabaja en
una copia temporal del código y verifica el resultado antes de ofrecerlo.

**Distribución local:** `compiler/share/` empaqueta el repositorio público con
Dockerfile, Compose y lanzadores para Windows, macOS y Linux. Cada usuario
compila en su propia computadora; no depende del servidor de este proyecto.
La ruta Docker fue probada de punta a punta en Linux x86-64: la descarga HTTP
entregó 16 MiB con el hash conocido. Windows/macOS aún no están probados en
máquinas reales.

Para usarla en esta máquina:

```sh
node compiler/app/server.mjs
```

Abrir `http://127.0.0.1:52655`. La wiki y el compilador son públicos: no tienen
login, contraseñas ni sesiones. `pokemondeksa.com` usa Cloudflare Tunnel hacia
este servicio local; conservar el enlace al servidor en loopback y publicar
mediante un proxy HTTPS. `DEKSA_HOST` permite cambiar la dirección de escucha.
Con `DEKSA_WIKI_ORIGIN` configurado, `/` es la portada de la guía y `/build` el
compilador. `/wiki/` y los enlaces de etapas/cambios siguen funcionando; sin
origen de wiki, el servicio local conserva el compilador también en `/`.
El navegador recibe únicamente el BPS y crea el `.gba` en el dispositivo:
no necesita instalar compiladores ni manejar el parche manualmente. La API
no sirve ROMs completas ni acepta archivos originales; `/api/build` sólo
recibe la seed. La base interna queda en `compiler/private/`, sin ruta pública.
Si no existe, se reconstruye desde upstream limpio y se valida por SHA-1;
`DEKSA_BASE_ROM` permite indicar una copia local con el mismo hash.
Se ejecuta una compilación a la vez, con hasta 20 pedidos en espera. Las seeds
de la misma versión reutilizan pedidos/resultados existentes; los nuevos pedidos
tienen un límite de tres por visitante cada diez minutos. La cola se conserva
en `compiler/private/build-jobs/jobs.json`, con hasta 200 resultados durante
siete días. Un reinicio retoma los pedidos pendientes. Una compilación tiene
un máximo de diez minutos: se abortan también los subprocesos del compilador.
Los límites no afectan la lectura de la wiki. La dirección
del visitante enviada por Cloudflare sólo se acepta desde el conector local.
Los archivos internos, históricos y ROMs no tienen rutas públicas. Los errores
detallados se guardan en el registro local y no se envían al navegador.

`app/release.json` fija la versión pública del juego. Cambiarla al modificar la
ROM, el plantel o las reglas de selección; una seed se reproduce junto con su
versión, no a través de distintas versiones. La caché no cruza versiones.
El navegador conserva sólo ID, seed y versión, nunca la ROM, para recuperar
pedidos después de recargar. `/play` contiene instrucciones, soporte y créditos.
La versión local no fuerza HTTPS; el dominio público y `www` se redirigen al
dominio canónico HTTPS desde el conector local de Cloudflare.

`compiler/share/create-source.mjs` prepara un paquete fuente mínimo sin ROMs,
con instalación limpia de los dos repositorios base fijados. El código nuevo de
`compiler/` está bajo [MIT](LICENSE); esa licencia no se extiende por defecto
al código base ni a los recursos de FireRed. La instalación limpia y una
recompilación con hash idéntico se probaron en Linux. El uso mediante Docker
también quedó probado en Linux; faltan pruebas reales en Windows y macOS.

Prueba local, sin instalar dependencias del compilador:

```sh
node --test compiler/*.test.mjs
node compiler/seed-plan-cli.mjs --seed random
node compiler/seed-plan-cli.mjs --seed mi-seed-01
node compiler/preview-cli.mjs --seed mi-seed-01
```

`build-gate.mjs` comprueba por separado que W01–W12 tengan exportaciones
revisadas. Una ventana parcial o faltante impide anunciar una ROM completa.
`data/trainer-packages.json` contiene los paquetes equilibrados guardados.
`trainer-packages.mjs` hace el sorteo determinista y `selected-trainers.mjs`
selecciona la variante individual de cada entrenador sin modificar los exports.
Si los datos de combate cambian, se exige actualizar los paquetes para evitar
usar mezclas evaluadas con equipos anteriores. `rom-build-data.mjs` vincula
la selección a los registros físicos FireRed.
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
