import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";

interface Props {
  questions: string[];
  onSubmit: (formattedAnswers: string) => void;
  disabled?: boolean;
}

/**
 * Renders agent discovery questions as individual labeled input fields
 * instead of requiring free-text in the main textarea.
 */
export default function DiscoveryForm({ questions, onSubmit, disabled }: Props) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));

  const handleChange = (idx: number, value: string) => {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  };

  const handleSubmit = () => {
    const formatted = questions
      .map((q, i) => `${i + 1}. ${answers[i].trim() || "(no answer)"}`)
      .join("\n");
    onSubmit(formatted);
  };

  const hasAnyAnswer = answers.some((a) => a.trim().length > 0);

  return (
    <div className="space-y-3 mt-4 p-3 rounded-lg border border-rose-100 bg-rose-50/40">
      <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide">
        Answer the questions below
      </p>
      {questions.map((q, i) => (
        <div key={i} className="space-y-1">
          <Label className="text-xs text-gray-700 font-medium">
            {i + 1}. {q}
          </Label>
          <Input
            value={answers[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            placeholder="Your answer…"
            className="h-8 text-sm"
            disabled={disabled}
          />
        </div>
      ))}
      <Button
        size="sm"
        className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
        onClick={handleSubmit}
        disabled={disabled || !hasAnyAnswer}
      >
        <Send className="h-3 w-3" /> Submit Answers
      </Button>
    </div>
  );
}
