import { useState, useCallback } from "react";
import { runSkillStream } from "@/lib/claude";
import { useAuth } from "./useAuth";
import { useOrg } from "./useOrg";
import { supabase } from "@/integrations/supabase/client";
import type { DesignType } from "@/data/designTypes";

interface DesignRunnerState {
  streaming: boolean;
  streamedText: string;
  generatedHtml: string;
  error: string | null;
}

export function useDesignRunner() {
  const { user } = useAuth();
  const { org } = useOrg();

  const [state, setState] = useState<DesignRunnerState>({
    streaming: false,
    streamedText: "",
    generatedHtml: "",
    error: null,
  });

  const generate = useCallback(
    async (userMessage: string, designType: DesignType) => {
      setState({ streaming: true, streamedText: "", generatedHtml: "", error: null });

      await runSkillStream(
        {
          skillSystemPrompt: designType.systemPrompt,
          userMessage,
        },
        {
          onToken: (token) => {
            setState((prev) => ({ ...prev, streamedText: prev.streamedText + token }));
          },
          onComplete: (fullText) => {
            setState({ streaming: false, streamedText: "", generatedHtml: fullText, error: null });
          },
          onError: (error) => {
            setState((prev) => ({ ...prev, streaming: false, error: error.message }));
          },
        }
      );
    },
    []
  );

  const saveOutput = useCallback(
    async (
      designType: DesignType,
      prompt: string,
      htmlOutput: string,
      title: string
    ) => {
      if (!user || !org) throw new Error("Not authenticated");

      const { error } = await supabase.from("design_outputs").insert({
        org_id: org.id,
        user_id: user.id,
        design_type_id: designType.id,
        design_type_name: designType.name,
        prompt,
        html_output: htmlOutput,
        title: title || null,
        is_starred: false,
      });

      if (error) throw error;
    },
    [user, org]
  );

  const reset = useCallback(() => {
    setState({ streaming: false, streamedText: "", generatedHtml: "", error: null });
  }, []);

  const currentHtml = state.generatedHtml || state.streamedText;

  return {
    streaming: state.streaming,
    streamedText: state.streamedText,
    generatedHtml: state.generatedHtml,
    currentHtml,
    error: state.error,
    generate,
    saveOutput,
    reset,
  };
}
