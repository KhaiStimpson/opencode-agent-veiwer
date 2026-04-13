import type {
  Session,
  SessionStatus,
  Message,
  Part,
  Todo,
  Event,
} from "@opencode-ai/sdk";

export type { Session, SessionStatus, Message, Part, Todo, Event };

export interface SessionNode {
  session: Session;
  status: SessionStatus;
  children: SessionNode[];
}

export interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  serverUrl: string;
  version?: string;
  error?: string;
}

export type SessionStatusMap = Record<string, SessionStatus>;
