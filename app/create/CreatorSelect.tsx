"use client";

type CreatorSelectProps = {
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export const CreatorSelect = ({
  value,
  options,
  disabled,
  onChange,
}: CreatorSelectProps) => {
  return (
    <label className="flex h-10 min-w-0 items-center gap-2 rounded-[14px] border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-500 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
      <span className="shrink-0 text-sm font-playfair">Creator</span>
      <input
        className="h-full w-30 min-w-0 border-0 bg-transparent text-sm font-normal text-neutral-950 outline-none placeholder:text-neutral-300"
        disabled={disabled}
        list="gruns-creators"
        value={value}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        placeholder="name"
      />
      <datalist id="gruns-creators">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
};
