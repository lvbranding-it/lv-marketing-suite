// ── Spanish narratives ──────────────────────────────────────────────────────────
// The composed prose. Written, not translated: several English sentences lean on
// constructions that read stiffly in Spanish ("Your $1,200 sits below…"), so the
// Spanish says the same thing the way a Spanish speaker would say it, keeping the
// substance and the directness intact.
//
// Nothing here softens a number. If the English tells someone their budget cannot
// run a campaign, the Spanish tells them too.

import {
  CHANNEL_MEDIA_MINIMUM, audienceBandMeta, formatMoney,
} from "../config";
import { esFormatRange } from "./es.ui";
import { esChannels, esObjectives, esReadinessBands, esReadinessItems } from "./es.metadata";
import type { Narratives } from "./narratives";
import type { ChannelKey, Range, ReadinessKey } from "../types";

const money = (n: number) => formatMoney(n);
// Uses the Spanish joiner ("a"), not the config default.
const range = (r: Range) => esFormatRange(r, money);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const canales = (n: number) => `${n} ${plural(n, "canal", "canales")}`;
const num = (n: number) => n.toLocaleString("es-MX");

/** "a, b y c". Spanish uses "y"/"o" and no serial comma. */
function lista(items: string[], conj: "y" | "o" = "y"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Duration phrased the way it reads best: months past 60 days, else days. */
function duracion(days: number): string {
  if (days >= 60) {
    const meses = Math.round(days / 30);
    return `${meses} ${plural(meses, "mes", "meses")}`;
  }
  return `${days} ${plural(days, "día", "días")}`;
}

const canalLabel = (c: ChannelKey) => esChannels[c] ?? c;

export const esNarratives: Narratives = {
  feasibility: (answers, fit) => {
    const lean = fit.minimumViable;
    const full = fit.completeScope;
    const dur = duracion(answers.scope.durationDays);

    if (!fit.applies) {
      return {
        headline: "Esto es lo que costaría tu meta.",
        detail: `Nos dijiste el resultado que quieres, así que trabajamos hacia atrás desde ahí. El alcance completo que seleccionaste se estima en ${range(full.total)}, de los cuales ${range(full.protectedTotal)} son la inversión protegida de campaña que hace que valga la pena comprar los medios.`,
      };
    }

    if (fit.status === "scope-supported") {
      return {
        headline: "Buenas noticias: tu inversión cubre el alcance que seleccionaste.",
        detail: `Alcanza para los ${range(full.total)} estimados para ${canales(fit.selectedChannels)} durante ${dur}. Aun así recorreríamos los detalles contigo antes de que algo salga al aire, porque un plan en papel y un plan en el mercado no son exactamente lo mismo.`,
      };
    }

    if (fit.status === "focused-pilot") {
      return {
        headline: "Puedes empezar con una campaña enfocada en un solo canal.",
        detail: `Una campaña profesional austera ronda los ${range(lean.total)}, mientras que el alcance completo que seleccionaste se acerca a ${range(full.total)}. Empezar enfocado es una forma perfectamente válida de entrar, y el plan de abajo detalla exactamente qué incluye, qué reutiliza y qué queda para después.`,
      };
    }

    if (fit.status === "campaign-preparation") {
      return {
        headline: "Puedes construir la base ahora y activar medios después.",
        detail: `Tu inversión alcanza para el trabajo de base, pero lo que queda todavía no llega a los ${range(lean.media)} que un solo canal necesita durante ${dur} para operar como se debe. Dividir el trabajo en dos fases es una manera sensata de hacerlo bien en lugar de hacerlo a medias.`,
      };
    }

    return {
      headline: "Empecemos por la preparación.",
      detail: `Tus ${money(fit.available)} quedan por debajo de los ${range(lean.total)} que una campaña necesita para correr con responsabilidad, y saberlo ahora es genuinamente útil. Alcanza para financiar un sprint enfocado de estrategia y configuración, que es un primer paso sólido. Para que quede claro: esta fase no incluye pautar anuncios ni entregar una campaña completa. Como referencia, el alcance completo que seleccionaste se estima en ${range(full.total)}.`,
    };
  },

  paths: (answers, fit) => {
    if (!fit.applies || fit.status === "scope-supported") return [];
    const lean = fit.minimumViable;
    const full = fit.completeScope;
    const barato = lean.channelMediaFloors.slice().sort((a, b) => a.amount - b.amount)[0];

    return [
      {
        id: "preparation",
        title: "Empezar con un sprint de estrategia",
        text: `Usaríamos los ${money(fit.available)} para definir tu objetivo y tu audiencia, recomendar el único canal por el que vale la pena empezar, fijar la dirección del mensaje central y armar un plan básico de activación. Pautar anuncios no es parte de esta fase.`,
      },
      {
        id: "pilot",
        title: "Enfocarte en un solo canal",
        text: `Si puedes reutilizar tu identidad de marca, tu sitio y tu seguimiento actuales, una campaña austera en un solo canal${barato ? ` (${canalLabel(barato.channel)}, con unos ${money(barato.amount)} de medios)` : ""} sale alrededor de ${range(lean.total)}. Pocas cosas bien hechas casi siempre le gana a muchas cosas hechas a medias.`,
      },
      {
        id: "increase",
        title: "Construir hacia el alcance completo",
        text: `La campaña de ${canales(fit.selectedChannels)} que describiste al principio se estima en ${range(full.total)}, de los cuales ${range(full.protectedTotal)} son el trabajo que hace que valga la pena comprar los medios. Vale la pena tenerlo a la vista como meta, aunque no sea esta fase.`,
      },
    ];
  },

  scenarioRationale: (answers, plan) => {
    const etiqueta = { essential: "Esencial", growth: "Crecimiento", expansion: "Expansión" }[plan.key];
    const fin = answers.financial;

    if (fin.mode === "budget") {
      const presupuesto = fin.budgetTotal ?? 0;
      const total = plan.total;
      const delta = total - presupuesto;
      const dentroDeRedondeo = Math.abs(delta) <= Math.max(50, presupuesto * 0.02);

      if (presupuesto <= 0 || dentroDeRedondeo) {
        return `${etiqueta} asigna ${money(total)}, redondeado para planeación.`;
      }
      if (delta > 0) {
        return `${etiqueta} cotiza este alcance en ${money(total)}, unos ${money(delta)} por encima de los ${money(presupuesto)} que indicaste. Eso es lo que cuesta el alcance, no una sugerencia de gastar más; los escenarios de abajo muestran cómo se ve uno más pequeño.`;
      }
      return `${etiqueta} cotiza este alcance en ${money(total)}, dejando unos ${money(-delta)} de los ${money(presupuesto)} que indicaste sin comprometer mientras la campaña se prueba.`;
    }

    const obj = answers.objective ? esObjectives[answers.objective] : null;
    if (!obj || plan.estimatedResults === null) {
      return `${etiqueta} se dimensiona a partir de tu meta y tus supuestos de costo.`;
    }
    const costo = fin.costPerResult ?? 0;
    if (answers.objective === "awareness") {
      const frecuencia = fin.targetFrequency ?? 3;
      const impresiones = plan.estimatedResults * frecuencia;
      return `${etiqueta} busca unas ${num(plan.estimatedResults)} personas con una frecuencia de ${frecuencia}, o cerca de ${num(impresiones)} impresiones a un CPM de ${money(costo)}. Eso cotiza los medios en unos ${money(plan.amounts.media)}, y el total completo financia la estrategia, la creatividad y la gestión alrededor.`;
    }
    return `${etiqueta} busca unos ${num(plan.estimatedResults)} ${obj.unitNoun} a un costo asumido de ${money(costo)} por ${obj.unitSingular}. Eso cotiza los medios en unos ${money(plan.amounts.media)}, y el total completo financia la estrategia, la creatividad y la gestión alrededor.`;
  },

  recommendationSummary: (answers, result) => {
    const ready = result.readiness;
    const canalesSel = answers.scope.channels.length;
    const dias = answers.scope.durationDays;
    const faltantes = ready.gaps.essential.length;

    const base =
      faltantes >= 5 ? "todavía necesita la mayoría de las piezas de las que depende"
      : faltantes >= 2 ? "todavía necesita construir algunas piezas clave"
      : faltantes === 1 ? "está casi lista, con una pieza pendiente por resolver"
      : "ya tiene las piezas que necesita";

    const partes: string[] = [];
    partes.push(`apunta a ${canales(canalesSel)} de publicidad`);
    if (answers.objective === "awareness" && answers.financial.mode === "goal" && answers.financial.goalCount) {
      partes.push(`busca llegar a unas ${num(answers.financial.goalCount)} personas`);
    } else if (answers.scope.audience !== "unknown") {
      const banda = audienceBandMeta(answers.scope.audience);
      partes.push(`le habla a una audiencia de ${banda.max === null && banda.key === "over-1m" ? "más de 1 millón" : banda.label.toLowerCase()}`);
    }
    partes.push(`corre durante ${duracion(dias)}`);

    const consecuencia = ready.score < 65
      ? "Por eso apartamos una parte real de la inversión para piezas, seguimiento, pruebas y la operación de la campaña, antes de que algo se vaya a anuncios. Ese orden importa más de lo que la mayoría espera."
      : "Como el trabajo de base ya está prácticamente hecho, una mayor parte de la inversión puede ir a llegar a más gente, sin dejar de financiar las pruebas y a alguien que la opere activamente.";

    return `Tu campaña ${base}, ${lista(partes)}. ${consecuencia}`;
  },

  planLevers: (answers, result) => {
    const motores: string[] = [];
    const esMetaAwareness = answers.objective === "awareness" && answers.financial.mode === "goal";
    const meta = answers.financial.goalCount ?? 0;

    if (esMetaAwareness && meta > 0) motores.push("el tamaño de la audiencia a la que quieres llegar");
    else if (answers.scope.audience === "over-1m" || answers.scope.audience === "100k-1m") motores.push("el tamaño de la audiencia");
    if (result.readiness.gaps.essential.length >= 2) motores.push("el hecho de que aún hay componentes esenciales por crear");
    if (answers.scope.channels.length >= 3) motores.push("la cantidad de canales seleccionados");

    const palancas: string[] = [];
    if (esMetaAwareness && meta > 0) palancas.push("reducir el alcance o la frecuencia");
    if (answers.scope.channels.length >= 2) palancas.push("acotar la mezcla de canales");
    if (result.readiness.gaps.essential.length >= 1 || result.readiness.needsReview >= 1) palancas.push("usar piezas de campaña que ya tienes");
    if (palancas.length === 0) palancas.push("ajustar el alcance");

    const texto = motores.length > 0
      ? `El número sale de ${lista(motores, "y")}.`
      : "El número sale del alcance que describiste.";
    return `${texto} ${mayus(lista(palancas, "o"))} lo cambiaría, y cualquiera de esas es una decisión razonable.`;
  },

  readiness: (result) => {
    const banda = esReadinessBands[result.band];
    const nombre = (k: ReadinessKey) => esReadinessItems[k].label.toLowerCase();
    const partes: string[] = [banda?.summary ?? ""];

    if (result.gaps.essential.length > 0) {
      const nombres = result.gaps.essential.slice(0, 4).map(nombre);
      const mas = result.gaps.essential.length - nombres.length;
      const items = mas > 0 ? [...nombres, `${mas} ${plural(mas, "más", "más")}`] : nombres;
      partes.push(`Según tus respuestas, ${lista(items)} ${plural(items.length, "necesita", "necesitan")} atención antes de lanzar.`);
    }
    if (result.gaps.recommended.length > 0) {
      const nombres = result.gaps.recommended.slice(0, 3).map(nombre);
      partes.push(
        `${mayus(lista(nombres))} ${plural(nombres.length, "se recomienda", "se recomiendan")} por los canales que seleccionaste, pero los requerimientos exactos habría que confirmarlos durante la planeación de la campaña.`,
      );
    }
    if (result.gaps.essential.length === 0 && result.gaps.recommended.length === 0) {
      partes.push("No queda nada esencial pendiente, así que el plan se inclina hacia la distribución y la optimización.");
    }
    return partes.filter(Boolean).join(" ");
  },

  balance: {
    mediaHeavy: (mediaPct) =>
      `Tu asignación actual pone ${mediaPct}% en medios pagados, pero tus respuestas indican que la creatividad de la campaña aún necesita desarrollo. Considera fortalecer la base antes de subir la inversión en medios.`,
    tracking:
      "El seguimiento de conversiones todavía no está listo. Sin él, la inversión en medios no se puede evaluar ni mejorar. Tu asignación de experiencia digital reserva espacio para configurarlo primero.",
    landing:
      "Tus respuestas indican que la página de destino aún necesita trabajo. El tráfico convierte en el destino, así que vale la pena financiarlo antes de escalar los medios.",
    channels: (selected, supported) =>
      `Seleccionaste ${canales(selected)}, pero el presupuesto de medios de este escenario respalda con holgura alrededor de ${supported}. Pocos canales con presupuesto real casi siempre le gana a muchos canales con presupuesto delgado.`,
    testing:
      "Las pruebas quedan por debajo del 5% del plan. Una reserva pequeña para experimentos suele ser lo que convierte una campaña decente en una buena para el segundo mes.",
    goalGap: (required, allocated) =>
      `Alcanzar la meta de este escenario se estima que necesita unos ${required} en medios, pero la asignación actual destina ${allocated}. Hay que revisar de nuevo la meta, los supuestos o el porcentaje de medios.`,
    timeline:
      "Varias piezas creativas todavía necesitan producción dentro de una ventana corta y fija. Meter tiempo de anticipación en el plan, o simplificar la creatividad de lanzamiento, va a proteger el calendario.",
    reachVsAudience: (goal, audienceLabel) =>
      `El alcance que quieres (${num(goal)} personas) es mayor que el tamaño de audiencia que seleccionaste antes (${audienceLabel.toLowerCase()}). Revisa tu estimado de audiencia o amplía el mercado geográfico de la campaña.`,
    localVsScale:
      "Describiste un mercado local con una audiencia de más de 1 millón de personas. Esa combinación es inusual; o el estimado de audiencia incluye gente fuera de tu zona de servicio, o el alcance del mercado es más amplio que local.",
    durationVsScale:
      "Llegar a una audiencia de este tamaño en 30 días concentra todo el presupuesto de medios en una ventana muy corta. Un vuelo más largo suele comprar el mismo alcance a un ritmo más sano, y con espacio para aprender.",
  },

  reasons: {
    channelStrategyMulti:  (n) => `Operar ${canales(n)} juntos necesita un plan de cómo funcionan como una sola campaña.`,
    channelStrategySingle: "Un solo canal también se beneficia de un plan deliberado, pero la carga de coordinación es pequeña.",
    visualIdentityVisual:  "Tu mezcla de canales es visual, así que la campaña necesita una imagen consistente.",
    visualIdentityText:    "Tus canales son principalmente de texto, así que la dirección visual importa menos aquí.",
    videoRequired:         (c) => `Seleccionaste ${c}, lo que hace del video un requerimiento creativo importante para esta mezcla de canales.`,
    videoFavoured:         (c) => `El video suele rendir más que la creatividad estática en ${c}.`,
    videoOptional:         "Tus canales admiten video, pero ninguno depende de él.",
    videoNotRequired:      "Ninguno de los canales que seleccionaste puede correr video.",
    photographyImagery:    (c) => `${c} funcionan con imágenes.`,
    graphicsImagery:       (c) => `${c} necesitan piezas publicitarias en los tamaños correctos.`,
    graphicsTextBased:     "Los canales que seleccionaste son principalmente de texto.",
    adCopyAlways:          "Todos los canales necesitan textos escritos.",
    trackingAction:        "Tu campaña impulsa una acción específica, así que necesita seguimiento de conversiones para poder evaluarse.",
    trackingAwareness:     "No hay una conversión directa que medir, aunque el seguimiento igual muestra en qué influyó la campaña.",
    pixelsAction:          "El seguimiento de las plataformas es lo que permite a cada canal optimizar hacia tu objetivo.",
    nativeForms:           (c) => `${c} pueden alojar el formulario de forma nativa, así que la página de destino es opcional.`,
    destinationChosen:     (d) => `Elegiste "${d}" como destino de la campaña.`,
    joinChannels: (hits) => lista(hits, "y"),
  },

  summary: {
    title:         "Plan de Inversión en Campaña de LV Branding",
    objective:     "Objetivo",
    duration:      "Duración",
    channels:      "Canales",
    startingPoint: "Punto de partida",
    allocation:    "Asignación",
    total:         "Inversión total",
    reserve:       "Reserva de campaña",
    disclaimer:    "Estimado de planeación, no una cotización. Los resultados no están garantizados.",
  },
};

/** Referenced so the channel-minimum table stays in sync if channels change. */
export const esChannelMinimums = CHANNEL_MEDIA_MINIMUM;
