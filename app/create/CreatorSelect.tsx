"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/components/ui/popover";
import { creatorPillClassName } from "../../src/lib/creator-tag";
import { cn } from "../../src/lib/utils";

type CreatorSelectProps = {
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

const normalizeCreator = (nextValue: string) => nextValue.trim().toLowerCase();

const CreatorPill = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => <span className={creatorPillClassName(name, className)}>{name}</span>;

export const CreatorSelect = ({
  value,
  options,
  disabled,
  onChange,
}: CreatorSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedOptions = useMemo(() => options.map(normalizeCreator), [options]);
  const normalizedSearch = normalizeCreator(search);
  const canCreate = normalizedSearch.length > 0 && !normalizedOptions.includes(normalizedSearch);
  const selectedValue = normalizeCreator(value);

  const selectCreator = (nextValue: string) => {
    const normalizedValue = normalizeCreator(nextValue);

    if (!normalizedValue) {
      return;
    }

    onChange(normalizedValue);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 min-w-[180px] justify-between gap-2 rounded-[14px] px-2.5 shadow-sm font-sans"
          disabled={disabled}
          aria-expanded={open}
          aria-label="Select creator"
        >
          <span className="font-playfair text-sm font-semibold text-neutral-500">Creator</span>
          {selectedValue ? (
            <CreatorPill name={selectedValue} className="min-w-0 max-w-32 py-0.5" />
          ) : (
            <span className="rounded-full bg-neutral-400 px-2 py-0.5 text-xs font-semibold text-white">
              select
            </span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-neutral-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-52 p-0" align="end">
        <Command shouldFilter>
          <CommandInput
            value={search}
            onValueChange={(nextValue) => setSearch(nextValue.toLowerCase())}
            placeholder="Search or type creator..."
          />
          <CommandList>
            <CommandEmpty>No creator found.</CommandEmpty>
            <CommandGroup heading="Creators">
              {normalizedOptions.map((option) => {
                const isSelected = selectedValue === option;

                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => selectCreator(option)}
                  >
                    <CreatorPill name={option} />
                    <Check
                      className={cn(
                        "ml-auto size-4 text-emerald-600",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {canCreate ? (
              <CommandGroup>
                <CommandItem value={normalizedSearch} onSelect={() => selectCreator(normalizedSearch)}>
                  <Plus className="mr-2 size-4 text-neutral-500" />
                  Add
                  <CreatorPill name={normalizedSearch} className="ml-2" />
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
