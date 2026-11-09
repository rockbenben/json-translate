"use client";

import { AutoComplete, Input, type InputProps } from "antd";
import { splitTopLevelCommas } from "@/app/utils/jsonPathUtils";

type Props = Omit<InputProps, "value" | "onChange"> & {
  value?: string;
  onChange?: (value: string) => void;
  suggestions: string[];
  multiple?: boolean;
};

/** Suggestions complete the current field; comma-separated paths retain earlier selections. */
export default function JSONFieldInput({ value = "", onChange, suggestions, multiple = false, ...inputProps }: Props) {
  const parts = multiple ? splitTopLevelCommas(value) : [value];
  const query = (parts.pop() ?? "").trim();
  const previous = parts.map((part) => part.trim()).filter(Boolean);
  const options = suggestions
    .filter((option) => !previous.includes(option) && option.toLowerCase().includes(query.toLowerCase()))
    .map((option) => ({ label: option, value: [...previous, option].join(",") }));

  return (
    <AutoComplete
      value={value}
      onChange={onChange}
      options={options}
      disabled={inputProps.disabled}
      className="w-full min-w-0"
      styles={{ popup: { listItem: { whiteSpace: "normal", overflowWrap: "anywhere" } } }}>
      <Input {...inputProps} spellCheck={false} autoCorrect="off" autoCapitalize="off" />
    </AutoComplete>
  );
}
