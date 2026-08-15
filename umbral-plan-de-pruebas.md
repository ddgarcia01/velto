# Umbral — Plan de pruebas

Versión 1.0 · ejecutado sobre el build servido en `http://localhost:8137`

## Alcance y estrategia

Tres niveles, de adentro hacia afuera:

1. **Unitario** sobre el núcleo (`core.js`): matemática de VDOT, aritmética de fechas, parseo y validación del estándar, métricas de carga. Se ejecuta en Node sin DOM.
2. **Integración** sobre el archivo construido: se carga `index.html` en un DOM real (jsdom), se simulan toques y se verifica el resultado en pantalla y en el estado persistido.
3. **Entrega**: los cinco archivos servidos por HTTP, con su tipo MIME, y la app cargada desde esa URL.

**Criterio de aprobación:** todo caso marcado como bloqueante debe pasar. Cero errores de JavaScript no capturados en cualquier recorrido.

## Riesgos que dirigen las pruebas

| Riesgo | Cómo lo ataco |
|---|---|
| El JSON de un LLM llega imperfecto | Batería de entradas deliberadamente sucias |
| Las fechas se corren por zona horaria o por el anclaje | Casos con anclaje por carrera, por inicio, fecha explícita, semana que arranca en domingo |
| Los ritmos se calculan mal y el entrenamiento sale mal | Contraste contra las tablas publicadas de Daniels |
| Un plan raro rompe la interfaz | Planes vacíos, sin segmentos, con tipos desconocidos, con una sola semana |
| Se pierden datos al editar o restaurar | Ida y vuelta completa: exportar, reimportar, comparar |

## Casos

### Núcleo — VDOT y ritmos

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U01 | VDOT de 21,1 km en 1:45:30 | 42,4 ± 0,3 | Sí |
| U02 | VDOT de 10 km en 40:00 | 49,8 ± 0,5 | Sí |
| U03 | Ritmos derivados de VDOT 42,4 | E 6:07, T 4:57, I 4:28 ± 4 s | Sí |
| U04 | Orden de las zonas | E más lento que M, M que T, T que I, I que R | Sí |
| U05 | Riegel de 21,1 km a 10 km | ≈ 47:48 | No |
| U06 | Recargo por clima según índice | 0 % con 15 °C, 8 % con 28 °C y 80 % | Sí |
| U07 | La zona E no se ajusta por clima | Idéntica con y sin ajuste | Sí |
| U08 | Ritmo de carrera desde la meta del plan | 10K en 47:30 → 4:45/km | Sí |

### Núcleo — tiempos y fechas

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U10 | Formatos de tiempo: `4:35`, `1:45:30`, `1h45`, `90min`, `45` | Segundos correctos | Sí |
| U11 | Tiempo inválido | Devuelve nulo, no rompe | Sí |
| U12 | Anclaje por carrera, 12 semanas | Semana 1 arranca 77 días antes de la semana de la carrera | Sí |
| U13 | Anclaje por inicio | Semana 1 arranca en el lunes de esa fecha | Sí |
| U14 | Semana que arranca en domingo | El índice de los días se corre | Sí |
| U15 | Sesión con fecha ISO explícita | Prevalece sobre el nombre del día | Sí |
| U16 | Dos sesiones el mismo día | Las dos sobreviven | No |
| U17 | Días en inglés y abreviados | `Tuesday`, `Sun`, `mié` se resuelven | Sí |

### Núcleo — estándar UTP/1

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U20 | JSON con cercas, prosa alrededor y comas finales | Se importa | Sí |
| U21 | Comillas tipográficas | Se enderezan | Sí |
| U22 | Comentarios `//` y `/* */` | Se descartan | Sí |
| U23 | `distancia_km`, `"400m"`, `"15min"` | Se convierten | Sí |
| U24 | Tipos en inglés y zona en minúscula | Se traducen | Sí |
| U25 | Falta distancia del objetivo | Error E03, importación bloqueada | Sí |
| U26 | Falta la fecha con anclaje por carrera | Error E06 | Sí |
| U27 | Tipo fuera del vocabulario | Advertencia A01, se importa como suave | Sí |
| U28 | Semana sin sesiones | Advertencia A06 | No |
| U29 | Salto de volumen mayor al 10 % | Advertencia A04 | No |
| U30 | Salto después de una descarga | Sin advertencia | Sí |
| U31 | Sin afinamiento al final | Advertencia A08 | No |
| U32 | Dos sesiones clave seguidas | Advertencia A05 | No |
| U33 | Texto sin JSON | Error E01, sin excepción | Sí |

### Núcleo — métricas

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U40 | Serie 6 × 800 con recuperación | Distancia y duración correctas | Sí |
| U41 | Fuerza y movilidad | Suman minutos, no kilómetros | Sí |
| U42 | Segmento sin distancia ni duración | Cero, sin romper | Sí |
| U43 | Perfil de esfuerzo de una serie | Un bloque por repetición, alternando | Sí |
| U44 | La técnica no define el ritmo de la sesión | Un rodaje con progresivos muestra zona E | Sí |
| U45 | Proporción suave contra fuerte | Entre 0 y 100 | No |

### Integración — recorridos

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| I01 | Arranque sin datos | Estado vacío con acceso a Importar | Sí |
| I02 | Cargar el plan de ejemplo | 12 semanas, sin errores | Sí |
| I03 | Las cinco pestañas se abren | Sin excepciones y con contenido | Sí |
| I04 | Copiar el prompt | Incluye zonas, vocabularios y cierre | Sí |
| I05 | Ver una sesión | Muestra estructura y las tres explicaciones | Sí |
| I06 | Editar título, tipo y fecha | Se refleja en el plan | Sí |
| I07 | Convertir un segmento continuo en serie | Aparecen repeticiones y recuperación | Sí |
| I08 | Agregar y quitar segmentos | Se guardan | Sí |
| I09 | Registrar una sesión | Marca hecha y calcula el ritmo medio | Sí |
| I10 | Marcar hecha desde la lista | Alterna sin abrir la sesión | Sí |
| I11 | Duplicar y eliminar sesión | Cambia la cantidad | Sí |
| I12 | Cargar la marca de referencia | Recalcula todos los ritmos | Sí |
| I13 | Activar ajuste por clima | Cambian M, T, I, R y no E | Sí |
| I14 | Exportar en UTP/1 y reimportar | Mismos volúmenes y sesiones | Sí |
| I15 | Exportar el plan a `.ics` | Un evento por sesión, líneas ≤ 75 octetos | Sí |
| I16 | Copia de seguridad y restauración | Vuelve todo, incluidos los registros | Sí |
| I17 | Dos planes, cambiar el activo | Cambia la cabecera y las vistas | Sí |
| I18 | Borrar un plan | Se van también sus registros | Sí |
| I19 | Plan que ya empezó | Avisa y deja importar igual | No |
| I20 | Plan de una sola semana | No rompe ninguna vista | Sí |

### Entrega

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| E01 | Los cinco archivos por HTTP | 200 con el MIME correcto | Sí |
| E02 | Manifiesto válido | JSON con íconos y `start_url` | Sí |
| E03 | Service worker | Sintaxis válida, precarga los cinco | Sí |
| E04 | Sin dependencias externas | Cero pedidos a dominios de terceros | Sí |
| E05 | Inputs de 16 px o más | Safari no hace zoom al enfocar | Sí |
