/**
 * Recipient-facing labels for the hosted digital card (Build Spec §5.6).
 * Centralised so the recipient can switch the display language of the card's
 * chrome ("Save Contact", "Visit Website", …) — cheap once copy lives in one map.
 */

export const LANGUAGES = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  nl: "Nederlands",
} as const;

export type Lang = keyof typeof LANGUAGES;

type Dict = {
  saveContact: string;
  openLinkedIn: string;
  visitWebsite: string;
  poweredBy: string;
  savedNote: string;
};

export const STRINGS: Record<Lang, Dict> = {
  en: {
    saveContact: "Save to Contacts",
    openLinkedIn: "Open LinkedIn",
    visitWebsite: "Visit Website",
    poweredBy: "Made with CardStudio",
    savedNote: "Add this contact to your phone",
  },
  es: {
    saveContact: "Guardar contacto",
    openLinkedIn: "Abrir LinkedIn",
    visitWebsite: "Visitar sitio web",
    poweredBy: "Hecho con CardStudio",
    savedNote: "Añade este contacto a tu teléfono",
  },
  fr: {
    saveContact: "Enregistrer le contact",
    openLinkedIn: "Ouvrir LinkedIn",
    visitWebsite: "Voir le site web",
    poweredBy: "Créé avec CardStudio",
    savedNote: "Ajoutez ce contact à votre téléphone",
  },
  de: {
    saveContact: "Kontakt speichern",
    openLinkedIn: "LinkedIn öffnen",
    visitWebsite: "Website besuchen",
    poweredBy: "Erstellt mit CardStudio",
    savedNote: "Diesen Kontakt im Telefon speichern",
  },
  nl: {
    saveContact: "Opslaan in contacten",
    openLinkedIn: "LinkedIn openen",
    visitWebsite: "Website bezoeken",
    poweredBy: "Gemaakt met CardStudio",
    savedNote: "Voeg dit contact toe aan je telefoon",
  },
};
