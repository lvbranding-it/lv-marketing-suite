import { useState, useCallback } from "react";
import { runSkillStream, type Message } from "@/lib/claude";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useOrg } from "./useOrg";
import type { Skill } from "@/data/skills";

interface SkillRunnerState {
  streaming: boolean;
  streamedText: string;
  conversationHistory: Message[];
  error: string | null;
}

export function useSkillRunner() {
  const { user } = useAuth();
  const { org } = useOrg();

  const [state, setState] = useState<SkillRunnerState>({
    streaming: false,
    streamedText: "",
    conversationHistory: [],
    error: null,
  });

  const run = useCallback(
    async (
      userMessage: string,
      skill: Skill,
      marketingContext?: Record<string, unknown>
    ) => {
      setState((prev) => ({
        ...prev,
        streaming: true,
        error: null,
      }));

      await runSkillStream(
        {
          skillSystemPrompt: skill.systemPrompt,
          userMessage,
          conversationHistory: state.conversationHistory,
          marketingContext,
        },
        {
          onToken: (token) => {
            setState((prev) => ({
              ...prev,
              streamedText: prev.streamedText + token,
            }));
          },
          onComplete: (fullText) => {
            setState((prev) => ({
              ...prev,
              streaming: false,
              conversationHistory: [
                ...prev.conversationHistory,
                { role: "user", content: userMessage },
                { role: "assistant", content: fullText },
              ],
              streamedText: "",
            }));
          },
          onError: (error) => {
            setState((prev) => ({
              ...prev,
              streaming: false,
              error: error.message,
            }));
          },
        }
      );
    },
    [state.conversationHistory]
  );

  const saveOutput = useCallback(
    async (
      skill: Skill,
      inputData: Record<string, string>,
      outputText: string,
      title: string,
      projectId?: string
    ) => {
      if (!user || !org) throw new Error("Not authenticated");

      const { error } = await supabase.from("skill_outputs").insert({
        org_id: org.id,
        project_id: projectId ?? null,
        user_id: user.id,
        skill_id: skill.id,
        skill_name: skill.name,
        input_data: inputData,
        output_text: outputText,
        title: title || null,
      });

      if (error) throw error;
    },
    [user, org]
  );

  const reset = useCallback(() => {
    setState({
      streaming: false,
      streamedText: "",
      conversationHistory: [],
      error: null,
    });
  }, []);

  // Full output = completed conversation turns + currently streaming text
  const currentOutput =
    state.conversationHistory.length > 0
      ? state.conversationHistory[state.conversationHistory.length - 1]?.content ?? ""
      : "";

  return {
    streaming: state.streaming,
    streamedText: state.streamedText,
    conversationHistory: state.conversationHistory,
    currentOutput,
    error: state.error,
    run,
    saveOutput,
    reset,
  };
}
