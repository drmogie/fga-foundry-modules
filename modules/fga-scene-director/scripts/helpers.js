/** Register small Handlebars helpers this module's templates rely on.
 *  Registered defensively (harmless if Foundry core already provides an equivalent "eq"). */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("fgaSdEq", (a, b) => a === b);
  // Alias "eq" only if nothing has claimed it yet, to avoid clobbering another module's helper.
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }
}
