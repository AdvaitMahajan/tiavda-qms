import { Font } from "@react-pdf/renderer";

/**
 * Shared @react-pdf setup for client-facing documents. Imported for side effects
 * by each PDF component.
 *
 * Hyphenation is off: the default splits long words across lines ("hydrome-
 * ter"), which reads as a typo in a quotation sent to a client. Returning the
 * word whole makes it wrap to the next line instead.
 */
Font.registerHyphenationCallback((word) => [word]);
