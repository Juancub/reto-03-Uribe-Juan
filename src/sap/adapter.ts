import { z } from "zod";

export const PosicionSchema = z.object({
  numero: z.number().describe("Número de posición secuencial SAP (10, 20, 30...)"),
  descripcion: z.string().max(40).describe("Descripción breve del bien o servicio (máximo 40 caracteres según límite SAP)"),
  cantidad: z.number().positive().describe("Cantidad solicitada"),
  unidad: z.enum(["UN", "H", "MES"]).describe("Unidad de medida SAP"),
  precio_unitario: z.number().nonnegative().describe("Precio unitario antes de impuestos"),
  centro_costo: z.string().describe("Código del centro de costo (ej. CC-1010)"),
  subarea: z.string().describe("Subárea perteneciente al centro de costo"),
  indicador_iva: z.string().describe("Código indicador de IVA (ej. C1, C0)"),
});

export const ExcepcionSchema = z.object({
  codigo: z.string().describe("Código de la regla o excepción (ej. RC5_DIFERENCIA_COTIZACION, RC8_RETROACTIVA)"),
  detalle: z.string().describe("Explicación detallada de la discrepancia o derivación"),
  confirmado_por: z.string().nullable().describe("Usuario o aprobador que confirmó la excepción, o null si pendiente"),
});

export const OrdenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string().describe("Identificador de la solicitud (ej. SOL-2026-001)"),
    correo_id: z.string().describe("Identificador del correo de origen"),
    cotizacion_ref: z.string().nullable().describe("Referencia o número de la cotización"),
  }),
  sociedad: z.literal("1000").default("1000"),
  organizacion_compras: z.literal("1000").default("1000"),
  proveedor: z.object({
    codigo_sap: z.string().describe("Código SAP del proveedor"),
    nit: z.string().describe("NIT del proveedor"),
    nombre: z.string().describe("Razón social del proveedor"),
  }),
  moneda: z.enum(["COP", "USD"]).describe("Moneda de la orden de compra"),
  condiciones_pago: z.string().describe("Código de condiciones de pago (ej. Z030)"),
  aprobador: z.object({
    email: z.string().email().describe("Correo corporativo del líder aprobador"),
    fecha_aprobacion: z.string().describe("Fecha y hora de la aprobación"),
    evidencia_sha256: z.string().describe("Hash SHA-256 del archivo de evidencia de aprobación"),
  }),
  posiciones: z.array(PosicionSchema).min(1).describe("Listado de posiciones de la OC"),
  excepciones: z.array(ExcepcionSchema).default([]).describe("Excepciones o confirmaciones requeridas asociadas a la OC"),
});

export type OrdenCompra = z.infer<typeof OrdenCompraSchema>;
export type PosicionOrden = z.infer<typeof PosicionSchema>;
export type ExcepcionOrden = z.infer<typeof ExcepcionSchema>;

export interface SapAdapter {
  consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null>;
  crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }>;
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null>;
}
