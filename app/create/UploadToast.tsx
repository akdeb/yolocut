"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type UploadToastState = {
  status: "loading" | "success" | "error";
  title: string;
  description: string;
} | null;

type UploadToastProps = {
  toast: UploadToastState;
};

export const UploadToast = ({ toast }: UploadToastProps) => {
  if (!toast) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-neutral-200 bg-white p-4 text-neutral-950 shadow-lg">
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {toast.status === "loading" ? (
            <Loader2 className="size-5 animate-spin text-neutral-500" />
          ) : toast.status === "success" ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <AlertCircle className="size-5 text-red-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="m-0 text-sm font-bold font-playfair text-neutral-950">{toast.title}</p>
          <p className="m-0 mt-1 text-xs leading-5 text-neutral-600">{toast.description}</p>
        </div>
      </div>
    </div>
  );
};
