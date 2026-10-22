import fs from "fs";
import path from "path";
import { leer_paquete, validar, construir_payload, generar_evidencia, crear } from "./src/tools/oc.js";

async function main() {
  console.log("\n================================================================================");
  console.log(" 🚀 DEMO RETO 03 - AGENTE ÓRDENES DE COMPRA SAP (EJECUCIÓN SIN MODELO LLM)");
  console.log("================================================================================\n");

  const baseDir = process.cwd();
  const outDir = path.join(baseDir, "out");

  // Requisito Sección 8: "out/ se limpia al inicio"
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const casos = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"];
  const resultados: Array<{
    caso: string;
    apta: boolean;
    bloqueos: number;
    confirmaciones: number;
    retroactiva: boolean;
    numero_oc: string;
    estado: string;
  }> = [];

  for (const caso of casos) {
    console.log(`\n────────────────────────────────────────────────────────────────────────────────`);
    console.log(`▶ Procesando Caso: [${caso.toUpperCase()}]`);
    console.log(`────────────────────────────────────────────────────────────────────────────────`);

    // 1. Leer paquete
    const packRes = JSON.parse(await leer_paquete.execute({ caso }));
    if (!packRes.ok) {
      console.error(`❌ Error al leer paquete de ${caso}:`, packRes.error);
      continue;
    }
    const paquete = packRes.data;
    console.log(`   📄 Solicitud:  ${paquete.solicitud.solicitud_id} | ${paquete.solicitud.descripcion.slice(0, 50)}...`);
    console.log(`   🏢 Proveedor:  ${paquete.solicitud.proveedor_nombre} (NIT: ${paquete.solicitud.proveedor_nit || "N/A"})`);
    console.log(`   💰 Valor:      COP ${paquete.solicitud.valor_total.toLocaleString()} | CC: ${paquete.solicitud.centro_costo}`);

    // 2. Validar reglas de control RC1 - RC10
    const valRes = JSON.parse(await validar.execute({ caso, paquete }));
    const { apta, bloqueos, confirmaciones, retroactiva, derivados } = valRes.data;

    console.log(`   🔍 Aptitud:    ${apta ? "✅ APTA" : "❌ NO APTA (BLOQUEADA)"}`);
    if (bloqueos.length > 0) {
      console.log(`   🚫 Bloqueos (${bloqueos.length}):`);
      bloqueos.forEach((b: string) => console.log(`      • ${b}`));
    }
    if (confirmaciones.length > 0) {
      console.log(`   ⚠️  Confirmaciones requeridas (${confirmaciones.length}):`);
      confirmaciones.forEach((c: string) => console.log(`      • ${c}`));
    }
    if (retroactiva) {
      console.log(`   ⏳ Retroactividad: DETECTADA (Factura anterior a solicitud)`);
    }

    // 3. Generar evidencia y payload
    await generar_evidencia.execute({ caso });
    await construir_payload.execute({ caso, paquete, derivados });

    // 4. Intentar creación según caso
    if (!apta) {
      // Caso bloqueado (ej. sol-002, sol-003)
      const intentoBloqueado = JSON.parse(await crear.execute({ caso }));
      console.log(`   🛑 Resultado:  OC NO CREADA (Bloqueada por controles de negocio)`);
      resultados.push({
        caso,
        apta,
        bloqueos: bloqueos.length,
        confirmaciones: confirmaciones.length,
        retroactiva,
        numero_oc: "N/A",
        estado: "BLOQUEADA",
      });
    } else if (confirmaciones.length > 0) {
      // Caso con confirmaciones (ej. sol-004, sol-005, sol-006)
      console.log(`   📋 Probando protección de confirmación humana (confirmado: false)...`);
      const sinConfirmar = JSON.parse(await crear.execute({ caso, confirmado: false }));
      console.log(`      🛡️  Respuesta esperada: ${sinConfirmar.error.split("\n")[0]}`);

      console.log(`   ✍️  Simulando confirmación explícita de analista (confirmado: true)...`);
      const conConfirmar = JSON.parse(await crear.execute({ caso, confirmado: true, confirmado_por: "analista_demo" }));
      if (conConfirmar.ok) {
        console.log(`   🎉 Resultado:  OC Creada con éxito -> Número: [${conConfirmar.data.numero_oc}] (Retroactiva: ${conConfirmar.data.retroactiva})`);
        resultados.push({
          caso,
          apta,
          bloqueos: 0,
          confirmaciones: confirmaciones.length,
          retroactiva,
          numero_oc: conConfirmar.data.numero_oc,
          estado: retroactiva ? "CREADA (RETROACTIVA)" : "CREADA (CONFIRMADA)",
        });
      }
    } else {
      // Caso normal directo (sol-001)
      const resCrear = JSON.parse(await crear.execute({ caso }));
      if (resCrear.ok) {
        console.log(`   🎉 Resultado:  OC Creada automáticamente -> Número: [${resCrear.data.numero_oc}]`);
        resultados.push({
          caso,
          apta,
          bloqueos: 0,
          confirmaciones: 0,
          retroactiva: false,
          numero_oc: resCrear.data.numero_oc,
          estado: "CREADA",
        });

        // Demostración de Idempotencia exigida en Sección 6.6: ejecutar sol-001 dos veces
        console.log(`\n   🔄 [TEST DE IDEMPOTENCIA]: Re-ejecutando creación para '${caso}'...`);
        const resIdempotente = JSON.parse(await crear.execute({ caso }));
        console.log(`   🔁 Respuesta: Número OC existente = [${resIdempotente.data.numero_oc}] | Idempotente = ${resIdempotente.data.idempotente}`);
      }
    }
  }

  // Resumen final tabular
  console.log("\n================================================================================");
  console.log(" 📊 RESUMEN FINAL DE EJECUCIÓN DEMO");
  console.log("================================================================================");
  console.table(resultados);

  // Verificación de archivos generados
  console.log("\n📁 Verificando artefactos generados en out/:");
  const controlPath = path.join(outDir, "control.csv");
  const ordenesPath = path.join(outDir, "sap", "ordenes.jsonl");

  if (fs.existsSync(controlPath)) {
    const lines = fs.readFileSync(controlPath, "utf-8").trim().split("\n");
    console.log(`   ✅ out/control.csv generado con ${lines.length - 1} registros.`);
  }
  if (fs.existsSync(ordenesPath)) {
    const lines = fs.readFileSync(ordenesPath, "utf-8").trim().split("\n");
    console.log(`   ✅ out/sap/ordenes.jsonl generado con ${lines.length} órdenes.`);
  }
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Error fatal en demo:", err);
  process.exit(1);
});
