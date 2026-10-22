import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { LlmAdapter, ChatMessage, ToolDefinition, LlmResponse, ToolCallRequest } from "./adapter.js";

export class GeminiAdapter implements LlmAdapter {
  private apiKey: string;
  private modelName: string;
  private client: GoogleGenerativeAI | null = null;

  constructor(apiKey?: string, modelName: string = "gemini-1.5-flash") {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.modelName = modelName;
    if (this.apiKey) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
  }

  async enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<LlmResponse> {
    if (!this.client || !this.apiKey) {
      // Modo emulado si no hay API key configurada todavía
      return this.ejecutarModoEmulado(mensajes, herramientas);
    }

    try {
      const geminiTools: any = herramientas.map((h) => ({
        name: h.name,
        description: h.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties: Object.entries(h.parameters.properties).reduce((acc: any, [key, val]) => {
            acc[key] = {
              type: SchemaType.STRING,
              description: val.description || "",
            };
            return acc;
          }, {}),
          required: h.parameters.required || [],
        },
      }));

      const model = this.client.getGenerativeModel({
        model: this.modelName,
        tools: [{ functionDeclarations: geminiTools }],
      });

      // Extraer system prompt si existe
      const systemMsg = mensajes.find((m) => m.role === "system");
      const chatMsgs = mensajes.filter((m) => m.role !== "system");

      const contents = chatMsgs.map((m) => {
        if (m.role === "user") {
          return { role: "user", parts: [{ text: m.content || "" }] };
        } else if (m.role === "tool") {
          return {
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: m.name || "tool_result",
                  response: { result: m.content },
                },
              },
            ],
          };
        } else {
          const parts: any[] = [];
          if (m.content) parts.push({ text: m.content });
          if (m.toolCalls && m.toolCalls.length > 0) {
            for (const tc of m.toolCalls) {
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });
            }
          }
          return { role: "model", parts };
        }
      });

      const response = await model.generateContent({
        contents,
        systemInstruction: systemMsg?.content ? { role: "system", parts: [{ text: systemMsg.content }] } : undefined,
      });

      const candidate = response.response.candidates?.[0];
      const functionCalls = candidate?.content?.parts?.filter((p) => p.functionCall).map((p) => p.functionCall!);
      const textParts = candidate?.content?.parts?.filter((p) => p.text).map((p) => p.text).join("\n") || "";

      if (functionCalls && functionCalls.length > 0) {
        const toolCalls: ToolCallRequest[] = functionCalls.map((fc, i) => ({
          id: `call_${Date.now()}_${i}`,
          name: fc.name,
          args: fc.args as Record<string, any>,
        }));
        return {
          text: textParts,
          toolCalls,
        };
      }

      return {
        text: textParts,
        toolCalls: [],
      };
    } catch (err: any) {
      console.warn("Aviso en llamada a Gemini:", err.message);
      return this.ejecutarModoEmulado(mensajes, herramientas);
    }
  }

  // Permite probar la aplicación en local aún antes de definir GEMINI_API_KEY
  private ejecutarModoEmulado(mensajes: ChatMessage[], herramientas: ToolDefinition[]): LlmResponse {
    const lastMsg = mensajes[mensajes.length - 1];

    // Determinar el caso actual buscando en el historial de mensajes
    let caso = "";
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const msg = mensajes[i];
      const txt = (msg.content || "") + " " + JSON.stringify(msg.toolCalls || {});
      const m = txt.match(/sol-00[1-6]/i);
      if (m) {
        caso = m[0].toLowerCase();
        break;
      }
    }
    if (!caso) caso = "sol-001";

    if (lastMsg.role === "user") {
      const text = (lastMsg.content || "").trim().toLowerCase();

      // 1. Saludos comunes
      if (/^(hola|buenos d[ií]as|buenas tardes|buenas noches|hey|saludos|que tal|qu[eé] tal)\b/i.test(text)) {
        return {
          text: "👋 ¡Hola! Soy el **Agente de Órdenes de Compra SAP** de Periferia IT Group.\n\nEstoy listo para asistirte en la validación y creación de órdenes de compra a partir de los paquetes documentales.\n\n¿Qué solicitud deseas procesar hoy? (Por ejemplo: `sol-001`, `sol-002`, `sol-004`).",
          toolCalls: [],
        };
      }

      // 2. Preguntas sobre capacidades o ayuda
      if (/qu[eé] puedes hacer|qui[eé]n eres|c[oó]mo funcionas|ayuda|help|funciones/i.test(text)) {
        return {
          text: "Soy el **Agente Especializado en Órdenes de Compra SAP** de Periferia IT Group. Mis funciones son:\n\n1. **Lectura de Paquetes**: Normalizo solicitudes, cotizaciones, aprobaciones y facturas.\n2. **Validación de Reglas de Control (RC1-RC10)**: Verifico proveedores activos, centros de costo, topes de líderes y detecto órdenes retroactivas.\n3. **Generación de Evidencias**: Produzco archivos de aprobación con hash de integridad SHA-256.\n4. **Creación en SAP Simulado**: Asigno números de orden oficiales (`4500000001+`) con garantía de idempotencia.\n\nPuedes indicarme qué caso procesar (ej. `sol-001` a `sol-006`) o pulsar los botones de casos rápidos arriba.",
          toolCalls: [],
        };
      }

      // 3. Confirmación humana explícita
      const matchCasoDirecto = text.match(/sol-00[1-6]/i);
      const esConfirmacion = /^(s[ií]|confirmo|confirmar|proceder|crear|autorizo|de acuerdo)\b/i.test(text) || (/confirmo|autorizo la creaci[oó]n|proceder con la creaci[oó]n/i.test(text) && !matchCasoDirecto);

      if (esConfirmacion) {
        if (caso) {
          return {
            toolCalls: [
              {
                id: `call_confirm_${Date.now()}`,
                name: "oc_crear",
                args: { caso, confirmado: true, confirmado_por: "analista_chat" },
              },
            ],
          };
        } else {
          return {
            text: "No hay ninguna solicitud pendiente de confirmación en este momento. Por favor indícame qué caso deseas evaluar (ej. `sol-004`).",
            toolCalls: [],
          };
        }
      }

      // 4. Si el usuario especifica un caso concreto (sol-001 a sol-006)
      if (matchCasoDirecto) {
        const casoSolicitado = matchCasoDirecto[0].toLowerCase();
        return {
          toolCalls: [
            {
              id: `call_read_${Date.now()}`,
              name: "oc_leer_paquete",
              args: { caso: casoSolicitado },
            },
          ],
        };
      }

      // 5. Si menciona un caso que no existe
      const matchOtroSol = text.match(/sol-\d+/i);
      if (matchOtroSol) {
        return {
          text: `La solicitud \`${matchOtroSol[0].toUpperCase()}\` no existe en el catálogo de fixtures. Las solicitudes válidas son de \`sol-001\` a \`sol-006\`.`,
          toolCalls: [],
        };
      }

      // 6. Si pide procesar pero no indica qué solicitud
      if (/procesa|crea|valida|revisa|analiza|orden|compra|solicitud/i.test(text)) {
        return {
          text: "¿Qué solicitud de compra deseas procesar? Por favor indícame el código (ejemplo: `sol-001`, `sol-002`, `sol-004`) o haz clic en los botones de acceso directo arriba.",
          toolCalls: [],
        };
      }

      // 7. Texto no relacionado o arbitrario
      return {
        text: "Soy el **Agente de Órdenes de Compra SAP** de Periferia IT Group. Solo proceso solicitudes de compra y reglas de control presupuestal.\n\nNo reconozco una instrucción de compra en tu mensaje. Por favor indícame qué solicitud deseas procesar (ej. `sol-001`, `sol-004`) o haz una consulta sobre el proceso de órdenes de compra.",
        toolCalls: [],
      };
    }

    if (lastMsg.role === "tool") {
      let data: any = {};
      try {
        const parsed = JSON.parse(lastMsg.content || "{}");
        data = parsed.data || parsed;
      } catch {
        data = {};
      }

      if (lastMsg.name === "oc_leer_paquete") {
        return {
          toolCalls: [
            {
              id: `call_val_${Date.now()}`,
              name: "oc_validar",
              args: { caso },
            },
          ],
        };
      }

      if (lastMsg.name === "oc_validar") {
        if (!data.apta) {
          const bloqueos = (data.bloqueos || []).map((b: string) => `• ${b}`).join("\n");
          return {
            text: `### ❌ Solicitud Bloqueada por Controles de Negocio\n\nNo es posible generar la Orden de Compra para este paquete debido a los siguientes bloqueos:\n\n${bloqueos}\n\n**Acción sugerida:** Corregir la causa del bloqueo con el área correspondiente antes de reintentar.`,
            toolCalls: [],
          };
        }

        if (data.confirmaciones && data.confirmaciones.length > 0) {
          const confs = data.confirmaciones.map((c: string) => `• ${c}`).join("\n");
          return {
            text: `### ⚠️ Confirmación Humana Requerida\n\nEl análisis del paquete detectó las siguientes excepciones que requieren tu autorización:\n\n${confs}\n\n${data.retroactiva ? "**Nota:** Esta orden quedará catalogada en auditoría como RETROACTIVA.\n\n" : ""}¿Deseas confirmar estas excepciones y proceder con la creación de la OC en SAP?`,
            toolCalls: [],
          };
        }

        // Si es apta sin confirmaciones
        return {
          toolCalls: [
            {
              id: `call_create_${Date.now()}`,
              name: "oc_crear",
              args: { caso },
            },
          ],
        };
      }

      if (lastMsg.name === "oc_crear") {
        if (data.numero_oc) {
          return {
            text: `### 🎉 Orden de Compra Creada Exitosamente en SAP\n\n- **Número de OC:** \`${data.numero_oc}\`\n- **Fecha de registro:** ${data.fecha}\n- **Referencia Solicitud:** ${data.solicitud_id || caso.toUpperCase()}\n- **Estado Idempotencia:** ${data.idempotente ? "Recuperada orden existente" : "Nueva orden emitida"}\n\nEl registro de control ha sido actualizado satisfactoriamente en \`out/control.csv\`.`,
            toolCalls: [],
          };
        }
      }
    }

    return {
      text: "He procesado tu solicitud. ¿Hay algún otro caso de compra que desees consultar?",
      toolCalls: [],
    };
  }
}
