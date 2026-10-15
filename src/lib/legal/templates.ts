// LegalSigns document templates.
//
// The Mutual and One-way NDAs are LV Branding's approved text in English and
// Spanish, word for word (ndaText.ts). The four releases and the client
// approval form are Suite 55's documents
// (suite55-ai/src/components/documents/*PDF.tsx), with LV Branding LLC as the
// producer; their Spanish versions are translations made for LegalSigns, not
// approved text: have a bilingual lawyer review them before relying on them.
//
// A document is rendered to blocks once, when it is sent. The blocks are what
// the client reads and signs and what the PDF prints, so later edits to a
// template never change a document already sent.

import { NDA_TEXT } from "./ndaText";

export type LegalLanguage = "en" | "es";
type Text = Record<LegalLanguage, string>;

export type LegalBlock =
  | { kind: "title"; text: string }
  | { kind: "meta"; label: string; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };

export interface LegalField {
  key: string;
  label: Text;
  type: "text" | "email" | "date" | "textarea" | "select";
  required?: boolean;
  options?: { value: string; label: Text }[];
  placeholder?: Text;
  hint?: Text;
  /** What the field starts with on a new document. */
  defaultValue?: () => string;
}

export interface LegalTemplate {
  key: string;
  version: string;
  kind: "nda" | "release" | "approval";
  name: Text;
  description: Text;
  /** False until the approved wording is in place; it cannot be sent. */
  available: boolean;
  /** Who the client is in this document, shown at their signature. */
  signerRole: Text;
  /** Who signs, when it depends on the document (the NDA names Party 2). */
  signerRoleFrom?: (input: LegalRenderInput) => string;
  /** Who LV Branding signs as. */
  countersignerRole: Text;
  /** The Spanish text is LV Branding's approved wording, not a LegalSigns translation. */
  spanishApproved?: boolean;
  fields: LegalField[];
  render: (input: LegalRenderInput) => LegalBlock[];
}

/** What every document knows besides its own fields. */
export interface LegalRenderInput {
  language: LegalLanguage;
  companyName: string;
  signerName: string;
  /** Where the signing link goes; the NDA's Party 2 notice email unless another is given. */
  recipientEmail?: string;
  values: Record<string, string>;
}

export const PRODUCER = "LV Branding LLC";
const BLANK = "________________________";

const value = (input: LegalRenderInput, key: string) => input.values[key]?.trim() || BLANK;
const optional = (input: LegalRenderInput, key: string) => input.values[key]?.trim() || "";

/** A "YYYY-MM-DD" date written out in the document's language. */
export function legalDate(date: string | undefined, language: LegalLanguage) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return BLANK;
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

const t = (en: string, es: string): Text => ({ en, es });

const MINOR_FIELD: LegalField = {
  key: "minorName",
  label: t("Minor's full name (if signing for a minor)", "Nombre completo del menor (si se firma por un menor)"),
  type: "text",
  hint: t(
    "Fill this in only when a parent or guardian signs for a minor. The recipient then signs as the parent or guardian.",
    "Complételo solo cuando un padre, madre o tutor firme por un menor. El destinatario firma entonces como padre, madre o tutor.",
  ),
};

/** The person a release is about: the minor when a guardian signs, otherwise the signer. */
const subjectOf = (input: LegalRenderInput) => optional(input, "minorName") || input.signerName.trim() || BLANK;

function guardianClause(input: LegalRenderInput): LegalBlock[] {
  const minor = optional(input, "minorName");
  if (!minor) return [];
  return input.language === "es"
    ? [
        { kind: "heading", text: "Consentimiento del padre, madre o tutor" },
        { kind: "paragraph", text: `Soy padre, madre o tutor legal de ${minor}, el menor objeto de esta autorización y consentimiento, y declaro que tengo autoridad sobre dicho menor. Acepto que dicho menor y yo quedaremos obligados por todas las disposiciones aquí contenidas.` },
      ]
    : [
        { kind: "heading", text: "Parent or guardian consent" },
        { kind: "paragraph", text: `I am a parent or legal guardian of ${minor}, the minor who is the subject of this release and consent, and I hereby represent that I have authority over the said minor. I agree that the said minor and I will be bound by all the provisions contained herein.` },
      ];
}

const PROJECT_FIELD: LegalField = { key: "projectTitle", label: t("Project or production title", "Título del proyecto o producción"), type: "text", required: true };
const DATE_FIELD: LegalField = { key: "productionDate", label: t("Production date", "Fecha de producción"), type: "date" };
const LOCATION_FIELD: LegalField = { key: "location", label: t("Location", "Lugar"), type: "text" };

const photoRelease: LegalTemplate = {
  key: "photo_release",
  version: "1.0",
  kind: "release",
  name: t("Photo Release", "Autorización de uso de fotografías"),
  description: t("Permission to use photographs of a person.", "Permiso para usar fotografías de una persona."),
  available: true,
  signerRole: t("Subject", "Persona fotografiada"),
  countersignerRole: t("Photographer/Producer", "Fotógrafo/Productor"),
  fields: [
    PROJECT_FIELD,
    DATE_FIELD,
    LOCATION_FIELD,
    {
      key: "usageDescription",
      label: t("Permitted uses", "Usos permitidos"),
      type: "textarea",
      placeholder: t("print, digital, web, social media, advertising, and promotional materials", "medios impresos y digitales, web, redes sociales, publicidad y materiales promocionales"),
      hint: t("Leave empty to use the standard wording shown.", "Déjelo vacío para usar el texto estándar indicado."),
    },
    MINOR_FIELD,
  ],
  render(input) {
    const es = input.language === "es";
    const usage = optional(input, "usageDescription") || (es
      ? "medios impresos y digitales, web, redes sociales, publicidad y materiales promocionales"
      : "print, digital, web, social media, advertising, and promotional materials");
    const project = value(input, "projectTitle");
    const subject = subjectOf(input);
    const meta: LegalBlock[] = [
      { kind: "meta", label: es ? "Empresa" : "Company", text: input.companyName.trim() || BLANK },
      { kind: "meta", label: es ? "Proyecto" : "Project", text: project },
      { kind: "meta", label: es ? "Fecha" : "Date", text: legalDate(input.values.productionDate, input.language) },
      ...(optional(input, "location") ? [{ kind: "meta", label: es ? "Lugar" : "Location", text: optional(input, "location") } as LegalBlock] : []),
    ];
    const body = es
      ? [
          `Yo, ${subject}, por medio del presente otorgo a ${PRODUCER} (el "Fotógrafo/Productor"), sus agentes, empleados, licenciatarios, sucesores y cesionarios, el derecho y permiso irrevocable de usar, reproducir, publicar y distribuir fotografías tomadas de mi persona o en las que yo pueda aparecer, en su totalidad o en parte, sin restricción en cuanto a cambios o alteraciones.`,
          `Autorizo el uso de estas fotografías para fines que incluyen, entre otros: ${usage}, en relación con el proyecto titulado "${project}" y para uso promocional general del Fotógrafo/Productor y sus clientes.`,
          "Acepto que estas fotografías serán propiedad exclusiva del Fotógrafo/Productor, con plenos derechos de autor, uso, reutilización, publicación y republicación en todos y cada uno de los medios, conocidos ahora o que se desarrollen en el futuro, en todo el mundo y a perpetuidad. Renuncio a cualquier derecho de inspeccionar o aprobar las fotografías terminadas o los usos que se les den.",
          "Libero y eximo al Fotógrafo/Productor de todas y cada una de las reclamaciones, demandas y causas de acción que yo, mis herederos, representantes, albaceas, administradores o cualquier otra persona que actúe en mi nombre pudiéramos tener en virtud de esta autorización, incluidas, entre otras, las reclamaciones por invasión de la privacidad, derecho de publicidad, difamación o infracción de derechos de autor.",
          "Declaro que soy mayor de edad y tengo derecho a contratar en mi propio nombre, o que he obtenido el consentimiento necesario de mi padre, madre o tutor. He leído esta autorización antes de firmarla y comprendo plenamente su contenido.",
        ]
      : [
          `I, ${subject}, hereby grant to ${PRODUCER} ("Photographer/Producer"), its agents, employees, licensees, successors, and assigns, the irrevocable right and permission to use, reproduce, publish, and distribute photographs taken of me or in which I may be included, in whole or in part, without restriction as to changes or alterations.`,
          `I authorize the use of these photographs for purposes including but not limited to: ${usage}, in connection with the project entitled "${project}" and for general promotional use by the Photographer/Producer and its clients.`,
          "I agree that these photographs shall be the sole property of the Photographer/Producer, with full rights to copyright, use, re-use, publish, and republish in any and all media, now known or hereafter devised, throughout the world, in perpetuity. I waive any right to inspect or approve the finished photographs or the uses to which they may be put.",
          "I release and discharge the Photographer/Producer from any and all claims, demands, and causes of action which I, my heirs, representatives, executors, administrators, or any other persons acting on my behalf may have by reason of this authorization, including but not limited to claims for invasion of privacy, right of publicity, defamation, or copyright infringement.",
          "I represent that I am of full legal age and have the right to contract in my own name, or that I have obtained the necessary consent from a parent or guardian. I have read this release before signing and I fully understand its contents.",
        ];
    return [
      { kind: "title", text: photoRelease.name[input.language] },
      ...meta,
      ...body.map((text) => ({ kind: "paragraph", text }) as LegalBlock),
      ...guardianClause(input),
    ];
  },
};

const mediaRelease: LegalTemplate = {
  key: "media_release",
  version: "1.0",
  kind: "release",
  name: t("Media Release", "Autorización de uso de imagen y medios"),
  description: t("Permission to record and use a person's appearance, voice and likeness.", "Permiso para grabar y usar la apariencia, voz e imagen de una persona."),
  available: true,
  signerRole: t("Participant", "Participante"),
  countersignerRole: t("Producer", "Productor"),
  fields: [PROJECT_FIELD, MINOR_FIELD],
  render(input) {
    const es = input.language === "es";
    const subject = subjectOf(input);
    const body = es
      ? [
          `Por una contraprestación válida y suficiente, cuyo recibo se reconoce por medio del presente, yo, ${subject}, autorizo a ${PRODUCER} (el "Productor"), a la Empresa y a sus respectivas matrices, afiliadas, subsidiarias, licenciatarios, sucesores y cesionarios a hacer uso de mi aparición en el o los programas titulados provisionalmente como el o los "Programas" indicados arriba, en relación con el Productor y/o la Empresa o de otro modo.`,
          "Acepto que pueden grabarme y fotografiarme, y grabar mi voz, conversaciones y sonidos, incluida cualquier interpretación de cualquier composición musical, durante y en relación con mi aparición, y que ustedes serán los propietarios exclusivos de los resultados y productos de dicha grabación y fotografía, con el derecho, en todo el mundo, un número ilimitado de veces y a perpetuidad, de registrar los derechos de autor, usar y licenciar a otros para usar, de cualquier manera, la totalidad o cualquier parte de ellos o de una reproducción de los mismos en relación con el Programa o de otro modo. Para mayor claridad, renuncio expresamente a todos y cada uno de los derechos morales que pudiera tener en relación con mi aparición.",
          "Acepto además que pueden usar y licenciar a otros para usar mi nombre, voz, imagen y cualquier material biográfico sobre mí que yo proporcione, en todos y cada uno de los medios y en la promoción, publicidad, venta, difusión y explotación del Programa y/o de otro modo, y de productos complementarios (por ejemplo, mercancía) en relación con el Programa y en relación con el Productor y/o la Empresa o los servicios afiliados de la Empresa, en todo el mundo, en todos los medios, un número ilimitado de veces y a perpetuidad. Declaro además que cualquier declaración que haga durante mi aparición es verdadera según mi leal saber y entender, y que ni dichas declaraciones ni mi aparición violarán ni infringirán los derechos de terceros.",
          "Por medio del presente renuncio a cualquier derecho de inspección o aprobación de mi aparición o de los usos que se le den. Reconozco que ustedes confiarán en este permiso, posiblemente con un costo considerable. Por medio del presente acepto no presentar ninguna reclamación de ningún tipo contra nadie en relación con el ejercicio de los permisos aquí otorgados.",
        ]
      : [
          `For good and valuable consideration, receipt of which is hereby acknowledged, I, ${subject}, authorize ${PRODUCER} ("Producer"), the Company, and their respective parents, affiliates, subsidiaries, licensees, successors, and assigns to make use of my appearance for the program(s) tentatively entitled as the "Program(s)" listed above and in connection with Producer and/or Company or otherwise.`,
          "I agree that you may tape and photograph me and record my voice, conversation, and sounds, including any performance of any musical composition(s), during and in connection with my appearance, and that you shall be the exclusive owner of the results and proceeds of such taping, photography, and recording with the right, throughout the world, an unlimited number of times in perpetuity, to copyright, to use and to license others to use, in any manner, all or any portion thereof or of a reproduction thereof in connection with the Program or otherwise. For purposes of clarity, I expressly waive any and all moral rights I may have in connection with my appearance.",
          "I further agree that you may use and license others to use my name, voice, likeness, and any biographical material concerning me, which I may provide, in any and all media and in the promotion, advertising, sale, publicizing, and exploitation of the Program and/or otherwise and ancillary products (e.g., merchandise) in connection with the Program and in connection with Producer and/or Company or Company's affiliated services, throughout the world in all media, an unlimited number of times in perpetuity. I further represent that any statements made by me during my appearance are true, to the best of my knowledge, and that neither they nor my appearance will violate or infringe upon the rights of any third party.",
          "I hereby waive any right of inspection or approval of my appearance or the uses to which such appearance may be put. I acknowledge that you will rely on this permission potentially, at a substantial cost to you. I hereby agree not to assert any claim of any nature whatsoever against anyone relating to the exercise of the permissions granted hereunder.",
        ];
    return [
      { kind: "title", text: mediaRelease.name[input.language] },
      { kind: "meta", label: es ? "Empresa" : "Company", text: input.companyName.trim() || BLANK },
      { kind: "meta", label: es ? "Producción" : "Production", text: value(input, "projectTitle") },
      ...body.map((text) => ({ kind: "paragraph", text }) as LegalBlock),
      ...guardianClause(input),
    ];
  },
};

const talentRelease: LegalTemplate = {
  key: "talent_release",
  version: "1.0",
  kind: "release",
  name: t("Talent Release", "Autorización de talento"),
  description: t("Permission to record and use a performer's appearance and work.", "Permiso para grabar y usar la aparición y el trabajo de un talento."),
  available: true,
  signerRole: t("Talent", "Talento"),
  countersignerRole: t("Producer", "Productor"),
  fields: [
    PROJECT_FIELD,
    DATE_FIELD,
    { ...LOCATION_FIELD, required: true },
    { key: "talentRole", label: t("Role", "Papel"), type: "text" },
    { key: "compensation", label: t("Compensation", "Compensación"), type: "text" },
    { key: "usageRights", label: t("Usage rights", "Derechos de uso"), type: "text", placeholder: t("All media, worldwide, in perpetuity", "Todos los medios, en todo el mundo, a perpetuidad"), hint: t("Leave empty to use the standard wording shown.", "Déjelo vacío para usar el texto estándar indicado.") },
    MINOR_FIELD,
  ],
  render(input) {
    const es = input.language === "es";
    const subject = subjectOf(input);
    const project = value(input, "projectTitle");
    const usage = optional(input, "usageRights") || (es ? "Todos los medios, en todo el mundo, a perpetuidad" : "All media, worldwide, in perpetuity");
    const meta: LegalBlock[] = [
      { kind: "meta", label: es ? "Empresa" : "Company", text: input.companyName.trim() || BLANK },
      { kind: "meta", label: es ? "Producción" : "Production", text: project },
      { kind: "meta", label: es ? "Fecha" : "Date", text: legalDate(input.values.productionDate, input.language) },
      { kind: "meta", label: es ? "Lugar" : "Location", text: value(input, "location") },
      ...(optional(input, "talentRole") ? [{ kind: "meta", label: es ? "Papel" : "Role", text: optional(input, "talentRole") } as LegalBlock] : []),
      ...(optional(input, "compensation") ? [{ kind: "meta", label: es ? "Compensación" : "Compensation", text: optional(input, "compensation") } as LegalBlock] : []),
    ];
    const body = es
      ? [
          `Por una contraprestación válida y suficiente, cuyo recibo y suficiencia se reconocen por medio del presente, yo, ${subject} (el "Talento"), otorgo a ${PRODUCER} (el "Productor"), a la Empresa y a sus respectivas matrices, afiliadas, subsidiarias, licenciatarios, sucesores y cesionarios, el derecho y permiso irrevocable de fotografiar, grabar y usar mi nombre, imagen, voz, interpretación e información biográfica en relación con la producción titulada provisionalmente "${project}".`,
          "Acepto que el Productor será titular de todos los derechos, títulos e intereses sobre todas las grabaciones, fotografías y demás materiales producidos en relación con mi aparición, incluido el derecho exclusivo de usarlos, reproducirlos, distribuirlos, exhibirlos y crear obras derivadas de ellos, en todo el mundo, en todos y cada uno de los medios conocidos ahora o que se desarrollen en el futuro, a perpetuidad. Renuncio expresamente a todos y cada uno de los derechos morales relacionados con ellos.",
          `Otorgo además al Productor el derecho de usar mi nombre, imagen, voz y material biográfico para la promoción, publicidad y explotación de la producción y de cualquier producto complementario, en todo el mundo, en todos los medios, un número ilimitado de veces, a perpetuidad. Derechos de uso: ${usage}.`,
          "Por medio del presente renuncio a cualquier derecho de inspección o aprobación de mi aparición o de los usos que se le den. Declaro que tengo pleno derecho y autoridad para otorgar los derechos aquí descritos. Libero al Productor de todas y cada una de las reclamaciones derivadas del uso de mi aparición según lo aquí autorizado.",
        ]
      : [
          `For good and valuable consideration, the receipt and sufficiency of which is hereby acknowledged, I, ${subject} ("Talent"), hereby grant to ${PRODUCER} ("Producer"), the Company, and their respective parents, affiliates, subsidiaries, licensees, successors, and assigns, the irrevocable right and permission to photograph, record, and use my name, likeness, voice, performance, and biographical information in connection with the production tentatively entitled "${project}".`,
          "I agree that Producer shall own all rights, title, and interest in and to all recordings, photographs, and other materials produced in connection with my appearance, including the exclusive right to use, reproduce, distribute, display, and create derivative works thereof, throughout the world, in any and all media now known or hereafter devised, in perpetuity. I expressly waive any and all moral rights in connection therewith.",
          `I further grant Producer the right to use my name, likeness, voice, and biographical material for the promotion, advertising, and exploitation of the production and any ancillary products, throughout the world, in all media, an unlimited number of times, in perpetuity. Usage rights: ${usage}.`,
          "I hereby waive any right of inspection or approval of my appearance or the uses to which such appearance may be put. I represent that I have the full right and authority to grant the rights herein. I release Producer from any and all claims arising from the use of my appearance as authorized herein.",
        ];
    return [
      { kind: "title", text: talentRelease.name[input.language] },
      ...meta,
      ...body.map((text) => ({ kind: "paragraph", text }) as LegalBlock),
      ...guardianClause(input),
    ];
  },
};

const locationRelease: LegalTemplate = {
  key: "location_release",
  version: "1.0",
  kind: "release",
  name: t("Location Release", "Autorización de uso de locación"),
  description: t("Permission to film and photograph at a property.", "Permiso para filmar y fotografiar en una propiedad."),
  available: true,
  signerRole: t("Property Owner / Representative", "Propietario / Representante de la propiedad"),
  countersignerRole: t("Producer", "Productor"),
  fields: [
    PROJECT_FIELD,
    { key: "propertyName", label: t("Property name", "Nombre de la propiedad"), type: "text", required: true },
    { key: "propertyAddress", label: t("Property address", "Dirección de la propiedad"), type: "text", required: true },
    { key: "accessDate", label: t("Date of access", "Fecha de acceso"), type: "date", required: true },
    { key: "accessHours", label: t("Access hours", "Horario de acceso"), type: "text", placeholder: t("8:00 AM – 6:00 PM", "8:00 a. m. – 6:00 p. m.") },
    { key: "compensation", label: t("Compensation", "Compensación"), type: "text" },
    { key: "specialConditions", label: t("Special conditions", "Condiciones especiales"), type: "textarea" },
  ],
  render(input) {
    const es = input.language === "es";
    const project = value(input, "projectTitle");
    const signer = input.signerName.trim() || BLANK;
    const meta: LegalBlock[] = [
      { kind: "meta", label: es ? "Empresa" : "Company", text: input.companyName.trim() || BLANK },
      { kind: "meta", label: es ? "Producción" : "Production", text: project },
      { kind: "meta", label: es ? "Propiedad" : "Property", text: value(input, "propertyName") },
      { kind: "meta", label: es ? "Dirección de la propiedad" : "Property Address", text: value(input, "propertyAddress") },
      { kind: "meta", label: es ? "Fecha de acceso" : "Date of Access", text: legalDate(input.values.accessDate, input.language) },
      ...(optional(input, "accessHours") ? [{ kind: "meta", label: es ? "Horario de acceso" : "Access Hours", text: optional(input, "accessHours") } as LegalBlock] : []),
      ...(optional(input, "compensation") ? [{ kind: "meta", label: es ? "Compensación" : "Compensation", text: optional(input, "compensation") } as LegalBlock] : []),
    ];
    const body = es
      ? [
          `Yo, ${signer} (el "Propietario/Representante"), otorgo a ${PRODUCER} (el "Productor"), sus agentes, empleados, licenciatarios, sucesores y cesionarios, el derecho y permiso irrevocable de ingresar y usar la propiedad descrita arriba con el fin de fotografiar, filmar y grabar en relación con la producción titulada provisionalmente "${project}".`,
          "Otorgo al Productor el derecho de ingresar personal, equipo y estructuras temporales a la propiedad y de usar la propiedad para fines que incluyen, entre otros, filmación, fotografía, grabación y actividades de producción relacionadas durante el período indicado arriba.",
          "Otorgo al Productor el derecho de usar, reproducir, distribuir y exhibir todas las fotografías, películas, grabaciones y demás materiales captados en la propiedad, incluidas representaciones del exterior y del interior de la propiedad, en todo el mundo, en todos y cada uno de los medios conocidos ahora o que se desarrollen en el futuro, a perpetuidad, para cualquier fin, incluidas la promoción y la publicidad.",
          "El Productor se compromete a actuar con un cuidado razonable para evitar daños a la propiedad y a restituir la propiedad a su condición original al terminar su uso. El Productor indemnizará y mantendrá indemne al Propietario frente a cualquier reclamación derivada del uso de la propiedad por parte del Productor, salvo las reclamaciones derivadas de la propia negligencia del Propietario.",
          "Por medio del presente renuncio a cualquier derecho de inspección o aprobación de la producción terminada o de los usos que se den a la representación de la propiedad. Declaro que tengo pleno derecho y autoridad para otorgar los permisos aquí descritos.",
        ]
      : [
          `I, ${signer} ("Owner/Representative"), hereby grant to ${PRODUCER} ("Producer"), its agents, employees, licensees, successors, and assigns, the irrevocable right and permission to enter and use the property described above for the purpose of photographing, filming, and recording in connection with the production tentatively entitled "${project}".`,
          "I grant Producer the right to bring personnel, equipment, and temporary structures onto the property and to use the property for purposes including but not limited to filming, photography, recording, and related production activities during the period specified above.",
          "I grant Producer the right to use, reproduce, distribute, and display all photographs, films, recordings, and other materials captured at the property, including depictions of the property's exterior and interior, throughout the world, in any and all media now known or hereafter devised, in perpetuity, for any purpose including promotion and advertising.",
          "Producer agrees to use reasonable care to prevent damage to the property and to restore the property to its original condition upon completion of use. Producer shall indemnify and hold harmless the Owner from any claims arising from Producer's use of the property, except for claims arising from the Owner's own negligence.",
          "I hereby waive any right of inspection or approval of the finished production or the uses to which the depiction of the property may be put. I represent that I have the full right and authority to grant the permissions herein.",
        ];
    const conditions = optional(input, "specialConditions");
    return [
      { kind: "title", text: locationRelease.name[input.language] },
      ...meta,
      ...body.map((text) => ({ kind: "paragraph", text }) as LegalBlock),
      ...(conditions ? [{ kind: "heading", text: es ? "Condiciones especiales" : "Special Conditions" } as LegalBlock, { kind: "paragraph", text: conditions } as LegalBlock] : []),
    ];
  },
};

const APPROVAL_TYPES = [
  { value: "creative_direction", label: t("Creative Direction", "Dirección creativa") },
  { value: "concept_approval", label: t("Concept Approval", "Aprobación de concepto") },
  { value: "edit_review", label: t("Edit Review", "Revisión de edición") },
  { value: "final_deliverables", label: t("Final Deliverables", "Entregables finales") },
  { value: "budget_approval", label: t("Budget Approval", "Aprobación de presupuesto") },
  { value: "other", label: t("Other", "Otro") },
];
const DECISIONS = [
  { value: "approved", label: t("Approved", "Aprobado") },
  { value: "approved_with_changes", label: t("Approved with changes", "Aprobado con cambios") },
  { value: "revisions_requested", label: t("Revisions requested", "Se solicitan revisiones") },
];

const clientApproval: LegalTemplate = {
  key: "client_approval",
  version: "1.0",
  kind: "approval",
  name: t("Client Approval Form", "Formulario de aprobación del cliente"),
  description: t("The client's formal approval of deliverables or creative direction.", "La aprobación formal del cliente de entregables o dirección creativa."),
  available: true,
  signerRole: t("Client", "Cliente"),
  countersignerRole: t("Producer acknowledgment", "Acuse del productor"),
  fields: [
    PROJECT_FIELD,
    DATE_FIELD,
    { key: "approvalType", label: t("Approval type", "Tipo de aprobación"), type: "select", required: true, options: APPROVAL_TYPES },
    { key: "decision", label: t("Decision", "Decisión"), type: "select", required: true, options: DECISIONS },
    { key: "deliverableDescription", label: t("Deliverable or item description", "Descripción del entregable o elemento"), type: "textarea", required: true },
    { key: "revisionNotes", label: t("Revision notes or feedback", "Notas de revisión o comentarios"), type: "textarea" },
  ],
  render(input) {
    const es = input.language === "es";
    const pick = (list: typeof APPROVAL_TYPES, key: string) => list.find((item) => item.value === input.values[key])?.label[input.language] || BLANK;
    const notes = optional(input, "revisionNotes");
    return [
      { kind: "title", text: clientApproval.name[input.language] },
      { kind: "meta", label: es ? "Cliente" : "Client", text: input.companyName.trim() || BLANK },
      { kind: "meta", label: es ? "Empresa productora" : "Production Company", text: PRODUCER },
      { kind: "meta", label: es ? "Proyecto" : "Project", text: value(input, "projectTitle") },
      { kind: "meta", label: es ? "Fecha" : "Date", text: legalDate(input.values.productionDate, input.language) },
      { kind: "meta", label: es ? "Tipo de aprobación" : "Approval Type", text: pick(APPROVAL_TYPES, "approvalType") },
      { kind: "meta", label: es ? "Decisión" : "Decision", text: pick(DECISIONS, "decision") },
      { kind: "heading", text: es ? "Descripción del entregable o elemento" : "Deliverable / Item Description" },
      { kind: "paragraph", text: value(input, "deliverableDescription") },
      ...(notes ? [{ kind: "heading", text: es ? "Notas de revisión / comentarios" : "Revision Notes / Feedback" } as LegalBlock, { kind: "paragraph", text: notes } as LegalBlock] : []),
      { kind: "paragraph", text: es
        ? `Al firmar a continuación, el Cliente confirma que ha revisado los entregables y/o la dirección creativa descritos arriba y otorga su aprobación formal según lo indicado. Esta aprobación constituye una autorización para que ${PRODUCER} proceda con la producción, entrega o implementación, según corresponda.`
        : `By signing below, the Client confirms that they have reviewed the deliverables and/or creative direction described above and provides their formal approval as indicated. This approval constitutes authorization for ${PRODUCER} to proceed with production, delivery, or implementation as applicable.` },
      { kind: "paragraph", text: es
        ? "Cualquier cambio solicitado después de esta aprobación puede estar sujeto a cargos adicionales y ajustes de calendario según se acuerde por separado."
        : "Any subsequent changes requested after this approval may be subject to additional fees and timeline adjustments as agreed upon separately." },
    ];
  },
};

/** LV Branding's side of the NDAs' parties block; both can still be changed on a document. */
export const LV_NOTICE = { address: "1755 Crescent Plaza Dr., Houston, Texas 77077", email: "admin@lvbranding.com" };

/** Today in Houston, as a date field holds it. */
const todayInHouston = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** The other party: the legal name typed for it, else the company, else the recipient personally. */
const otherParty = (input: LegalRenderInput) =>
  optional(input, "party2Name") || input.companyName.trim() || input.signerName.trim() || BLANK;

/**
 * An NDA: the approved text with its parties block filled in. Both NDAs share
 * their form; they differ in their text and in what they call the parties
 * (Party 1 and 2, or Disclosing and Receiving Party).
 */
function ndaTemplate(kind: "mutual" | "oneWay", key: string, description: Text): LegalTemplate {
  const text = NDA_TEXT[kind];
  const party = t(text.en.labels.party2, text.es.labels.party2);
  return {
    key,
    version: "1.0",
    kind: "nda",
    name: t(text.en.title, text.es.title),
    description,
    available: true,
    spanishApproved: true,
    signerRole: party,
    signerRoleFrom: (input) => `${party[input.language]} · ${otherParty(input)}`,
    countersignerRole: t(text.en.labels.party1, text.es.labels.party1),
    fields: [
      { key: "effectiveDate", label: t("Effective date", "Fecha de entrada en vigor"), type: "date", required: true, defaultValue: todayInHouston },
      {
        key: "businessPurpose", label: t("Business purpose", "Objeto comercial"), type: "textarea", required: true,
        placeholder: t("Describe the proposed project or relationship", "Describir el proyecto o la relación propuesta"),
      },
      {
        key: "party2Name", label: t(`${party.en} full legal name`, `Nombre legal completo de la ${party.es}`), type: "text",
        hint: t("Leave empty to use the Company, or the recipient's own name when there is no company.", "Déjelo vacío para usar la Empresa, o el nombre del destinatario si no hay empresa."),
      },
      {
        key: "party2Entity", label: t(`${party.en} entity type and jurisdiction`, `Tipo de entidad y jurisdicción de la ${party.es}`), type: "text",
        placeholder: t("Texas limited liability company", "Sociedad de responsabilidad limitada de Texas"),
        hint: t(`Leave empty when the ${party.en} is an individual.`, `Déjelo vacío si la ${party.es} es una persona física.`),
      },
      { key: "party2Address", label: t(`${party.en} address`, `Domicilio de la ${party.es}`), type: "text", required: true },
      {
        key: "party2Email", label: t(`${party.en} notice email`, `Correo para notificaciones de la ${party.es}`), type: "email",
        hint: t("Leave empty to use the recipient's email.", "Déjelo vacío para usar el correo del destinatario."),
      },
      { key: "lvAddress", label: t("LV Branding address", "Domicilio de LV Branding"), type: "text", required: true, defaultValue: () => LV_NOTICE.address },
      { key: "lvEmail", label: t("LV Branding notice email", "Correo para notificaciones de LV Branding"), type: "email", required: true, defaultValue: () => LV_NOTICE.email },
    ],
    render(input) {
      const words = text[input.language];
      const meta = (label: string, value: string): LegalBlock => ({ kind: "meta", label, text: value });
      return [
        { kind: "title", text: words.title },
        { kind: "paragraph", text: words.intro },
        meta(words.labels.effectiveDate, legalDate(input.values.effectiveDate, input.language)),
        meta(words.labels.party1, PRODUCER),
        meta(words.labels.address, value(input, "lvAddress")),
        meta(words.labels.noticeEmail, value(input, "lvEmail")),
        meta(words.labels.party2, otherParty(input)),
        meta(words.labels.entity, optional(input, "party2Entity") || words.notApplicable),
        meta(words.labels.address, value(input, "party2Address")),
        meta(words.labels.noticeEmail, optional(input, "party2Email") || input.recipientEmail?.trim() || BLANK),
        meta(words.labels.purpose, value(input, "businessPurpose")),
        ...words.sections.flatMap(([heading, body]) => [{ kind: "heading", text: heading }, { kind: "paragraph", text: body }] as LegalBlock[]),
        { kind: "paragraph", text: words.signingNote },
      ];
    },
  };
}

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  ndaTemplate("mutual", "nda_mutual", t("Both parties protect what they share.", "Ambas partes protegen lo que comparten.")),
  ndaTemplate("oneWay", "nda_one_way", t("Only LV Branding's information is protected.", "Solo se protege la información de LV Branding.")),
  photoRelease,
  mediaRelease,
  talentRelease,
  locationRelease,
  clientApproval,
];

export const legalTemplate = (key: string) => LEGAL_TEMPLATES.find((template) => template.key === key);

/** Who signs, as printed with their signature: a guardian when a release is for a minor, Party 2 on the NDA. */
export function signerRoleFor(template: LegalTemplate, input: LegalRenderInput) {
  if (template.signerRoleFrom) return template.signerRoleFrom(input);
  const minor = input.values.minorName?.trim();
  if (template.fields.some((field) => field.key === "minorName") && minor) {
    return input.language === "es" ? `Padre, madre o tutor de ${minor}` : `Parent or guardian of ${minor}`;
  }
  return template.signerRole[input.language];
}

/** The values a new document of this template starts with. */
export function fieldDefaults(template: LegalTemplate) {
  return Object.fromEntries(
    template.fields.filter((field) => field.defaultValue).map((field) => [field.key, field.defaultValue!()]),
  ) as Record<string, string>;
}

/** The labels of required fields left empty, in the document's language. */
export function missingLegalFields(template: LegalTemplate, values: Record<string, string>, language: LegalLanguage) {
  return template.fields.filter((field) => field.required && !values[field.key]?.trim()).map((field) => field.label[language]);
}
