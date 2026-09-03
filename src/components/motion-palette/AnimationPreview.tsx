import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light";

export interface AnimationPreviewHandle {
  restart: () => void;
  seek: (frame: number) => void;
}

interface AnimationPreviewProps {
  animationData: Record<string, unknown>;
  playing: boolean;
  loop: boolean;
  speed: number;
  background: string;
  transparent: boolean;
  onFrameChange: (frame: number) => void;
  onPlaybackChange: (playing: boolean) => void;
  onRenderError: (message: string | null) => void;
}

/**
 * Remove expression source and raster payloads before handing an uploaded
 * document to the renderer. The light Lottie build does not include the
 * expression runtime; stripping expression strings is an additional guard.
 */
function makePreviewSafe(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const safeItems = parentKey === "assets"
      ? value.filter((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof (item as Record<string, unknown>).p !== "string")
      : parentKey === "layers"
        ? value.filter((item) => !item || typeof item !== "object" || Array.isArray(item) || (item as Record<string, unknown>).ty !== 2)
        : value;
    return safeItems.map((item) => makePreviewSafe(item));
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === "x" && typeof child === "string") continue;
    result[key] = makePreviewSafe(child, key);
  }
  return result;
}

const AnimationPreview = forwardRef<AnimationPreviewHandle, AnimationPreviewProps>(
  function AnimationPreview(
    {
      animationData,
      playing,
      loop,
      speed,
      background,
      transparent,
      onFrameChange,
      onPlaybackChange,
      onRenderError,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<AnimationItem | null>(null);
    const lastFrameRef = useRef(0);
    const playingRef = useRef(playing);

    playingRef.current = playing;

    useImperativeHandle(ref, () => ({
      restart() {
        const animation = animationRef.current;
        if (!animation) return;
        animation.goToAndStop(0, true);
        lastFrameRef.current = 0;
        onFrameChange(0);
        if (playingRef.current) animation.play();
      },
      seek(frame: number) {
        const animation = animationRef.current;
        if (!animation) return;
        animation.goToAndStop(frame, true);
        lastFrameRef.current = frame;
        onFrameChange(frame);
        if (playingRef.current) animation.play();
      },
    }), [onFrameChange]);

    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let animation: AnimationItem | null = null;
      let disposed = false;
      const retainedFrame = lastFrameRef.current;
      onRenderError(null);

      try {
        const safeData = makePreviewSafe(structuredClone(animationData));
        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop,
          autoplay: false,
          animationData: safeData,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
            progressiveLoad: false,
            title: "Animation preview",
            description: "Locally rendered Lottie animation",
            focusable: false,
          },
        });
        animationRef.current = animation;
        animation.setSpeed(speed);

        const onReady = () => {
          if (disposed || !animation) return;
          const maxFrame = Math.max(0, animation.totalFrames - 1);
          const nextFrame = Math.min(retainedFrame, maxFrame);
          animation.goToAndStop(nextFrame, true);
          if (playingRef.current) animation.play();
        };
        const onEnterFrame = (event: { currentTime: number }) => {
          lastFrameRef.current = event.currentTime;
          onFrameChange(event.currentTime);
        };
        const onComplete = () => {
          if (!loop) onPlaybackChange(false);
        };
        const onError = () => {
          onRenderError("This file parsed correctly, but the preview renderer could not display it.");
        };

        animation.addEventListener("DOMLoaded", onReady);
        animation.addEventListener("enterFrame", onEnterFrame);
        animation.addEventListener("complete", onComplete);
        animation.addEventListener("error", onError);
        animation.addEventListener("data_failed", onError);
      } catch (error) {
        onRenderError(error instanceof Error ? error.message : "Unable to render this animation.");
      }

      return () => {
        disposed = true;
        if (animationRef.current === animation) animationRef.current = null;
        animation?.destroy();
        container.replaceChildren();
      };
    }, [animationData]);

    useEffect(() => {
      const animation = animationRef.current;
      if (!animation) return;
      if (playing) animation.play();
      else animation.pause();
    }, [playing]);

    useEffect(() => {
      animationRef.current?.setLoop(loop);
    }, [loop]);

    useEffect(() => {
      animationRef.current?.setSpeed(speed);
    }, [speed]);

    const checkerboard = transparent
      ? {
          backgroundColor: "#f5f5f5",
          backgroundImage:
            "conic-gradient(#dedede 25%, #f5f5f5 0 50%, #dedede 0 75%, #f5f5f5 0)",
          backgroundSize: "24px 24px",
        }
      : { backgroundColor: background };

    return (
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
        style={checkerboard}
      >
        <div
          ref={containerRef}
          className="h-full min-h-[280px] w-full p-5 sm:min-h-[420px] sm:p-8 lg:min-h-[520px] [&>svg]:!h-full [&>svg]:!w-full"
          aria-label="Lottie animation preview"
        />
      </div>
    );
  },
);

export default AnimationPreview;
