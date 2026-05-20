import { cn } from "./utils";

/** Asana-style solid tag colors (white text on saturated background). */
export const CREATOR_TAG_COLORS = [
  "bg-purple-500 text-white",
  "bg-orange-500 text-white",
  "bg-red-500 text-white",
  "bg-yellow-500 text-white",
  "bg-green-500 text-white",
  "bg-blue-500 text-white",
  "bg-pink-500 text-white",
  "bg-gray-500 text-white",
  "bg-blue-500 text-white",
  "bg-pink-500 text-white",
  "bg-gray-500 text-white",
  "bg-green-500 text-white",
] as const;

const hashCreator = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash ^= index + 1;
  }

  hash ^= value.charCodeAt(0) << 11;

  if (value.length > 1) {
    hash ^= value.charCodeAt(value.length - 1) << 19;
  }

  hash ^= value.length << 5;

  return (hash >>> 0) % CREATOR_TAG_COLORS.length;
};

export const getCreatorTagClassName = (name: string) => {
  const normalized = name.trim().toLowerCase();

  if (!normalized) {
    return "bg-neutral-400 text-white";
  }

  return CREATOR_TAG_COLORS[hashCreator(normalized)];
};

export const creatorPillClassName = (name: string, className?: string) =>
  cn(
    "inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium",
    getCreatorTagClassName(name),
    className,
  );
