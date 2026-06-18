import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Download, FileText, FileType } from "lucide-react";

// Export the open note — Save as PDF (native print pipeline) or Save as Word
// (.docx, real editable OOXML).
export function ExportMenu({
  onPdf,
  onDocx,
  disabled,
}: {
  onPdf: () => void;
  onDocx: () => void;
  disabled?: boolean;
}) {
  const item =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-is-text-secondary outline-none data-[highlighted]:bg-is-surface-alt data-[highlighted]:text-is-text";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Export note"
          title="Export"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <Download size={14} strokeWidth={1.333} aria-hidden="true" />
          Export
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[11rem] rounded-lg border border-is-border bg-is-surface p-1 shadow-md"
        >
          <DropdownMenu.Item className={item} onSelect={onPdf}>
            <FileText size={15} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            Save as PDF
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onDocx}>
            <FileType size={15} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            Save as Word (.docx)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
