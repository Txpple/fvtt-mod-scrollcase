/**
 * What every file of the module shares: the id, the logger, the strings. No imports
 * from the module's other files, so nothing here can be caught in an import cycle.
 */

import { createLogger } from "./kit/log.js";

export const MODULE_ID = "fvtt-mod-handouts";

/** Every line opens with the module's title; debug lines need CONFIG.debug["fvtt-mod-handouts"]. */
export const log = createLogger(MODULE_ID);

/** A string from lang/en.json, under this module's key; with data, formatted. */
export const t = (key, data) =>
  data ? game.i18n.format(`${MODULE_ID}.${key}`, data) : game.i18n.localize(`${MODULE_ID}.${key}`);

/** A setting of this module's. */
export const setting = key => game.settings.get(MODULE_ID, key);

/** Ownership levels, read once Foundry has defined them. */
export const LEVELS = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
