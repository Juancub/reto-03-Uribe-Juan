# SOLUCION.md — Planteamiento de la Solución Técnica
## Reto Técnico 03: Agente Conversacional "Órdenes de Compra SAP"
**Equipo Perxia 2.0 · Periferia IT Group**

---

### 1. El problema en una frase y a quién le duele
> *"La digitación manual y desarticulada de solicitudes de compra en SAP GUI consume tiempo valioso, carece de validación sistemática de topes y gobernanza, y oculta un alto volumen de órdenes de compra retroactivas que vulneran el control presupuestal de la compañía."*

- **A quién le duele:**
  - **A la Analista Administrativa:** Sobrecarga operativa de digitación repetitiva y riesgo permanente de imputar centros de costo o proveedores erróneos que solo se detectan en el cierre contable.
  - **A Contabilidad y Auditoría:** Incertidumbre sobre si quien aprobó el gasto tenía la facultad y el tope monetario suficiente, junto a la falta de trazabilidad en las compras que llegan facturadas antes de ser aprobadas.
  - **A la Dirección Financiera:** Carencia de métricas sobre desvíos de proceso y compras no planificadas.

---

### 2. Arquitectura del Sistema
El sistema implementa una arquitectura desacoplada basada en la estricta separación de responsabilidades exigida:

```
┌────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + Design Tokens Periferia)     │
│  - Historial de Chat con Markdown & Tablas             │
│  - Visor interactivo de Tool Calls (inspección JSON)   │
│  - Modal / Banner de Confirmación Humana Explícita     │
│  - Inspector de Órdenes SAP y Trazabilidad             │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────▼─────────────────────────────┐
│  BACKEND (Node.js 20+ Express con TypeScript / tsx)    │
│  - API REST: /api/chat, /api/sessions/:id, /api/health │
│  - Ciclo del Agente con tope de 25 iteraciones         │
│  - Gestor de Sesiones en Memoria                       │
│  - Adaptador LLM desacoplado (Google Gemini / OpenAI)  │
└──────┬──────────────────────┬──────────────────────────┘
       │                      │
       ▼                      ▼
┌──────────────────┐   ┌─────────────────────────────────┐
│ SEPARACIÓN CORE  │   │ CAPA DE EJECUCIÓN: HERRAMIENTAS │
│                  │   │ (src/tools/oc.ts con Zod)       │
│ Comportamiento:  │   │ - oc_leer_paquete               │
│  agent/prompt.md │   │ - oc_validar (RC1 a RC10)       │
│                  │   │ - oc_construir_payload          │
│ Conocimiento:    │   │ - oc_generar_evidencia          │
│  src/knowledge/  │   │ - oc_crear                      │
└──────────────────┘   └───────────────┬─────────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
             fixtures/reto-03/                 out/
             (Solo Lectura)                    (Salidas de Auditoría)
             - Maestros JSON                   - sap/ordenes.jsonl
             - Solicitudes 001-006             - control.csv
                                               - <caso>/aprobacion.txt / .pdf
                                               - <caso>/trazabilidad.json
                                               - log.jsonl
```

#### Dónde vive cada componente:
1. **Comportamiento (Prompt)**: En `agent/prompt.md`. Define el tono, prohibición de inventar datos y regla de confirmación.
2. **Conocimiento del Negocio**: En `src/knowledge/ordenes-compra.md`. Explica qué es un centro de costo, cómo operan las condiciones de pago y qué implica una orden retroactiva.
3. **Ejecución (Herramientas)**: En `src/tools/oc.ts`. Funciones puras con esquemas `zod` que nunca lanzan excepciones no controladas y devuelven `{ ok, data }` o `{ ok, error }`.

---

### 3. Ciclo del Agente, Control de Iteraciones y Confirmación Humana
1. **Bucle de Razonamiento (Agent Loop)**:
   - El usuario envía un mensaje a `/api/chat`.
   - El backend inyecta el `agent/prompt.md` y `src/knowledge/ordenes-compra.md` como instrucción de sistema.
   - El backend envía los mensajes y las definiciones de herramientas al proveedor LLM (`LlmAdapter`).
   - Si el LLM emite `functionCalls`, el servidor ejecuta la herramienta correspondiente en `src/tools/oc.ts`, formatea la respuesta e itera nuevamente alimentando el resultado al modelo.
2. **Tope de Iteraciones (Regla CA1)**:
   - Se configuró un límite estricto de **25 iteraciones** por turno (`MAX_ITERATIONS`). Si el ciclo alcanza este tope sin respuesta final de texto, el servidor corta el bucle y devuelve al cliente el estado actual y lo que falta, evitando consumo infinito de cuota.
3. **Punto de Control Humano (Regla CA3, O3 y O4)**:
   - Cuando una orden presenta anomalías (diferencia en cotización > 2%, derivación de IVA o compra retroactiva), la herramienta `oc_validar` y `oc_crear` marcan `needsConfirmation = true`.
   - El agente suspende cualquier intento de creación, formula una pregunta explícita a la analista y el frontend resalta visualmente el estado con un **Banner de Confirmación**.
   - La orden solo se crea si el usuario responde en el siguiente turno con confirmación expresa ("confirmo", "sí", "proceder"), invocando `oc_crear` con `{ confirmado: true }`.

---

### 4. Elección del Modelo de Lenguaje
- **Proveedor Principal**: **Google Gemini (Gemini 1.5 Flash)**.
- **Por qué**:
  - Excelente velocidad de inferencia (latencia sub-segundo) y amplia ventana de contexto.
  - Soporte nativo y tipado de **Function Calling** estructurado.
  - Nivel gratuito muy generoso a través de Google AI Studio, ideal para evaluaciones y pruebas sin costos de infraestructura.
- **Costo estimado por caso procesado**:
  - En promedio, procesar un caso completo consume ~2,000 tokens de entrada (prompt + schemas + paquete) y ~300 tokens de salida.
  - Con tarifas de Gemini 1.5 Flash ($0.075 por millón de tokens de entrada / $0.30 por millón de tokens de salida):
  - **Costo aproximado por caso: $0.00024 USD** (menos de 1 peso colombiano por orden de compra procesada).

---

### 5. Matriz de Controles (RC1–RC10)
| Regla | Implementación en `src/tools/oc.ts` | Tipo | Manejo en el Agente |
|---|---|---|---|
| **RC1** | Búsqueda por NIT normalizado (sin caracteres especiales) o por nombre en `proveedores.json`. Valida `activo === true`. | **Bloqueo** | Si no existe o está inactivo, rechazo rotundo. Sugiere solicitar alta a Compras. *(Caso sol-002)* |
| **RC2** | Comprueba que el correo del emisor en `aprobacion.json` pertenezca a la lista de aprobadores de ese `centro_costo` y contenga "Aprobado". | **Bloqueo** | Si el aprobador no está facultado, rechaza y lista quiénes son los autorizados. *(Caso sol-003)* |
| **RC3** | Compara `solicitud.valor_total <= aprobador.tope` para ese centro específico. | **Bloqueo** | Si excede el tope, bloquea y sugiere escalar a un aprobador con mayor facultad. |
| **RC4** | Verifica que `solicitud.subarea` esté en el array `subareas` de `centros-costo.json`. | **Bloqueo** | Bloquea por imputación errónea si la subárea no coincide con el centro de costo. |
| **RC5** | `abs(cotizacion.total - solicitud.valor_total) / solicitud.valor_total <= 0.02`. | Confirmación | Si supera el 2% o no hay cotización, detiene el flujo y pide confirmación humana. *(Caso sol-004)* |
| **RC6** | Si `solicitud.indicador_iva` falta, toma `proveedor.indicador_iva_default`. | Confirmación + Derivado | Deriva 'C1' (19%) y solicita confirmación antes de crear. *(Caso sol-006)* |
| **RC7** | Si `solicitud.condiciones_pago` falta, toma `proveedor.condiciones_pago_default`. | Derivado | Deriva 'Z030' o la correspondiente y la informa en el payload sin bloquear. |
| **RC8** | Si existe `factura.txt` y `factura.fecha < solicitud.fecha_solicitud`. | Confirmación | Marca `retroactiva = true`, pide confirmación y graba el flag en `out/control.csv`. *(Caso sol-005)* |
| **RC9** | Compara `fecha_aprobacion >= fecha_solicitud`. | Confirmación | Solicita confirmación si la fecha de aprobación es previa al registro de solicitud. |
| **RC10** | `abs(cantidad * valor_unitario - valor_total) <= 1`. | **Bloqueo** | Bloquea de inmediato si hay discrepancia en el producto aritmético. |

- **Regla más difícil**: **RC5 y RC8**. Extraer y normalizar formatos no estructurados de texto libre en `cotizacion.txt` y `factura.txt` (distintos formatos de moneda, puntos de miles y fechas), garantizando que las comparaciones matemáticas y temporales sean inmunes a diferencias de formato.

---

### 6. Diseño del Adaptador SAP Real (Sección 7.5)

#### 1. Opción de Integración Elegida: OData (`API_PURCHASEORDER_PROCESS_SRV`) o RFC/BAPI (`BAPI_PO_CREATE1`)
- **Recomendación**: **OData v2/v4 (`API_PURCHASEORDER_PROCESS_SRV`) vía SAP Integration Suite (BTP)**.
- **Justificación**: Es el estándar moderno de SAP S/4HANA (Cloud y On-Premise). Permite autenticación OAuth 2.0 estándar, opera sobre HTTP REST/JSON y no requiere compilar conectores nativos binarios como SAP NW RFC SDK (que suelen ser problemáticos de desplegar en contenedores ligeros de Node.js).
- **Plan si SAP es ECC 6.0 On-Premise**: Si el cliente cuenta con un SAP heredado, se usa `BAPI_PO_CREATE1` expuesta como servicio REST a través de SAP Cloud Connector o SAP Integration Suite.

#### 2. Mapeo del Payload
- `referencia.solicitud_id` $\rightarrow$ Cabecera: `PurchaseOrder` o campo de texto libre `CorrespncInternalReference` / `TrackingNumber`.
- `sociedad` $\rightarrow$ `CompanyCode: "1000"`.
- `organizacion_compras` $\rightarrow$ `PurchasingOrganization: "1000"`.
- `proveedor.codigo_sap` $\rightarrow$ `Supplier: "100234"`.
- `condiciones_pago` $\rightarrow$ `PaymentTerms: "Z030"`.
- Posiciones:
  - `posiciones[i].numero` $\rightarrow$ `PurchaseOrderItem: "00010"`.
  - `posiciones[i].descripcion` $\rightarrow$ `PurchaseOrderItemText: (max 40 chars)`.
  - `posiciones[i].precio_unitario` $\rightarrow$ `NetPriceAmount`.
  - `posiciones[i].centro_costo` $\rightarrow$ Imputación (`AccountAssignment`): `CostCenter: "CC-1010"`.
  - `posiciones[i].indicador_iva` $\rightarrow$ `TaxCode: "C1"`.

#### 3. Autenticación y Seguridad
- Credenciales administradas exclusivamente en el backend mediante variables de entorno o un gestor de secretos (AWS Secrets Manager, Azure Key Vault o HashiCorp Vault).
- Flujo OAuth 2.0 `Client Credentials`: El agente solicita un token JWT efímero (`Bearer`) a SAP BTP Identity Service.
- **Nunca** se expone ninguna credencial de SAP ni del modelo al cliente web ni a los logs de auditoría.

#### 4. Idempotencia y Errores Parciales
- Antes de enviar el POST de creación a SAP, se consulta el endpoint OData filtrando por el campo de referencia (`$filter=CorrespncInternalReference eq 'SOL-2026-XXX'`).
- Si SAP ya contiene una orden para esa solicitud, se recupera el `PurchaseOrder` existente sin duplicar.
- **Errores parciales de SAP**: Si SAP responde con mensajes de error en la cabecera o posiciones (tabla `RETURN` de BAPI con tipo `E`), la transacción ejecuta un `BAPI_TRANSACTION_ROLLBACK`, registra el error en `out/control.csv` con estado `RECHAZADO_SAP` y devuelve el mensaje amigable a la analista.

#### 5. Plan B (Si la conexión directa a SAP no es viable)
Si la conectividad de red o la autorización de SAP tarda meses:
1. El agente genera un archivo de carga masiva pre-validado en formato Excel/CSV (`out/sap/carga_masiva_oc.xlsx`) compatible con la transacción `LSMW`, `BAPI` por lotes o la app Fiori *"Cargar órdenes de compra"*.
2. El agente genera una tarjeta resumen con el formato exacto de digitación rápida para copiar y pegar en SAP GUI en 15 segundos sin errores.

---

### 7. Lectura del Proceso: Qué decirle a la Dirección sobre las OC Retroactivas
> **Para:** Dirección Financiera y de Operaciones — Periferia IT Group  
> **Asunto:** Hallazgos sobre Órdenes de Compra Retroactivas y Propuesta de Ajuste

Estimada Dirección,

Durante la automatización y auditoría del proceso de compras hemos identificado que un porcentaje significativo de órdenes de compra se están gestionando como **retroactivas** (ejemplificado en el caso `sol-005`, donde la factura `FC-88231` fue emitida el 10 de agosto y la solicitud formal apenas se radicó el 27 de agosto).

**Riesgos para el negocio:**
1. **Pérdida de Gobernanza y Negociación:** Al solicitar la OC después de recibir la factura, el área solicitante compromete a la compañía sin cotizaciones previas ni validación de presupuesto disponible.
2. **Distorsión Contable:** Genera acumulaciones pasivas no registradas oportunamente y dificulta el devengo exacto de gastos en el período contable correspondiente.

**Propuesta de Cambio de Proceso:**
1. **Regla de Bloqueo Progresivo:** Establecer una política donde toda factura con fecha anterior a la solicitud mayor a 5 días hábiles sea rechazada automáticamente por el agente y requiera una autorización extraordinaria de la Gerencia Financiera.
2. **Monitoreo Automático:** Utilizar el log generado por nuestro agente (`out/control.csv`) para publicar un tablero mensual de OC retroactivas por área y centro de costo, incentivando la solicitud previa a la adquisición del servicio.

---

### 8. Decisiones Técnicas y Trade-offs
1. **Backend en Node.js 20+ con TypeScript (`tsx`) vs Python (FastAPI)**:
   - *Alternativa descartada:* Python con FastAPI.
   - *Por qué:* El PRD exigía en la Sección 0 TypeScript en backend y herramientas. Además, la sección 6.6 exigía un `demo.ts` ejecutable que llamara directamente a las herramientas. Al usar TypeScript, compartimos el 100% del código de `src/tools/oc.ts` y esquemas Zod sin mantener implementaciones duplicadas.
2. **Simulación de SAP sobre JSONL y CSV vs Base de Datos SQLite**:
   - *Alternativa descartada:* SQLite / PostgreSQL.
   - *Por qué:* El PRD (Sección 3.2 y 6.1) prohíbe explícitamente bases de datos adicionales (*"sin base de datos, memoria o archivos en out/ bastan"*). Los archivos `out/sap/ordenes.jsonl` y `out/control.csv` permiten auditar las ejecuciones directamente con herramientas de consola y garantizan persistencia liviana.
3. **Mapeo de Herramientas Desacoplado de la API HTTP**:
   - *Alternativa descartada:* Poner la lógica del negocio dentro de los controladores Express.
   - *Por qué:* El contrato exigía que las herramientas fueran exportables e importables de manera independiente para correr en `demo.ts` sin necesidad de levantar el servidor web.

---

### 9. Supuestos Tomados al Interpretar el PRD
1. Los catálogos maestros en `fixtures/reto-03/maestros/` representan el estado íntegro y verídico de SAP para esta evaluación.
2. La presencia de la palabra "Aprobado" en el cuerpo del correo de aprobación es el criterio unívoco de validación de conformidad del líder.
3. El documento de cotización puede tener ligeras variaciones de redacción pero siempre conserva el monto total y el proveedor en texto plano.

---

### 10. Coberura de Historias de Usuario (HU-1 a HU-6)
| Historia | Descripción | Estado | Implementación |
|---|---|---|---|
| **HU-1** | Leer el paquete (correo, solicitud, cotización, aprobación, factura) | **HECHO** | Implementado en `oc_leer_paquete`. Devuelve paquete normalizado sin lanzar excepciones si falta algún adjunto. |
| **HU-2** | Validar contra maestros y controles (RC1 a RC10) | **HECHO** | Implementado en `oc_validar`. Clasifica bloqueos, confirmaciones y derivados informativos. |
| **HU-3** | Construir el payload SAP y trazabilidad | **HECHO** | Implementado en `oc_construir_payload`. Valida con `OrdenCompraSchema` y genera `out/<caso>/trazabilidad.json`. |
| **HU-4** | Generar evidencia de aprobación | **HECHO** | Implementado en `oc_generar_evidencia`. Genera `aprobacion.txt` (P0) con hash SHA-256 y `aprobacion.pdf` (P1) mediante `pdf-lib`. |
| **HU-5** | Crear OC en SAP simulado e Idempotencia | **HECHO** | Implementado en `MockSapAdapter.crearOrden`. Asigna números secuenciales desde 4500000001, garantiza idempotencia y registra en `out/control.csv`. |
| **HU-6** | Manejo de errores y resiliencia | **HECHO** | Todas las herramientas responden con `{ ok: false, error }` legible sin tumbar el servidor ni la sesión. |

---

### 11. Declaración de Uso de Asistentes de IA
- **Asistentes utilizados**: Google Antigravity / Gemini 3.8 Flash.
- **Para qué tareas se utilizaron**:
  - Estructuración rápida de tipos TypeScript y esquemas Zod a partir de la especificación Markdown.
  - Generación de los componentes de interfaz en React con los Design Tokens de Periferia IT Group.
  - Redacción técnica del diseño de integración SAP BAPI/OData y de la matriz de controles.
- **Qué se descartó de lo propuesto por la IA y por qué**:
  - Se descartó una propuesta inicial de usar bases de datos SQLite en memoria, ya que violaba la restricción del PRD que exige que el estado resida en archivos de texto en `out/`.
  - Se descartó una dependencia de orquestación pesada (LangChain) en favor de un ciclo de agente nativo y transparente con TypeScript puro, reduciendo dependencias innecesarias y garantizando control total del tope de iteraciones.

---

### 12. Riesgos de Llevar la Solución a Producción y Mitigaciones
1. **Riesgo de alucinación del modelo en valores de compra:**
   - *Mitigación implementada:* El agente tiene estrictamente prohibido emitir valores de compra que no provengan de la herramienta `oc_construir_payload`. El payload enviado a SAP se genera determinísticamente en código tipado, no en el prompt del LLM.
2. **Latencia o caída del proveedor de IA en momentos críticos:**
   - *Mitigación implementada:* Patrón adaptador (`LlmAdapter`). Si Gemini presenta fallas de red, se puede alternar inmediatamente a OpenAI u otro proveedor vía `.env` sin modificar la lógica del agente.
3. **Cambios en los formatos de cotización de proveedores externos:**
   - *Mitigación para producción:* Reemplazar el parser de texto básico por un modelo de Document AI / OCR especializado (como Google Cloud Document AI) antes de alimentar el agente.
