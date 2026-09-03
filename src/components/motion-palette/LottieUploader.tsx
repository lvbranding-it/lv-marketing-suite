import { useRef, useState } from "react";
import { FileJson2, LockKeyhole, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LottieUploaderProps {
  onFile: (file: File) => void;
  compact?: boolean;
  disabled?: boolean;
}

export default function LottieUploader({ onFile, compact = false, disabled = false }: LottieUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const choose = () => inputRef.current?.click();
  const accept = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(event) => {
            accept(event.target.files);
            event.target.value = "";
          }}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={choose}
          disabled={disabled}
          className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        >
          <Upload aria-hidden="true" />
          Replace animation
        </Button>
      </>
    );
  }

  return (
    <div
      className={cn(
        "group flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
        dragging
          ? "border-[#CB2039] bg-[#CB2039]/10"
          : "border-white/20 bg-[#181717] hover:border-white/35 hover:bg-[#1b1a1a]",
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        accept(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
        disabled={disabled}
      />
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/80 shadow-sm transition-transform group-hover:-translate-y-0.5">
        <FileJson2 className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-lg font-semibold text-white">Drop a Lottie JSON here</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">
        Choose a Bodymovin <span className="font-medium text-white/70">.json</span> file up to 10 MB.
        Your animation stays in this browser.
      </p>
      <Button type="button" className="mt-6 bg-[#CB2039] hover:bg-[#b51c33]" onClick={choose} disabled={disabled}>
        <Upload aria-hidden="true" />
        Choose animation
      </Button>
      <div className="mt-5 flex items-center gap-2 text-xs text-white/35">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        Local processing · Nothing is uploaded
      </div>
    </div>
  );
}
