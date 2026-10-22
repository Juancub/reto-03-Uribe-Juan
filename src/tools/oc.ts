import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { OrdenCompra, OrdenCompraSchema, SapAdapter } from "../sap/adapter.js";
import { MockSapAdapter } from "../sap/mock.js";

export interface ToolContext {
  directory?: string;
  sessionId?: string;
  sapAdapter?: SapAdapter;
}

export type Paquete = {
  correo: { id: string; de: string; asunto: string; fecha: string; cuerpo: string };
  solicitud: {
    solicitud_id: string;
    solicitante: string;
    proveedor_nombre: string;
    proveedor_nit?: string;
    descripcion: string;
    centro_costo: string;
    subarea: string;
    cantidad: number;
    valor_unitario: number;
    valor_total: number;
    moneda: "COP" | "USD";
    indicador_iva?: string;
    condiciones_pago?: string;
    fecha_solicitud: string;
  };
  cotizacion: {
    referencia: string | null;
    proveedor: string;
    nit: string | null;
    total: number;
    moneda: string;
    validez_hasta: string | null;
    texto: string;
  } | null;
  aprobacion: {
    de: string;
    para?: string;
    fecha: string;
    aprobado: boolean;
    asunto: string;
    texto: string;
  } | null;
  factura: {
    numero: string;
    fecha: string;
    total: number;
    texto: string;
  } | null;
  adjuntos_faltantes: string[];
};

function getBaseDir(ctx?: ToolContext): string {
  return ctx?.directory || process.cwd();
}

export function getOutDir(baseDir: string): string {
  return process.env.VERCEL ? path.join("/tmp", "out") : path.join(baseDir, "out");
}

function parseMonto(str: string): number {
  const clean = str.replace(/COP|\$|\s/gi, "").replace(/\./g, "").replace(/,/g, ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseCotizacion(content: string) {
  const lines = content.split("\n").map((l) => l.trim());
  let referencia: string | null = null;
  let proveedor = "";
  let nit: string | null = null;
  let total = 0;
  let validez_hasta: string | null = null;

  for (const line of lines) {
    if (/^COTIZACI[OÓ]N/i.test(line)) {
      const match = line.match(/^COTIZACI[OÓ]N\s+([^\s]+)/i);
      if (match) referencia = match[1];
    } else if (/^Proveedor:\s*/i.test(line)) {
      proveedor = line.replace(/^Proveedor:\s*/i, "").trim();
    } else if (/^NIT:\s*/i.test(line)) {
      nit = line.replace(/^NIT:\s*/i, "").trim();
    } else if (/^TOTAL(\s*\(.*\))?:\s*/i.test(line)) {
      const montoPart = line.replace(/^TOTAL(\s*\(.*\))?:\s*/i, "").trim();
      total = parseMonto(montoPart);
    } else if (/^Validez\s+de\s+la\s+oferta:\s*/i.test(line)) {
      validez_hasta = line.replace(/^Validez\s+de\s+la\s+oferta:\s*/i, "").trim();
    }
  }

  return {
    referencia,
    proveedor,
    nit,
    total,
    moneda: "COP",
    validez_hasta,
    texto: content,
  };
}

function parseFactura(content: string) {
  const lines = content.split("\n").map((l) => l.trim());
  let numero = "";
  let fecha = "";
  let total = 0;

  for (const line of lines) {
    if (/FACTURA.*No\.\s*/i.test(line)) {
      const match = line.match(/No\.\s*([^\s]+)/i);
      if (match) numero = match[1];
    } else if (/Fecha\s+de\s+emisi[oó]n:\s*/i.test(line)) {
      fecha = line.replace(/Fecha\s+de\s+emisi[oó]n:\s*/i, "").trim();
    } else if (/^TOTAL:\s*/i.test(line)) {
      const montoPart = line.replace(/^TOTAL:\s*/i, "").trim();
      total = parseMonto(montoPart);
    }
  }

  return {
    numero,
    fecha,
    total,
    texto: content,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. oc_leer_paquete
// ─────────────────────────────────────────────────────────────────────────────
export const leer_paquete = {
  description: "Lee el paquete documental completo de una solicitud de compra normalizando solicitud, cotización, aprobación y factura.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso (ej. 'sol-001') ubicado en fixtures/reto-03/solicitudes/"),
  },
  async execute(args: { caso: string }, ctx?: ToolContext): Promise<string> {
    try {
      const baseDir = getBaseDir(ctx);
      const casoDir = path.join(baseDir, "fixtures", "reto-03", "solicitudes", args.caso);

      if (!fs.existsSync(casoDir)) {
        return JSON.stringify({ ok: false, error: `El caso '${args.caso}' no existe en la ruta de fixtures.` });
      }

      const adjuntos_faltantes: string[] = [];

      // Correo
      const correoPath = path.join(casoDir, "correo.json");
      let correo: any = null;
      if (fs.existsSync(correoPath)) {
        correo = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
      } else {
        adjuntos_faltantes.push("correo.json");
      }

      // Solicitud
      const solPath = path.join(casoDir, "solicitud.json");
      let solicitud: any = null;
      if (fs.existsSync(solPath)) {
        solicitud = JSON.parse(fs.readFileSync(solPath, "utf-8"));
      } else {
        adjuntos_faltantes.push("solicitud.json");
      }

      // Cotización
      const cotPath = path.join(casoDir, "cotizacion.txt");
      let cotizacion: any = null;
      if (fs.existsSync(cotPath)) {
        const cotRaw = fs.readFileSync(cotPath, "utf-8");
        cotizacion = parseCotizacion(cotRaw);
      } else {
        adjuntos_faltantes.push("cotizacion.txt");
      }

      // Aprobación
      const aprPath = path.join(casoDir, "aprobacion.json");
      let aprobacion: any = null;
      if (fs.existsSync(aprPath)) {
        const aprData = JSON.parse(fs.readFileSync(aprPath, "utf-8"));
        const cuerpo = aprData.cuerpo || "";
        const aprobado = /aprobado/i.test(cuerpo);
        aprobacion = {
          de: aprData.de,
          para: aprData.para,
          fecha: aprData.fecha,
          aprobado,
          asunto: aprData.asunto,
          texto: cuerpo,
        };
      } else {
        adjuntos_faltantes.push("aprobacion.json");
      }

      // Factura (opcional / caso retroactivo)
      const facPath = path.join(casoDir, "factura.txt");
      let factura: any = null;
      if (fs.existsSync(facPath)) {
        const facRaw = fs.readFileSync(facPath, "utf-8");
        factura = parseFactura(facRaw);
      }

      if (!solicitud || !correo) {
        return JSON.stringify({
          ok: false,
          error: `Paquete incompleto para el caso '${args.caso}'. Faltan archivos requeridos: ${adjuntos_faltantes.join(", ")}`,
        });
      }

      const paquete: Paquete = {
        correo,
        solicitud,
        cotizacion,
        aprobacion,
        factura,
        adjuntos_faltantes,
      };

      return JSON.stringify({ ok: true, data: paquete });
    } catch (err: any) {
      return JSON.stringify({ ok: false, error: `Error al leer paquete: ${err.message}` });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. oc_validar
// ─────────────────────────────────────────────────────────────────────────────
export const validar = {
  description: "Aplica las reglas de control de negocio RC1 a RC10 contrastando el paquete con los maestros SAP y detectando bloqueos y confirmaciones.",
  args: {
    caso: z.string().describe("Identificador del caso (ej. sol-001)"),
    paquete: z.any().optional().describe("Paquete previamente cargado; si se omite, se lee automáticamente"),
  },
  async execute(args: { caso: string; paquete?: Paquete }, ctx?: ToolContext): Promise<string> {
    try {
      const baseDir = getBaseDir(ctx);
      let paquete = args.paquete;

      if (!paquete) {
        const readRes = JSON.parse(await leer_paquete.execute({ caso: args.caso }, ctx));
        if (!readRes.ok) return JSON.stringify(readRes);
        paquete = readRes.data;
      }

      if (!paquete) {
        return JSON.stringify({ ok: false, error: "No fue posible obtener los datos del paquete." });
      }

      // Cargar catálogos maestros
      const maestrosDir = path.join(baseDir, "fixtures", "reto-03", "maestros");
      const proveedores = JSON.parse(fs.readFileSync(path.join(maestrosDir, "proveedores.json"), "utf-8"));
      const centrosCosto = JSON.parse(fs.readFileSync(path.join(maestrosDir, "centros-costo.json"), "utf-8"));
      const condicionesPago = JSON.parse(fs.readFileSync(path.join(maestrosDir, "condiciones-pago.json"), "utf-8"));
      const indicadoresIva = JSON.parse(fs.readFileSync(path.join(maestrosDir, "indicadores-iva.json"), "utf-8"));

      const bloqueos: string[] = [];
      const confirmaciones: string[] = [];
      const derivados: Record<string, any> = {};
      let retroactiva = false;

      const sol = paquete.solicitud;
      const apr = paquete.aprobacion;
      const cot = paquete.cotizacion;
      const fac = paquete.factura;

      // ─── RC1: Proveedor en proveedores.json y activo ───
      const cleanNitSol = sol.proveedor_nit ? sol.proveedor_nit.replace(/\D/g, "") : "";
      const normNameSol = sol.proveedor_nombre.trim().toLowerCase();

      const proveedorEncontrado = proveedores.find((p: any) => {
        const pNitClean = p.nit ? String(p.nit).replace(/\D/g, "") : "";
        if (cleanNitSol && pNitClean === cleanNitSol) return true;
        return p.nombre.trim().toLowerCase() === normNameSol;
      });

      if (!proveedorEncontrado) {
        bloqueos.push(`RC1: El proveedor '${sol.proveedor_nombre}' (NIT: ${sol.proveedor_nit || "No indicado"}) no existe en el maestro de proveedores SAP.`);
      } else if (!proveedorEncontrado.activo) {
        bloqueos.push(`RC1: El proveedor '${proveedorEncontrado.nombre}' (Código SAP: ${proveedorEncontrado.codigo_sap}) se encuentra INACTIVO en SAP.`);
      } else {
        derivados.proveedor_codigo_sap = proveedorEncontrado.codigo_sap;
        derivados.proveedor_nit = proveedorEncontrado.nit;
        derivados.proveedor_nombre = proveedorEncontrado.nombre;
        derivados.proveedor_condiciones_default = proveedorEncontrado.condiciones_pago_default;
        derivados.proveedor_iva_default = proveedorEncontrado.indicador_iva_default;
      }

      // ─── RC4: Centro de costo existe y subárea pertenece ───
      const ccEncontrado = centrosCosto.find((c: any) => c.centro_costo === sol.centro_costo);
      if (!ccEncontrado) {
        bloqueos.push(`RC4: El centro de costo '${sol.centro_costo}' no existe en el catálogo maestro.`);
      } else {
        const subareaValida = ccEncontrado.subareas.some((s: string) => s.trim().toLowerCase() === sol.subarea.trim().toLowerCase());
        if (!subareaValida) {
          bloqueos.push(`RC4: La subárea '${sol.subarea}' no pertenece al centro de costo '${sol.centro_costo}'. Subáreas válidas: ${ccEncontrado.subareas.join(", ")}.`);
        }
      }

      // ─── RC2 y RC3: Aprobación, Aprobador autorizado y Tope ───
      if (!apr) {
        bloqueos.push("RC2: No se encontró el correo de aprobación requerido.");
      } else if (!apr.aprobado) {
        bloqueos.push("RC2: El correo de aprobación no contiene la confirmación 'Aprobado'.");
      } else if (ccEncontrado) {
        const emailApr = apr.de.trim().toLowerCase();
        const aprobadorAutorizado = ccEncontrado.aprobadores.find((a: any) => a.email.trim().toLowerCase() === emailApr);

        if (!aprobadorAutorizado) {
          bloqueos.push(`RC2: El aprobador '${apr.de}' no está facultado para autorizar compras en el centro de costo '${sol.centro_costo}'. Aprobadores autorizados: ${ccEncontrado.aprobadores.map((a: any) => a.email).join(", ")}.`);
        } else {
          // RC3: Tope
          if (sol.valor_total > aprobadorAutorizado.tope) {
            bloqueos.push(`RC3: El valor total de la solicitud (COP ${sol.valor_total.toLocaleString()}) supera el tope máximo autorizado del aprobador '${aprobadorAutorizado.nombre}' (COP ${aprobadorAutorizado.tope.toLocaleString()}).`);
          }
        }
      }

      // ─── RC10: Consistencia aritmética cantidad × valor_unitario == valor_total (± 1 COP) ───
      const valorCalculado = sol.cantidad * sol.valor_unitario;
      if (Math.abs(valorCalculado - sol.valor_total) > 1) {
        bloqueos.push(`RC10: Inconsistencia matemática: Cantidad (${sol.cantidad}) × Valor Unitario (${sol.valor_unitario}) = ${valorCalculado}, pero se registró un Valor Total de ${sol.valor_total}.`);
      }

      // ─── RC5: Cotización vs Solicitud (diferencia <= 2%) ───
      if (!cot) {
        confirmaciones.push("RC5: No se adjuntó cotización formal del proveedor. Se requiere confirmación humana para proceder sin cotización.");
      } else {
        const diffRelativa = Math.abs(cot.total - sol.valor_total) / sol.valor_total;
        if (diffRelativa > 0.02) {
          const pct = (diffRelativa * 100).toFixed(2);
          confirmaciones.push(`RC5: El valor de la cotización (COP ${cot.total.toLocaleString()}) difiere en un ${pct}% respecto a la solicitud (COP ${sol.valor_total.toLocaleString()}), excediendo la tolerancia del 2%.`);
        }
      }

      // ─── RC6: Indicador de IVA ausente ───
      if (!sol.indicador_iva) {
        const ivaDefault = proveedorEncontrado?.indicador_iva_default || "C1";
        derivados.indicador_iva = ivaDefault;
        confirmaciones.push(`RC6: La solicitud no especifica indicador de IVA. Se propone derivar '${ivaDefault}' configurado por defecto para el proveedor.`);
      } else {
        derivados.indicador_iva = sol.indicador_iva;
      }

      // ─── RC7: Condiciones de pago ausente (derivado, solo informa) ───
      if (!sol.condiciones_pago) {
        const condDefault = proveedorEncontrado?.condiciones_pago_default || "Z030";
        derivados.condiciones_pago = condDefault;
      } else {
        derivados.condiciones_pago = sol.condiciones_pago;
      }

      // ─── RC8: Factura anterior a solicitud (Retroactiva) ───
      if (fac) {
        if (fac.fecha < sol.fecha_solicitud) {
          retroactiva = true;
          confirmaciones.push(`RC8: Desvío de proceso detectado: La factura (${fac.numero}) fue emitida el ${fac.fecha}, con fecha anterior a la creación de la solicitud (${sol.fecha_solicitud}). La OC quedará registrada como RETROACTIVA.`);
        }
      }

      // ─── RC9: Fecha de aprobación anterior a fecha de solicitud ───
      if (apr) {
        const fechaAprStr = apr.fecha.split("T")[0];
        if (fechaAprStr < sol.fecha_solicitud) {
          confirmaciones.push(`RC9: La fecha del correo de aprobación (${fechaAprStr}) es anterior a la fecha de la solicitud (${sol.fecha_solicitud}).`);
        }
      }

      const apta = bloqueos.length === 0;

      return JSON.stringify({
        ok: true,
        data: {
          apta,
          bloqueos,
          confirmaciones,
          derivados,
          retroactiva,
        },
      });
    } catch (err: any) {
      return JSON.stringify({ ok: false, error: `Error en validación: ${err.message}` });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. oc_generar_evidencia
// ─────────────────────────────────────────────────────────────────────────────
export const generar_evidencia = {
  description: "Genera el archivo de evidencia de aprobación en texto con hash SHA-256 y en PDF en out/<caso>/.",
  args: {
    caso: z.string().describe("Identificador del caso (ej. sol-001)"),
  },
  async execute(args: { caso: string }, ctx?: ToolContext): Promise<string> {
    try {
      const baseDir = getBaseDir(ctx);
      const aprPath = path.join(baseDir, "fixtures", "reto-03", "solicitudes", args.caso, "aprobacion.json");

      if (!fs.existsSync(aprPath)) {
        return JSON.stringify({ ok: false, error: `No se encontró aprobacion.json para el caso '${args.caso}'.` });
      }

      const apr = JSON.parse(fs.readFileSync(aprPath, "utf-8"));
      const outCasoDir = path.join(getOutDir(baseDir), args.caso);
      if (!fs.existsSync(outCasoDir)) {
        fs.mkdirSync(outCasoDir, { recursive: true });
      }

      const contenidoTxt = [
        "============================================================",
        "          EVIDENCIA DE APROBACIÓN DE GASTO - SAP            ",
        "============================================================",
        `De:      ${apr.de}`,
        `Para:    ${apr.para || "No especificado"}`,
        `CC:      ${apr.cc ? apr.cc.join(", ") : "N/A"}`,
        `Fecha:   ${apr.fecha}`,
        `Asunto:  ${apr.asunto}`,
        "------------------------------------------------------------",
        "Cuerpo del mensaje:",
        apr.cuerpo || "",
        "============================================================",
      ].join("\n");

      // SHA-256
      const sha256 = crypto.createHash("sha256").update(contenidoTxt, "utf-8").digest("hex");
      const txtFinal = contenidoTxt + `\nSHA-256 Evidencia: ${sha256}\n`;

      const rutaTxt = path.join(outCasoDir, "aprobacion.txt");
      fs.writeFileSync(rutaTxt, txtFinal, "utf-8");

      // P1: Generación de PDF usando pdf-lib
      let rutaPdf = "";
      try {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const page = pdfDoc.addPage([600, 450]);

        page.drawText("EVIDENCIA DE APROBACIÓN - PERIFERIA IT GROUP", {
          x: 40,
          y: 400,
          size: 14,
          font: fontBold,
          color: rgb(0.08, 0.38, 0.11), // Color --title
        });

        const lines = [
          `De:      ${apr.de}`,
          `Para:    ${apr.para || "N/A"}`,
          `Fecha:   ${apr.fecha}`,
          `Asunto:  ${apr.asunto}`,
          "",
          "Cuerpo de la Aprobación:",
          apr.cuerpo || "",
          "",
          `Integridad SHA-256: ${sha256}`,
        ];

        let curY = 360;
        for (const line of lines) {
          page.drawText(line, {
            x: 40,
            y: curY,
            size: 10,
            font: line.startsWith("De:") || line.startsWith("Asunto:") ? fontBold : font,
            color: rgb(0.13, 0.13, 0.13),
          });
          curY -= 18;
        }

        const pdfBytes = await pdfDoc.save();
        rutaPdf = path.join(outCasoDir, "aprobacion.pdf");
        fs.writeFileSync(rutaPdf, Buffer.from(pdfBytes));
      } catch (pdfErr) {
        // En caso de falla menor de renderizado PDF, mantenemos P0 txt
      }

      return JSON.stringify({
        ok: true,
        data: {
          ruta: path.relative(baseDir, rutaTxt),
          rutaPdf: rutaPdf ? path.relative(baseDir, rutaPdf) : null,
          sha256,
        },
      });
    } catch (err: any) {
      return JSON.stringify({ ok: false, error: `Error al generar evidencia: ${err.message}` });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. oc_construir_payload
// ─────────────────────────────────────────────────────────────────────────────
export const construir_payload = {
  description: "Construye el payload formal de la Orden de Compra SAP, valida contra esquema Zod y guarda trazabilidad.",
  args: {
    caso: z.string().describe("Identificador del caso"),
    paquete: z.any().optional().describe("Paquete opcional; si se omite, se lee automáticamente"),
    derivados: z.record(z.any()).optional().describe("Valores derivados de maestros producidos por oc_validar"),
  },
  async execute(args: { caso: string; paquete?: Paquete; derivados?: Record<string, any> }, ctx?: ToolContext): Promise<string> {
    try {
      const baseDir = getBaseDir(ctx);
      let paquete = args.paquete;

      if (!paquete) {
        const readRes = JSON.parse(await leer_paquete.execute({ caso: args.caso }, ctx));
        if (!readRes.ok) return JSON.stringify(readRes);
        paquete = readRes.data;
      }

      let derivados = args.derivados;
      if (!derivados) {
        const valRes = JSON.parse(await validar.execute({ caso: args.caso, paquete }, ctx));
        if (valRes.ok) derivados = valRes.data.derivados;
      }

      if (!paquete) {
        return JSON.stringify({ ok: false, error: "Paquete no disponible" });
      }

      // Asegurar evidencia SHA-256
      const evRes = JSON.parse(await generar_evidencia.execute({ caso: args.caso }, ctx));
      const sha256 = evRes.ok ? evRes.data.sha256 : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

      const sol = paquete.solicitud;

      const orden: OrdenCompra = {
        referencia: {
          solicitud_id: sol.solicitud_id,
          correo_id: paquete.correo?.id || "CORREO-DESCONOCIDO",
          cotizacion_ref: paquete.cotizacion?.referencia || null,
        },
        sociedad: "1000",
        organizacion_compras: "1000",
        proveedor: {
          codigo_sap: derivados?.proveedor_codigo_sap || "100234",
          nit: sol.proveedor_nit || derivados?.proveedor_nit || "N/A",
          nombre: sol.proveedor_nombre,
        },
        moneda: sol.moneda || "COP",
        condiciones_pago: sol.condiciones_pago || derivados?.condiciones_pago || "Z030",
        aprobador: {
          email: paquete.aprobacion?.de || "aprobador@periferia.com",
          fecha_aprobacion: paquete.aprobacion?.fecha || new Date().toISOString(),
          evidencia_sha256: sha256,
        },
        posiciones: [
          {
            numero: 10,
            descripcion: sol.descripcion.slice(0, 40),
            cantidad: sol.cantidad,
            unidad: "UN",
            precio_unitario: sol.valor_unitario,
            centro_costo: sol.centro_costo,
            subarea: sol.subarea,
            indicador_iva: sol.indicador_iva || derivados?.indicador_iva || "C1",
          },
        ],
        excepciones: [],
      };

      // Validar con Zod
      const validado = OrdenCompraSchema.safeParse(orden);
      if (!validado.success) {
        return JSON.stringify({
          ok: false,
          error: `Error de esquema Zod en payload SAP: ${validado.error.message}`,
        });
      }

      // Guardar trazabilidad requerida en out/<caso>/trazabilidad.json
      const trazabilidad = {
        caso: args.caso,
        solicitud_id: sol.solicitud_id,
        fuentes: {
          "referencia.solicitud_id": "solicitud.json",
          "referencia.correo_id": "correo.json",
          "referencia.cotizacion_ref": paquete.cotizacion ? "cotizacion.txt" : "null",
          "proveedor.codigo_sap": "maestro.proveedores",
          "proveedor.nit": sol.proveedor_nit ? "solicitud.json" : "maestro.proveedores",
          "proveedor.nombre": "solicitud.json",
          "condiciones_pago": sol.condiciones_pago ? "solicitud.json" : "derivado.maestro.proveedores",
          "aprobador.email": "aprobacion.json",
          "aprobador.evidencia_sha256": "generar_evidencia",
          "posiciones[0].descripcion": "solicitud.json (truncado max 40)",
          "posiciones[0].indicador_iva": sol.indicador_iva ? "solicitud.json" : "derivado.maestro.proveedores",
        },
        payload_orden: validado.data,
      };

      const outCasoDir = path.join(getOutDir(baseDir), args.caso);
      if (!fs.existsSync(outCasoDir)) fs.mkdirSync(outCasoDir, { recursive: true });

      const tracePath = path.join(outCasoDir, "trazabilidad.json");
      fs.writeFileSync(tracePath, JSON.stringify(trazabilidad, null, 2), "utf-8");

      return JSON.stringify({
        ok: true,
        data: {
          orden: validado.data,
          trazabilidadRuta: path.relative(baseDir, tracePath),
        },
      });
    } catch (err: any) {
      return JSON.stringify({ ok: false, error: `Error al construir payload: ${err.message}` });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. oc_crear
// ─────────────────────────────────────────────────────────────────────────────
export const crear = {
  description: "Crea la Orden de Compra en SAP simulado si no hay bloqueos y se han confirmado las excepciones.",
  args: {
    caso: z.string().describe("Identificador del caso"),
    payload: z.any().optional().describe("Payload de la OC. Si se omite, se generará"),
    confirmado: z.boolean().optional().describe("True si el usuario confirmó las excepciones pendientes"),
    confirmado_por: z.string().optional().describe("Nombre del usuario o aprobador que confirmó"),
  },
  async execute(args: { caso: string; payload?: OrdenCompra; confirmado?: boolean; confirmado_por?: string }, ctx?: ToolContext): Promise<string> {
    try {
      const baseDir = getBaseDir(ctx);
      const sapAdapter = (ctx?.sapAdapter as MockSapAdapter) || new MockSapAdapter(baseDir);

      // 1. Ejecutar validación
      const valRes = JSON.parse(await validar.execute({ caso: args.caso }, ctx));
      if (!valRes.ok) return JSON.stringify(valRes);

      const { apta, bloqueos, confirmaciones, derivados, retroactiva } = valRes.data;

      // Si está bloqueada
      if (!apta) {
        const errorMsg = `No se puede crear la Orden de Compra. El caso '${args.caso}' presenta bloqueos de control:\n${bloqueos.join("\n")}`;
        sapAdapter.registrarControl({
          solicitud_id: args.caso.toUpperCase(),
          resultado: "BLOQUEADA",
          numero_oc: "",
          retroactiva,
          bloqueos,
          confirmaciones,
        });
        return JSON.stringify({ ok: false, error: errorMsg, bloqueos, confirmaciones });
      }

      // Si tiene confirmaciones pendientes y no se ha confirmado
      if (confirmaciones.length > 0 && !args.confirmado) {
        const warnMsg = `La orden requiere confirmación humana explícita antes de crearse debido a:\n${confirmaciones.join("\n")}`;
        sapAdapter.registrarControl({
          solicitud_id: args.caso.toUpperCase(),
          resultado: "PENDIENTE_CONFIRMACION",
          numero_oc: "",
          retroactiva,
          bloqueos,
          confirmaciones,
        });
        return JSON.stringify({
          ok: false,
          error: warnMsg,
          needsConfirmation: true,
          confirmaciones,
        });
      }

      // 2. Construir payload si no viene dado
      let payload = args.payload;
      if (!payload) {
        const buildRes = JSON.parse(await construir_payload.execute({ caso: args.caso, derivados }, ctx));
        if (!buildRes.ok) return JSON.stringify(buildRes);
        payload = buildRes.data.orden;
      }

      if (!payload) {
        return JSON.stringify({ ok: false, error: "No se pudo generar el payload de la orden" });
      }

      // Asociar excepciones confirmadas en el payload
      if (confirmaciones.length > 0) {
        payload.excepciones = confirmaciones.map((c: string, idx: number) => ({
          codigo: `EX-${idx + 1}`,
          detalle: c,
          confirmado_por: args.confirmado_por || "analista_administrativa",
        }));
      }

      // 3. Crear orden en SAP
      const sapRes = await sapAdapter.crearOrden(payload);

      // Registrar en control.csv
      sapAdapter.registrarControl({
        solicitud_id: payload.referencia.solicitud_id,
        resultado: "CREADA",
        numero_oc: sapRes.numero_oc,
        retroactiva,
        bloqueos: [],
        confirmaciones,
      });

      return JSON.stringify({
        ok: true,
        data: {
          numero_oc: sapRes.numero_oc,
          fecha: sapRes.fecha,
          idempotente: sapRes.idempotente,
          retroactiva,
          solicitud_id: payload.referencia.solicitud_id,
        },
      });
    } catch (err: any) {
      return JSON.stringify({ ok: false, error: `Error al crear orden en SAP: ${err.message}` });
    }
  },
};
