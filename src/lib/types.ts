export interface Upload {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  contentType: string;
  metadata: unknown | null;
  folder: string | null;
  type: "VIDEO" | "IMAGE" | "AUDIO" | "DOCUMENT" | "OTHER";
  method: "USER" | "API" | "SYSTEM" | "OTHER";
  origin: "USER_CREATED" | "AI_GENERATED" | "UNKNOWN";
  status: "PENDING" | "COMPLETED" | "FAILED";
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  isPreview: boolean;
}
