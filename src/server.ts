import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { leer_paquete, validar, construir_payload, generar_evidencia, crear, ToolContext } from "./tools/oc.js";
import { GeminiAdapter } from "./llm/gemini.js";
import { ChatMessage, LlmAdapter, ToolDefinition } from "./llm/adapter.js";
import { MockSapAdapter } from "./sap/mock.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const baseDir = process.cwd();

app.use(cors());
app.use(express.json());

// Herramientas mapeadas para el agente
const toolsMap: Record<string, any> = {
  oc_leer_paquete: leer_paquete,
  oc_validar: validar,
  oc_construir_payload: construir_payload,
  oc_generar_evidencia: generar_evidencia,
  oc_crear: crear,
};

// Definiciones de herramientas para el LLM
const toolDefinitions: ToolDefinition[] = [
  {
    name: "oc_leer_paquete",
    description: leer_paquete.description,
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/ (ej: 'sol-001', 'sol-004')" },
      },
      required: ["caso"],
    },
  },
  {
    name: "oc_validar",
    description: validar.description,
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Identificador del caso a validar contra maestros" },
      },
      required: ["caso"],
    },
  },
  {
    name: "oc_construir_payload",
    description: construir_payload.description,
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Identificador del caso" },
      },
      required: ["caso"],
    },
  },
  {
    name: "oc_generar_evidencia",
    description: generar_evidencia.description,
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Identificador del caso" },
      },
      required: ["caso"],
    },
  },
  {
    name: "oc_crear",
    description: crear.description,
    parameters: {
      type: "object",
      properties: {
        caso: { type: "string", description: "Identificador del caso" },
        confirmado: { type: "boolean", description: "Indica si el usuario confirmó las excepciones o retroactividad detectadas" },
      },
      required: ["caso"],
    },
  },
];

// Cargar System Prompt y Base de Conocimiento
function loadSystemPrompt(): string {
  const promptPath = path.join(baseDir, "agent", "prompt.md");
  const knowledgePath = path.join(baseDir, "src", "knowledge", "ordenes-compra.md");

  let prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, "utf-8") : "Eres un agente de compras SAP.";
  if (fs.existsSync(knowledgePath)) {
    const knowledge = fs.readFileSync(knowledgePath, "utf-8");
    prompt += "\n\n# CONOCIMIENTO DE PROCESO DE NEGOCIO:\n" + knowledge;
  }
  return prompt;
}

// Inicializar adaptador de LLM
const llmProvider: LlmAdapter = new GeminiAdapter(process.env.GEMINI_API_KEY, process.env.LLM_MODEL || "gemini-1.5-flash");
const sapAdapter = new MockSapAdapter(baseDir);

// Almacén de sesiones en memoria
interface SessionData {
  messages: ChatMessage[];
  toolCalls: Array<{ name: string; args: any; result: any; ts: string }>;
  needsConfirmation: boolean;
  ultimoCaso?: string;
}

const sessions = new Map<string, SessionData>();

// Función de registro en out/log.jsonl (Regla CA4)
function logToolCall(entry: any) {
  try {
    const outDir = path.join(baseDir, "out");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const logFile = path.join(outDir, "log.jsonl");
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("Error al escribir log.jsonl:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: POST /api/chat
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { sessionId = `session_${Date.now()}`, message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ ok: false, error: "El campo 'message' es obligatorio." });
    }

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [{ role: "system", content: loadSystemPrompt() }],
        toolCalls: [],
        needsConfirmation: false,
      });
    }

    const session = sessions.get(sessionId)!;
    session.messages.push({ role: "user", content: message });

    // Detectar si el usuario envió un caso específico
    const matchCaso = message.match(/sol-00[1-6]/i);
    if (matchCaso) {
      session.ultimoCaso = matchCaso[0].toLowerCase();
    }

    const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "25", 10);
    let iterations = 0;
    const turnToolCalls: Array<{ name: string; args: any; result: any }> = [];
    let finalReply = "";
    let needsConfirmation = false;
    let createdNumeroOc: string | undefined;

    // Ciclo del Agente (Reglas CA1, CA2, CA3)
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const llmRes = await llmProvider.enviar(session.messages, toolDefinitions);

      // Si el modelo solicita llamadas a herramientas
      if (llmRes.toolCalls && llmRes.toolCalls.length > 0) {
        session.messages.push({
          role: "assistant",
          toolCalls: llmRes.toolCalls,
        });

        for (const tc of llmRes.toolCalls) {
          const tool = toolsMap[tc.name];
          let resultStr = "";

          if (tool) {
            const ctx: ToolContext = { directory: baseDir, sessionId, sapAdapter };
            resultStr = await tool.execute(tc.args, ctx);

            let parsedResult: any = {};
            try {
              parsedResult = JSON.parse(resultStr);
            } catch {
              parsedResult = { raw: resultStr };
            }

            // Trazar en log
            const logEntry = {
              name: tc.name,
              tool: tc.name,
              args: tc.args,
              result: parsedResult,
              ts: new Date().toISOString(),
            };
            logToolCall({ sessionId, ...logEntry });
            session.toolCalls.push(logEntry);
            turnToolCalls.push({ name: tc.name, args: tc.args, result: parsedResult });

            // Detectar estado de confirmación
            if (parsedResult.needsConfirmation) {
              needsConfirmation = true;
            }
            if (parsedResult.data?.numero_oc) {
              createdNumeroOc = parsedResult.data.numero_oc;
            }
          } else {
            resultStr = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${tc.name}` });
          }

          session.messages.push({
            role: "tool",
            name: tc.name,
            toolCallId: tc.id,
            content: resultStr,
          });
        }
      } else {
        // Respuesta final del modelo
        finalReply = llmRes.text || "Operación procesada.";
        session.messages.push({
          role: "assistant",
          content: finalReply,
        });
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      finalReply += "\n\n⚠️ *Se alcanzó el tope máximo de iteraciones configurado.*";
    }

    session.needsConfirmation = needsConfirmation;

    return res.json({
      ok: true,
      sessionId,
      reply: finalReply,
      toolCalls: turnToolCalls,
      needsConfirmation,
      numero_oc: createdNumeroOc,
      ultimoCaso: session.ultimoCaso,
    });
  } catch (err: any) {
    console.error("Error en /api/chat:", err);
    return res.status(500).json({ ok: false, error: `Error en el ciclo del agente: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: GET /api/sessions/:id
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/sessions/:id", (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ ok: false, error: "Sesión no encontrada." });
  }
  return res.json({
    ok: true,
    sessionId,
    messages: session.messages.filter((m) => m.role !== "system"),
    toolCalls: session.toolCalls,
    needsConfirmation: session.needsConfirmation,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    provider: process.env.LLM_PROVIDER || "gemini",
    model: process.env.LLM_MODEL || "gemini-1.5-flash",
    node_version: process.version,
    status: "online",
  });
});

// Levantar servidor
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor Backend corriendo en: http://localhost:${PORT}`);
    console.log(`📡 API Chat lista en: POST http://localhost:${PORT}/api/chat`);
    console.log(`🩺 Health check en:  GET  http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
