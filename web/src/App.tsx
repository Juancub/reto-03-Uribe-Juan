import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Database,
  Sparkles,
  Layers,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X
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
        "👋 ¡Hola! Soy el **Agente de Órdenes de Compra SAP** de Periferia IT Group.\n\nPuedo leer los paquetes documentales, validar contra catálogos maestros (RC1–RC10), gestionar confirmaciones de discrepancias o retroactividad y emitir órdenes en SAP simulado con hash de evidencia SHA-256.\n\n*Puedes pulsar cualquiera de los casos rápidos abajo o escribirme tu solicitud.*",
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
  const [lastOcDetails, setLastOcDetails] = useState<{ fecha?: string; solicitud_id?: string; totalOrdenes?: number } | null>(null);
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});
  
  // Estado para esconder y mostrar el sidebar izquierdo
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Detección de tamaño de pantalla para responsividad
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false); // cerrado por defecto en pantallas pequeñas
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadStatusAndOrders = () => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setServerStatus({ provider: data.provider, model: data.model, ok: true });
          if (data.ultimaOrden) {
            setLastOcCreated(data.ultimaOrden.numero_oc);
            setLastOcDetails({
              fecha: data.ultimaOrden.fecha,
              solicitud_id: data.ultimaOrden.solicitud_id,
              totalOrdenes: data.ultimaOrden.totalOrdenes,
            });
          }
        }
      })
      .catch(() => setServerStatus({ provider: "Local", model: "Emulado", ok: true }));
  };

  useEffect(() => {
    loadStatusAndOrders();
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
          loadStatusAndOrders();
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
    loadStatusAndOrders();
    setMessages([
      {
        id: "welcome_new",
        role: "assistant",
        content: "🔄 **Nueva sesión iniciada.** Puedes indicarme cualquier solicitud a evaluar.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // Casos rápidos sin texto entre paréntesis
  const quickCases = [
    { label: "sol-001", prompt: "Procesa la solicitud 'sol-001' y genera la orden en SAP si cumple todos los requisitos." },
    { label: "sol-002", prompt: "Procesa la solicitud 'sol-002' y valida sus maestros." },
    { label: "sol-003", prompt: "Procesa la solicitud 'sol-003' y verifica la autorización de gasto." },
    { label: "sol-004", prompt: "Procesa la solicitud 'sol-004'. Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme." },
    { label: "sol-005", prompt: "Procesa la solicitud 'sol-005'. Evalúa si es retroactiva y qué excepciones tiene." },
    { label: "sol-006", prompt: "Procesa la solicitud 'sol-006' y completa los datos derivados del proveedor." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F8FAFC" }}>
      {/* ─── Header Corporativo Periferia (Fondo Blanco) ─── */}
      <header
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E2E8F0",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Botón para esconder / mostrar Sidebar */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
            style={{
              background: "#F1F5F9",
              border: "1px solid #E2E8F0",
              color: "#334155",
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#E2E8F0";
              e.currentTarget.style.color = "#15601D";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#F1F5F9";
              e.currentTarget.style.color = "#334155";
            }}
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "#15601D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(21, 96, 29, 0.2)",
            }}
          >
            <Bot size={22} color="#FFFFFF" />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-title" style={{ fontSize: "1.1rem", color: "#15601D", fontWeight: 700 }}>
                Perxia 2.0
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  background: "#ECFDF5",
                  color: "#047857",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: "1px solid #A7F3D0",
                  fontWeight: 600,
                }}
              >
                Reto 03
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748B" }}>
              Agente Autónomo de Órdenes de Compra SAP
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Badge de Motor LLM */}
          <div
            className="desktop-only"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#F8FAFC",
              padding: "6px 12px",
              borderRadius: "999px",
              border: "1px solid #E2E8F0",
              fontSize: "0.8rem",
            }}
          >
            <Cpu size={14} color="#15601D" />
            <span style={{ color: "#64748B" }}>Motor:</span>
            <span style={{ color: "#15601D", fontWeight: 600 }}>{serverStatus.provider}</span>
          </div>

          <button
            onClick={resetSession}
            title="Reiniciar Sesión"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#FFFFFF",
              border: "1px solid #CBD5E1",
              color: "#334155",
              padding: "7px 14px",
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 500,
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "#15601D";
              e.currentTarget.style.color = "#15601D";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#CBD5E1";
              e.currentTarget.style.color = "#334155";
            }}
          >
            <RotateCcw size={14} />
            <span className="desktop-only">Nueva Sesión</span>
          </button>
        </div>
      </header>

      {/* ─── Contenedor Principal con Sidebar Izquierdo ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        
        {/* Backdrop para móviles cuando el sidebar está abierto */}
        {isMobile && isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.4)",
              zIndex: 30,
              backdropFilter: "blur(2px)",
            }}
          />
        )}

        {/* ─── Sidebar Izquierdo (Escondible / Colapsable) ─── */}
        <aside
          style={{
            width: isSidebarOpen ? (isMobile ? "280px" : "310px") : "0px",
            minWidth: isSidebarOpen ? (isMobile ? "280px" : "310px") : "0px",
            background: "#FFFFFF",
            borderRight: isSidebarOpen ? "1px solid #E2E8F0" : "none",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            padding: isSidebarOpen ? "20px 18px" : "0px",
            overflowX: "hidden",
            overflowY: "auto",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: isMobile ? 40 : 10,
            position: isMobile ? "absolute" : "relative",
            height: "100%",
            boxShadow: isMobile && isSidebarOpen ? "4px 0 20px rgba(0,0,0,0.12)" : "none",
            visibility: isSidebarOpen ? "visible" : "hidden",
            opacity: isSidebarOpen ? 1 : 0,
          }}
        >
          {/* Header del sidebar en móvil */}
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#15601D" }}>Panel SAP</span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748B" }}
              >
                <X size={20} />
              </button>
            </div>
          )}

          {/* Card: SAP ERP Simulado */}
          <div
            style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15601D", marginBottom: "10px" }}>
              <Layers size={18} />
              <h3 style={{ fontSize: "0.92rem", fontWeight: 700 }}>SAP ERP Simulado</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.82rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Sociedad:</span>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>1000 (Periferia)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Org. Compras:</span>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>1000</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Rango Consecutivos:</span>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>4500000001+</span>
              </div>
            </div>
          </div>

          {/* Card: Última OC en SAP (out/sap) */}
          <div
            style={{
              background: lastOcCreated ? "#F0FDF4" : "#F8FAFC",
              border: `1px solid ${lastOcCreated ? "#86EFAC" : "#E2E8F0"}`,
              borderRadius: "14px",
              padding: "16px",
              transition: "all 0.3s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15601D", marginBottom: "8px" }}>
              <CheckCircle2 size={18} />
              <h3 style={{ fontSize: "0.92rem", fontWeight: 700 }}>Última OC en SAP</h3>
            </div>
            {lastOcCreated ? (
              <div>
                <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#15601D", letterSpacing: "0.02em", margin: "4px 0" }}>
                  #{lastOcCreated}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#334155" }}>
                  {lastOcDetails?.solicitud_id && (
                    <div style={{ marginBottom: "2px" }}>
                      Solicitud: <span style={{ color: "#15601D", fontWeight: 600 }}>{lastOcDetails.solicitud_id}</span>
                    </div>
                  )}
                  {lastOcDetails?.totalOrdenes !== undefined && (
                    <div style={{ color: "#64748B", marginBottom: "4px" }}>
                      Total en base SAP: <b>{lastOcDetails.totalOrdenes} órdenes</b>
                    </div>
                  )}
                  <div style={{ fontSize: "0.74rem", color: "#94A3B8" }}>
                    Almacenada en <code>out/sap/ordenes.jsonl</code>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "#64748B" }}>
                Aún no hay órdenes registradas en el almacenamiento persistente de SAP (`out/sap/`).
              </p>
            )}
          </div>

          {/* Footer del sidebar */}
          <div style={{ marginTop: "auto", fontSize: "0.75rem", color: "#94A3B8", textAlign: "center", padding: "10px 0" }}>
            Perxia 2.0 · Periferia IT Group
            <br />
            Reto Técnico 03
          </div>
        </aside>

        {/* ─── Área Principal: Feed del Chat & Barra de Entrada ─── */}
        <main style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden", background: "#F8FAFC" }}>
          
          {/* Feed de Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: m.role === "user" ? "82%" : "88%",
                }}
              >
                {m.role === "assistant" && (
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "10px",
                      background: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={18} color="#15601D" />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "100%" }}>
                  {/* Acordeón de Tool Calls */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "2px" }}>
                      {m.toolCalls.map((tc, idx) => {
                        const toolKey = `${m.id}_${idx}`;
                        const isOpen = Boolean(openTools[toolKey]);
                        return (
                          <div
                            key={idx}
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              borderRadius: "8px",
                              overflow: "hidden",
                              fontSize: "0.8rem",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                            }}
                          >
                            <button
                              onClick={() => toggleToolOpen(toolKey)}
                              style={{
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                padding: "6px 12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                color: "#15601D",
                                cursor: "pointer",
                                textAlign: "left",
                                fontFamily: "var(--font-b)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Database size={13} color="#15601D" />
                                <span style={{ fontWeight: 600 }}>Herramienta: {tc.name}</span>
                                <span style={{ color: "#64748B", fontSize: "0.75rem" }}>
                                  ({tc.args?.caso || "ejecutado"})
                                </span>
                              </div>
                              {isOpen ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#64748B" />}
                            </button>

                            {isOpen && (
                              <div
                                style={{
                                  padding: "8px 12px",
                                  borderTop: "1px solid #E2E8F0",
                                  background: "#0F172A",
                                  color: "#F8FAFC",
                                  fontFamily: "monospace",
                                  fontSize: "0.74rem",
                                  maxHeight: "180px",
                                  overflowY: "auto",
                                }}
                              >
                                <div style={{ color: "#94A3B8", marginBottom: "4px" }}>Parámetros:</div>
                                <pre style={{ color: "#67E8F9", whiteSpace: "pre-wrap" }}>
                                  {JSON.stringify(tc.args, null, 2)}
                                </pre>
                                <div style={{ color: "#94A3B8", marginTop: "6px", marginBottom: "4px" }}>Resultado:</div>
                                <pre style={{ color: "#86EFAC", whiteSpace: "pre-wrap" }}>
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
                      background: m.role === "user" ? "#15601D" : "#FFFFFF",
                      border: `1px solid ${m.role === "user" ? "#15601D" : "#E2E8F0"}`,
                      borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "14px 18px",
                      color: m.role === "user" ? "#FFFFFF" : "#0F172A",
                      boxShadow: m.role === "user" ? "0 2px 6px rgba(21,96,29,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div className="markdown-body" style={{ color: m.role === "user" ? "#FFFFFF" : "inherit" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>

                    {/* Banner de Confirmación Humana */}
                    {m.needsConfirmation && (
                      <div
                        style={{
                          marginTop: "14px",
                          background: "#FFFBEB",
                          border: "1px solid #FCD34D",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#92400E", fontWeight: 700, fontSize: "0.88rem" }}>
                          <AlertTriangle size={17} />
                          <span>Punto de Control Humano Requerido (Regla CA3)</span>
                        </div>
                        <p style={{ fontSize: "0.82rem", color: "#78350F" }}>
                          El agente ha detenido el flujo para salvaguardar el proceso. Para emitir la OC en SAP debes confirmar explícitamente las excepciones reportadas.
                        </p>
                        <div style={{ display: "flex", gap: "10px", marginTop: "2px" }}>
                          <button
                            onClick={handleConfirmAction}
                            disabled={isLoading}
                            style={{
                              background: "#15601D",
                              border: "none",
                              color: "#FFFFFF",
                              padding: "7px 14px",
                              borderRadius: "8px",
                              fontWeight: 600,
                              fontSize: "0.82rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              boxShadow: "0 2px 5px rgba(21,96,29,0.25)",
                              transition: "all 0.2s",
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = "#0E4414")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "#15601D")}
                          >
                            <CheckCircle2 size={15} />
                            Confirmar y Crear OC en SAP
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#94A3B8",
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      padding: "0 4px",
                    }}
                  >
                    {m.timestamp}
                  </span>
                </div>

                {m.role === "user" && (
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "10px",
                      background: "#E2E8F0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <User size={18} color="#475569" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ display: "flex", gap: "12px", alignItems: "center", alignSelf: "flex-start" }}>
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "10px",
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bot size={18} color="#15601D" />
                </div>
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "16px 16px 16px 4px",
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <span style={{ fontSize: "0.82rem", color: "#64748B" }}>El agente está evaluando reglas de control</span>
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

          {/* ─── Casos Rápidos y Barra de Entrada al Final del Chat ─── */}
          <div
            style={{
              background: "#FFFFFF",
              borderTop: "1px solid #E2E8F0",
              padding: "10px 20px 16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Casos Rápidos encima del input (sin texto entre paréntesis) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                overflowX: "auto",
                whiteSpace: "nowrap",
                paddingBottom: "4px",
              }}
            >
              <span style={{ fontSize: "0.76rem", color: "#64748B", fontWeight: 600, marginRight: "4px" }}>
                Casos rápidos:
              </span>
              {quickCases.map((qc, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(qc.prompt)}
                  disabled={isLoading}
                  style={{
                    background: "#F8FAFC",
                    border: "1px solid #CBD5E1",
                    color: "#334155",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: isLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.borderColor = "#15601D";
                      e.currentTarget.style.color = "#15601D";
                      e.currentTarget.style.background = "#ECFDF5";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.borderColor = "#CBD5E1";
                      e.currentTarget.style.color = "#334155";
                      e.currentTarget.style.background = "#F8FAFC";
                    }
                  }}
                >
                  <Sparkles size={11} color="#15601D" />
                  {qc.label}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: "flex",
                gap: "8px",
                background: "#F8FAFC",
                border: "1px solid #CBD5E1",
                borderRadius: "12px",
                padding: "6px 8px 6px 14px",
                alignItems: "center",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#15601D")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#CBD5E1")}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu consulta o indica una solicitud (ej. 'procesa sol-004')..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#0F172A",
                  fontFamily: "var(--font-b)",
                  fontSize: "0.9rem",
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                style={{
                  background: input.trim() && !isLoading ? "#15601D" : "#E2E8F0",
                  color: input.trim() && !isLoading ? "#FFFFFF" : "#94A3B8",
                  border: "none",
                  borderRadius: "8px",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
