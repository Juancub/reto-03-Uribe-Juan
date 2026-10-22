import fs from "fs";
import path from "path";
import { SapAdapter, OrdenCompra } from "./adapter.js";

export class MockSapAdapter implements SapAdapter {
  private baseDir: string;
  private sapDir: string;
  private ordenesFile: string;
  private controlFile: string;
  private proveedoresFile: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    this.sapDir = path.join(this.baseDir, "out", "sap");
    this.ordenesFile = path.join(this.sapDir, "ordenes.jsonl");
    this.controlFile = path.join(this.baseDir, "out", "control.csv");
    this.proveedoresFile = path.join(this.baseDir, "fixtures", "reto-03", "maestros", "proveedores.json");

    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.sapDir)) {
      fs.mkdirSync(this.sapDir, { recursive: true });
    }
    const outDir = path.join(this.baseDir, "out");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
  }

  async consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null> {
    if (!fs.existsSync(this.proveedoresFile)) {
      return null;
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.proveedoresFile, "utf-8"));
      const cleanNit = nit.replace(/\D/g, "");
      const prov = data.find((p: any) => {
        const pNitClean = String(p.nit).replace(/\D/g, "");
        return pNitClean === cleanNit;
      });
      if (prov) {
        return {
          codigo_sap: prov.codigo_sap,
          activo: Boolean(prov.activo),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null> {
    if (!fs.existsSync(this.ordenesFile)) {
      return null;
    }
    const lines = fs.readFileSync(this.ordenesFile, "utf-8").split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.orden?.referencia?.solicitud_id === solicitud_id || entry.solicitud_id === solicitud_id) {
          return { numero_oc: entry.numero_oc };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  obtenerUltimaOrden(): { numero_oc: string; fecha: string; solicitud_id: string; totalOrdenes: number } | null {
    if (!fs.existsSync(this.ordenesFile)) {
      return null;
    }
    const lines = fs.readFileSync(this.ordenesFile, "utf-8").split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return null;
    }
    try {
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      return {
        numero_oc: lastEntry.numero_oc,
        fecha: lastEntry.fecha,
        solicitud_id: lastEntry.solicitud_id || lastEntry.orden?.referencia?.solicitud_id || "N/A",
        totalOrdenes: lines.length,
      };
    } catch {
      return null;
    }
  }

  async crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string; idempotente: boolean }> {
    this.ensureDirs();
    const solicitud_id = orden.referencia.solicitud_id;

    // Idempotencia: Verificar si ya existe una OC para esta solicitud
    const existente = await this.buscarOrdenPorReferencia(solicitud_id);
    if (existente) {
      return {
        numero_oc: existente.numero_oc,
        fecha: new Date().toISOString().split("T")[0],
        idempotente: true,
      };
    }

    // Calcular el siguiente número secuencial desde 4500000001
    let nextNum = 4500000001;
    if (fs.existsSync(this.ordenesFile)) {
      const lines = fs.readFileSync(this.ordenesFile, "utf-8").split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const currentNum = parseInt(entry.numero_oc, 10);
          if (!isNaN(currentNum) && currentNum >= nextNum) {
            nextNum = currentNum + 1;
          }
        } catch {
          continue;
        }
      }
    }

    const numero_oc = String(nextNum);
    const fecha = new Date().toISOString().split("T")[0];

    const registro = {
      numero_oc,
      fecha,
      solicitud_id,
      orden,
    };

    fs.appendFileSync(this.ordenesFile, JSON.stringify(registro) + "\n", "utf-8");

    return {
      numero_oc,
      fecha,
      idempotente: false,
    };
  }

  registrarControl(params: {
    solicitud_id: string;
    resultado: "CREADA" | "BLOQUEADA" | "PENDIENTE_CONFIRMACION";
    numero_oc: string;
    retroactiva: boolean;
    bloqueos: string[];
    confirmaciones: string[];
  }): void {
    this.ensureDirs();
    const headers = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\n";
    if (!fs.existsSync(this.controlFile)) {
      fs.writeFileSync(this.controlFile, headers, "utf-8");
    }

    const clean = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const bloqueosStr = clean(params.bloqueos.join("; "));
    const confirmacionesStr = clean(params.confirmaciones.join("; "));
    const ts = new Date().toISOString();

    const row = `${params.solicitud_id},${params.resultado},${params.numero_oc},${params.retroactiva},${bloqueosStr},${confirmacionesStr},${ts}\n`;
    fs.appendFileSync(this.controlFile, row, "utf-8");
  }
}
