# Umbral — Plan de pruebas

Versión 3.0 · automatizado en `tests/` (núcleo: `node --test tests/*.test.mjs` · recorridos: `node tests/app.e2e.mjs`)

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
| U02 | VDOT de 10 km en 40:00 | 51,9 ± 0,3 (tabla de Daniels; la 1.0 documentaba 49,8 por error) | Sí |
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

### Núcleo 2.0 — guía, ejercicios y estaciones

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U50 | `Sentadilla · 3 × 5 @ RIR 3–4 · 75–80 kg · pausa 2:30` | Ejercicio, series, reps, RIR, carga y pausa separados | Sí |
| U50b | Superserie `A … + B …` | Dos ejercicios con la pausa entre rondas | Sí |
| U50c | `(4 × 12,5 m)` entre paréntesis | No se toma como prescripción | Sí |
| U51 | Detección de ejercicios | Sin solapamientos; el nombre más específico gana (rumano > peso muerto, búlgara > zancada) | Sí |
| U52 | Estación de Hyrox | Bloque con estación y zona `caminar` se muestra como Estación, sin ritmo de caminata | Sí |
| U44b | Técnica con minutos explícitos | `Drills 5 min + 4 × 20 s` suma 5 + 3,3 min | Sí |
| U53 | Plan de ejemplo y plantilla híbrida | Siguen validando sin errores | Sí |

### Integración 2.0 — recorridos nuevos

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| N01 | Hoy | Paso a paso con ejercicios enlazados, "Mañana", sin ritmo de carrera en sesiones de fuerza | Sí |
| N02 | Semana | Mapa de carga de 7 días, totales, progreso y navegación entre semanas | Sí |
| N03 | Guía | Búsqueda; cada ejercicio con qué es, cómo se hace, error común y qué trabaja; términos | Sí |
| N04 | Registro de fuerza | Kilos, reps y RIR por ejercicio; "Última vez" en la próxima sesión | Sí |
| N05 | CSV de fuerza | `fecha,ejercicio,series,reps,carga_kg,rir,notas` | Sí |
| N06 | Detalle con estaciones | "Estación" en lugar de "caminando" | Sí |
| N07 | 390 px | Ninguna vista desborda en horizontal | Sí |
| N08 | Más | Ritmos, Importar y Ajustes conservan todo y tienen "‹ Más" para volver | Sí |

### Núcleo 3.0 — bloques de fuerza y precarga

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| U54 | `Título · A 2 × 12 + B 2 × 10 + C 2 × 20 s por lado` | Secuencia con título y 3 ejercicios; peso corporal por defecto donde corresponde | Sí |
| U54b | `Circuito × 2 vueltas: A 12 por lado · B 40 s por lado` | Circuito de 2 vueltas; cada ejercicio con sus reps o tiempo | Sí |
| U54c | Superserie con carga solo en uno | Carga en el primero, el segundo sin carga ("elige por RIR") | Sí |
| U55 | Carga sugerida | Sin historial: lo más bajo del rango · sobró RIR (+2): +2,5 kg (+1 kg bajo 40 kg) · justo: igual · pasado: −5 % | Sí |
| U55b | Reps, RIR y RPE sugeridos; 1RM estimado | `5-5-5`, RIR mínimo del rango, RPE por tipo; Epley con RIR, nulo con más de 12 reps | Sí |

### Integración 3.0

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| N09 | Calendario | Pestaña con Mes · Semana · Día · Plan; mes con carga y tipo por día; tocar un día abre el Día; navegación entre meses y días | Sí |
| N10 | Panel | Indicadores, km plan vs hecho por semana con detalle al tocar y tabla, 1RM estimado por ejercicio | Sí |
| N11 | Registro precargado | Km, tiempo, RPE, sensación y cargas sugeridas, marcadas como sugeridas hasta editarlas; se guardan al confirmar | Sí |
| N12 | Resumen primero | La sesión muestra lo esencial con el peso de cada ejercicio; el paso a paso y el detalle de cada ejercicio se despliegan al tocar | Sí |

### Mejoras 3.0 (ciclos 1–10)

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| C1 | Un toque en "Hecha como el plan" o en el tilde | Registro completo sugerido (km, tiempo, RPE, cargas); aviso con "Editar"; desmarcar no borra datos | Sí |
| C2 | Carga sugerida de hoy | Con historial, el resumen y la fila del ejercicio muestran "Hoy X kg" | Sí |
| C3 | Volver a hoy | Botón en Mes, Semana y Día cuando se mira otro período | No |
| C4 | Panel: racha y suaves frente a la zona E | Racha de sesiones cumplidas; suaves más rápidos que E marcados | Sí |
| C5 | Guía | ≥ 50 ejercicios; reconoce calentamientos y rutinas habituales | No |
| C6 | Accesibilidad | Tilde de 28 px con etiqueta y teclado; pestañas con estado; ningún botón sin nombre | Sí |
| C7 | Modo oscuro | Fondos oscuros y texto claro en todas las vistas; colores de gráfico validados para fondo oscuro | Sí |
| C8 | Service worker | La página se pide primero a la red (versión nueva al abrir); sin conexión abre la copia | Sí |
| C9 | Rendimiento | Con 1000 registros de fuerza cada vista se pinta en menos de 50 ms | Sí |
| C10 | Robustez | Tiempo inválido no se guarda; una sesión corrupta muestra un aviso, no una pantalla en blanco | Sí |

### Entrega

| ID | Caso | Esperado | Blq |
|---|---|---|---|
| E01 | Los archivos de la app por HTTP | 200 con el MIME correcto | Sí |
| E02 | Manifiesto válido | JSON con íconos y `start_url` | Sí |
| E03 | Service worker | Sintaxis válida, precarga los cinco | Sí |
| E04 | Sin dependencias externas | Cero pedidos a dominios de terceros | Sí |
| E05 | Inputs de 16 px o más | Safari no hace zoom al enfocar | Sí |
