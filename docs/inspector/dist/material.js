// Material Web Components loader.
//
// Pulls @material/web (v2) from esm.run and registers every
// <md-*> custom element. Also adopts the Material 3 typescale
// stylesheet so .md-typescale-* classes work on plain HTML.

import "https://esm.run/@material/web@2.0.0/all.js";
import { styles as typescaleStyles }
  from "https://esm.run/@material/web@2.0.0/typography/md-typescale-styles.js";

document.adoptedStyleSheets.push(typescaleStyles.styleSheet);
