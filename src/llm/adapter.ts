export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
  name?: string;
}

export interface LlmResponse {
  text?: string;
  toolCalls?: ToolCallRequest[];
  raw?: any;
}

export interface LlmAdapter {
  enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<LlmResponse>;
}
