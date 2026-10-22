import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Bot,
  User,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Database,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Layers,
  Cpu
} from "lucide-react";

interface ToolCallItem {
  name: string;
  args: any;
  result: any;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallItem[];
  needsConfirmation?: boolean;
  numero_oc?: string;
  timestamp: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "👋 ¡Hola! Soy el **Agente de Órdenes de Compra SAP** de Periferia IT Group.\n\nPuedo leer los paquetes documentales, validar contra catálogos maestros (RC1–RC10), gestionar confirmaciones de discrepancias o retroactividad y crear las órdenes en SAP simulado con evidencia hash SHA-256.\n\n*Puedes seleccionar un caso rápido abajo o escribir tu solicitud.*",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(`ses_${Date.now()}`);
  const [serverStatus, setServerStatus] = useState<{ provider: string; model: string; ok: boolean }>({
    provider: "Gemini",
    model: "gemini-1.5-flash",
    ok: true,
  });
  const [lastOcCreated, setLastOcCreated] = useState<string | null>(null);
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    // Health check
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setServerStatus({ provider: data.provider, model: data.model, ok: true });
        }
      })
      .catch(() => setServerStatus({ provider: "Local", model: "Emulado", ok: true }));
  }, []);

  const toggleToolOpen = (toolId: string) => {
    setOpenTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: textToSend }),
      });
      const data = await res.json();

      if (data.ok) {
        if (data.numero_oc) {
          setLastOcCreated(data.numero_oc);
        }

        const agentMsg: Message = {
          id: `msg_${Date.now()}_agent`,
          role: "assistant",
          content: data.reply,
          toolCalls: data.toolCalls,
          needsConfirmation: data.needsConfirmation,
          numero_oc: data.numero_oc,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const errorMsg: Message = {
          id: `msg_${Date.now()}_err`,
          role: "assistant",
          content: `❌ **Error del Agente:** ${data.error || "Ocurrió un error al procesar el turno."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_net_err`,
          role: "assistant",
          content: `⚠️ **Error de conexión con el backend:** ${err.message}. Asegúrate de que el servidor esté activo.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = () => {
    handleSend("Confirmo las excepciones encontradas y autorizo la creación de la Orden de Compra en SAP.");
  };

  const resetSession = () => {
    setSessionId(`ses_${Date.now()}`);
    setLastOcCreated(null);
    setMessages([
      {
        id: "welcome_new",
        role: "assistant",
        content: "🔄 **Nueva sesión iniciada.** Puedes indicarme cualquier solicitud a evaluar.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const quickCases = [
    { label: "sol-001 (Caso Normal)", prompt: "Procesa la solicitud 'sol-001' y genera la orden en SAP si cumple todos los requisitos." },
    { label: "sol-002 (Proveedor Invalido)", prompt: "Procesa la solicitud 'sol-002' y valida sus maestros." },
    { label: "sol-003 (Aprobador Sin Tope)", prompt: "Procesa la solicitud 'sol-003' y verifica la autorización de gasto." },
    { label: "sol-004 (Diferencia > 2%)", prompt: "Procesa la solicitud 'sol-004'. Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme." },
    { label: "sol-005 (OC Retroactiva)", prompt: "Procesa la solicitud 'sol-005'. Evalúa si es retroactiva y qué excepciones tiene." },
    { label: "sol-006 (IVA Faltante)", prompt: "Procesa la solicitud 'sol-006' y completa los datos derivados del proveedor." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ─── Header Corporativo Periferia ─── */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #063635 0%, #15601D 100%)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 15px var(--accent-glow)",
            }}
          >
            <Bot size={24} color="#6DFD8C" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-title" style={{ fontSize: "1.15rem", color: "var(--title)" }}>
                Perxia 2.0
              </span>
              <span style={{ fontSize: "0.75rem", background: "rgba(109,253,140,0.15)", color: "var(--accent)", padding: "2px 8px", borderRadius: "999px", border: "1px solid var(--line)", fontWeight: 600 }}>
                RETO 03
              </span>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              Agente Autónomo de Órdenes de Compra SAP ERP
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0,0,0,0.25)",
              padding: "6px 14px",
              borderRadius: "999px",
              border: "1px solid var(--line)",
              fontSize: "0.8rem",
            }}
          >
            <Cpu size={14} color="#6DFD8C" />
            <span style={{ color: "var(--muted)" }}>Motor:</span>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>{serverStatus.provider} ({serverStatus.model})</span>
          </div>

          <button
            onClick={resetSession}
            title="Reiniciar Sesión"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--ink-secondary)",
              padding: "6px 14px",
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.82rem",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
          >
            <RotateCcw size={14} />
            <span>Nueva Sesión</span>
          </button>
        </div>
      </header>

      {/* ─── Contenedor Principal (2 Columnas) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", flex: 1, overflow: "hidden" }}>
        
        {/* Columna Izquierda: Chat Feed & Entrada */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
          
          {/* Barra de Acciones Rápidas */}
          <div
            style={{
              padding: "10px 20px",
              background: "rgba(6, 54, 53, 0.4)",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", alignSelf: "center", marginRight: "4px" }}>
              Casos Rápidos:
            </span>
            {quickCases.map((qc, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qc.prompt)}
                disabled={isLoading}
                style={{
                  background: "rgba(109, 253, 140, 0.08)",
                  border: "1px solid var(--line)",
                  color: "var(--ink-secondary)",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => !isLoading && (e.currentTarget.style.borderColor = "var(--accent)", e.currentTarget.style.background = "rgba(109,253,140,0.18)")}
                onMouseOut={(e) => !isLoading && (e.currentTarget.style.borderColor = "var(--line)", e.currentTarget.style.background = "rgba(109,253,140,0.08)")}
              >
                <Sparkles size={12} color="#6DFD8C" />
                {qc.label}
              </button>
            ))}
          </div>

          {/* Área de Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  gap: "14px",
                  alignItems: "flex-start",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: m.role === "user" ? "75%" : "88%",
                }}
              >
                {m.role === "assistant" && (
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(109,253,140,0.15)",
                      border: "1px solid var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={20} color="#6DFD8C" />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {/* Tool Calls Accordion */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "4px" }}>
                      {m.toolCalls.map((tc, idx) => {
                        const toolKey = `${m.id}_${idx}`;
                        const isOpen = Boolean(openTools[toolKey]);
                        return (
                          <div
                            key={idx}
                            style={{
                              background: "rgba(0,0,0,0.3)",
                              border: "1px solid var(--line)",
                              borderRadius: "8px",
                              overflow: "hidden",
                              fontSize: "0.8rem",
                            }}
                          >
                            <button
                              onClick={() => toggleToolOpen(toolKey)}
                              style={{
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                padding: "6px 10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                color: "var(--accent)",
                                cursor: "pointer",
                                textAlign: "left",
                                fontFamily: "var(--font-b)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Database size={13} />
                                <span style={{ fontWeight: 600 }}>Herramienta: {tc.name}</span>
                                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                                  ({tc.args?.caso || "ejecutado"})
                                </span>
                              </div>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>

                            {isOpen && (
                              <div
                                style={{
                                  padding: "8px 12px",
                                  borderTop: "1px solid rgba(109, 253, 140, 0.1)",
                                  background: "rgba(0,0,0,0.2)",
                                  fontFamily: "monospace",
                                  fontSize: "0.74rem",
                                  maxHeight: "180px",
                                  overflowY: "auto",
                                }}
                              >
                                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Parámetros:</div>
                                <pre style={{ color: "#8be9fd", whiteSpace: "pre-wrap" }}>
                                  {JSON.stringify(tc.args, null, 2)}
                                </pre>
                                <div style={{ color: "var(--muted)", marginTop: "6px", marginBottom: "4px" }}>Resultado:</div>
                                <pre style={{ color: "#50fa7b", whiteSpace: "pre-wrap" }}>
                                  {JSON.stringify(tc.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Burbuja de Texto */}
                  <div
                    style={{
                      background: m.role === "user" ? "linear-gradient(135deg, #15601D 0%, #063635 100%)" : "var(--surface)",
                      border: `1px solid ${m.role === "user" ? "var(--accent)" : "var(--line)"}`,
                      borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      padding: "14px 18px",
                      color: "var(--ink)",
                      boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>

                    {/* Banner de Confirmación Humana */}
                    {m.needsConfirmation && (
                      <div
                        style={{
                          marginTop: "16px",
                          background: "var(--warning-bg)",
                          border: "1px solid var(--warning-border)",
                          borderRadius: "12px",
                          padding: "14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--warning-text)", fontWeight: 700 }}>
                          <AlertTriangle size={18} />
                          <span>Punto de Control Humano Requerido (Regla CA3)</span>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
                          El agente ha detenido el flujo para salvaguardar el proceso. Para crear la OC oficial en SAP debes confirmar explícitamente las excepciones reportadas.
                        </p>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                          <button
                            onClick={handleConfirmAction}
                            disabled={isLoading}
                            style={{
                              background: "linear-gradient(135deg, #6DFD8C 0%, #15601D 100%)",
                              border: "none",
                              color: "#042423",
                              padding: "8px 16px",
                              borderRadius: "8px",
                              fontWeight: 700,
                              fontSize: "0.84rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              boxShadow: "0 4px 12px rgba(109, 253, 140, 0.3)",
                            }}
                          >
                            <CheckCircle2 size={16} />
                            Confirmar y Crear OC en SAP
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", alignSelf: m.role === "user" ? "flex-end" : "flex-start", padding: "0 4px" }}>
                    {m.timestamp}
                  </span>
                </div>

                {m.role === "user" && (
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(109,253,140,0.1)",
                      border: "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <User size={20} color="#D4F4DC" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ display: "flex", gap: "14px", alignItems: "center", alignSelf: "flex-start" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(109,253,140,0.15)",
                    border: "1px solid var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bot size={20} color="#6DFD8C" />
                </div>
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "18px 18px 18px 4px",
                    padding: "12px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "0.84rem", color: "var(--muted)" }}>El agente está pensando y evaluando reglas de control</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <div className="pulse-dot"></div>
                    <div className="pulse-dot"></div>
                    <div className="pulse-dot"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Entrada */}
          <div
            style={{
              padding: "16px 24px",
              background: "var(--surface)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: "flex",
                gap: "10px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--line)",
                borderRadius: "14px",
                padding: "6px 8px 6px 16px",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Indica un caso (ej. 'Procesa sol-004 y valídalo') o haz una consulta..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--ink)",
                  fontFamily: "var(--font-b)",
                  fontSize: "0.92rem",
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                style={{
                  background: input.trim() && !isLoading ? "var(--accent)" : "rgba(109,253,140,0.2)",
                  color: "#042423",
                  border: "none",
                  borderRadius: "10px",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* ─── Columna Derecha: Inspector SAP y Auditoría ─── */}
        <aside
          style={{
            background: "rgba(6, 54, 53, 0.7)",
            borderLeft: "1px solid var(--line)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            overflowY: "auto",
          }}
        >
          {/* Card: Estado SAP Mock */}
          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--title)", marginBottom: "10px" }}>
              <Layers size={18} />
              <h3 style={{ fontSize: "0.95rem" }}>SAP ERP Simulado</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.82rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Sociedad:</span>
                <span style={{ fontWeight: 600 }}>1000 (Periferia)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Org. Compras:</span>
                <span style={{ fontWeight: 600 }}>1000</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Rango Números:</span>
                <span style={{ fontWeight: 600 }}>4500000001+</span>
              </div>
            </div>
          </div>

          {/* Card: Última OC Generada */}
          <div
            style={{
              background: lastOcCreated ? "rgba(109, 253, 140, 0.12)" : "var(--surface-card)",
              border: `1px solid ${lastOcCreated ? "var(--accent)" : "var(--line)"}`,
              borderRadius: "14px",
              padding: "16px",
              boxShadow: lastOcCreated ? "0 0 20px var(--accent-glow)" : "none",
              transition: "all 0.3s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--title)", marginBottom: "8px" }}>
              <CheckCircle2 size={18} />
              <h3 style={{ fontSize: "0.95rem" }}>Última OC Creada</h3>
            </div>
            {lastOcCreated ? (
              <div>
                <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "0.05em", margin: "6px 0" }}>
                  #{lastOcCreated}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--ink-secondary)" }}>
                  Registrada exitosamente en <code>out/sap/ordenes.jsonl</code> y asentada en el log de control.
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Aún no se ha creado ninguna orden en esta sesión.
              </p>
            )}
          </div>

          {/* Card: Matriz de Control */}
          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--title)", marginBottom: "10px" }}>
              <ShieldAlert size={18} />
              <h3 style={{ fontSize: "0.95rem" }}>Reglas de Control</h3>
            </div>
            <ul style={{ listStyle: "none", fontSize: "0.76rem", display: "flex", flexDirection: "column", gap: "6px", color: "var(--ink-secondary)" }}>
              <li>🔴 <b>RC1</b>: Proveedor activo en maestro</li>
              <li>🔴 <b>RC2/RC3</b>: Aprobador de CC y tope</li>
              <li>🔴 <b>RC4</b>: Subárea válida en CC</li>
              <li>🟡 <b>RC5</b>: Discrepancia cotización ≤ 2%</li>
              <li>🟡 <b>RC6</b>: Derivación de IVA ausente</li>
              <li>🟡 <b>RC8</b>: Detección OC Retroactiva</li>
              <li>🔴 <b>RC10</b>: Consistencia matemática</li>
            </ul>
          </div>

          {/* Info Footer */}
          <div style={{ marginTop: "auto", fontSize: "0.75rem", color: "var(--muted)", textAlign: "center", padding: "10px 0" }}>
            Perxia 2.0 · Proceso de Selección
            <br />
            Periferia IT Group © 2026
          </div>
        </aside>
      </div>
    </div>
  );
}
