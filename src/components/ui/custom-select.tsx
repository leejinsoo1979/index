import { Select } from "radix-ui";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import "./custom-select.css";

export type CustomSelectOption = { value: string; label?: string };

type Props = {
  options: CustomSelectOption[] | string[];
  /** Form field name — a hidden native select is rendered so FormData picks it up. */
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** 프로젝트 공용 드롭다운. 네이티브 <select> 대신 항상 이 컴포넌트를 사용한다. */
export function CustomSelect({
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "선택",
  disabled,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Select.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger className={`cselect__trigger${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="cselect__icon">
          <ChevronDownIcon size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="cselect__content" position="popper" sideOffset={6}>
          <Select.Viewport className="cselect__viewport">
            {items.map((it) => (
              <Select.Item key={it.value} value={it.value} className="cselect__item">
                <Select.ItemText>{it.label ?? it.value}</Select.ItemText>
                <Select.ItemIndicator className="cselect__check">
                  <CheckIcon size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
