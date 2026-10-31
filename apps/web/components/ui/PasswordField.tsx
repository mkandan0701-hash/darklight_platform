"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "./icons";
import { fieldInputLgClass } from "./Field";

/**
 * A password input with a show/hide toggle. Render it inside
 * `<Field id={...}>` and pass the same `id` here.
 *
 * Stays an ordinary <input name=... autocomplete=...> inside the form so
 * password managers recognise it; only `type` flips. The toggle is
 * type="button" so it can never submit the form, and it sits after the input
 * in tab order, so keyboard users reach the field first.
 */
export function PasswordField({
  id,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        // Spell-check and autocapitalise on a visible password would send it
        // to the OS dictionary service and capitalise the first letter.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${fieldInputLgClass} pr-14 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-1 my-auto flex h-11 w-11 items-center justify-center rounded-lg text-slate transition-colors hover:bg-ink/5 hover:text-ink motion-reduce:transition-none"
      >
        {visible ? (
          <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
