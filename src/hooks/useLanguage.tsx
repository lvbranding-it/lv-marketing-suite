import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "es";

const LANGUAGE_STORAGE_KEY = "lv-marketing-suite-language";

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    "common.cancel": "Cancel",
    "common.loading": "Loading...",
    "common.save": "Save",
    "common.status": "Status",
    "language.label": "Language",
    "language.english": "English",
    "language.spanish": "Spanish",
    "language.short.en": "EN",
    "language.short.es": "ES",
    "nav.dashboard": "Dashboard",
    "nav.skills": "Skills",
    "nav.projects": "Projects",
    "nav.contacts": "Contacts",
    "nav.intake": "Intake",
    "nav.campaigns": "Campaigns",
    "nav.photoSessions": "Photo Sessions",
    "nav.fileDrop": "File Drop",
    "nav.history": "History",
    "nav.settings": "Settings",
    "dashboard.greeting": "Hey {{name}}",
    "dashboard.subtitle": "Here's your marketing workspace.",
    "dashboard.totalOutputs": "Total Outputs",
    "dashboard.activeProjects": "Active Projects",
    "dashboard.skillsAvailable": "Skills Available",
    "dashboard.thisWeek": "This Week",
    "dashboard.quickStart": "Quick Start",
    "dashboard.viewAllSkills": "View all skills",
    "dashboard.recentOutputs": "Recent Outputs",
    "dashboard.viewAll": "View all",
    "dashboard.noOutputs": "No outputs yet. Run a skill to get started!",
    "dashboard.noProjects": "No active projects. Create one to organize your outputs.",
    "settings.title": "Settings",
    "settings.account": "Account",
    "settings.organization": "Organization",
    "settings.branches": "Branches",
    "settings.team": "Team",
    "settings.activity": "Activity",
    "settings.name": "Name",
    "settings.organizationId": "Organization ID",
    "settings.profileHelp": "To update your name or email, contact your workspace administrator.",
    "settings.languagePreference": "Language preference",
    "settings.languageHelp": "Choose the language used across the main app controls.",
    "settings.teamMembers": "Team Members",
    "settings.pendingInvitations": "Pending Invitations",
    "settings.inviteTeamMember": "Invite Team Member",
    "settings.noMembers": "No members yet.",
    "settings.noPendingInvitations": "No pending invitations.",
    "settings.featureAccess": "Feature Access",
    "settings.sendInvite": "Send Invite",
    "settings.loadingMembers": "Loading members...",
    "branches.title": "LATAM Branches",
    "branches.subtitle": "Add expansion branches as tenants under HQ oversight. HQ keeps visibility into branch status and activity.",
    "branches.add": "Add Branch",
    "branches.addFirst": "Add the first branch to prepare the LATAM rollout.",
    "branches.branchName": "Branch name",
    "branches.code": "Branch code",
    "branches.country": "Country",
    "branches.city": "City",
    "branches.timezone": "Timezone",
    "branches.primaryLanguage": "Primary language",
    "branches.region": "Region",
    "branches.hqMonitored": "HQ monitored",
    "branches.hqMonitoredHelp": "HQ monitoring stays enabled for every branch so central leadership can govern expansion.",
    "branches.namePlaceholder": "LV Branding Mexico City",
    "branches.codePlaceholder": "MX-CDMX",
    "branches.countryPlaceholder": "Mexico",
    "branches.cityPlaceholder": "Mexico City",
    "branches.created": "Branch added under HQ monitoring.",
    "branches.createFailed": "Failed to add branch",
    "branches.statusUpdated": "Branch status updated.",
    "branches.statusUpdateFailed": "Failed to update branch status",
    "branches.status.planning": "Planning",
    "branches.status.active": "Active",
    "branches.status.paused": "Paused",
    "branches.status.archived": "Archived",
    "branches.language.en": "English",
    "branches.language.es": "Spanish",
    "branches.noCode": "No code",
    "branches.noCity": "City pending",
    "branches.loading": "Loading branches...",
    "activity.created_branch": "Created branch",
    "activity.updated_branch_status": "Updated branch status",
  },
  es: {
    "common.cancel": "Cancelar",
    "common.loading": "Cargando...",
    "common.save": "Guardar",
    "common.status": "Estado",
    "language.label": "Idioma",
    "language.english": "Inglés",
    "language.spanish": "Español",
    "language.short.en": "EN",
    "language.short.es": "ES",
    "nav.dashboard": "Panel",
    "nav.skills": "Habilidades",
    "nav.projects": "Proyectos",
    "nav.contacts": "Contactos",
    "nav.intake": "Formulario",
    "nav.campaigns": "Campañas",
    "nav.photoSessions": "Sesiones de Fotos",
    "nav.fileDrop": "Archivos",
    "nav.history": "Historial",
    "nav.settings": "Configuración",
    "dashboard.greeting": "Hola {{name}}",
    "dashboard.subtitle": "Este es tu espacio de marketing.",
    "dashboard.totalOutputs": "Resultados Totales",
    "dashboard.activeProjects": "Proyectos Activos",
    "dashboard.skillsAvailable": "Habilidades",
    "dashboard.thisWeek": "Esta Semana",
    "dashboard.quickStart": "Inicio Rápido",
    "dashboard.viewAllSkills": "Ver habilidades",
    "dashboard.recentOutputs": "Resultados Recientes",
    "dashboard.viewAll": "Ver todo",
    "dashboard.noOutputs": "Todavía no hay resultados. Ejecuta una habilidad para comenzar.",
    "dashboard.noProjects": "No hay proyectos activos. Crea uno para organizar tus resultados.",
    "settings.title": "Configuración",
    "settings.account": "Cuenta",
    "settings.organization": "Organización",
    "settings.branches": "Sucursales",
    "settings.team": "Equipo",
    "settings.activity": "Actividad",
    "settings.name": "Nombre",
    "settings.organizationId": "ID de Organización",
    "settings.profileHelp": "Para actualizar tu nombre o correo, contacta al administrador del espacio.",
    "settings.languagePreference": "Preferencia de idioma",
    "settings.languageHelp": "Elige el idioma usado en los controles principales de la app.",
    "settings.teamMembers": "Miembros del Equipo",
    "settings.pendingInvitations": "Invitaciones Pendientes",
    "settings.inviteTeamMember": "Invitar Miembro",
    "settings.noMembers": "Todavía no hay miembros.",
    "settings.noPendingInvitations": "No hay invitaciones pendientes.",
    "settings.featureAccess": "Acceso a Funciones",
    "settings.sendInvite": "Enviar Invitación",
    "settings.loadingMembers": "Cargando miembros...",
    "branches.title": "Sucursales LATAM",
    "branches.subtitle": "Agrega sucursales de expansión como tenants bajo supervisión de HQ. HQ conserva visibilidad sobre estado y actividad.",
    "branches.add": "Agregar Sucursal",
    "branches.addFirst": "Agrega la primera sucursal para preparar la expansión en LATAM.",
    "branches.branchName": "Nombre de sucursal",
    "branches.code": "Código de sucursal",
    "branches.country": "País",
    "branches.city": "Ciudad",
    "branches.timezone": "Zona horaria",
    "branches.primaryLanguage": "Idioma principal",
    "branches.region": "Región",
    "branches.hqMonitored": "Monitoreada por HQ",
    "branches.hqMonitoredHelp": "El monitoreo de HQ permanece activo en cada sucursal para que liderazgo central gobierne la expansión.",
    "branches.namePlaceholder": "LV Branding Ciudad de México",
    "branches.codePlaceholder": "MX-CDMX",
    "branches.countryPlaceholder": "México",
    "branches.cityPlaceholder": "Ciudad de México",
    "branches.created": "Sucursal agregada bajo monitoreo de HQ.",
    "branches.createFailed": "No se pudo agregar la sucursal",
    "branches.statusUpdated": "Estado de sucursal actualizado.",
    "branches.statusUpdateFailed": "No se pudo actualizar el estado",
    "branches.status.planning": "Planeación",
    "branches.status.active": "Activa",
    "branches.status.paused": "Pausada",
    "branches.status.archived": "Archivada",
    "branches.language.en": "Inglés",
    "branches.language.es": "Español",
    "branches.noCode": "Sin código",
    "branches.noCity": "Ciudad pendiente",
    "branches.loading": "Cargando sucursales...",
    "activity.created_branch": "Creó sucursal",
    "activity.updated_branch_status": "Actualizó estado de sucursal",
  },
};

const LITERAL_TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {},
  es: {
    Settings: "Configuración",
    Dashboard: "Panel",
    "Here's your marketing workspace.": "Este es tu espacio de marketing.",
    "Skills Library": "Biblioteca de Habilidades",
    "33 AI-powered marketing skills": "33 habilidades de marketing con IA",
    Projects: "Proyectos",
    Contacts: "Contactos",
    "Houston MSA · brand-ready decision makers": "Houston MSA · decisores listos para marca",
    "Client Intake": "Formulario de Clientes",
    "Output History": "Historial de Resultados",
    "Email Campaigns": "Campañas de Email",
    "Compose, send and track email blasts": "Redacta, envía y mide campañas de email",
    "Photo Sessions": "Sesiones de Fotos",
    "Client File Drop": "Entrega de Archivos",
    "Send a link to clients so they can upload files directly to you.": "Envía un enlace para que los clientes suban archivos directamente.",
    Campaign: "Campaña",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  translateLiteral: (value?: string) => string | undefined;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;

  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function interpolate(value: string, values?: Record<string, string | number>) {
  if (!values) return value;
  return Object.entries(values).reduce(
    (result, [key, replacement]) => result.split(`{{${key}}}`).join(String(replacement)),
    value
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key, values) => interpolate(TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key, values),
      translateLiteral: (text) => {
        if (!text) return text;
        return LITERAL_TRANSLATIONS[language][text] ?? text;
      },
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
