"use client";

import { useState } from "react";
import { Check, ICON_PROPS, Link2 } from "../../../../components/ui/icons";

/**
 * Copies the session page's address. That page is membership-gated, so the
 * link is only useful to someone already in the room — it's a convenience for
 * pasting into a family WhatsApp group, not an invitation that grants access.
 */
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions);
      // there's nothing useful to show beyond not flipping to "copied".
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Link copied" : "Copy class link"}
      title={copied ? "Copied" : "Copy class link"}
      className="rounded-lg p-2 text-slate hover:bg-parchment hover:text-ink"
    >
      {copied ? (
        <Check {...ICON_PROPS} aria-hidden="true" />
      ) : (
        <Link2 {...ICON_PROPS} aria-hidden="true" />
      )}
    </button>
  );
}
