"use client";

import * as React from "react";

/**
 * Run `onChange` during render when `value` changes (React's recommended
 * alternative to resetting state in an effect — no extra render pass).
 * `onChange` may only update this component's own state.
 */
export function useOnChange<T>(value: T, onChange: (value: T) => void) {
  const [prev, setPrev] = React.useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    onChange(value);
  }
}

/** Reset form state each time a dialog opens. */
export function useOnOpen(open: boolean, onOpen: () => void) {
  useOnChange(open, (o) => {
    if (o) onOpen();
  });
}
