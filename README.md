# Reto Técnico 03 — Agente Conversacional "Órdenes de Compra SAP"
### Proceso de Selección · Equipo Perxia 2.0 · Periferia IT Group

Agente conversacional completo e independiente para la preparación, validación contra maestros y creación de Órdenes de Compra en SAP ERP, con interfaz web en **React**, backend en **Node.js 20+ con TypeScript (Express)** y motor de inteligencia artificial con **Google Gemini**.

---

## 🚀 Inicio Rápido (En 1 solo comando)

### Prerrequisitos
- **Node.js 20+** y **npm** (probado y validado en Node v20.17.0).

### 1. Clonar e Instalar
```bash
git clone <URL_DE_TU_REPOSITORIO>
cd Reto03
npm install
npm --prefix web install
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

Edita `.env` y coloca tu clave de API (opcional para pruebas con modo emulado; obligatorio para inferencia LLM en vivo con Gemini):
```env
PORT=3000
LLM_PROVIDER=gemini
GEMINI_API_KEY=tu_api_key_aqui
LLM_MODEL=gemini-1.5-flash
MAX_ITERATIONS=25
```

### 3. Levantar Todo el Sistema (Frontend + Backend)
Con un único comando levantas el servidor Express y la interfaz React con recarga en caliente:
```bash
npm run dev
```

- **Frontend React**: Abre tu navegador en [http://localhost:5173](http://localhost:5173)
- **Backend API**: Disponible en [http://localhost:3000](http://localhost:3000)
- **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 🧪 Ejecución de Verificación Determinista (`demo.ts`)

La prueba obligatoria del reto (Sección 6.6) ejecuta los 6 casos de prueba directamente sobre las herramientas tipadas **sin consumir tokens de LLM ni requerir credenciales**:

```bash
npm run demo
```
*(o directamente `npx tsx demo.ts`)*

### Qué demuestra `demo.ts`:
1. **`sol-001`**: Creación de la primera OC (`4500000001`). Re-ejecuta inmediatamente el caso para demostrar la **idempotencia** exigida.
2. **`sol-002`**: Bloqueo por proveedor no existente en catálogo SAP (`RC1`).
3. **`sol-003`**: Bloqueo por aprobador sin autorización para el centro de costos o tope excedido (`RC2/RC3`).
4. **`sol-004`**: Discrepancia del 6% entre cotización y solicitud. Demuestra la protección de confirmación humana obligatoria (`RC5`).
5. **`sol-005`**: Detección de orden **retroactiva** por factura anterior a la solicitud (`RC8`).
6. **`sol-006`**: Derivación automática de indicador de IVA (`RC6`) y condiciones de pago (`RC7`) desde el maestro del proveedor.
7. Verificación de archivos generados: `out/control.csv`, `out/sap/ordenes.jsonl` y evidencias de aprobación con hash SHA-256.

---

## 🏛️ Estructura del Repositorio

```
Reto03/
├── agent/
│   └── prompt.md                       # System prompt gobernante del agente
├── fixtures/reto-03/                   # Catálogos maestros y solicitudes 001-006 (solo lectura)
│   ├── maestros/                       # centros-costo, proveedores, condiciones-pago, indicadores-iva
│   └── solicitudes/                    # sol-001 a sol-006 (correo, solicitud, cotización, aprobación, factura)
├── modulo/                             # Bonus 9.4: Módulo reutilizable desacoplado
│   ├── agent.md                        # Agente empaquetado con frontmatter de permisos
│   ├── tools/oc.ts                     # Herramientas tipadas importables sin servidor
│   └── skill/ordenes-compra/SKILL.md   # Conocimiento de negocio empaquetado
├── out/                                # Generado en tiempo de ejecución (ignorado en git)
│   ├── sap/ordenes.jsonl               # Base de órdenes emitidas por el SAP simulado
│   ├── control.csv                     # Log general de auditoría y retroactividad
│   ├── log.jsonl                       # Trazabilidad de tool calls del agente
│   └── <caso>/                         # aprobacion.txt, aprobacion.pdf y trazabilidad.json
├── src/
│   ├── server.ts                       # Servidor Express y ciclo de iteraciones del agente
│   ├── knowledge/
│   │   └── ordenes-compra.md           # Base de conocimiento del proceso de compras
│   ├── llm/
│   │   ├── adapter.ts                  # Interfaz desacoplada LlmAdapter
│   │   └── gemini.ts                   # Adaptador oficial de Google Gemini
│   ├── sap/
│   │   ├── adapter.ts                  # Interfaz SapAdapter y esquema Zod de OrdenCompra
│   │   └── mock.ts                     # Mock sobre archivos locales con control e idempotencia
│   └── tools/
│       └── oc.ts                       # Herramientas P0 (leer, validar, payload, evidencia, crear)
├── web/                                # Aplicación Frontend React + Vite
│   ├── src/
│   │   ├── App.tsx                     # Chat interactivo, acordiones de tools y confirmación
│   │   ├── index.css                   # Tokens institucionales Periferia IT Group
│   │   └── main.tsx
│   └── package.json
├── demo.ts                             # Script determinista sin modelo
├── package.json                        # Scripts dev, demo, build raíz
├── tsconfig.json                       # Configuración TypeScript NodeNext
├── .env.example                        # Plantilla de variables de entorno
├── SOLUCION.md                         # Documentación de los 12 capítulos obligatorios
└── README.md                           # Instrucciones de ejecución
```

---

## 🎨 Identidad Visual y Experiencia de Usuario
La interfaz web fue construida utilizando la paleta institucional y tipografías oficiales de **Periferia IT Group** (`Outfit` y `Montserrat`, `#063635`, `#6DFD8C`, `#15601D`), ofreciendo:
- Visualizador en tiempo real de cada llamada a herramienta (`oc_leer_paquete`, `oc_validar`, `oc_crear`) con inspección de parámetros y resultados JSON.
- Banner de confirmación humana interactivo que resalta cuando existen discrepancias que demandan la intervención de la analista.
- Panel lateral con el estado en vivo de las órdenes emitidas en SAP simulado y el resumen de auditoría.

---

## 📄 Documentación Completa de la Solución
Para consultar los 12 puntos obligatorios requeridos por los evaluadores (arquitectura, ciclo del agente, análisis de OC retroactivas, diseño de integración SAP real BAPI vs OData, riesgos y supuestos), revisa el documento:
👉 **[SOLUCION.md](SOLUCION.md)**
