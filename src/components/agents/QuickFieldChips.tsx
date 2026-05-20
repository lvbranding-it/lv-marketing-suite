import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const FIELD_LABELS: Record<string, string> = {
  prospect_name:         "Prospect Name",
  website_url:           "Website URL",
  client_brand:          "Client / Brand",
  need_right_now:        "Need Right Now",
  goal:                  "Goal",
  what_they_want:        "What They Want",
  scope_or_deliverables: "Scope / Deliverables",
  deliverables:          "Deliverables",
  raw_notes:             "Raw Notes / Updates",
};

interface Props {
  fields: string[];
  onSubmit: (text: string) => void;
}

/**
 * Shows labeled mini-inputs for an agent's required fields
 * above the chat textarea on the first message.
 */
export default function QuickFieldChips({ fields, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  if (fields.length === 0) return null;

  const handleChange = (field: string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const filled = fields
        .filter((f) => values[f]?.trim())
        .map((f) => `${FIELD_LABELS[f] || f}: ${values[f].trim()}`);
      if (filled.length > 0) onSubmit(filled.join("\n"));
    }
  };

  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] shrink-0 h-6 text-gray-600 border-gray-300">
            {FIELD_LABELS[field] || field}
          </Badge>
          <Input
            value={values[field] || ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={FIELD_LABELS[field] || field}
            className="h-7 text-xs w-[140px]"
          />
        </div>
      ))}
    </div>
  );
}
