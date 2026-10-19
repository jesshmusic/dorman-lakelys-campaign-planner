// The world settings that switch techniques on and off. The list of
// techniques, and what each one hides, is in techniques.mjs.
import { MODULE_ID } from "./constants.mjs";
import { TECHNIQUES, techniquesFrom } from "./techniques.mjs";

/**
 * Registers a setting for each technique: for the whole world, changed by a
 * GM in Module Settings, on to begin with.
 * @param {() => void} onChange called when one is switched on or off
 */
export function registerTechniqueSettings(onChange) {
  for (const technique of TECHNIQUES) {
    game.settings.register(MODULE_ID, technique.setting, {
      name: technique.name,
      hint: technique.hint,
      scope: "world",
      config: true,
      restricted: true,
      type: Boolean,
      default: true,
      onChange: () => onChange(),
    });
  }
}

/** The techniques this world uses, as { truths: true, ... } */
export const currentTechniques = () => techniquesFrom((setting) => game.settings.get(MODULE_ID, setting));
