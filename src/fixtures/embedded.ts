// Archivo autogenerado para garantizar disponibilidad de fixtures en Vercel Serverless
export const EMBEDDED_SYSTEM_PROMPT = "# Prompt del Sistema — Agente Conversacional \"Órdenes de Compra SAP\"\n\nEres el **Agente Especializado en Órdenes de Compra SAP** de **Periferia IT Group**.\nTu propósito es asistir a la analista administrativa en la verificación, validación y creación de Órdenes de Compra (OC) en el sistema SAP a partir de los paquetes documentales recibidos.\n\n---\n\n## Principios Fundamentales e Inviolables\n\n1. **Veracidad Basada en Herramientas (Regla CA2)**:\n   - **NUNCA** inventes, supongas ni afirmes montos, NITs, nombres de proveedores, centros de costo, topes ni estados de aprobación que no hayan sido retornados explícitamente por una herramienta (`oc_leer_paquete`, `oc_validar`, `oc_construir_payload`, `oc_crear`).\n   - Las herramientas son tu única fuente de verdad fáctica.\n\n2. **Control Estricto de Bloqueos (Regla O2)**:\n   - Si `oc_validar` indica que una solicitud **NO es apta** (`apta: false`) y contiene `bloqueos`:\n     - **JAMÁS intentes crear la orden de compra.**\n     - Comunica claramente a la analista el motivo exacto del rechazo citando la regla (ej. RC1 Proveedor inexistente/inactivo, RC2/RC3 Aprobador no autorizado o tope excedido, RC4 Subárea incorrecta, RC10 Inconsistencia aritmética).\n     - Proporciona una recomendación de acción concreta (por ejemplo: *\"Devolver la solicitud al solicitante para que se tramite el alta del proveedor en compras\"* o *\"Solicitar la aprobación del líder facultado del centro de costo con tope suficiente\"*).\n\n3. **Confirmación Humana Obligatoria (Reglas CA3, O3 y O4)**:\n   - Si `oc_validar` contiene elementos en `confirmaciones` (ej. diferencia cotización > 2%, derivación de indicador de IVA, o factura anterior a solicitud):\n     - Presenta a la analista los datos en una tabla comparativa clara.\n     - Si es una orden **retroactiva** (factura previa a solicitud), resalta enfáticamente que quedará registrada y auditada en el log de control como desvío de proceso.\n     - **NO crees la orden de compra en este turno.**\n     - Termina tu respuesta haciendo una pregunta explícita a la analista: *\"¿Deseas confirmar esta excepción y proceder con la creación de la OC en SAP?\"*.\n     - Solo cuando la analista en el siguiente mensaje responda afirmativamente (\"sí\", \"confirmo\", \"proceder\", \"crear\"), llama a `oc_crear` enviando `confirmado: true`.\n\n4. **Formato y Claridad Ejecutiva**:\n   - Responde de manera profesional, estructurada y concisa.\n   - Utiliza tablas en Markdown para resumir el encabezado y las posiciones de la orden de compra (Código SAP, Descripción, Cantidad, Precio Unitario, Subtotal, Moneda, Centro de Costo, Aprobador).\n   - Cuando una orden sea creada con éxito, resalta en grande el número de orden de compra asignado por SAP (ej. `4500000001`), la fecha de registro y la ruta del archivo de evidencia.\n";
export const EMBEDDED_KNOWLEDGE = "# Base de Conocimiento: Proceso de Órdenes de Compra en Periferia IT Group\n\n## 1. Contexto Operativo\nEn Periferia IT Group, cada solicitud de compra recibida en administración debe pasar por un ciclo de control antes de convertirse en una Orden de Compra (OC) oficial en SAP ERP.\n\n### Paquete Documental Obligatorio\n1. **Solicitud de Compra (`solicitud.json`)**: Detalla el bien o servicio, cantidad, valor unitario, centro de costos y subárea imputada.\n2. **Cotización del Proveedor (`cotizacion.txt`)**: Documento comercial emitido por el proveedor con desglose de precios, validez y condiciones.\n3. **Correo de Aprobación (`aprobacion.json`)**: Correo electrónico del líder responsable del centro de costo confirmando expresamente la autorización (\"Aprobado\").\n4. **Factura de Venta (`factura.txt`)**: Opcional. Su presencia previa a la solicitud denota un proceso retroactivo.\n\n---\n\n## 2. Catálogos Maestros de SAP\n- **Proveedores (`proveedores.json`)**: Contiene código de acreedor SAP, NIT, razón social, condiciones de pago predeterminadas (ej. Z030 = 30 días, Z000 = pago inmediato) e indicador de IVA default. Solo proveedores con estado `activo: true` pueden recibir órdenes.\n- **Centros de Costo (`centros-costo.json`)**: Estructura de imputación organizativa (ej. `CC-1010` Tecnología, `CC-2020` Administración, `CC-3030` Comercial). Cada centro define sus subáreas válidas y una matriz de líderes aprobadores con topes monetarios máximos.\n- **Indicadores de IVA (`indicadores-iva.json`)**: `C1` (IVA 19%), `C2` (IVA 5%), `C0` (Excluido/no gravado).\n- **Condiciones de Pago (`condiciones-pago.json`)**: Días de crédito pactados (`Z000`, `Z015`, `Z030`, `Z060`).\n\n---\n\n## 3. Matriz de Reglas de Control (RC1–RC10)\n| Regla | Descripción | Tipo | Consecuencia |\n|---|---|---|---|\n| **RC1** | Proveedor registrado y activo en SAP | Bloqueo | No se crea OC. Devolver para creación o activación de proveedor. |\n| **RC2** | Aprobación explícita de aprobador del centro de costo | Bloqueo | No se crea OC. Correo debe pertenecer al centro de costo. |\n| **RC3** | Valor total ≤ Tope monetario del aprobador | Bloqueo | No se crea OC. Solicitar aprobación de nivel superior. |\n| **RC4** | Subárea válida dentro del centro de costo | Bloqueo | No se crea OC. Corregir imputación contable. |\n| **RC5** | Diferencia cotización vs solicitud ≤ 2% | Confirmación | Analista debe autorizar la discrepancia de precio. |\n| **RC6** | Indicador de IVA ausente | Confirmación | Se deriva default del proveedor y se solicita confirmación. |\n| **RC7** | Condiciones de pago ausente | Derivado | Se asume default del proveedor y se informa en el payload. |\n| **RC8** | Factura emitida antes de fecha de solicitud | Confirmación | Marcada como **OC RETROACTIVA** en auditoría. |\n| **RC9** | Fecha de aprobación posterior o igual a solicitud | Confirmación | Verificar por qué se aprobó antes de formalizar solicitud. |\n| **RC10** | Consistencia aritmética (Cant × Unitario = Total) | Bloqueo | Error en digitación o cálculo de la solicitud. |\n\n---\n\n## 4. Problemática de las Órdenes de Compra Retroactivas\nUna orden de compra es retroactiva cuando el servicio ya fue prestado o el producto entregado e incluso facturado por el proveedor **antes** de que el área solicitante gestionara la solicitud formal y la autorización interna.\n- **Riesgos**: Salto de cotizaciones competitivas, compromiso de recursos sin validación de presupuesto, y dificultades en el cierre contable.\n- **Rol del Agente**: Identificar fehacientemente este desvío mediante la comparación de fechas (`factura.fecha < solicitud.fecha_solicitud`), solicitar confirmación a la analista y registrar indeleblemente la marca `retroactiva: true` en el log de auditoría `out/control.csv`.\n";

export const EMBEDDED_MAESTROS: Record<string, any> = {
  "centros-costo": [
    {
      "centro_costo": "CC-1010",
      "nombre": "Tecnología",
      "subareas": [
        "Infraestructura",
        "Soporte",
        "Desarrollo"
      ],
      "aprobadores": [
        {
          "email": "mlopez@periferia-ficticia.com",
          "nombre": "Mariana López Cárdenas",
          "tope": 50000000
        },
        {
          "email": "dgarcia@periferia-ficticia.com",
          "nombre": "Diego García Rincón",
          "tope": 200000000
        }
      ]
    },
    {
      "centro_costo": "CC-2020",
      "nombre": "Administración",
      "subareas": [
        "Compras",
        "Servicios Generales"
      ],
      "aprobadores": [
        {
          "email": "rtorres@periferia-ficticia.com",
          "nombre": "Rocío Torres Ibáñez",
          "tope": 30000000
        }
      ]
    },
    {
      "centro_costo": "CC-3030",
      "nombre": "Comercial",
      "subareas": [
        "Preventa",
        "Marketing"
      ],
      "aprobadores": [
        {
          "email": "fvargas@periferia-ficticia.com",
          "nombre": "Felipe Vargas Ocampo",
          "tope": 80000000
        }
      ]
    }
  ],
  "condiciones-pago": [
    {
      "codigo": "Z000",
      "descripcion": "Pago inmediato",
      "dias": 0
    },
    {
      "codigo": "Z015",
      "descripcion": "15 días fecha factura",
      "dias": 15
    },
    {
      "codigo": "Z030",
      "descripcion": "30 días fecha factura",
      "dias": 30
    },
    {
      "codigo": "Z060",
      "descripcion": "60 días fecha factura",
      "dias": 60
    }
  ],
  "indicadores-iva": [
    {
      "codigo": "C0",
      "descripcion": "Excluido / no gravado",
      "tasa": 0
    },
    {
      "codigo": "C1",
      "descripcion": "IVA 19%",
      "tasa": 0.19
    },
    {
      "codigo": "C2",
      "descripcion": "IVA 5%",
      "tasa": 0.05
    }
  ],
  "proveedores": [
    {
      "codigo_sap": "100234",
      "nit": "900555111",
      "nombre": "TecnoSuministros S.A.S.",
      "condiciones_pago_default": "Z030",
      "indicador_iva_default": "C1",
      "activo": true
    },
    {
      "codigo_sap": "100310",
      "nit": "901222333",
      "nombre": "Cloud Andina S.A.S.",
      "condiciones_pago_default": "Z000",
      "indicador_iva_default": "C1",
      "activo": true
    },
    {
      "codigo_sap": "100118",
      "nit": "800444555",
      "nombre": "Papelería Central Ltda.",
      "condiciones_pago_default": "Z015",
      "indicador_iva_default": "C1",
      "activo": true
    },
    {
      "codigo_sap": "100150",
      "nit": "830111222",
      "nombre": "Mobiliario Andino S.A.",
      "condiciones_pago_default": "Z030",
      "indicador_iva_default": "C1",
      "activo": true
    },
    {
      "codigo_sap": "100402",
      "nit": "901777888",
      "nombre": "Consultores Ágiles S.A.S.",
      "condiciones_pago_default": "Z030",
      "indicador_iva_default": "C1",
      "activo": false
    }
  ]
};

export const EMBEDDED_SOLICITUDES: Record<string, Record<string, any>> = {
  "sol-001": {
    "aprobacion.json": {
      "de": "mlopez@periferia-ficticia.com",
      "para": "juan.camargo@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-21T10:02:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-001",
      "cuerpo": "Aprobado, proceder con la orden de compra.\n\nMariana López\nGerente de Tecnología"
    },
    "correo.json": {
      "id": "sol-001-correo",
      "de": "juan.camargo@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-001 - Renovación licencias antivirus corporati",
      "fecha": "2026-08-20T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nJuan Camargo",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN COT-TS-2026-0451\nFecha: 2026-08-18\nProveedor: TecnoSuministros S.A.S.\nNIT: 900.555.111-2\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Licencia antivirus corporativo 12 meses | Cantidad: 120 | Precio unitario (IVA incl.): COP 95.000 | Subtotal: COP 11.400.000\n\nBase gravable: COP 9.579.832\nIVA 19%: COP 1.820.168\nTOTAL (IVA incluido): COP 11.400.000\n\nValidez de la oferta: 30 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-001",
      "solicitante": "Juan Camargo",
      "proveedor_nombre": "TecnoSuministros S.A.S.",
      "proveedor_nit": "900555111",
      "descripcion": "Renovación licencias antivirus corporativo 120 puestos, vigencia 12 meses",
      "centro_costo": "CC-1010",
      "subarea": "Infraestructura",
      "cantidad": 120,
      "valor_unitario": 95000,
      "valor_total": 11400000,
      "moneda": "COP",
      "indicador_iva": "C1",
      "condiciones_pago": "Z030",
      "fecha_solicitud": "2026-08-20"
    }
  },
  "sol-002": {
    "aprobacion.json": {
      "de": "mlopez@periferia-ficticia.com",
      "para": "sofía.herrera@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-22T15:30:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-002",
      "cuerpo": "Aprobado.\n\nMariana López"
    },
    "correo.json": {
      "id": "sol-002-correo",
      "de": "sofía.herrera@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-002 - Licencia anual herramienta de pruebas au",
      "fecha": "2026-08-22T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nSofía Herrera",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN SDN-0093\nFecha: 2026-08-21\nProveedor: Soluciones Digitales del Norte S.A.S.\nNIT: 901.999.000-5\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Licencia anual pruebas automatizadas, por usuario | Cantidad: 5 | Precio unitario (IVA incl.): COP 1.700.000 | Subtotal: COP 8.500.000\n\nBase gravable: COP 7.142.857\nIVA 19%: COP 1.357.143\nTOTAL (IVA incluido): COP 8.500.000\n\nValidez de la oferta: 15 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-002",
      "solicitante": "Sofía Herrera",
      "proveedor_nombre": "Soluciones Digitales del Norte S.A.S.",
      "proveedor_nit": "901999000",
      "descripcion": "Licencia anual herramienta de pruebas automatizadas, 5 usuarios",
      "centro_costo": "CC-1010",
      "subarea": "Desarrollo",
      "cantidad": 5,
      "valor_unitario": 1700000,
      "valor_total": 8500000,
      "moneda": "COP",
      "indicador_iva": "C1",
      "condiciones_pago": "Z030",
      "fecha_solicitud": "2026-08-22"
    }
  },
  "sol-003": {
    "aprobacion.json": {
      "de": "fvargas@periferia-ficticia.com",
      "para": "pedro.ayala@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-25T09:10:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-003",
      "cuerpo": "Aprobado desde comercial, es para el equipo de preventa que se muda a la nueva sede.\n\nFelipe Vargas"
    },
    "correo.json": {
      "id": "sol-003-correo",
      "de": "pedro.ayala@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-003 - Mobiliario para nueva sede: 40 puestos d",
      "fecha": "2026-08-24T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nPedro Ayala",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN MA-2026-1177\nFecha: 2026-08-20\nProveedor: Mobiliario Andino S.A.\nNIT: 830.111.222-8\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Puesto de trabajo 1.40 m con silla ergonómica | Cantidad: 40 | Precio unitario (IVA incl.): COP 1.850.000 | Subtotal: COP 74.000.000\n\nBase gravable: COP 62.184.874\nIVA 19%: COP 11.815.126\nTOTAL (IVA incluido): COP 74.000.000\n\nValidez de la oferta: 45 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-003",
      "solicitante": "Pedro Ayala",
      "proveedor_nombre": "Mobiliario Andino S.A.",
      "proveedor_nit": "830111222",
      "descripcion": "Mobiliario para nueva sede: 40 puestos de trabajo con silla ergonómica",
      "centro_costo": "CC-2020",
      "subarea": "Servicios Generales",
      "cantidad": 40,
      "valor_unitario": 1850000,
      "valor_total": 74000000,
      "moneda": "COP",
      "indicador_iva": "C1",
      "condiciones_pago": "Z030",
      "fecha_solicitud": "2026-08-24"
    }
  },
  "sol-004": {
    "aprobacion.json": {
      "de": "dgarcia@periferia-ficticia.com",
      "para": "natalia.ríos@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-26T18:45:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-004",
      "cuerpo": "Aprobado por 25 millones según la solicitud.\n\nDiego García\nDirector de Tecnología"
    },
    "correo.json": {
      "id": "sol-004-correo",
      "de": "natalia.ríos@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-004 - Bolsa de 100 horas de arquitectura de nu",
      "fecha": "2026-08-26T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nNatalia Ríos",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN CA-2026-0310\nFecha: 2026-08-25\nProveedor: Cloud Andina S.A.S.\nNIT: 901.222.333-1\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Hora de arquitecto de nube senior | Cantidad: 100 | Precio unitario (IVA incl.): COP 265.000 | Subtotal: COP 26.500.000\n\nBase gravable: COP 22.268.908\nIVA 19%: COP 4.231.092\nTOTAL (IVA incluido): COP 26.500.000\n\nValidez de la oferta: 20 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-004",
      "solicitante": "Natalia Ríos",
      "proveedor_nombre": "Cloud Andina S.A.S.",
      "proveedor_nit": "901222333",
      "descripcion": "Bolsa de 100 horas de arquitectura de nube para migración",
      "centro_costo": "CC-1010",
      "subarea": "Desarrollo",
      "cantidad": 100,
      "valor_unitario": 250000,
      "valor_total": 25000000,
      "moneda": "COP",
      "indicador_iva": "C1",
      "condiciones_pago": "Z000",
      "fecha_solicitud": "2026-08-26"
    }
  },
  "sol-005": {
    "aprobacion.json": {
      "de": "rtorres@periferia-ficticia.com",
      "para": "camila.ortiz@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-28T08:20:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-005",
      "cuerpo": "Aprobado. Ya llegó la factura, por favor crear la OC para poder radicarla.\n\nRocío Torres"
    },
    "correo.json": {
      "id": "sol-005-correo",
      "de": "camila.ortiz@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-005 - Papelería y tóner para el trimestre",
      "fecha": "2026-08-27T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nCamila Ortiz",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml",
        "factura.pdf"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN PC-5520\nFecha: 2026-08-05\nProveedor: Papelería Central Ltda.\nNIT: 800.444.555-3\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Paquete trimestral papelería y tóner | Cantidad: 1 | Precio unitario (IVA incl.): COP 3.200.000 | Subtotal: COP 3.200.000\n\nBase gravable: COP 2.689.076\nIVA 19%: COP 510.924\nTOTAL (IVA incluido): COP 3.200.000\n\nValidez de la oferta: 30 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "factura.txt": "FACTURA ELECTRÓNICA DE VENTA No. FC-88231\nFecha de emisión: 2026-08-10\nVendedor: Papelería Central Ltda. - NIT 800.444.555-3\nAdquiriente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nDescripción: Paquete trimestral papelería y tóner\nBase gravable: COP 2.689.076\nIVA 19%: COP 510.924\nTOTAL: COP 3.200.000\n\nForma de pago: crédito 15 días.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-005",
      "solicitante": "Camila Ortiz",
      "proveedor_nombre": "Papelería Central Ltda.",
      "proveedor_nit": "800444555",
      "descripcion": "Papelería y tóner para el trimestre",
      "centro_costo": "CC-2020",
      "subarea": "Compras",
      "cantidad": 1,
      "valor_unitario": 3200000,
      "valor_total": 3200000,
      "moneda": "COP",
      "indicador_iva": "C1",
      "condiciones_pago": "Z015",
      "fecha_solicitud": "2026-08-27"
    }
  },
  "sol-006": {
    "aprobacion.json": {
      "de": "mlopez@periferia-ficticia.com",
      "para": "andrés.beltrán@periferia-ficticia.com",
      "cc": [
        "compras@periferia-ficticia.com"
      ],
      "fecha": "2026-08-29T12:00:00-05:00",
      "asunto": "RE: Solicitud de orden de compra SOL-006",
      "cuerpo": "Aprobado.\n\nMariana López"
    },
    "correo.json": {
      "id": "sol-006-correo",
      "de": "andrés.beltrán@periferia-ficticia.com",
      "para": "compras@periferia-ficticia.com",
      "asunto": "Solicitud de orden de compra SOL-006 - Diademas con micrófono para la mesa de s",
      "fecha": "2026-08-29T09:00:00-05:00",
      "cuerpo": "Hola Camila,\n\nAdjunto la solicitud de compra, la cotización del proveedor y el correo de aprobación de mi líder. Quedo atento a la orden de compra.\n\nGracias,\nAndrés Beltrán",
      "adjuntos": [
        "solicitud.xlsx",
        "cotizacion.pdf",
        "aprobacion.eml"
      ],
      "nota_fixture": "Los adjuntos binarios se entregan normalizados: solicitud.xlsx → solicitud.json, cotizacion.pdf → cotizacion.txt, aprobacion.eml → aprobacion.json, factura.pdf → factura.txt"
    },
    "cotizacion.txt": "COTIZACIÓN COT-TS-2026-0468\nFecha: 2026-08-28\nProveedor: TecnoSuministros S.A.S.\nNIT: 900.555.111-2\nCliente: Periferia IT Group S.A.S. - NIT 900.123.456-7\n\nÍTEMS\n1. Diadema USB con micrófono y cancelación de ruido | Cantidad: 30 | Precio unitario (IVA incl.): COP 180.000 | Subtotal: COP 5.400.000\n\nBase gravable: COP 4.537.815\nIVA 19%: COP 862.185\nTOTAL (IVA incluido): COP 5.400.000\n\nValidez de la oferta: 30 días\nCondiciones de pago: según acuerdo comercial vigente.\n",
    "solicitud.json": {
      "solicitud_id": "SOL-2026-006",
      "solicitante": "Andrés Beltrán",
      "proveedor_nombre": "TecnoSuministros S.A.S.",
      "descripcion": "Diademas con micrófono para la mesa de soporte",
      "centro_costo": "CC-1010",
      "subarea": "Soporte",
      "cantidad": 30,
      "valor_unitario": 180000,
      "valor_total": 5400000,
      "moneda": "COP",
      "fecha_solicitud": "2026-08-29"
    }
  }
};

export function getEmbeddedFile(caso: string, filename: string): any | null {
  const c = EMBEDDED_SOLICITUDES[caso.toLowerCase()];
  if (!c) return null;
  return c[filename] !== undefined ? c[filename] : null;
}

export function hasEmbeddedCaso(caso: string): boolean {
  return EMBEDDED_SOLICITUDES[caso.toLowerCase()] !== undefined;
}

export function getEmbeddedMaestro(tipo: string): any | null {
  return EMBEDDED_MAESTROS[tipo] !== undefined ? EMBEDDED_MAESTROS[tipo] : null;
}
