import { useEffect, useRef, useState } from "react";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return money.format(Number.isFinite(value) ? value : 0);
}

function parseCurrency(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return 0;
  }
  const [whole, fraction] = cleaned.split(".");
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return Number(normalized || 0);
}

function caretFromDigitIndex(value: string, digitIndex: number): number {
  if (digitIndex <= 0) {
    return 0;
  }
  let digitsSeen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value[i])) {
      digitsSeen += 1;
      if (digitsSeen >= digitIndex) {
        return i + 1;
      }
    }
  }
  return value.length;
}

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}

export default function CurrencyInput({
  value,
  onChange,
  ariaLabel,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(formatCurrency(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!focused) {
      setDisplay(formatCurrency(value));
    }
  }, [value, focused]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const selection = event.target.selectionStart ?? raw.length;
    const digitsBeforeCursor = raw.slice(0, selection).replace(/\D/g, "").length;
    const parsed = parseCurrency(raw);
    const formatted = formatCurrency(parsed);
    setDisplay(formatted);
    onChange(parsed);

    requestAnimationFrame(() => {
      const nextInput = inputRef.current;
      if (!nextInput) {
        return;
      }
      const nextPos = caretFromDigitIndex(formatted, digitsBeforeCursor);
      nextInput.setSelectionRange(nextPos, nextPos);
    });
  };

  const handleBlur = () => {
    setFocused(false);
    setDisplay(formatCurrency(parseCurrency(display)));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={display}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    />
  );
}
