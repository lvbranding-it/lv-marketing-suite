import type { ReactNode } from "react";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * How the canvas works, inside the canvas.
 *
 * The rules here are not discoverable by looking at the screen: an arrow points
 * somewhere for a reason, and a tick box closes a whole branch rather than one
 * card. Written for whoever is using Canvas rather than for whoever built it, so
 * it names what people see — cards, arrows, ticks — and not nodes or edges.
 */

/** Card types that own real artwork, which is what makes them exportable. */
const CARD_TYPES: Array<{ label: string; artwork?: boolean }> = [
  { label: "Text" }, { label: "Reference", artwork: true }, { label: "Image", artwork: true },
  { label: "Brand" }, { label: "Direction" }, { label: "Palette" }, { label: "Type" },
  { label: "AI chat" }, { label: "Decision" }, { label: "Export frame" }, { label: "Generation", artwork: true },
];

const EXPORT_RULES: Array<[string, string]> = [
  ["One piece of artwork", "One PNG, or a one-page PDF"],
  ["Several pieces", "A ZIP of PNGs, or a PDF with one page each"],
  ["A frame", "One composed image of everything inside it"],
  ["A mix of artwork and text", "One composed image"],
];

const LIMITS: Array<[string, string]> = [
  ["3", "cards back, at most"],
  ["12", "cards of context"],
  ["4", "reference images per request"],
];

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
    {children}
  </section>
);

export default function CanvasHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle size={17} className="text-[#CB2039]" />How nodes work
          </DialogTitle>
          <DialogDescription>
            Cards hold the work. Arrows tell the AI how the work relates. That is the whole system.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mr-4 max-h-[62vh] pr-4">
          <div className="space-y-6 py-5 text-sm leading-relaxed text-muted-foreground">

            <Section title="Everything on the canvas is a card">
              <p>A headline, a photo, a colour palette, an AI reply — all the same kind of object. Only the label changes.</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CARD_TYPES.map((card) => (
                  <span key={card.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${card.artwork ? "border-border text-foreground" : "border-border/60"}`}>
                    {card.artwork && <span className="h-1.5 w-1.5 rounded-full bg-[#CB2039]" />}
                    {card.label}
                  </span>
                ))}
              </div>
              <p className="pt-1">The marked ones hold a real picture. Those are the cards you can export, and the only ones that travel to the AI as a visual reference. The rest are words.</p>
            </Section>

            <Section title="An arrow means “this informs that”">
              <p>Drag from the right edge of one card to the left edge of another. The arrow points at the thing being informed.</p>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground">Direction</p>
                  <p className="truncate text-[13px] font-medium text-foreground">Warm, low light</p>
                </div>
                <div className="flex flex-col items-center text-[#CB2039]">
                  <span className="text-[10px] italic leading-none">informs</span>
                  <ArrowRight size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground">Image</p>
                  <p className="truncate text-[13px] font-medium text-foreground">Product shot</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium text-foreground">Select <span className="text-[#CB2039]">Product shot</span></p>
                  <p className="mt-1 text-xs">The direction comes along on its own. You get the product, made the way the direction says.</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium text-foreground">Select <span className="text-[#CB2039]">Warm, low light</span></p>
                  <p className="mt-1 text-xs">Nothing comes along. You are asking about the direction itself, so what it informs is not context.</p>
                </div>
              </div>
              <p>Arrows only travel backwards, never forwards. Before you spend anything, the AI bar says what it picked up — <strong className="font-medium text-foreground">“2 selected · 1 connected”</strong>.</p>
            </Section>

            <Section title="An arrow can mean “then” instead">
              <p>
                Click any arrow and the panel on the right offers two meanings. <strong className="font-medium text-foreground">Informs</strong>
                {" "}is the one above. <strong className="font-medium text-foreground">Then</strong> says <em>this comes before that</em> — slide 1
                to slide 2 of a carousel, or the beats of a campaign. Those arrows are drawn in red and dashed.
              </p>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-[#CB2039]">
                <li>A <strong className="font-medium text-foreground">Then</strong> arrow never travels as direction. The first slide is not a brief for the second.</li>
                <li>The AI is told where a card falls — <em>step 2 of 4, following “Hook”</em> — so it continues the story instead of restating it.</li>
                <li>Chain a whole carousel and export it: the files are numbered in that order, whatever the layout looks like.</li>
              </ul>
              <p className="text-xs">Ordering needs one unbroken chain through everything you selected. A fork, a gap or a loop falls back to canvas position rather than guessing.</p>
            </Section>

            <Section title="Selected is the subject. Connected is the direction.">
              <p>
                What you selected is <em>what the work is about</em>. What is connected to it is <em>how the work should be done</em>.
                The AI is told which is which, in those words — which is why attaching a mood board makes the result look like the
                mood board, instead of producing a picture of a mood board.
              </p>
            </Section>

            <Section title="The tick box mutes a whole branch">
              <p>
                Untick <strong className="font-medium text-foreground">Include in AI context</strong> on a card and everything behind
                it stops flowing through as well — it closes the path rather than skipping one card. It applies to pictures too: an
                unticked photo is not sent. Use it to try something without a chain, instead of deleting the chain.
              </p>
            </Section>

            <Section title="Frames group. Arrows mean.">
              <p>Select a few cards and group them: they get a frame, move together, and export as one piece. Frames are about layout, arrows are about meaning, and the two never interfere.</p>
            </Section>

            <Section title="A series is the same arrows, multiplied">
              <p>
                Choose your directions across and your subjects down, and Canvas makes every combination. Each post is a normal,
                separate generation with its own cost and its own retry, placed where its cell sits in the grid. If one fails the
                others are untouched — the failed one leaves a marker in its slot so the grid never collapses.
              </p>
            </Section>

            <Section title="What export gives you">
              <dl className="divide-y rounded-lg border">
                {EXPORT_RULES.map(([selected, result]) => (
                  <div key={selected} className="flex flex-wrap gap-x-4 gap-y-0.5 px-3 py-2.5">
                    <dt className="min-w-[9.5rem] text-xs font-medium text-foreground">{selected}</dt>
                    <dd className="flex-1 text-xs">{result}</dd>
                  </div>
                ))}
              </dl>
              <p>Files are numbered 01, 02, 03 so a set stays in order once it is unzipped. A complete chain of <strong className="font-medium text-foreground">Then</strong> arrows sets that order; otherwise it is reading order — across each row, then down. Pick the delivery size first and artwork is rendered at exactly those pixels.</p>
            </Section>

            <Section title="Worth knowing">
              <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg bg-[#CB2039]/[.07] px-4 py-3">
                {LIMITS.map(([value, meaning]) => (
                  <div key={meaning}>
                    <span className="block text-lg font-semibold tabular-nums leading-tight text-foreground">{value}</span>
                    <span className="text-xs">{meaning}</span>
                  </div>
                ))}
              </div>
              <p>When more than four pictures are in play, the ones you selected take priority over the ones that arrived through an arrow.</p>
            </Section>

            <Section title="Habits that pay off">
              <ul className="list-disc space-y-1.5 pl-5 marker:text-[#CB2039]">
                <li>Point directions <em>at</em> subjects, not the other way round.</li>
                <li>Keep brand and direction cards upstream — one arrow into a direction feeds everything downstream of it.</li>
                <li>Untick rather than delete when you want to test without something.</li>
                <li>Group before exporting a layout. Leave cards loose when you want separate files.</li>
              </ul>
            </Section>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
